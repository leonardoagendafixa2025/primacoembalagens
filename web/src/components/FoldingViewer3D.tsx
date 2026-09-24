import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import type { PackagingModel, DielineResult, CardboardProfile } from '../engine/types';
import { LoopTopologyEngine, type StructuralPanel } from '../engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine, type FoldingTreeResult } from '../engine/importers/FoldingTreeEngine';
import { TopologyReconstructor } from '../engine/importers/TopologyReconstructor';
import { convertDielineTopologyToStructural, buildFoldingTopology } from '../engine/dielineTopology';
import {
  ThreeGeometryAdapter,
  type ThreeModelController,
  type HingeControlInfo,
  type PanelProvenanceData,
  type CreaseProvenanceData,
} from '../engine/renderers/ThreeGeometryAdapter';
import { Play, Pause, RotateCw, Box, Eye, Sliders, Grid } from 'lucide-react';

interface FoldingViewer3DProps {
  model: PackagingModel;
  params: Record<string, number>;
  dieline?: DielineResult;
  profile?: CardboardProfile;
  customAngles?: Record<string, number>;
  selectedPanelId?: string | null;
  onSelectPanel?: (panelId: string | null) => void;
  onAngleChange?: (panelId: string, angleDeg: number) => void;
  onResetAngle?: (panelId: string) => void;
  onResetAllAngles?: () => void;
  onHingeListUpdate?: (list: HingeControlInfo[]) => void;
  onOpenFoldInspector?: () => void;
  isFoldInspectorActive?: boolean;
  artworkTextureUri?: string | null;
  outerArtworkTextureUri?: string | null;
  innerArtworkTextureUri?: string | null;
}

