import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PackagingModel, DielineResult, CardboardProfile } from '../engine/types';
import { LoopTopologyEngine, type StructuralPanel } from '../engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine, type FoldingTreeResult } from '../engine/importers/FoldingTreeEngine';
import { convertDielineTopologyToStructural, buildFoldingTopology } from '../engine/dielineTopology';
import {
  ThreeGeometryAdapter,
  type ThreeModelController,
  type HingeControlInfo,
  type PanelProvenanceData,
  type CreaseProvenanceData,
} from '../engine/renderers/ThreeGeometryAdapter';
import { Play, Pause, RotateCw, Box, Eye, Sliders } from 'lucide-react';

interface FoldingViewer3DProps {
  model: PackagingModel;
  params: Record<string, number>;
  dieline?: DielineResult;
  profile?: CardboardProfile;
  customAngles?: Record<string, number>;
  selectedPanelId?: string | null;
  onSelectPanel?: (panelId: string | null) => void;
  onHingeListUpdate?: (list: HingeControlInfo[]) => void;
  onOpenFoldInspector?: () => void;
  isFoldInspectorActive?: boolean;
  artworkTextureUri?: string | null;
}

export const FoldingViewer3D: React.FC<FoldingViewer3DProps> = ({
  model,
  params,
  dieline,
  profile,
  customAngles = {},
  selectedPanelId = null,
  onSelectPanel,
  onHingeListUpdate,
  onOpenFoldInspector,
  isFoldInspectorActive = false,
  artworkTextureUri = null,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Progresso da dobra: 0 (aberta) a 1 (montada)
  const [foldProgress, setFoldProgress] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  // Estado de seleção e metadados para inspeção forense no 3D
  const [selectedPanel, setSelectedPanel] = useState<PanelProvenanceData | null>(null);
  const [selectedCrease, setSelectedCrease] = useState<CreaseProvenanceData | null>(null);

  // Lista interna de vincos para contagem e status
  const [hingeList, setHingeList] = useState<HingeControlInfo[]>([]);

  // Textura de Arte vinda do Adobe Illustrator
  const [artworkTexture, setArtworkTexture] = useState<THREE.Texture | null>(null);
  const artworkTextureRef = useRef<THREE.Texture | null>(null);
  artworkTextureRef.current = artworkTexture;

  // Refs Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const boxGroupRef = useRef<THREE.Group | null>(null);
  const updateProgressRef = useRef<((progress: number) => void) | null>(null);
  const controllerRef = useRef<ThreeModelController | null>(null);
  const downPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Carrega textura sincronizada da arte do Illustrator quando fornecida,
  // compondo sobre a cor do papel/substrato para eliminar qualquer fundo preto indesejado
  useEffect(() => {
    if (!artworkTextureUri) {
      setArtworkTexture(null);
      controllerRef.current?.updateArtwork(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Pinta o fundo com a cor real do substrato (ex: Branco do Cartão ou Bege/Marrom do Kraft)
      const substrateColor = profile?.outerColor || '#FFFFFF';
      ctx.fillStyle = substrateColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Desenha a arte vetorial/impressa com sua transparência sobreposta ao papel
      ctx.drawImage(img, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.needsUpdate = true;
      setArtworkTexture(tex);
      controllerRef.current?.updateArtwork(tex);
    };
    img.onerror = (err) => {
      console.warn('[FoldingViewer3D] Erro ao carregar imagem de arte do Illustrator:', err);
    };
    img.src = artworkTextureUri;
  }, [artworkTextureUri, profile?.outerColor]);

  // Configuração inicial da cena Three.js com OrbitControls profissional
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = Math.max(mount.clientWidth || 800, 100);
    const height = Math.max(mount.clientHeight || 600, 100);

    // 1. Cena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B0F17');
    sceneRef.current = scene;

    // 2. Câmera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
    camera.position.set(500, 400, 500);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. OrbitControls com rotação 360° total (horizontal e vertical em torno da base)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.screenSpacePanning = false;
    controls.minDistance = 60;
    controls.maxDistance = 5000;
    // Permite girar 360 graus em torno da base e inspecionar por todos os ângulos
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.target.set(0, 50, 0);
    controls.autoRotate = false;
    controls.autoRotateSpeed = 2.5;
    controlsRef.current = controls;

    // 5. Luzes de estúdio balanceadas (Daylight Neutro para fidelidade do papel cartão BRANCO)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    mainLight.position.set(450, 800, 500);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.bias = -0.0001;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-500, 400, -300);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.4);
    backLight.position.set(0, 600, -500);
    scene.add(backLight);

    const bottomLight = new THREE.DirectionalLight(0xffffff, 0.5);
    bottomLight.position.set(0, -600, 0);
    scene.add(bottomLight);

    // 6. Piso semi-transparente para permitir visualização por baixo da base
    const floorGeo = new THREE.PlaneGeometry(5000, 5000);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grade no chão ancorada em Y=0
    const grid = new THREE.GridHelper(2000, 40, 0x35a89e, 0x1a2428);
    grid.position.y = 0;
    scene.add(grid);

    // 7. Grupo da Caixa
    const boxGroup = new THREE.Group();
    boxGroup.position.set(0, 0, 0);
    scene.add(boxGroup);
    boxGroupRef.current = boxGroup;

    // Observador de Redimensionamento
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(mount);

    // Loop de Animação suave com Damping do OrbitControls
    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      if (controllerRef.current) {
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Atualiza autoRotate sem destruir a cena Three.js
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 2.5;
    }
  }, [autoRotate]);

  // Recria a geometria 3D articulada a partir da MESMA faca 2D real
  useEffect(() => {
    const boxGroup = boxGroupRef.current;
    if (!boxGroup) return;

    // Limpa malhas anteriores e desaloca buffers WebGL
    if (controllerRef.current) {
      controllerRef.current.dispose();
      controllerRef.current = null;
    }
    while (boxGroup.children.length > 0) {
      const obj = boxGroup.children[0];
      boxGroup.remove(obj);
    }
    setSelectedPanel(null);
    setSelectedCrease(null);

    const isFoldable =
      model.isFoldable !== false &&
      model.status !== 'NON_FOLDABLE';

    if (!isFoldable) {
      setHingeList([]);
      updateProgressRef.current = null;
      return;
    }

    try {
      // PIPELINE CANÔNICO OFICIAL DA FASE 4:
      // Prioriza a topologia canônica da faca (customTopology || buildFoldingTopology)
      // para garantir a presença de 100% dos painéis industriais (incluindo abas de canto / dust flaps).
      const currentDieline = dieline || model.calculate(params);
      const customTopo = currentDieline.customTopology || buildFoldingTopology(currentDieline);

      let panels: StructuralPanel[];
      let foldingTree: FoldingTreeResult;

      if (customTopo && customTopo.panels && customTopo.panels.length > 0) {
        const converted = convertDielineTopologyToStructural(customTopo);
        panels = converted.panels;
        foldingTree = converted.foldingTree;
      } else {
        const topo = LoopTopologyEngine.extractTopology(currentDieline);
        foldingTree = FoldingTreeEngine.buildFoldingTree(topo.panels, currentDieline);
        panels = topo.panels;
      }

      const outerColor = profile?.outerColor || '#FFFFFF';
      const innerColor = profile?.innerColor || '#FFFFFF';
      const roughness = profile?.roughness ?? 0.28;

      const controller = ThreeGeometryAdapter.createModelController(
        panels,
        foldingTree,
        {
          outerColor,
          innerColor,
          roughness,
          customAngles,
          artworkTexture,
        }
      );
      controllerRef.current = controller;

      const list = controller.getHingeInfoList();
      setHingeList(list);
      onHingeListUpdate?.(list);
      if (selectedPanelId) {
        controller.highlightPanel(selectedPanelId);
      }

      if (controller.panelsCount > 0) {
        // Verifica se é modelo tubular (FEFCO 02xx / 07xx / ECMA A, B, E) para manter a caixa em pé com o fundo no chão
        const codeStr = (model.code || model.id || '').toUpperCase();
        const isTubular =
          codeStr.includes('FEFCO 02') ||
          codeStr.includes('FEFCO 07') ||
          codeStr.includes('FEFCO_02') ||
          codeStr.includes('FEFCO_07') ||
          codeStr.includes('FEFCO_F2') ||
          codeStr.includes('FEFCO_F7') ||
          codeStr.startsWith('ECMA A') ||
          codeStr.startsWith('ECMA B') ||
          codeStr.startsWith('ECMA E') ||
          codeStr.startsWith('ECMA X') ||
          codeStr.startsWith('ECMA_A') ||
          codeStr.startsWith('ECMA_B') ||
          codeStr.startsWith('ECMA_E') ||
          codeStr.startsWith('ECMA_X') ||
          Boolean(model.series && (
            model.series.includes('0200') ||
            model.series.includes('0700') ||
            model.series.includes('Grupo A') ||
            model.series.includes('Grupo B') ||
            model.series.includes('Grupo E') ||
            model.series.includes('Série X') ||
            model.series.includes('Serie X')
          ));

        if (isTubular) {
          // Rotaciona 90° em torno de X para colocar o fundo (+Z) voltado para o chão (-Y) e a tampa para cima (+Y)
          controller.rootGroup.rotation.x = Math.PI / 2;
        }

        // Função de fechamento que SEMPRE garante o FUNDO no chão perfeitamente apoiado a Y = 0 e centralizado em X e Z
        const updateWithGrounding = (progress: number) => {
          controller.rootGroup.position.set(0, 0, 0);
          controller.updateFoldPercent(progress * 100);
          boxGroup.updateMatrixWorld(true);
          const bbox = new THREE.Box3().setFromObject(boxGroup);

          const groundY = -bbox.min.y;

          const cx = (bbox.min.x + bbox.max.x) / 2;
          const cz = (bbox.min.z + bbox.max.z) / 2;
          controller.rootGroup.position.set(-cx, groundY, -cz);
          boxGroup.updateMatrixWorld(true);
        };

        boxGroup.add(controller.rootGroup);
        updateProgressRef.current = updateWithGrounding;
        updateWithGrounding(foldProgress);

        // Auto-enquadramento suave da câmera na altura real da caixa
        boxGroup.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(boxGroup);
        const boxH = Math.max(30, bbox.max.y - bbox.min.y);
        if (controlsRef.current && cameraRef.current) {
          controlsRef.current.target.set(0, boxH * 0.45, 0);

          const sphere = new THREE.Sphere();
          bbox.getBoundingSphere(sphere);
          if (sphere.radius > 10) {
            const dist = Math.max(450, sphere.radius * 2.2);
            cameraRef.current.position.set(dist * 0.7, dist * 0.65, dist * 0.7);
            controlsRef.current.update();
          }
        }
        return;
      }
      setHingeList([]);
      updateProgressRef.current = null;
    } catch (e) {
      console.warn('[FoldingViewer3D] Erro na interpretação topológica:', e);
      controllerRef.current = null;
      setHingeList([]);
      updateProgressRef.current = null;
    }
  }, [model, params, dieline, profile, customAngles, artworkTexture]);

  // Atualiza as rotações de dobra conforme o foldProgress (0% = aberta, 100% = montada)
  useEffect(() => {
    if (updateProgressRef.current) {
      updateProgressRef.current(foldProgress);
    }
  }, [foldProgress]);

  // Animação contínua Play/Pause
  useEffect(() => {
    if (!isPlaying) return;
    let forward = true;
    const interval = setInterval(() => {
      setFoldProgress((prev) => {
        if (prev >= 1) forward = false;
        if (prev <= 0.02) forward = true;
        const next = forward ? prev + 0.015 : prev - 0.015;
        return Math.max(0, Math.min(1, next));
      });
    }, 25);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Funções de câmera para validação visual rápida em 360 graus
  const snapToTopView = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    controls.target.set(0, 0, 0);
    const dist = camera.position.length() || 800;
    camera.position.set(0, dist, 0);
    controls.update();
  };

  const snapToPerspective = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    const boxH = Math.max(30, params.H || 100);
    controls.target.set(0, boxH * 0.4, 0);
    const dist = 750;
    camera.position.set(dist * 0.7, dist * 0.65, dist * 0.7);
    controls.update();
  };

  const snapToBottomView = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    controls.target.set(0, 0, 0);
    const dist = camera.position.length() || 800;
    camera.position.set(0, -dist * 0.9, 0.01);
    controls.update();
  };

  // Sincroniza destaque 3D quando a seleção vem do painel lateral esquerdo
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.highlightPanel(selectedPanelId || null);
    }
  }, [selectedPanelId]);

  // Sincroniza ângulos quando alterados no inspetor lateral
  useEffect(() => {
    if (controllerRef.current) {
      for (const [panelId, angle] of Object.entries(customAngles)) {
        controllerRef.current.setHingeAngle(panelId, angle);
      }
      if (updateProgressRef.current) {
        updateProgressRef.current(foldProgress);
      }
      const list = controllerRef.current.getHingeInfoList();
      setHingeList(list);
      onHingeListUpdate?.(list);
    }
  }, [customAngles]);

  // Raycasting 3D interativo para seleção de abas ou vincos via clique
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    downPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const dx = Math.abs(e.clientX - downPos.current.x);
    const dy = Math.abs(e.clientY - downPos.current.y);
    if (dx > 5 || dy > 5) return; // Orbit/pan da câmera, não conta como clique

    const mount = mountRef.current;
    const camera = cameraRef.current;
    const controller = controllerRef.current;
    if (!mount || !camera || !controller) return;

    const rect = mount.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Prioridade 1: Crease / Hinge Picking Tube
    const hitCrease = controller.raycastCrease(raycaster);
    if (hitCrease) {
      setSelectedCrease(hitCrease.provenance);
      setSelectedPanel(null);
      controller.highlightCrease(hitCrease.creaseId);
      controller.highlightPanel(null);
      return;
    }

    // Prioridade 2: Painel Estrutural
    const hitPanel = controller.raycastPanel(raycaster);
    if (hitPanel) {
      setSelectedPanel(hitPanel.provenance);
      setSelectedCrease(null);
      controller.highlightPanel(hitPanel.panelId);
      controller.highlightCrease(null);
      onSelectPanel?.(hitPanel.panelId);
    } else {
      setSelectedPanel(null);
      setSelectedCrease(null);
      controller.highlightPanel(null);
      controller.highlightCrease(null);
      onSelectPanel?.(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const mount = mountRef.current;
    const camera = cameraRef.current;
    const controller = controllerRef.current;
    if (!mount || !camera || !controller) return;

    const rect = mount.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const hasHit = controller.raycastCrease(raycaster) !== null || controller.raycastPanel(raycaster) !== null;
    mount.style.cursor = hasHit ? 'pointer' : 'grab';
  };

  const modifiedCount = useMemo(() => {
    return hingeList.filter((h) => h.isModified).length;
  }, [hingeList]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0B0F17' }}>
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
      />

      {/* Card de Inspeção Forense de Painel Selecionado (Fase 4 - Seção 14) */}
      {selectedPanel && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #38BDF8',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#F8FAFC',
            fontSize: 11,
            zIndex: 20,
            maxWidth: 320,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase' }}>
              Painel Estrutural: {selectedPanel.panelId}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedPanel(null);
                controllerRef.current?.highlightPanel(null);
              }}
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 13 }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace' }}>
            <div>Área Líquida: <b>{selectedPanel.areaMm2.toFixed(2)} mm²</b></div>
            <div>Triângulos GPU: <b>{selectedPanel.trianglesCount}</b></div>
            <div>Furos (Holes): <b>{selectedPanel.holesCount}</b></div>
            <div>Segmentos: <b>{selectedPanel.boundarySegmentsCount}</b> | Arcos: <b>{selectedPanel.boundaryArcsCount}</b></div>
            <div style={{ marginTop: 4, fontSize: 10, color: '#94A3B8', wordBreak: 'break-all' }}>
              Entidades Origem: {selectedPanel.sourceEntityIds.slice(0, 6).join(', ')}
              {selectedPanel.sourceEntityIds.length > 6 ? ` (+${selectedPanel.sourceEntityIds.length - 6})` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Card de Inspeção Forense de Vinco/Hinge Selecionado (Fase 4 - Seção 14) */}
      {selectedCrease && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #0284C7',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#F8FAFC',
            fontSize: 11,
            zIndex: 20,
            maxWidth: 340,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: '#38BDF8', textTransform: 'uppercase' }}>
              Vinco Articulado: {selectedCrease.creaseId}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedCrease(null);
                controllerRef.current?.highlightCrease(null);
              }}
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 13 }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'monospace' }}>
            <div>sourceCreaseId: <b>{selectedCrease.sourceCreaseId}</b></div>
            <div>matchedHalfEdge: <b>{selectedCrease.matchedHalfEdgeId}</b></div>
            <div>Hierarquia: <b>{selectedCrease.parentPanelId} &rarr; {selectedCrease.childPanelId}</b></div>
            <div>Comprimento: <b>{selectedCrease.lengthMm} mm</b></div>
            <div>Ângulo Alvo: <b>{selectedCrease.targetAngleDeg}°</b> (Fonte: {selectedCrease.angleSource})</div>
            <div>Sinal Topológico: <b>{selectedCrease.topologicalSign > 0 ? '+1' : '-1'}</b> (Fonte: {selectedCrease.signSource})</div>
            <div style={{ color: selectedCrease.physicalDirection === 'NOT_DETERMINED' ? '#F59E0B' : '#10B981' }}>
              Direção Física: <b>{selectedCrease.physicalDirection}</b>
            </div>
          </div>
        </div>
      )}

      {/* Estação de Controle CAD de Dobra e Câmera 3D */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: 720,
          background: 'var(--cad-bg-panel)',
          border: '1px solid var(--cad-border-default)',
          borderRadius: 'var(--cad-radius-md)',
          boxShadow: 'var(--cad-shadow-panel)',
          padding: '12px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 15,
          userSelect: 'none',
        }}
      >
        {/* Linha Superior: Presets de Ângulo de Dobra, Inspetor de Abas e Câmera */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          {/* Presets de Dobra Global */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: '0% Aberta', val: 0.0 },
              { label: '25%', val: 0.25 },
              { label: '50%', val: 0.50 },
              { label: '75%', val: 0.75 },
              { label: '100% Montada', val: 1.0 },
            ].map((step) => {
              const isActive = Math.abs(foldProgress - step.val) < 0.05;
              return (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setFoldProgress(step.val);
                  }}
                  className="cad-btn"
                  style={{
                    padding: '3px 9px',
                    fontSize: 10,
                    fontWeight: 600,
                    background: isActive ? 'var(--cad-accent-dim)' : 'transparent',
                    borderColor: isActive ? 'var(--cad-accent)' : 'var(--cad-border-subtle)',
                    color: isActive ? 'var(--cad-accent)' : 'var(--cad-text-muted)',
                  }}
                >
                  {step.label}
                </button>
              );
            })}
          </div>

          {/* Botão de Abrir Inspetor de Ângulos de Abas (ArtiosCAD / Prinect) e Câmera */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={onOpenFoldInspector}
              title="Editar Ângulos das Abas no Painel Esquerdo (ArtiosCAD / Prinect)"
              className="cad-btn"
              style={{
                padding: '3px 9px',
                fontSize: 10,
                gap: 5,
                background: isFoldInspectorActive ? 'var(--cad-accent-dim)' : 'transparent',
                borderColor: isFoldInspectorActive ? 'var(--cad-accent)' : 'var(--cad-border-default)',
                color: isFoldInspectorActive ? 'var(--cad-accent)' : 'var(--cad-text-primary)',
              }}
            >
              <Sliders size={11} color="var(--cad-accent)" />
              <span>Ângulos das Abas</span>
              {modifiedCount > 0 && (
                <span
                  className="cad-mono"
                  style={{
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '1px 5px',
                    borderRadius: 8,
                    background: 'var(--cad-accent)',
                    color: '#000000',
                  }}
                >
                  {modifiedCount}
                </span>
              )}
            </button>

            {/* Vistas Rápidas de Câmera CAD */}
            <button
              type="button"
              onClick={snapToPerspective}
              title="Câmera Isométrica 3D"
              className="cad-btn"
              style={{ padding: '3px 8px', fontSize: 10 }}
            >
              <Box size={11} color="var(--cad-accent)" />
              <span>3D</span>
            </button>

            <button
              type="button"
              onClick={snapToTopView}
              title="Vista Superior (Planta/Topo)"
              className="cad-btn"
              style={{ padding: '3px 8px', fontSize: 10 }}
            >
              <Eye size={11} />
              <span>Topo</span>
            </button>

            <button
              type="button"
              onClick={snapToBottomView}
              title="Vista Inferior (Inspeção de Fundo)"
              className="cad-btn"
              style={{ padding: '3px 8px', fontSize: 10 }}
            >
              <Eye size={11} />
              <span>Fundo</span>
            </button>
          </div>
        </div>

        {/* Linha Inferior: Slider Tátil de Dobra e Botões de Ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            title={isPlaying ? 'Pausar Simulação' : 'Animar Sequência de Dobra'}
            className="cad-tool-btn"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--cad-accent)',
              color: '#000000',
              border: 'none',
              boxShadow: '0 0 10px rgba(0, 210, 180, 0.4)',
            }}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
          </button>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: 'var(--cad-text-muted)',
              }}
            >
              <span>0% Aberta</span>
              <span className="cad-mono" style={{ color: 'var(--cad-accent)', fontWeight: 700 }}>
                DOBRA: {Math.round(foldProgress * 100)}%
              </span>
              <span>100% Fechada</span>
            </div>
            <input
              type="range"
              className="cad-slider"
              min="0"
              max="1"
              step="0.005"
              value={foldProgress}
              onChange={(e) => {
                setIsPlaying(false);
                setFoldProgress(parseFloat(e.target.value));
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setAutoRotate((r) => !r)}
            title="Girar 360° Automaticamente"
            className={`cad-tool-btn ${autoRotate ? 'active' : ''}`}
            style={{ width: 32, height: 32 }}
          >
            <RotateCw size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
