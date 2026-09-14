import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { PackagingModel } from '../engine/types';
import { extractPanelsFromModel, buildFoldable3DTree } from '../engine/foldingEngine';
import { Play, Pause, RotateCw, Layers } from 'lucide-react';

interface FoldingViewer3DProps {
  model: PackagingModel;
  params: Record<string, number>;
}

export const FoldingViewer3D: React.FC<FoldingViewer3DProps> = ({ model, params }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Progresso da dobra: 0 (aberta) a 1 (montada)
  const [foldProgress, setFoldProgress] = useState(0.85);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);

  // Refs Three.js
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const boxGroupRef = useRef<THREE.Group | null>(null);

  // Configuração inicial da cena Three.js
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // 1. Cena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B0F17');
    sceneRef.current = scene;

    // 2. Câmera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(400, 350, 500);
    camera.lookAt(0, 50, 0);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Luzes
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.2);
    dirLight.position.set(300, 600, 400);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x35a89e, 0.35);
    fillLight.position.set(-400, 200, -300);
    scene.add(fillLight);

    // 5. Piso com sombra suave
    const floorGeo = new THREE.PlaneGeometry(3000, 3000);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grade sutil no chão (Preto com acento Teal Primacor)
    const grid = new THREE.GridHelper(1500, 30, 0x35a89e, 0x1a2020);
    grid.position.y = 0;
    scene.add(grid);

    // 6. Grupo da Caixa
    const boxGroup = new THREE.Group();
    scene.add(boxGroup);
    boxGroupRef.current = boxGroup;

    // Controles de Órbita via Mouse
    let isMouseDown = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    const spherical = { radius: 700, theta: Math.PI / 4, phi: Math.PI / 3 };

    const updateCameraPosition = () => {
      spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, spherical.phi));
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = spherical.radius * Math.cos(spherical.phi);
      camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(0, 50, 0);
    };
    updateCameraPosition();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      spherical.theta -= deltaX * 0.006;
      spherical.phi -= deltaY * 0.006;
      updateCameraPosition();
    };

    const onMouseUp = () => {
      isMouseDown = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(200, Math.min(1800, spherical.radius + e.deltaY * 0.8));
      updateCameraPosition();
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel);

    // Loop de Animação
    let reqId = 0;
    const animate = () => {
      reqId = requestAnimationFrame(animate);

      if (autoRotate && !isMouseDown) {
        spherical.theta += 0.005;
        updateCameraPosition();
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      if (mount.contains(dom)) {
        mount.removeChild(dom);
      }
      renderer.dispose();
    };
  }, [autoRotate]);

  const updateProgressRef = useRef<((progress: number) => void) | null>(null);

  // Recria a geometria 3D articulada a partir da faca real quando o modelo ou parâmetros mudam
  useEffect(() => {
    const boxGroup = boxGroupRef.current;
    if (!boxGroup) return;

    // Limpa malhas anteriores
    while (boxGroup.children.length > 0) {
      const obj = boxGroup.children[0];
      boxGroup.remove(obj);
    }

    const Ep = Math.max(1.0, params.Ep || 3);

    // 1. Calcula a geometria real da faca a partir do motor paramétrico com proteção estrita
    try {
      if (model.status === 'PASS' && model.isFoldable) {
        const dieline = model.calculate(params);
        const panels = extractPanelsFromModel(model.code || model.id, dieline, params);
        if (panels && panels.length > 0) {
          const tree = buildFoldable3DTree(panels, Ep);
          boxGroup.add(tree.rootGroup);
          updateProgressRef.current = tree.updateProgress;
          tree.updateProgress(foldProgress);
          return;
        }
      }
      updateProgressRef.current = null;
    } catch (e) {
      console.warn('[FoldingViewer3D] Unable to fold model:', e);
      updateProgressRef.current = null;
    }
  }, [model, params]);

  // Atualiza as rotações de dobra dos painéis 3D conforme o foldProgress (0% = aberta, 100% = montada)
  useEffect(() => {
    if (updateProgressRef.current) {
      updateProgressRef.current(foldProgress);
    }
  }, [foldProgress]);

  // Animação de abrir/fechar contínua quando o usuário aperta Play
  useEffect(() => {
    if (!isPlaying) return;
    let forward = true;
    const interval = setInterval(() => {
      setFoldProgress((prev) => {
        if (prev >= 1) forward = false;
        if (prev <= 0.05) forward = true;
        const next = forward ? prev + 0.015 : prev - 0.015;
        return Math.max(0, Math.min(1, next));
      });
    }, 25);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0B0F17' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

      {/* Barra de Controle de Dobra (Fold Slider) */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '12px 24px',
          borderRadius: 30,
          zIndex: 10,
          minWidth: 420,
        }}
      >
        <button
          onClick={() => setIsPlaying((p) => !p)}
          title={isPlaying ? 'Pausar Simulação' : 'Animar Dobra'}
          style={{
            background: '#35a89e',
            color: '#000000',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 14px rgba(53, 168, 158, 0.45)',
          }}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94A3B8' }}>
            <span>Plana (0%)</span>
            <span style={{ color: '#35a89e', fontWeight: 700 }}>Dobra: {Math.round(foldProgress * 100)}%</span>
            <span>Montada (100%)</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={foldProgress}
            onChange={(e) => {
              setIsPlaying(false);
              setFoldProgress(parseFloat(e.target.value));
            }}
            style={{
              width: '100%',
              cursor: 'pointer',
              accentColor: '#35a89e',
            }}
          />
        </div>

        <button
          onClick={() => setAutoRotate((r) => !r)}
          title="Auto-Girar 360°"
          style={{
            padding: 8,
            borderRadius: 8,
            color: autoRotate ? '#35a89e' : '#64748B',
            background: autoRotate ? 'rgba(53, 168, 158, 0.15)' : 'transparent',
          }}
        >
          <RotateCw size={18} />
        </button>
      </div>

            {/* Banner de Modelo 2D Plano / Não Dobrável */}
      {model && model.status === 'NON_FOLDABLE' && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid #35a89e',
            borderRadius: 8,
            padding: '10px 18px',
            color: '#E2E8F0',
            fontSize: 13,
            zIndex: 20,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#35a89e' }} />
          <span>
            <strong>Modelo 2D Vetorial Plano:</strong> Este modelo ({model.code}) é um desenho técnico bidimensional e não possui estrutura de articulação/dobra 3D.
          </span>
        </div>
      )}

      {/* Diagnóstico Técnico de Modelo Não Disponível para Dobra 3D */}
      {model && model.status !== 'PASS' && model.status !== 'NON_FOLDABLE' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(5, 8, 15, 0.88)',
            backdropFilter: 'blur(8px)',
            zIndex: 20,
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: '100%',
              background: '#0B0F17',
              border: '1px solid #EF4444',
              borderRadius: 12,
              padding: 24,
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              color: '#E2E8F0',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700, color: '#FFFFFF' }}>
              VISUALIZAÇÃO 3D INDISPONÍVEL
            </h3>
            <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              {model.error ||
                `O modelo "${model.code}" possui status ${model.status}. A geração de caixa 3D arbitrária está desativada pela regra Zero Fallback.`}
            </p>
            <div
              style={{
                display: 'inline-block',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'monospace',
                color: '#FCA5A5',
              }}
            >
              STATUS: {model.status} | ZERO FALLBACK
            </div>
          </div>
        </div>
      )}
{/* Dica de Interação 3D */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          fontSize: 12,
          color: '#64748B',
          background: 'rgba(15, 23, 42, 0.6)',
          padding: '6px 12px',
          borderRadius: 6,
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Layers size={14} />
        <span>Clique e arraste com o mouse para girar 360° | Scroll para zoom</span>
      </div>
    </div>
  );
};