export const FoldingViewer3D: React.FC<FoldingViewer3DProps> = ({
  model,
  params,
  dieline,
  profile,
  customAngles = {},
  selectedPanelId = null,
  onSelectPanel,
  onAngleChange,
  onResetAngle,
  onResetAllAngles,
  onHingeListUpdate,
  onOpenFoldInspector,
  isFoldInspectorActive = false,
  artworkTextureUri = null,
  outerArtworkTextureUri = null,
  innerArtworkTextureUri = null,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Progresso da dobra: 0 (aberta) a 1 (montada)
  const [foldProgress, setFoldProgress] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [isWireframe, setIsWireframe] = useState(false);

  // Estado de seleção e metadados para inspeção forense no 3D
  const [selectedPanel, setSelectedPanel] = useState<PanelProvenanceData | null>(null);
  const [selectedCrease, setSelectedCrease] = useState<CreaseProvenanceData | null>(null);

  // Lista interna de vincos para contagem e status
  const [hingeList, setHingeList] = useState<HingeControlInfo[]>([]);

  // Texturas de Arte vinda do Adobe Illustrator (Externa + Interna)
  const effectiveOuterUri = outerArtworkTextureUri || artworkTextureUri;
  const [outerArtworkTexture, setOuterArtworkTexture] = useState<THREE.Texture | null>(null);
  const [innerArtworkTexture, setInnerArtworkTexture] = useState<THREE.Texture | null>(null);

  // Refs Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const boxGroupRef = useRef<THREE.Group | null>(null);
  const updateProgressRef = useRef<((progress: number) => void) | null>(null);
  const controllerRef = useRef<ThreeModelController | null>(null);
  const downPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPointerDownRef = useRef(false);
  const autoRotateRef = useRef(false);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  const outerTexRef = useRef<THREE.Texture | null>(null);
  const innerTexRef = useRef<THREE.Texture | null>(null);

  // Carrega textura externa sincronizada da arte do Illustrator
  useEffect(() => {
    if (!effectiveOuterUri) {
      outerTexRef.current = null;
      setOuterArtworkTexture(null);
      controllerRef.current?.updateArtwork(null, innerTexRef.current);
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

      const substrateColor = profile?.outerColor || '#FFFFFF';
      ctx.fillStyle = substrateColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.needsUpdate = true;
      outerTexRef.current = tex;
      setOuterArtworkTexture(tex);
      controllerRef.current?.updateArtwork(tex, innerTexRef.current);
    };
    img.src = effectiveOuterUri;
  }, [effectiveOuterUri, profile?.outerColor]);

  // Carrega textura interna sincronizada da arte do Illustrator
  useEffect(() => {
    if (!innerArtworkTextureUri) {
      innerTexRef.current = null;
      setInnerArtworkTexture(null);
      controllerRef.current?.updateArtwork(outerTexRef.current, null);
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

      const substrateColor = profile?.innerColor || '#FFFFFF';
      ctx.fillStyle = substrateColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.needsUpdate = true;
      innerTexRef.current = tex;
      setInnerArtworkTexture(tex);
      controllerRef.current?.updateArtwork(outerTexRef.current, tex);
    };
    img.src = innerArtworkTextureUri;
  }, [innerArtworkTextureUri, profile?.innerColor]);

  // Configuração inicial da cena Three.js com TrackballControls profissional (360° Horizontal e Vertical Livres)
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
    camera.up.set(0, 1, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. TrackballControls: resposta em TEMPO REAL DIRETA 1:1 sem atraso/lag elástico
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 3.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.staticMoving = true; // Tempo real instantâneo e síncrono com o mouse
    controls.dynamicDampingFactor = 0.9;
    controls.minDistance = 30;
    controls.maxDistance = 8000;
    controls.target.set(0, 0, 0);
    controls.handleResize();
    controlsRef.current = controls;

    // 5. Luzes de estúdio balanceadas (Daylight Neutro para fidelidade do papel cartão BRANCO)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    mainLight.position.set(450, 800, 500);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
    fillLight.position.set(-500, 400, -300);
    scene.add(fillLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.6);
    backLight.position.set(0, 600, -500);
    scene.add(backLight);

    const bottomLight = new THREE.DirectionalLight(0xffffff, 0.8);
    bottomLight.position.set(0, -600, 0);
    scene.add(bottomLight);

    // 6. Grupo da Caixa (sem chão ou grade, permitindo inspeção flutuante 360° pura)
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
          controls.handleResize();
        }
      }
    });
    resizeObserver.observe(mount);

    // Loop de Animação suave com Damping do TrackballControls e suporte a AutoRotate
    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);

      if (autoRotateRef.current && controlsRef.current) {
        // Gira 360° horizontalmente em torno do centróide (0, 0, 0)
        const angle = 0.008;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const x = camera.position.x;
        const z = camera.position.z;
        camera.position.x = x * cosA - z * sinA;
        camera.position.z = x * sinA + z * cosA;
        camera.lookAt(controlsRef.current.target);
      }

      if (controlsRef.current) {
        controlsRef.current.update();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      if (controllerRef.current && typeof controllerRef.current.dispose === 'function') {
        try { controllerRef.current.dispose(); } catch {}
        controllerRef.current = null;
      }
      if (controlsRef.current && typeof controlsRef.current.dispose === 'function') {
        try { controlsRef.current.dispose(); } catch {}
      }
      if (mount && renderer && mount.contains(renderer.domElement)) {
        try { mount.removeChild(renderer.domElement); } catch {}
      }
      if (renderer && typeof renderer.dispose === 'function') {
        try { renderer.dispose(); } catch {}
      }
    };
  }, []);

  // Recria a geometria 3D articulada a partir da MESMA faca 2D real
  useEffect(() => {
    const boxGroup = boxGroupRef.current;
    if (!boxGroup) return;

    // Limpa malhas anteriores e desaloca buffers WebGL
    if (controllerRef.current && typeof controllerRef.current.dispose === 'function') {
      try { controllerRef.current.dispose(); } catch {}
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
      const currentDieline = dieline || model.calculate(params);

      let panels: StructuralPanel[];
      let foldingTree: FoldingTreeResult;

      if (currentDieline.customTopology && currentDieline.customTopology.panels && currentDieline.customTopology.panels.length > 0) {
        const converted = convertDielineTopologyToStructural(currentDieline.customTopology);
        panels = converted.panels;
        foldingTree = converted.foldingTree;
      } else {
        // Reconstrói a topologia planar para facas importadas ou editadas
        // Isso resolve T-junctions, une micro-gaps e conecta vértices entre cortes e vincos
        const recon = TopologyReconstructor.reconstructConnectivity(currentDieline, {
          gapToleranceMm: 0.35,
          tJunctionToleranceMm: 0.35,
          coincidentToleranceMm: 0.08,
        });
        const geom = recon.geometry || currentDieline;
        let topo = LoopTopologyEngine.extractTopology(geom);

        if (topo.panels.length === 0) {
          topo = LoopTopologyEngine.extractTopology(currentDieline);
        }

        if (topo.panels.length > 0) {
          foldingTree = FoldingTreeEngine.buildFoldingTree(topo.panels, geom);
          panels = topo.panels;
        } else {
          const fallbackTopo = buildFoldingTopology(currentDieline);
          const converted = convertDielineTopologyToStructural(fallbackTopo);
          panels = converted.panels;
          foldingTree = converted.foldingTree;
        }
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
          artworkTexture: outerTexRef.current || outerArtworkTexture,
          outerArtworkTexture: outerTexRef.current || outerArtworkTexture,
          innerArtworkTexture: innerTexRef.current || innerArtworkTexture,
          dielineBounds: currentDieline.bounds,
        }
      );
      controllerRef.current = controller;

      const list = controller.getHingeInfoList();
      setHingeList(list);
      onHingeListUpdate?.(list);
      if (selectedPanelId) {
        controller.highlightPanel(selectedPanelId);
      }
      if (isWireframe) {
        controller.setWireframe(true);
      }

      if (controller.panelsCount > 0) {
        // Orienta o modelo de modo que o topo fique sempre em +Y e o fundo em -Y/plano horizontal:
        // - Para bandejas/envelopes (FEFCO 04xx / 03xx / 09xx): a base 2D está no plano XY e as abas dobram em +Z.
        //   Rotacionamos -90° em X para que a base fique horizontal (plano XZ) e as abas subam em +Y.
        // - Para modelos tubulares (FEFCO 02xx / 07xx / ECMA A/B/E): os painéis já formam um tubo vertical ao longo de Y,
        //   portanto permanecem perfeitamente eretos com rotation.x = 0.
        const codeStr = (model.code || model.id || '').toUpperCase();
        const isTrayOrFolder =
          codeStr.includes('FEFCO 04') ||
          codeStr.includes('FEFCO_04') ||
          codeStr.includes('FEFCO_F4') ||
          codeStr.includes('FEFCO 03') ||
          codeStr.includes('FEFCO_03') ||
          codeStr.includes('FEFCO_F3') ||
          codeStr.includes('FEFCO 09') ||
          codeStr.includes('FEFCO_09') ||
          Boolean(model.series && (
            model.series.includes('0400') ||
            model.series.includes('0300') ||
            model.series.includes('0900') ||
            model.series.includes('Bandejas') ||
            model.series.includes('Gavetas')
          ));

        if (isTrayOrFolder) {
          controller.rootGroup.rotation.x = -Math.PI / 2;
        } else {
          controller.rootGroup.rotation.x = 0;
        }

        // Função de fechamento que SEMPRE centraliza o centróide 3D da caixa exatamente na origem (0, 0, 0)
        const updateWithCentering = (progress: number) => {
          controller.rootGroup.position.set(0, 0, 0);
          controller.updateFoldPercent(progress * 100);
          boxGroup.updateMatrixWorld(true);
          const bbox = new THREE.Box3().setFromObject(boxGroup);

          const cx = (bbox.min.x + bbox.max.x) / 2;
          const cy = (bbox.min.y + bbox.max.y) / 2;
          const cz = (bbox.min.z + bbox.max.z) / 2;
          controller.rootGroup.position.set(-cx, -cy, -cz);
          boxGroup.updateMatrixWorld(true);
        };

        boxGroup.add(controller.rootGroup);
        updateProgressRef.current = updateWithCentering;
        updateWithCentering(foldProgress);

        // Auto-enquadramento suave da câmera em torno do centro 3D do modelo
        boxGroup.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(boxGroup);
        if (controlsRef.current && cameraRef.current) {
          controlsRef.current.target.set(0, 0, 0);

          const sphere = new THREE.Sphere();
          bbox.getBoundingSphere(sphere);
          if (sphere.radius > 10) {
            const dist = Math.max(450, sphere.radius * 2.2);
            cameraRef.current.position.set(dist * 0.7, dist * 0.65, dist * 0.7);
            cameraRef.current.up.set(0, 1, 0);
            cameraRef.current.lookAt(0, 0, 0);
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
  }, [model, params, dieline, profile, customAngles]);

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

  // Funções de câmera para validação visual rápida em 360° x 360°
  const snapToTopView = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    controls.target.set(0, 0, 0);
    const dist = camera.position.length() || 800;
    camera.position.set(0, dist, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    controls.update();
  };

  const snapToPerspective = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    controls.target.set(0, 0, 0);
    const dist = 750;
    camera.position.set(dist * 0.7, dist * 0.65, dist * 0.7);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    controls.update();
  };

  const snapToBottomView = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    controls.target.set(0, 0, 0);
    const dist = camera.position.length() || 800;
    camera.position.set(0, -dist, 0);
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
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

  // Sincroniza modo aramado (Wireframe 3D) em tempo real
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setWireframe(isWireframe);
    }
  }, [isWireframe]);

  // Raycasting 3D interativo para seleção de abas ou vincos via clique
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = true;
    downPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false;
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
    if (isPointerDownRef.current) return; // Ignora raycast durante rotação em tempo real para 60/120 FPS cravados
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
        style={{ width: '100%', height: '100%', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      />

      {/* Card de Controle de Ângulo e Inspeção da Aba Selecionada (Fase 4) */}
      {selectedPanel && (() => {
        const panelHinge = hingeList.find((h) => h.panelId === selectedPanel.panelId);
        const currentAngle = panelHinge
          ? (customAngles[panelHinge.panelId] ?? panelHinge.currentAngleDeg)
          : 0;
        const isModified = panelHinge ? customAngles[panelHinge.panelId] !== undefined : false;

        return (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #38BDF8',
              borderRadius: 8,
              padding: '14px 16px',
              color: '#F8FAFC',
              fontSize: 11,
              zIndex: 20,
              width: 320,
              maxWidth: 'calc(100% - 32px)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 800, color: '#38BDF8', textTransform: 'uppercase', fontSize: 12 }}>
                  {panelHinge?.panelName || `Painel: ${selectedPanel.panelId}`}
                </span>
                {isModified && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: '#38BDF8',
                      border: '1px solid #38BDF8',
                    }}
                  >
                    Editado
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPanel(null);
                  controllerRef.current?.highlightPanel(null);
                  onSelectPanel?.(null);
                }}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 14 }}
              >
                ✕
              </button>
            </div>

            {/* Controle de Ângulo (Graus) */}
            {panelHinge ? (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Ângulo de Dobra:</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#38BDF8' }}>
                    {Math.round(currentAngle)}°
                  </span>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={currentAngle}
                  onChange={(e) => onAngleChange?.(panelHinge.panelId, parseFloat(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: '#38BDF8' }}
                />

                {/* Botões Rápidos de Graus */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {[
                    { label: '0° Plano', val: 0 },
                    { label: '45°', val: 45 },
                    { label: '90° Reto', val: 90 },
                    { label: '180° Fechado', val: 180 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => onAngleChange?.(panelHinge.panelId, p.val)}
                      style={{
                        padding: '4px 2px',
                        fontSize: 9.5,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: Math.abs(currentAngle - p.val) < 1 ? '#38BDF8' : 'rgba(15, 23, 42, 0.6)',
                        color: Math.abs(currentAngle - p.val) < 1 ? '#000000' : '#E2E8F0',
                        cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Ações Extras: Inverter e Restaurar */}
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => onAngleChange?.(panelHinge.panelId, -currentAngle)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      background: 'rgba(56, 189, 248, 0.1)',
                      color: '#38BDF8',
                      cursor: 'pointer',
                    }}
                  >
                    Inverter (+ / -)
                  </button>
                  <button
                    type="button"
                    onClick={() => onAngleChange?.(panelHinge.panelId, (currentAngle + 90) % 360 > 180 ? (currentAngle + 90) % 360 - 360 : (currentAngle + 90) % 360)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      background: 'rgba(56, 189, 248, 0.1)',
                      color: '#38BDF8',
                      cursor: 'pointer',
                    }}
                  >
                    Virar +90°
                  </button>
                  {isModified && (
                    <button
                      type="button"
                      onClick={() => onResetAngle?.(panelHinge.panelId)}
                      style={{
                        padding: '4px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        cursor: 'pointer',
                      }}
                    >
                      Padrão
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.5)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 10.5,
                  color: '#94A3B8',
                }}
              >
                Painel Base Central (Origem / Fixo a 0°)
              </div>
            )}

            {/* Informações Estruturais */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>
              <div>Área Líquida: <b>{selectedPanel.areaMm2.toFixed(1)} mm²</b></div>
              <div>Segmentos: <b>{selectedPanel.boundarySegmentsCount}</b> | Arcos: <b>{selectedPanel.boundaryArcsCount}</b></div>
            </div>
          </div>
        );
      })()}

      {/* Card de Inspeção Forense de Vinco/Hinge Selecionado (Fase 4) */}
      {selectedCrease && (() => {
        const creaseHinge = hingeList.find((h) => h.panelId === selectedCrease.childPanelId);
        const currentAngle = creaseHinge
          ? (customAngles[creaseHinge.panelId] ?? creaseHinge.currentAngleDeg)
          : selectedCrease.targetAngleDeg;
        const isModified = creaseHinge ? customAngles[creaseHinge.panelId] !== undefined : false;

        return (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid #0284C7',
              borderRadius: 8,
              padding: '14px 16px',
              color: '#F8FAFC',
              fontSize: 11,
              zIndex: 20,
              width: 320,
              maxWidth: 'calc(100% - 32px)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#38BDF8', textTransform: 'uppercase', fontSize: 12 }}>
                Vinco Articulado: {selectedCrease.creaseId}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCrease(null);
                  controllerRef.current?.highlightCrease(null);
                }}
                style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 14 }}
              >
                ✕
              </button>
            </div>

            {/* Controle de Ângulo Direto */}
            {creaseHinge && (
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Ângulo da Aba:</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#38BDF8' }}>
                    {Math.round(currentAngle)}°
                  </span>
                </div>

                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={currentAngle}
                  onChange={(e) => onAngleChange?.(creaseHinge.panelId, parseFloat(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: '#38BDF8' }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  {[
                    { label: '0° Plano', val: 0 },
                    { label: '45°', val: 45 },
                    { label: '90° Reto', val: 90 },
                    { label: '180° Fechado', val: 180 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => onAngleChange?.(creaseHinge.panelId, p.val)}
                      style={{
                        padding: '4px 2px',
                        fontSize: 9.5,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        background: Math.abs(currentAngle - p.val) < 1 ? '#38BDF8' : 'rgba(15, 23, 42, 0.6)',
                        color: Math.abs(currentAngle - p.val) < 1 ? '#000000' : '#E2E8F0',
                        cursor: 'pointer',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => onAngleChange?.(creaseHinge.panelId, -currentAngle)}
                    style={{
                      flex: 1,
                      padding: '4px 8px',
                      fontSize: 10,
                      fontWeight: 600,
                      borderRadius: 4,
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      background: 'rgba(56, 189, 248, 0.1)',
                      color: '#38BDF8',
                      cursor: 'pointer',
                    }}
                  >
                    Inverter (+ / -)
                  </button>
                  {isModified && (
                    <button
                      type="button"
                      onClick={() => onResetAngle?.(creaseHinge.panelId)}
                      style={{
                        padding: '4px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        cursor: 'pointer',
                      }}
                    >
                      Padrão
                    </button>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'monospace', fontSize: 10, color: '#94A3B8' }}>
              <div>Hierarquia: <b>{selectedCrease.parentPanelId} &rarr; {selectedCrease.childPanelId}</b></div>
              <div>Comprimento: <b>{selectedCrease.lengthMm} mm</b></div>
            </div>
          </div>
        );
      })()}

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

            {modifiedCount > 0 && onResetAllAngles && (
              <button
                type="button"
                onClick={onResetAllAngles}
                title="Restaurar Todos os Ângulos de Dobra para o Padrão"
                className="cad-btn"
                style={{
                  padding: '3px 8px',
                  fontSize: 10,
                  color: '#EF4444',
                  borderColor: 'rgba(239, 68, 68, 0.4)',
                  background: 'rgba(239, 68, 68, 0.08)',
                }}
              >
                <span>Resetar ({modifiedCount})</span>
              </button>
            )}

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

            {/* Modo Aramado (Wireframe 3D) */}
            <button
              type="button"
              onClick={() => setIsWireframe((w) => !w)}
              title={isWireframe ? 'Alternar para Modo Sólido (Sombreamento)' : 'Alternar para Modo Aramado (Wireframe 3D)'}
              className="cad-btn"
              style={{
                padding: '3px 8px',
                fontSize: 10,
                background: isWireframe ? 'var(--cad-accent-dim)' : 'transparent',
                borderColor: isWireframe ? 'var(--cad-accent)' : 'var(--cad-border-default)',
                color: isWireframe ? 'var(--cad-accent)' : 'var(--cad-text-primary)',
              }}
            >
              <Grid size={11} color="var(--cad-accent)" />
              <span>Aramado</span>
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
