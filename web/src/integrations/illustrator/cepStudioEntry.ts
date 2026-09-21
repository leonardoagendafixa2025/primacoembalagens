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

    // Piso semi-transparente para permitir visualização por baixo da base
    const floorGeo = new THREE.PlaneGeometry(3000, 3000);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.25 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Grade no chão ancorada em Y=0 (idêntica à Web)
    const grid = new THREE.GridHelper(2000, 40, 0x35a89e, 0x1a2428);
    grid.position.y = 0;
    this.scene.add(grid);
  }

  public isInitialized: boolean = false;
  private resizeObserver: ResizeObserver | null = null;

  public init(container: HTMLElement) {
    if (this.isInitialized && this.renderer) return;
    this.container = container;

    const width = Math.max(container.clientWidth || 0, 300);
    const height = Math.max(container.clientHeight || 0, 250);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
    } catch (err: any) {
      console.error('[PLMStudio] Erro crítico ao criar WebGLRenderer:', err);
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;color:#f87171;background:#14171d;">
          <span style="font-size:36px;margin-bottom:10px;">⚠️</span>
          <strong style="font-size:13px;color:#ffffff;margin-bottom:6px;">Aceleração 3D (WebGL) Bloqueada</strong>
          <p style="font-size:11px;color:#94a3b8;line-height:1.45;max-width:280px;">
            O Adobe Illustrator nesta máquina bloqueou o WebGL. Atualize o driver da placa de vídeo ou verifique as permissões de GPU.
          </p>
        </div>
      `;
      return;
    }

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
    if (typeof ResizeObserver !== 'undefined') {
      try {
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(container);
      } catch (e) {
        // Fallback silencioso para ambientes sem ResizeObserver
      }
    }

    this.isInitialized = true;
    this.startRenderLoop();
  }

  private onResize = () => {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w <= 0 || h <= 0) return;

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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
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

    if (!project.dieline.segments && (project.dieline as any).lines) {
      project.dieline.segments = ((project.dieline as any).lines || []).map((l: any) => ({
        x0: l.x1,
        y0: l.y1,
        x1: l.x2,
        y1: l.y2,
        type: l.type,
      }));
    }
    if (!project.dieline.arcs) {
      project.dieline.arcs = [];
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

      // Verifica se é modelo tubular (FEFCO 02xx / 07xx / ECMA A, B, E, X) para manter a caixa em pé com o fundo no chão
      const codeStr = (project.modelCode || project.projectName || '').toUpperCase();
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
        codeStr.startsWith('ECMA_X');

      if (isTubular) {
        // Rotaciona 90° em torno de X para colocar o fundo (+Z) voltado para o chão (-Y) e a tampa para cima (+Y)
        this.currentTree.rootGroup.rotation.x = Math.PI / 2;
      }

      this.boxGroup.add(this.currentTree.rootGroup);
      this.updateWithGrounding(this.foldProgress);

      // Auto-enquadramento suave da câmera na altura real da caixa
      this.boxGroup.updateMatrixWorld(true);
      const bbox = new THREE.Box3().setFromObject(this.boxGroup);
      const boxH = Math.max(30, bbox.max.y - bbox.min.y);
      const sphere = new THREE.Sphere();
      bbox.getBoundingSphere(sphere);
      const dist = Math.max(250, sphere.radius * 2.2);

      this.camera.position.set(dist * 0.75, dist * 0.65 + boxH * 0.45, dist * 0.75);
      if (this.controls) {
        this.controls.target.set(0, boxH * 0.45, 0);
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

  // Função que SEMPRE garante o FUNDO da embalagem perfeitamente apoiado no chão a Y = 0 e centralizado em X e Z
  private updateWithGrounding(progress: number) {
    if (!this.currentTree) return;
    this.currentTree.rootGroup.position.set(0, 0, 0);
    this.currentTree.updateProgress(progress);
    this.boxGroup.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(this.boxGroup);

    const groundY = -bbox.min.y;

    const cx = (bbox.min.x + bbox.max.x) / 2;
    const cz = (bbox.min.z + bbox.max.z) / 2;
    this.currentTree.rootGroup.position.set(-cx, groundY, -cz);
    this.boxGroup.position.set(0, 0, 0);
    this.boxGroup.updateMatrixWorld(true);
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
    this.updateWithGrounding(this.foldProgress);
  }

  public getFoldProgress(): number {
    return this.foldProgress;
  }

  public setCameraView(preset: 'iso' | 'front' | 'top') {
    if (!this.controls) return;
    const bbox = new THREE.Box3().setFromObject(this.boxGroup);
    const boxH = Math.max(30, bbox.max.y - bbox.min.y);
    const sphere = new THREE.Sphere();
    bbox.getBoundingSphere(sphere);
    const dist = Math.max(250, sphere.radius * 2.2);

    if (preset === 'iso') {
      this.camera.position.set(dist * 0.75, dist * 0.65 + boxH * 0.45, dist * 0.75);
    } else if (preset === 'front') {
      this.camera.position.set(0, boxH * 0.45, dist * 1.5);
    } else if (preset === 'top') {
      this.camera.position.set(0, dist * 1.8 + boxH * 0.45, 0.001);
    }

    this.controls.target.set(0, boxH * 0.45, 0);
    this.controls.update();
  }

  public setSubstrate(mode: 'cartao' | 'kraft') {
    this.substrateMode = mode;
    if (this.currentProject) {
      this.loadModel(this.currentProject);
    }
  }

  public clearModel() {
    this.currentProject = null;
    this.currentTree = null;
    this.lastArtworkDataUri = null;
    this.currentTexture = null;
    this.isAutoRotating = false;

    while (this.boxGroup.children.length > 0) {
      const child = this.boxGroup.children[0];
      this.boxGroup.remove(child);
      try {
        child.traverse((obj: any) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
            else obj.material.dispose();
          }
        });
      } catch (e) {
        // Ignora erros em geometrias auxiliares
      }
    }

    this.boxGroup.position.set(0, 0, 0);
    this.boxGroup.rotation.set(0, 0, 0);
    this.boxGroup.scale.set(1, 1, 1);

    if (this.controls) {
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  public hasModel(): boolean {
    return this.currentProject !== null && this.currentTree !== null;
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
