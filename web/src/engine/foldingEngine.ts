import * as THREE from 'three';
import type { Point2D, DielineResult } from './types';

export interface PanelHinge {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  targetAngleDeg: number; // Ângulo de dobra final em graus (ex: 90, -90, 180)
  foldOrder?: number;      // Ordem sequencial de dobra (1 = dobra primeiro, 2 = depois...)
}

export interface PanelNode {
  id: string;
  name: string;
  points: Point2D[];
  holes?: Point2D[][];
  parentId?: string;
  hinge?: PanelHinge;
}

export interface FoldableTreeResult {
  rootGroup: THREE.Group;
  panelsCount: number;
  updateProgress: (progress: number) => void;
}

/**
 * Cria a geometria 3D extrudada de um painel a partir do seu polígono 2D real da faca
 */
export function createPanelMesh(
  panel: PanelNode,
  thickness: number,
  materials: THREE.Material | THREE.Material[]
): THREE.Mesh {
  const shape = new THREE.Shape();

  if (panel.points.length > 0) {
    shape.moveTo(panel.points[0].x, panel.points[0].y);
    for (let i = 1; i < panel.points.length; i++) {
      shape.lineTo(panel.points[i].x, panel.points[i].y);
    }
    shape.closePath();
  }

  // Adiciona furos internos (mortises, furos de dedo, etc.)
  if (panel.holes && panel.holes.length > 0) {
    for (const holePts of panel.holes) {
      if (holePts.length < 3) continue;
      const holePath = new THREE.Path();
      holePath.moveTo(holePts[0].x, holePts[0].y);
      for (let i = 1; i < holePts.length; i++) {
        holePath.lineTo(holePts[i].x, holePts[i].y);
      }
      holePath.closePath();
      shape.holes.push(holePath);
    }
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.5, thickness),
    bevelEnabled: false,
  });

  // Em 2D da faca: X e Y. Em Three.js deitado na chapa: X e Z, com espessura em Y.
  // Rotaciona a geometria para deitar no plano XZ
  geom.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geom, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = panel.name;
  return mesh;
}

interface NodeGroupItem {
  panel: PanelNode;
  pivotGroup: THREE.Group;
  mesh: THREE.Mesh;
  hingeAxis: THREE.Vector3;
  hingeOrigin: THREE.Vector3;
  targetAngleRad: number;
  order: number;
  parentItemId?: string;
}

/**
 * Constrói a árvore cinemática 3D de painéis e vincos da faca real
 */
