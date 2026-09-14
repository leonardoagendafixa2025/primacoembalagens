import * as THREE from 'three';
import type { Point2D, DielineResult } from './types';
import { buildFoldingTopology, type TopologicalPanel, type TopologicalHinge, type DielineTopology } from './dielineTopology';

export interface FoldableTreeResult {
  rootGroup: THREE.Group;
  panelsCount: number;
  topology: DielineTopology;
  updateProgress: (progress: number) => void;
}

/**
 * Cria a malha 3D extrudada de um painel a partir do seu contorno 2D real da faca
 * e seus furos internos (mortises, furos de dedo, etc.).
 */
export function createPanelMesh(
  panel: TopologicalPanel,
  thickness: number,
  materials: THREE.Material | THREE.Material[]
): THREE.Mesh {
  const shape = new THREE.Shape();

  if (panel.boundary.length > 0) {
    shape.moveTo(panel.boundary[0].x, panel.boundary[0].y);
    for (let i = 1; i < panel.boundary.length; i++) {
      shape.lineTo(panel.boundary[i].x, panel.boundary[i].y);
    }
    shape.closePath();
  }

  // Adiciona furos internos reais da faca
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

  // Rotaciona a geometria por -PI/2 em torno de X:
  // - A espessura fica no eixo vertical +Y (de 0 a +thickness)
  // - O plano 2D da faca (X, Y) mapeia exatamente para (X, -Z) no plano horizontal
  // - A projeção superior (Top View) olhando para baixo de +Y para Y=0 coincide 1:1 com a faca 2D
  geom.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geom, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = panel.name;
  return mesh;
}

interface KinematicNodeItem {
  panel: TopologicalPanel;
  pivotGroup: THREE.Group;
  mesh: THREE.Mesh;
  hingeAxis: THREE.Vector3;
  targetAngleRad: number;
  foldOrder: number;
}

/**
 * Constrói a árvore cinemática 3D a partir da topologia da faca 2D real
 */
export function buildFoldable3DTree(
  dieline: DielineResult,
  thickness: number,
  outerColor: string = '#C29B68',
  innerColor: string = '#D4B07B'
): FoldableTreeResult {
  const rootGroup = new THREE.Group();
  const topology = buildFoldingTopology(dieline);
  const panels = topology.panels;

  if (!panels || panels.length === 0) {
    return {
      rootGroup,
      panelsCount: 0,
      topology,
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

  // Painel Raiz (Base/Fundo)
  const rootPanel = panels.find((p) => p.isRoot) || panels[0];
  const itemsMap = new Map<string, KinematicNodeItem>();

  for (const p of panels) {
    const mesh = createPanelMesh(p, thickness, materials);
    const pivotGroup = new THREE.Group();
    pivotGroup.name = `pivot_${p.id}`;

    let hingeAxis = new THREE.Vector3(1, 0, 0);
    let targetAngleRad = 0;
    let foldOrder = 1;

    if (p.hingeToParent) {
      const h = p.hingeToParent;
      hingeAxis = new THREE.Vector3(h.axis.x, h.axis.y, h.axis.z).normalize();
      targetAngleRad = (h.targetAngleDeg * Math.PI) / 180;
      foldOrder = h.foldOrder;
    }

    itemsMap.set(p.id, {
      panel: p,
      pivotGroup,
      mesh,
      hingeAxis,
      targetAngleRad,
      foldOrder,
    });
  }

  // Montagem da hierarquia cinematica com posições locais relativas
  const rootItem = itemsMap.get(rootPanel.id)!;
  rootItem.pivotGroup.add(rootItem.mesh);
  rootGroup.add(rootItem.pivotGroup);

  // Para cada nó filho na árvore
  for (const p of panels) {
    if (p.id === rootPanel.id) continue;
    const item = itemsMap.get(p.id)!;
    const parentPanelId = p.parentId;
    if (!parentPanelId) continue;

    const parentItem = itemsMap.get(parentPanelId);
    if (!parentItem) continue;

    const h = p.hingeToParent!;
    const childHingeOrigin = new THREE.Vector3(h.origin.x, h.origin.y, h.origin.z);

    // O offset do mesh relativo ao próprio pivô é -childHingeOrigin
    item.mesh.position.set(-childHingeOrigin.x, -childHingeOrigin.y, -childHingeOrigin.z);
    item.pivotGroup.add(item.mesh);

    // Posição local do pivotGroup do filho dentro do frame do pai:
    if (parentItem.panel.hingeToParent) {
      const parentHingeOrigin = parentItem.panel.hingeToParent.origin;
      item.pivotGroup.position.set(
        childHingeOrigin.x - parentHingeOrigin.x,
        childHingeOrigin.y - parentHingeOrigin.y,
        childHingeOrigin.z - parentHingeOrigin.z
      );
    } else {
      // Pai é a raiz (na origem do mundo)
      item.pivotGroup.position.copy(childHingeOrigin);
    }

    parentItem.pivotGroup.add(item.pivotGroup);
  }

  // Centraliza o rootGroup no centro da faca 2D
  const bbox = new THREE.Box3().setFromObject(rootGroup);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  // Mantém Y=0 no nível do chão
  rootGroup.position.set(-center.x, 0, -center.z);

  // Atualização contínua e 100% reversível de 0% a 100%
  const updateProgress = (progress: number) => {
    const t = Math.max(0, Math.min(1, progress));

    for (const [id, item] of itemsMap.entries()) {
      if (id === rootPanel.id) continue;

      let localT = t;
      if (item.foldOrder > 1) {
        // Dobra sequencial suave para abas internas/roll-over
        localT = Math.max(0, Math.min(1, (t - 0.25) / 0.75));
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
    topology,
    updateProgress,
  };
}
