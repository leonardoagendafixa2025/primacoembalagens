import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildFoldable3DTree, type FoldableTreeResult } from '../../engine/foldingEngine';
import type { DielineResult } from '../../engine/types';

export interface StudioProjectData {
  projectId: string;
  projectName: string;
  modelCode?: string;
  geometryVersion?: number;
  dieline: DielineResult;
  substrate?: {
    outerColor?: string;
    innerColor?: string;
    thickness?: number;
  };
}

class PLMStudioViewer {
  private container: HTMLElement | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private boxGroup: THREE.Group;
  private currentTree: FoldableTreeResult | null = null;
  private currentTexture: THREE.Texture | null = null;
  private currentProject: StudioProjectData | null = null;

  private foldProgress: number = 1.0;
  private isAutoRotating: boolean = false;
  private substrateMode: 'cartao' | 'kraft' = 'cartao';
  private animationFrameId: number | null = null;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13161c); // Estúdio profissional escuro

    this.camera = new THREE.PerspectiveCamera(40, 1, 1, 10000);
    this.camera.position.set(380, 290, 420);

    this.boxGroup = new THREE.Group();
    this.scene.add(this.boxGroup);

    this.setupLighting();
  }

  private setupLighting() {
    // Luz ambiente para sombras suaves
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambientLight);

    // Luz principal de estúdio (Key Light)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(350, 600, 400);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    // Luz de preenchimento (Fill Light)
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.8);
    fillLight.position.set(-350, 300, -250);
    this.scene.add(fillLight);

    // Luz de contorno superior (Rim Light)
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, -400, 200);
    this.scene.add(rimLight);

    // Grade de piso de estúdio elegante
    const grid = new THREE.GridHelper(1000, 40, 0x2a3242, 0x1a202c);
    grid.position.y = -0.5;
    this.scene.add(grid);
  }

  public init(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 350;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 3000;
    this.controls.minDistance = 40;

    window.addEventListener('resize', this.onResize);
    this.startRenderLoop();
  }

  private onResize = () => {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private startRenderLoop = () => {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);

      if (this.controls) {
        if (this.isAutoRotating) {
          this.boxGroup.rotation.y += 0.008;
        }
        this.controls.update();
      }

      if (this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  };

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.onResize);
  }

  private lastArtworkDataUri: string | null = null;

  public loadModel(project: StudioProjectData) {
    this.currentProject = project;

    if (!project.dieline) {
      console.warn('[PLMStudio] Objeto project.dieline ausente no payload');
      return;
    }

    if (!project.dieline.bounds) {
      project.dieline.bounds = { minX: 0, minY: 0, maxX: 500, maxY: 500, width: 500, height: 500 };
    }

    // Se project.dieline não tiver customTopology mas tiver project.panels, reconstrói customTopology com centroid
    if (!project.dieline.customTopology && (project as any).panels) {
      const pList = (project as any).panels;
      project.dieline.customTopology = {
        panels: pList.map((p: any) => {
          const pts = (p.polygon || []).map((pt: any) => ({ x: pt.x, y: pt.y }));
          let cx = 0, cy = 0;
          if (pts.length > 0) {
            for (const pt of pts) { cx += pt.x; cy += pt.y; }
            cx /= pts.length;
            cy /= pts.length;
          }
          return {
            id: p.id,
            name: p.name,
            isRoot: !!p.isRoot,
            boundary: pts,
            centroid: { x: cx, y: cy },
            holes: [],
            hingeToParent: p.hingeToParent || null,
          };
        }),
        hinges: [],
      };
    }

    // Limpa a malha anterior
    while (this.boxGroup.children.length > 0) {
      const child = this.boxGroup.children[0];
      this.boxGroup.remove(child);
    }

    const thickness = project.substrate?.thickness || 0.45;
    const isKraft = this.substrateMode === 'kraft';
    const outerColor = isKraft ? '#C89D68' : '#FFFFFF';
    const innerColor = isKraft ? '#B38652' : '#F1EFEA';

    try {
      this.currentTree = buildFoldable3DTree(
        project.dieline,
        thickness,
        outerColor,
        innerColor,
        0.26,
        {},
        this.currentTexture
      );

      this.boxGroup.add(this.currentTree.rootGroup);
      this.currentTree.updateProgress(this.foldProgress);

      // Centraliza a caixa na cena
      const bbox = new THREE.Box3().setFromObject(this.boxGroup);
      const center = bbox.getCenter(new THREE.Vector3());
      this.boxGroup.position.sub(center);

      // Ajusta câmera para enquadrar a embalagem
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 150);
      this.camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.7);
      if (this.controls) {
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }

      // Se houver arte anterior, reaplica com a cor atual do substrato
      if (this.lastArtworkDataUri) {
        this.updateArtwork(this.lastArtworkDataUri);
      }
    } catch (err) {
      console.error('[PLMStudio] Erro ao construir árvore 3D do modelo:', err);
    }
  }

  public updateArtwork(dataUri: string) {
    this.lastArtworkDataUri = dataUri;
    const isKraft = this.substrateMode === 'kraft';
    const substrateColor = isKraft ? '#C89D68' : '#FFFFFF';

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Pinta todo o fundo com a cor do papel/substrato (elimina o fundo preto)
      ctx.fillStyle = substrateColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Desenha a arte impressa com transparência preservada por cima
      ctx.drawImage(img, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = true;
      tex.needsUpdate = true;
      this.currentTexture = tex;

      if (this.currentTree) {
        this.currentTree.updateArtwork(tex);
      }
    };
    img.onerror = (err) => {
      console.error('[PLMStudio] Erro ao carregar imagem de arte:', err);
    };
    img.src = dataUri;
  }

  public setFoldProgress(val: number) {
    this.foldProgress = Math.max(0, Math.min(1, val));
    if (this.currentTree) {
      this.currentTree.updateProgress(this.foldProgress);
    }
  }

  public getFoldProgress(): number {
    return this.foldProgress;
  }

  public setCameraView(preset: 'iso' | 'front' | 'top') {
    if (!this.controls) return;
    const bbox = new THREE.Box3().setFromObject(this.boxGroup);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 150);

    if (preset === 'iso') {
      this.camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.7);
    } else if (preset === 'front') {
      this.camera.position.set(0, 0, maxDim * 2.2);
    } else if (preset === 'top') {
      this.camera.position.set(0, maxDim * 2.4, 0.001);
    }

    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  public setSubstrate(mode: 'cartao' | 'kraft') {
    this.substrateMode = mode;
    if (this.currentProject) {
      this.loadModel(this.currentProject);
    }
  }

  public toggleAutoRotate(): boolean {
    this.isAutoRotating = !this.isAutoRotating;
    return this.isAutoRotating;
  }
}

// Instância global disponível para a interface CEP
const studioInstance = new PLMStudioViewer();
(window as any).PLMStudio = studioInstance;
export default studioInstance;
