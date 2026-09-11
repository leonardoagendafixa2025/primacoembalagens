import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { PackagingModel } from '../engine/types';
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
  const panelsRef = useRef<{
    base: THREE.Mesh;
    front: THREE.Group;
    back: THREE.Group;
    left: THREE.Group;
    right: THREE.Group;
    lid: THREE.Group;
    tuck: THREE.Group;
  } | null>(null);

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

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
    fillLight.position.set(-400, 200, -300);
    scene.add(fillLight);

    // 5. Piso com sombra suave
    const floorGeo = new THREE.PlaneGeometry(3000, 3000);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grade sutil no chão
    const grid = new THREE.GridHelper(1500, 30, 0x1e293b, 0x0f172a);
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

  // Recria a geometria 3D articulada quando os parâmetros mudam
  useEffect(() => {
    const boxGroup = boxGroupRef.current;
    if (!boxGroup) return;

    // Limpa malhas anteriores
    while (boxGroup.children.length > 0) {
      const obj = boxGroup.children[0];
      boxGroup.remove(obj);
    }

    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 150;
    const Ep = Math.max(1.5, params.Ep || 3);

    // Material de Papelão Kraft
    const kraftOuterMat = new THREE.MeshStandardMaterial({
      color: '#C29B68',
      roughness: 0.85,
      metalness: 0.05,
    });
    const kraftInnerMat = new THREE.MeshStandardMaterial({
      color: '#D4B07B',
      roughness: 0.9,
      metalness: 0.02,
    });
    const materials = [kraftOuterMat, kraftInnerMat, kraftOuterMat, kraftOuterMat, kraftOuterMat, kraftOuterMat];

    const createPanel = (w: number, h: number) => {
      const geo = new THREE.BoxGeometry(w, Ep, h);
      const mesh = new THREE.Mesh(geo, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    // 1. Fundo Base (L x B) fixo no chão
    const baseMesh = createPanel(L, B);
    baseMesh.position.set(0, Ep / 2, 0);
    boxGroup.add(baseMesh);

    // 2. Painel Frontal (L x H) articulado na borda +Z
    const frontGroup = new THREE.Group();
    frontGroup.position.set(0, Ep / 2, B / 2);
    const frontMesh = createPanel(L, H);
    frontMesh.position.set(0, 0, H / 2);
    frontGroup.add(frontMesh);
    boxGroup.add(frontGroup);

    // 3. Painel Traseiro (L x H) articulado na borda -Z
    const backGroup = new THREE.Group();
    backGroup.position.set(0, Ep / 2, -B / 2);
    const backMesh = createPanel(L, H);
    backMesh.position.set(0, 0, -H / 2);
    backGroup.add(backMesh);
    boxGroup.add(backGroup);

    // Tampa superior (L x B) articulada no topo do painel traseiro
    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, 0, -H);
    const lidMesh = createPanel(L, B);
    lidMesh.position.set(0, 0, -B / 2);
    lidGroup.add(lidMesh);
    backGroup.add(lidGroup);

    // Aba de encaixe frontal da tampa (L x 35)
    const tuckGroup = new THREE.Group();
    tuckGroup.position.set(0, 0, -B);
    const tuckH = Math.min(40, H * 0.4);
    const tuckMesh = createPanel(L * 0.95, tuckH);
    tuckMesh.position.set(0, 0, -tuckH / 2);
    tuckGroup.add(tuckMesh);
    lidGroup.add(tuckGroup);

    // 4. Painel Lateral Esquerdo (H x B) articulado na borda -X
    const leftGroup = new THREE.Group();
    leftGroup.position.set(-L / 2, Ep / 2, 0);
    const leftMesh = createPanel(H, B);
    leftMesh.position.set(-H / 2, 0, 0);
    leftGroup.add(leftMesh);
    boxGroup.add(leftGroup);

    // 5. Painel Lateral Direito (H x B) articulado na borda +X
    const rightGroup = new THREE.Group();
    rightGroup.position.set(L / 2, Ep / 2, 0);
    const rightMesh = createPanel(H, B);
    rightMesh.position.set(H / 2, 0, 0);
    rightGroup.add(rightMesh);
    boxGroup.add(rightGroup);

    panelsRef.current = {
      base: baseMesh,
      front: frontGroup,
      back: backGroup,
      left: leftGroup,
      right: rightGroup,
      lid: lidGroup,
      tuck: tuckGroup,
    };
  }, [model, params]);

  // Atualiza as rotações de dobra dos painéis 3D conforme o foldProgress
  useEffect(() => {
    if (!panelsRef.current) return;
    const { front, back, left, right, lid, tuck } = panelsRef.current;

    const angle90 = (Math.PI / 2) * foldProgress;

    // Painel frontal levanta 90°
    front.rotation.x = -angle90;

    // Painel traseiro levanta 90°
    back.rotation.x = angle90;

    // Tampa fecha 90° em relação à traseira
    lid.rotation.x = angle90;

    // Aba frontal fecha 90° para encaixar na frente
    tuck.rotation.x = angle90 * 0.9;

    // Laterais levantam 90°
    left.rotation.z = angle90;
    right.rotation.z = -angle90;
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
            background: '#3B82F6',
            color: '#FFF',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(59, 130, 246, 0.4)',
          }}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94A3B8' }}>
            <span>Plana (0%)</span>
            <span style={{ color: '#38BDF8', fontWeight: 600 }}>Dobra: {Math.round(foldProgress * 100)}%</span>
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
              accentColor: '#3B82F6',
            }}
          />
        </div>

        <button
          onClick={() => setAutoRotate((r) => !r)}
          title="Auto-Girar 360°"
          style={{
            padding: 8,
            borderRadius: 8,
            color: autoRotate ? '#38BDF8' : '#64748B',
            background: autoRotate ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
          }}
        >
          <RotateCw size={18} />
        </button>
      </div>

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