export function buildFoldable3DTree(
  panels: PanelNode[],
  thickness: number,
  outerColor: string = '#C29B68',
  innerColor: string = '#D4B07B'
): FoldableTreeResult {
  const rootGroup = new THREE.Group();

  if (!panels || panels.length === 0) {
    return {
      rootGroup,
      panelsCount: 0,
      updateProgress: () => {},
    };
  }

  // Materiais de acabamento Kraft
  const kraftOuter = new THREE.MeshStandardMaterial({
    color: outerColor,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const kraftInner = new THREE.MeshStandardMaterial({
    color: innerColor,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const materials = [kraftOuter, kraftInner];

  // Mapa de painéis
  const panelMap = new Map<string, PanelNode>();
  for (const p of panels) {
    panelMap.set(p.id, p);
  }

  // Identifica o painel raiz (aquele sem parentId ou o primeiro)
  const rootPanel = panels.find((p) => !p.parentId) || panels[0];

  const itemsMap = new Map<string, NodeGroupItem>();

  for (const p of panels) {
    const mesh = createPanelMesh(p, thickness, materials);
    const pivotGroup = new THREE.Group();
    pivotGroup.name = `pivot_${p.id}`;

    let hingeAxis = new THREE.Vector3(1, 0, 0);
    let hingeOrigin = new THREE.Vector3(0, 0, 0);
    let targetAngleRad = 0;
    const order = p.hinge?.foldOrder || 1;

    if (p.hinge) {
      // Coordenadas 2D para 3D (X -> X, Y -> -Z pois Y na faca vai para cima)
      const hx0 = p.hinge.x0;
      const hz0 = -p.hinge.y0;
      const hx1 = p.hinge.x1;
      const hz1 = -p.hinge.y1;

      hingeOrigin = new THREE.Vector3(hx0, 0, hz0);
      const dir = new THREE.Vector3(hx1 - hx0, 0, hz1 - hz0);
      if (dir.lengthSq() > 1e-6) {
        hingeAxis = dir.normalize();
      }

      targetAngleRad = (p.hinge.targetAngleDeg * Math.PI) / 180;
    }

    itemsMap.set(p.id, {
      panel: p,
      pivotGroup,
      mesh,
      hingeAxis,
      hingeOrigin,
      targetAngleRad,
      order,
      parentItemId: p.parentId,
    });
  }

  // Monta a hierarquia Three.js
  // Para o painel raiz: adiciona o mesh direto no rootGroup
  const rootItem = itemsMap.get(rootPanel.id)!;
  rootItem.pivotGroup.add(rootItem.mesh);
  rootGroup.add(rootItem.pivotGroup);

  // Para os nós filhos:
  // Cada filho tem seu pivotGroup posicionado na origem do vinco
  for (const [id, item] of itemsMap.entries()) {
    if (id === rootPanel.id) continue;

    const parentItem = item.parentItemId ? itemsMap.get(item.parentItemId) : rootItem;
    const effectiveParent = parentItem || rootItem;

    // Configura o pivot do vinco
    const hingePos = item.hingeOrigin;
    item.pivotGroup.position.copy(hingePos);

    // Ajusta o mesh do filho para ser relativo à posição do vinco
    item.mesh.position.set(-hingePos.x, -hingePos.y, -hingePos.z);
    item.pivotGroup.add(item.mesh);

    // Adiciona o pivotGroup dentro do pivot do pai para propagação hierárquica
    effectiveParent.pivotGroup.add(item.pivotGroup);
  }

  // Centraliza o rootGroup
  const bbox = new THREE.Box3().setFromObject(rootGroup);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  rootGroup.position.set(-center.x, 0, -center.z);

  // Função de atualização contínua e reversível de 0% a 100%
  const updateProgress = (progress: number) => {
    const t = Math.max(0, Math.min(1, progress));

    for (const [id, item] of itemsMap.entries()) {
      if (id === rootPanel.id) continue;

      // Se houver ordem de dobra, programa as fases
      let localT = t;
      if (item.order > 1) {
        // Dobra sequencial: fase 1 (0 a 0.6), fase 2 (0.4 a 1.0)
        localT = Math.max(0, Math.min(1, (t - 0.3) / 0.7));
      }

      const currentAngle = item.targetAngleRad * localT;
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(item.hingeAxis, currentAngle);
      item.pivotGroup.quaternion.copy(q);
    }
  };

  // Inicializa aberto em 0%
  updateProgress(0);

  return {
    rootGroup,
    panelsCount: panels.length,
    updateProgress,
  };
}

/**
 * Constrói painéis canônicos padrão diretamente a partir do DielineResult
 * para modelos FEFCO 0420, 0427, 0429, 0201 e ECMA
 */
export function extractPanelsFromModel(
  modelCode: string,
  _dieline: DielineResult,
  params: Record<string, number>
): PanelNode[] {
  const L = params.L || 300;
  const B = params.B || 200;
  const H = params.H || 150;
  const Ep = params.Ep || 3.0;
  const codeUpper = (modelCode || '').toUpperCase();

  // =========================================================================
  // 1. FEFCO 0429 e 0427 (Arquitetura Dbl_Wall_v2 + Top Cover)
  // =========================================================================
  if (codeUpper.includes('429') || codeUpper.includes('427')) {
    const PP = (2 * Ep) / 3;
    const GE = Ep - PP;
    const m1 = 5 * Ep;
    const m2 = 3 * Ep;
    const m3 = 2 * Ep + GE;
    const m4 = 3 * Ep + GE;
    const L1_2 = (L + m1) / 2;
    const L2_2 = (L + m2) / 2;
    const B1_2 = (B + m3) / 2;
    const B2_2 = (B + m4) / 2;
    const H4 = H + GE;
    const dbw = 2 * Ep;
    const H3 = H - GE;
    const H7 = Math.min(H, 60);

    const is429 = codeUpper.includes('429');

    // Furos mortise no fundo
    const mtl = 33;
    const mth = m3;
    const Pos = 40;
    const v5 = B2_2 - mtl - Pos;

    const mortiseHoles: Point2D[][] = [
      // Furo superior direito
      [
        { x: L1_2 - mth, y: v5 },
        { x: L1_2, y: v5 },
        { x: L1_2, y: v5 + mtl },
        { x: L1_2 - mth, y: v5 + mtl },
      ],
      // Furo inferior direito
      [
        { x: L1_2 - mth, y: -v5 - mtl },
        { x: L1_2, y: -v5 - mtl },
        { x: L1_2, y: -v5 },
        { x: L1_2 - mth, y: -v5 },
      ],
      // Furo superior esquerdo
      [
        { x: -L1_2, y: v5 },
        { x: -L1_2 + mth, y: v5 },
        { x: -L1_2 + mth, y: v5 + mtl },
        { x: -L1_2, y: v5 + mtl },
      ],
      // Furo inferior esquerdo
      [
        { x: -L1_2, y: -v5 - mtl },
        { x: -L1_2 + mth, y: -v5 - mtl },
        { x: -L1_2 + mth, y: -v5 },
        { x: -L1_2, y: -v5 },
      ],
    ];

    const panels: PanelNode[] = [
      // 1. Painel Raiz: Fundo / Base
      {
        id: 'base',
        name: 'Fundo (Base)',
        points: [
          { x: -L2_2, y: -B1_2 },
          { x: L2_2, y: -B1_2 },
          { x: L2_2, y: B1_2 },
          { x: -L2_2, y: B1_2 },
        ],
        holes: mortiseHoles,
      },
      // 2. Parede Lateral Direita (Outer Wall)
      {
        id: 'wall_right',
        name: 'Parede Lateral Direita',
        parentId: 'base',
        points: [
          { x: L1_2, y: -B2_2 },
          { x: L1_2 + H4, y: -B2_2 },
          { x: L1_2 + H4, y: B2_2 },
          { x: L1_2, y: B2_2 },
        ],
        hinge: {
          x0: L1_2,
          y0: -B2_2,
          x1: L1_2,
          y1: B2_2,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // 3. Parede Lateral Direita Dobra Interna (Roll-over Wall)
      {
        id: 'wall_right_inner',
        name: 'Parede Direita Retorno (Roll-over)',
        parentId: 'wall_right',
        points: [
          { x: L1_2 + H4 + dbw, y: -B2_2 + 5 },
          { x: L1_2 + H4 + dbw + H3, y: -B2_2 + 10 },
          { x: L1_2 + H4 + dbw + H3, y: B2_2 - 10 },
          { x: L1_2 + H4 + dbw, y: B2_2 - 5 },
        ],
        hinge: {
          x0: L1_2 + H4,
          y0: -B2_2,
          x1: L1_2 + H4,
          y1: B2_2,
          targetAngleDeg: 180,
          foldOrder: 2,
        },
      },
      // 4. Parede Lateral Esquerda (Outer Wall)
      {
        id: 'wall_left',
        name: 'Parede Lateral Esquerda',
        parentId: 'base',
        points: [
          { x: -L1_2, y: -B2_2 },
          { x: -L1_2 - H4, y: -B2_2 },
          { x: -L1_2 - H4, y: B2_2 },
          { x: -L1_2, y: B2_2 },
        ],
        hinge: {
          x0: -L1_2,
          y0: B2_2,
          x1: -L1_2,
          y1: -B2_2,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // 5. Parede Lateral Esquerda Retorno (Roll-over Wall)
      {
        id: 'wall_left_inner',
        name: 'Parede Esquerda Retorno (Roll-over)',
        parentId: 'wall_left',
        points: [
          { x: -L1_2 - H4 - dbw, y: -B2_2 + 5 },
          { x: -L1_2 - H4 - dbw - H3, y: -B2_2 + 10 },
          { x: -L1_2 - H4 - dbw - H3, y: B2_2 - 10 },
          { x: -L1_2 - H4 - dbw, y: B2_2 - 5 },
        ],
        hinge: {
          x0: -L1_2 - H4,
          y0: B2_2,
          x1: -L1_2 - H4,
          y1: -B2_2,
          targetAngleDeg: 180,
          foldOrder: 2,
        },
      },
      // 6. Parede Frontal (Inferior em Y)
      {
        id: 'front_wall',
        name: 'Parede Frontal',
        parentId: 'base',
        points: [
          { x: -L2_2, y: -B1_2 },
          { x: L2_2, y: -B1_2 },
          { x: L2_2, y: -(B1_2 + H) },
          { x: -L2_2, y: -(B1_2 + H) },
        ],
        hinge: {
          x0: -L2_2,
          y0: -B1_2,
          x1: L2_2,
          y1: -B1_2,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // 7. Parede Traseira (Superior em Y)
      {
        id: 'rear_wall',
        name: 'Parede Traseira',
        parentId: 'base',
        points: [
          { x: -L2_2, y: B1_2 },
          { x: L2_2, y: B1_2 },
          { x: L2_2, y: B1_2 + H },
          { x: -L2_2, y: B1_2 + H },
        ],
        hinge: {
          x0: L2_2,
          y0: B1_2,
          x1: -L2_2,
          y1: B1_2,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // 8. Tampa Superior (Lid)
      {
        id: 'lid',
        name: 'Tampa Superior',
        parentId: 'rear_wall',
        points: [
          { x: -L2_2 + 2, y: B1_2 + H },
          { x: L2_2 - 2, y: B1_2 + H },
          { x: L2_2 - 2, y: B1_2 + H + B },
          { x: -L2_2 + 2, y: B1_2 + H + B },
        ],
        hinge: {
          x0: L2_2,
          y0: B1_2 + H,
          x1: -L2_2,
          y1: B1_2 + H,
          targetAngleDeg: 90,
          foldOrder: 2,
        },
      },
      // 9. Aba Frontal da Tampa (Tuck Flap)
      {
        id: 'tuck_flap',
        name: is429 ? 'Aba Frontal com Cantos R15' : 'Aba Frontal com Travas Orelha',
        parentId: 'lid',
        points: [
          { x: -L2_2 + 10, y: B1_2 + H + B },
          { x: L2_2 - 10, y: B1_2 + H + B },
          { x: L2_2 - 15, y: B1_2 + H + B + H7 },
          { x: -L2_2 + 15, y: B1_2 + H + B + H7 },
        ],
        hinge: {
          x0: L2_2,
          y0: B1_2 + H + B,
          x1: -L2_2,
          y1: B1_2 + H + B,
          targetAngleDeg: 90,
          foldOrder: 3,
        },
      },
    ];

    return panels;
  }

  // =========================================================================
  // 2. FEFCO 0420 (Five-Panel Folder)
  // =========================================================================
  if (codeUpper.includes('420')) {
    const tuckW = Math.max(25, Math.min(35, B * 0.4));
    const x0 = 0;
    const xTuckCrease = x0 + tuckW;
    const xLidRearCrease = xTuckCrease + B;
    const xRearBaseCrease = xLidRearCrease + H;
    const xBaseFrontCrease = xRearBaseCrease + B;
    const xFrontEnd = xBaseFrontCrease + H;
    const yBodyHalf = L / 2;

    const panels: PanelNode[] = [
      // Fundo / Base (Panel 2)
      {
        id: 'base',
        name: 'Fundo (Base)',
        points: [
          { x: xRearBaseCrease, y: -yBodyHalf },
          { x: xBaseFrontCrease, y: -yBodyHalf },
          { x: xBaseFrontCrease, y: yBodyHalf },
          { x: xRearBaseCrease, y: yBodyHalf },
        ],
      },
      // Parede Lateral Frontal
      {
        id: 'front_wall',
        name: 'Parede Frontal',
        parentId: 'base',
        points: [
          { x: xBaseFrontCrease, y: -yBodyHalf },
          { x: xFrontEnd, y: -yBodyHalf },
          { x: xFrontEnd, y: yBodyHalf },
          { x: xBaseFrontCrease, y: yBodyHalf },
        ],
        hinge: {
          x0: xBaseFrontCrease,
          y0: -yBodyHalf,
          x1: xBaseFrontCrease,
          y1: yBodyHalf,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // Parede Lateral Traseira
      {
        id: 'rear_wall',
        name: 'Parede Traseira',
        parentId: 'base',
        points: [
          { x: xRearBaseCrease, y: -yBodyHalf },
          { x: xLidRearCrease, y: -yBodyHalf },
          { x: xLidRearCrease, y: yBodyHalf },
          { x: xRearBaseCrease, y: yBodyHalf },
        ],
        hinge: {
          x0: xRearBaseCrease,
          y0: yBodyHalf,
          x1: xRearBaseCrease,
          y1: -yBodyHalf,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // Tampa Superior
      {
        id: 'lid',
        name: 'Tampa Superior',
        parentId: 'rear_wall',
        points: [
          { x: xLidRearCrease, y: -yBodyHalf },
          { x: xTuckCrease, y: -yBodyHalf },
          { x: xTuckCrease, y: yBodyHalf },
          { x: xLidRearCrease, y: yBodyHalf },
        ],
        hinge: {
          x0: xLidRearCrease,
          y0: yBodyHalf,
          x1: xLidRearCrease,
          y1: -yBodyHalf,
          targetAngleDeg: 90,
          foldOrder: 2,
        },
      },
      // Aba de Encaixe Frontal (Tuck Flap)
      {
        id: 'tuck_flap',
        name: 'Aba de Encaixe (Tuck)',
        parentId: 'lid',
        points: [
          { x: xTuckCrease, y: -yBodyHalf + 5 },
          { x: x0, y: -yBodyHalf + 10 },
          { x: x0, y: yBodyHalf - 10 },
          { x: xTuckCrease, y: yBodyHalf - 5 },
        ],
        hinge: {
          x0: xTuckCrease,
          y0: yBodyHalf,
          x1: xTuckCrease,
          y1: -yBodyHalf,
          targetAngleDeg: 90,
          foldOrder: 3,
        },
      },
      // Paredes Laterais Duplas do Fundo
      {
        id: 'side_flap_top',
        name: 'Parede Lateral Superior',
        parentId: 'base',
        points: [
          { x: xRearBaseCrease + 2, y: yBodyHalf },
          { x: xBaseFrontCrease - 2, y: yBodyHalf },
          { x: xBaseFrontCrease - 2, y: yBodyHalf + H },
          { x: xRearBaseCrease + 2, y: yBodyHalf + H },
        ],
        hinge: {
          x0: xRearBaseCrease,
          y0: yBodyHalf,
          x1: xBaseFrontCrease,
          y1: yBodyHalf,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      {
        id: 'side_flap_bottom',
        name: 'Parede Lateral Inferior',
        parentId: 'base',
        points: [
          { x: xRearBaseCrease + 2, y: -yBodyHalf },
          { x: xBaseFrontCrease - 2, y: -yBodyHalf },
          { x: xBaseFrontCrease - 2, y: -(yBodyHalf + H) },
          { x: xRearBaseCrease + 2, y: -(yBodyHalf + H) },
        ],
        hinge: {
          x0: xBaseFrontCrease,
          y0: -yBodyHalf,
          x1: xRearBaseCrease,
          y1: -yBodyHalf,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
    ];

    return panels;
  }

  // =========================================================================
  // 3. ECMA B10.01 (Bandeja Dobrável com Trava / Tray Lock)
  // =========================================================================
  if (codeUpper.includes('B1001') || codeUpper.includes('B10.01')) {
    const A = L; // Comprimento interior
    const Bval = B; // Largura interior
    const ep1 = Ep;
    const ch2 = 8;
    const Htuck = ep1 + 2;

    const xBaseLeft = H + H;
    const xBaseRight = xBaseLeft + Bval;
    const yBaseBottom = Htuck + H + H;
    const yBaseTop = yBaseBottom + A;

    const yWallTopCrease = yBaseTop + H;
    const yWallTopEdge = yWallTopCrease + H + Htuck;
    const yWallBottomCrease = yBaseBottom - H;
    const yWallBottomEdge = yWallBottomCrease - H - Htuck;

    const panels: PanelNode[] = [
      // Fundo central
      {
        id: 'base',
        name: 'Fundo da Bandeja',
        points: [
          { x: xBaseLeft, y: yBaseBottom },
          { x: xBaseRight, y: yBaseBottom },
          { x: xBaseRight, y: yBaseTop },
          { x: xBaseLeft, y: yBaseTop },
        ],
      },
      // Parede Superior
      {
        id: 'wall_top',
        name: 'Parede Superior',
        parentId: 'base',
        points: [
          { x: xBaseLeft, y: yBaseTop },
          { x: xBaseRight, y: yBaseTop },
          { x: xBaseRight, y: yWallTopCrease },
          { x: xBaseLeft, y: yWallTopCrease },
        ],
        hinge: {
          x0: xBaseRight,
          y0: yBaseTop,
          x1: xBaseLeft,
          y1: yBaseTop,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // Aba Superior Retorno (Roll-over)
      {
        id: 'wall_top_inner',
        name: 'Parede Superior Retorno',
        parentId: 'wall_top',
        points: [
          { x: xBaseLeft, y: yWallTopCrease },
          { x: xBaseRight, y: yWallTopCrease },
          { x: xBaseRight - ch2, y: yWallTopEdge },
          { x: xBaseLeft + ch2, y: yWallTopEdge },
        ],
        hinge: {
          x0: xBaseRight,
          y0: yWallTopCrease,
          x1: xBaseLeft,
          y1: yWallTopCrease,
          targetAngleDeg: 180,
          foldOrder: 2,
        },
      },
      // Parede Inferior
      {
        id: 'wall_bottom',
        name: 'Parede Inferior',
        parentId: 'base',
        points: [
          { x: xBaseLeft, y: yBaseBottom },
          { x: xBaseRight, y: yBaseBottom },
          { x: xBaseRight, y: yWallBottomCrease },
          { x: xBaseLeft, y: yWallBottomCrease },
        ],
        hinge: {
          x0: xBaseLeft,
          y0: yBaseBottom,
          x1: xBaseRight,
          y1: yBaseBottom,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // Aba Inferior Retorno (Roll-over)
      {
        id: 'wall_bottom_inner',
        name: 'Parede Inferior Retorno',
        parentId: 'wall_bottom',
        points: [
          { x: xBaseLeft, y: yWallBottomCrease },
          { x: xBaseRight, y: yWallBottomCrease },
          { x: xBaseRight - ch2, y: yWallBottomEdge },
          { x: xBaseLeft + ch2, y: yWallBottomEdge },
        ],
        hinge: {
          x0: xBaseLeft,
          y0: yWallBottomCrease,
          x1: xBaseRight,
          y1: yWallBottomCrease,
          targetAngleDeg: 180,
          foldOrder: 2,
        },
      },
      // Parede Lateral Esquerda
      {
        id: 'wall_left',
        name: 'Parede Lateral Esquerda',
        parentId: 'base',
        points: [
          { x: xBaseLeft, y: yBaseBottom },
          { x: xBaseLeft, y: yBaseTop },
          { x: xBaseLeft - H, y: yBaseTop },
          { x: xBaseLeft - H, y: yBaseBottom },
        ],
        hinge: {
          x0: xBaseLeft,
          y0: yBaseBottom,
          x1: xBaseLeft,
          y1: yBaseTop,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // Parede Lateral Direita
      {
        id: 'wall_right',
        name: 'Parede Lateral Direita',
        parentId: 'base',
        points: [
          { x: xBaseRight, y: yBaseBottom },
          { x: xBaseRight, y: yBaseTop },
          { x: xBaseRight + H, y: yBaseTop },
          { x: xBaseRight + H, y: yBaseBottom },
        ],
        hinge: {
          x0: xBaseRight,
          y0: yBaseTop,
          x1: xBaseRight,
          y1: yBaseBottom,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
    ];

    return panels;
  }

  // =========================================================================
  // 4. ECMA B10 (Cartucho com Abas Opostas / Reverse Tuck-in Carton)
  // =========================================================================
  if (codeUpper.includes('ECMA') && (codeUpper.includes('B10') || codeUpper.includes('CARTON'))) {
    const M = params.M || 15;
    const tuck = Math.max(15, Math.min(B * 0.4, 25));
    const tc = 8;

    const x1 = M;
    const x2 = x1 + B;
    const x3 = x2 + L;
    const x4 = x3 + B;
    const x5 = x4 + L;

    const yBotTuck = 0;
    const yBotLidCrease = yBotTuck + tuck;
    const yBotBodyCrease = yBotLidCrease + B;
    const yTopBodyCrease = yBotBodyCrease + H;
    const yTopLidCrease = yTopBodyCrease + B;
    const yTopTuck = yTopLidCrease + tuck;

    const panels: PanelNode[] = [
      // Painel 2: Frente (Base de referência)
      {
        id: 'panel_front',
        name: 'Painel Frontal (L x H)',
        points: [
          { x: x2, y: yBotBodyCrease },
          { x: x3, y: yBotBodyCrease },
          { x: x3, y: yTopBodyCrease },
          { x: x2, y: yTopBodyCrease },
        ],
      },
      // Painel 1: Lateral Esquerda
      {
        id: 'panel_left',
        name: 'Lateral Esquerda (B x H)',
        parentId: 'panel_front',
        points: [
          { x: x1, y: yBotBodyCrease },
          { x: x2, y: yBotBodyCrease },
          { x: x2, y: yTopBodyCrease },
          { x: x1, y: yTopBodyCrease },
        ],
        hinge: {
          x0: x2,
          y0: yBotBodyCrease,
          x1: x2,
          y1: yTopBodyCrease,
          targetAngleDeg: -90,
          foldOrder: 1,
        },
      },
      // Painel 3: Lateral Direita
      {
        id: 'panel_right',
        name: 'Lateral Direita (B x H)',
        parentId: 'panel_front',
        points: [
          { x: x3, y: yBotBodyCrease },
          { x: x4, y: yBotBodyCrease },
          { x: x4, y: yTopBodyCrease },
          { x: x3, y: yTopBodyCrease },
        ],
        hinge: {
          x0: x3,
          y0: yTopBodyCrease,
          x1: x3,
          y1: yBotBodyCrease,
          targetAngleDeg: -90,
          foldOrder: 1,
        },
      },
      // Painel 4: Traseiro
      {
        id: 'panel_rear',
        name: 'Painel Traseiro (L x H)',
        parentId: 'panel_right',
        points: [
          { x: x4, y: yBotBodyCrease },
          { x: x5, y: yBotBodyCrease },
          { x: x5, y: yTopBodyCrease },
          { x: x4, y: yTopBodyCrease },
        ],
        hinge: {
          x0: x4,
          y0: yTopBodyCrease,
          x1: x4,
          y1: yBotBodyCrease,
          targetAngleDeg: -90,
          foldOrder: 1,
        },
      },
      // Tampa Superior (no Painel Frontal 2)
      {
        id: 'top_lid',
        name: 'Tampa Superior',
        parentId: 'panel_front',
        points: [
          { x: x2, y: yTopBodyCrease },
          { x: x3, y: yTopBodyCrease },
          { x: x3, y: yTopLidCrease },
          { x: x2, y: yTopLidCrease },
        ],
        hinge: {
          x0: x3,
          y0: yTopBodyCrease,
          x1: x2,
          y1: yTopBodyCrease,
          targetAngleDeg: 90,
          foldOrder: 2,
        },
      },
      // Aba de Encaixe da Tampa Superior
      {
        id: 'top_tuck',
        name: 'Aba de Encaixe Superior',
        parentId: 'top_lid',
        points: [
          { x: x2, y: yTopLidCrease },
          { x: x3, y: yTopLidCrease },
          { x: x3 - tc, y: yTopTuck },
          { x: x2 + tc, y: yTopTuck },
        ],
        hinge: {
          x0: x3,
          y0: yTopLidCrease,
          x1: x2,
          y1: yTopLidCrease,
          targetAngleDeg: 90,
          foldOrder: 3,
        },
      },
      // Tampa Inferior Reversa (no Painel Traseiro 4)
      {
        id: 'bot_lid',
        name: 'Tampa Inferior',
        parentId: 'panel_rear',
        points: [
          { x: x4, y: yBotBodyCrease },
          { x: x5, y: yBotBodyCrease },
          { x: x5, y: yBotLidCrease },
          { x: x4, y: yBotLidCrease },
        ],
        hinge: {
          x0: x4,
          y0: yBotBodyCrease,
          x1: x5,
          y1: yBotBodyCrease,
          targetAngleDeg: 90,
          foldOrder: 2,
        },
      },
      // Aba de Encaixe da Tampa Inferior
      {
        id: 'bot_tuck',
        name: 'Aba de Encaixe Inferior',
        parentId: 'bot_lid',
        points: [
          { x: x4, y: yBotLidCrease },
          { x: x5, y: yBotLidCrease },
          { x: x5 - tc, y: yBotTuck },
          { x: x4 + tc, y: yBotTuck },
        ],
        hinge: {
          x0: x4,
          y0: yBotLidCrease,
          x1: x5,
          y1: yBotLidCrease,
          targetAngleDeg: 90,
          foldOrder: 3,
        },
      },
    ];

    return panels;
  }

  // =========================================================================
  // 5. ECMA A20 (Luva Deslizante / Sleeve)
  // =========================================================================
  if (codeUpper.includes('A20')) {
    const clearance = Ep * 2 + 1;
    const L1 = L + clearance;
    const H1 = H + clearance;
    const M = params.M || 15;

    const x1 = M;
    const x2 = x1 + L1;
    const x3 = x2 + H1;
    const x4 = x3 + L1;
    const x5 = x4 + H1;
    const y0 = 0;
    const y1 = B;

    const panels: PanelNode[] = [
      // Topo (Base de referência)
      {
        id: 'panel_top',
        name: 'Painel Superior da Luva',
        points: [
          { x: x1, y: y0 },
          { x: x2, y: y0 },
          { x: x2, y: y1 },
          { x: x1, y: y1 },
        ],
      },
      // Lateral Direita
      {
        id: 'panel_right',
        name: 'Lateral Direita',
        parentId: 'panel_top',
        points: [
          { x: x2, y: y0 },
          { x: x3, y: y0 },
          { x: x3, y: y1 },
          { x: x2, y: y1 },
        ],
        hinge: {
          x0: x2,
          y0: y1,
          x1: x2,
          y1: y0,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // Fundo
      {
        id: 'panel_bottom',
        name: 'Painel Fundo',
        parentId: 'panel_right',
        points: [
          { x: x3, y: y0 },
          { x: x4, y: y0 },
          { x: x4, y: y1 },
          { x: x3, y: y1 },
        ],
        hinge: {
          x0: x3,
          y0: y1,
          x1: x3,
          y1: y0,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
      // Lateral Esquerda
      {
        id: 'panel_left',
        name: 'Lateral Esquerda',
        parentId: 'panel_bottom',
        points: [
          { x: x4, y: y0 },
          { x: x5, y: y0 },
          { x: x5, y: y1 },
          { x: x4, y: y1 },
        ],
        hinge: {
          x0: x4,
          y0: y1,
          x1: x4,
          y1: y0,
          targetAngleDeg: 90,
          foldOrder: 1,
        },
      },
    ];

    return panels;
  }

  // =========================================================================
  // 6. FEFCO 0201 / 0200 / 0203 (Maletas com 4 Painéis em Linha)
  // =========================================================================
  const flapH = B / 2;
  const panels: PanelNode[] = [
    // Painel 1 (Frontal / Base de referência)
    {
      id: 'panel_1',
      name: 'Painel Frontal (L x H)',
      points: [
        { x: 0, y: 0 },
        { x: L, y: 0 },
        { x: L, y: H },
        { x: 0, y: H },
      ],
    },
    // Aba Inferior do Painel 1
    {
      id: 'flap_bottom_1',
      name: 'Aba Inferior 1',
      parentId: 'panel_1',
      points: [
        { x: 0, y: 0 },
        { x: L, y: 0 },
        { x: L - 5, y: -flapH },
        { x: 5, y: -flapH },
      ],
      hinge: { x0: 0, y0: 0, x1: L, y1: 0, targetAngleDeg: 90, foldOrder: 2 },
    },
    // Aba Superior do Painel 1
    {
      id: 'flap_top_1',
      name: 'Aba Superior 1',
      parentId: 'panel_1',
      points: [
        { x: 0, y: H },
        { x: L, y: H },
        { x: L - 5, y: H + flapH },
        { x: 5, y: H + flapH },
      ],
      hinge: { x0: L, y0: H, x1: 0, y1: H, targetAngleDeg: 90, foldOrder: 2 },
    },
    // Painel 2 (Lateral Direita B x H)
    {
      id: 'panel_2',
      name: 'Painel Lateral Direita (B x H)',
      parentId: 'panel_1',
      points: [
        { x: L, y: 0 },
        { x: L + B, y: 0 },
        { x: L + B, y: H },
        { x: L, y: H },
      ],
      hinge: { x0: L, y0: 0, x1: L, y1: H, targetAngleDeg: 90, foldOrder: 1 },
    },
    // Aba Inferior do Painel 2
    {
      id: 'flap_bottom_2',
      name: 'Aba Inferior 2',
      parentId: 'panel_2',
      points: [
        { x: L, y: 0 },
        { x: L + B, y: 0 },
        { x: L + B - 5, y: -flapH },
        { x: L + 5, y: -flapH },
      ],
      hinge: { x0: L, y0: 0, x1: L + B, y1: 0, targetAngleDeg: 90, foldOrder: 2 },
    },
    // Aba Superior do Painel 2
    {
      id: 'flap_top_2',
      name: 'Aba Superior 2',
      parentId: 'panel_2',
      points: [
        { x: L, y: H },
        { x: L + B, y: H },
        { x: L + B - 5, y: H + flapH },
        { x: L + 5, y: H + flapH },
      ],
      hinge: { x0: L + B, y0: H, x1: L, y1: H, targetAngleDeg: 90, foldOrder: 2 },
    },
    // Painel 3 (Traseiro L x H)
    {
      id: 'panel_3',
      name: 'Painel Traseiro (L x H)',
      parentId: 'panel_2',
      points: [
        { x: L + B, y: 0 },
        { x: L + B + L, y: 0 },
        { x: L + B + L, y: H },
        { x: L + B, y: H },
      ],
      hinge: { x0: L + B, y0: 0, x1: L + B, y1: H, targetAngleDeg: 90, foldOrder: 1 },
    },
    // Aba Inferior do Painel 3
    {
      id: 'flap_bottom_3',
      name: 'Aba Inferior 3',
      parentId: 'panel_3',
      points: [
        { x: L + B, y: 0 },
        { x: L + B + L, y: 0 },
        { x: L + B + L - 5, y: -flapH },
        { x: L + B + 5, y: -flapH },
      ],
      hinge: { x0: L + B, y0: 0, x1: L + B + L, y1: 0, targetAngleDeg: 90, foldOrder: 2 },
    },
    // Aba Superior do Painel 3
    {
      id: 'flap_top_3',
      name: 'Aba Superior 3',
      parentId: 'panel_3',
      points: [
        { x: L + B, y: H },
        { x: L + B + L, y: H },
        { x: L + B + L - 5, y: H + flapH },
        { x: L + B + 5, y: H + flapH },
      ],
      hinge: { x0: L + B + L, y0: H, x1: L + B, y1: H, targetAngleDeg: 90, foldOrder: 2 },
    },
    // Painel 4 (Lateral Esquerda B x H)
    {
      id: 'panel_4',
      name: 'Painel Lateral Esquerda (B x H)',
      parentId: 'panel_3',
      points: [
        { x: L + B + L, y: 0 },
        { x: L + B + L + B, y: 0 },
        { x: L + B + L + B, y: H },
        { x: L + B + L, y: H },
      ],
      hinge: { x0: L + B + L, y0: 0, x1: L + B + L, y1: H, targetAngleDeg: 90, foldOrder: 1 },
    },
    // Aba Inferior do Painel 4
    {
      id: 'flap_bottom_4',
      name: 'Aba Inferior 4',
      parentId: 'panel_4',
      points: [
        { x: L + B + L, y: 0 },
        { x: L + B + L + B, y: 0 },
        { x: L + B + L + B - 5, y: -flapH },
        { x: L + B + L + 5, y: -flapH },
      ],
      hinge: { x0: L + B + L, y0: 0, x1: L + B + L + B, y1: 0, targetAngleDeg: 90, foldOrder: 2 },
    },
    // Aba Superior do Painel 4
    {
      id: 'flap_top_4',
      name: 'Aba Superior 4',
      parentId: 'panel_4',
      points: [
        { x: L + B + L, y: H },
        { x: L + B + L + B, y: H },
        { x: L + B + L + B - 5, y: H + flapH },
        { x: L + B + L + 5, y: H + flapH },
      ],
      hinge: { x0: L + B + L + B, y0: H, x1: L + B + L, y1: H, targetAngleDeg: 90, foldOrder: 2 },
    },
  ];

  return panels;
}
