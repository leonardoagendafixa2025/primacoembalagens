import * as THREE from 'three';
import type { DielineResult, BoundingBox2D } from './types';
import { buildFoldingTopology, type TopologicalPanel, type DielineTopology } from './dielineTopology';

export interface HingeControlInfo {
  panelId: string;
  panelName: string;
  parentId?: string;
  parentName?: string;
  creaseLength: number;
  foldOrder: number;
  nominalAngleDeg: number;
  currentAngleDeg: number;
  isModified: boolean;
}

export interface FoldableTreeResult {
  rootGroup: THREE.Group;
  panelsCount: number;
  topology: DielineTopology;
  updateProgress: (progress: number) => void;
  setHingeAngle: (panelId: string, angleDeg: number) => void;
  resetHingeAngle: (panelId: string) => void;
  resetAllHingeAngles: () => void;
  getHingeInfoList: () => HingeControlInfo[];
  highlightPanel: (panelId: string | null) => void;
  updateArtwork: (texture: THREE.Texture | null) => void;
}

/**
 * Cria a malha 3D extrudada de um painel a partir do seu contorno 2D real da faca
 * e seus furos internos (mortises, furos de dedo, etc.).
 */
export function createPanelMesh(
  panel: TopologicalPanel,
  thickness: number,
  materials: THREE.Material | THREE.Material[],
  dielineBounds?: BoundingBox2D
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
    depth: Math.max(0.05, thickness),
    bevelEnabled: false,
  });

  // Mapeamento normalizado 1:1 de coordenadas UV da faca 2D no painel (para renderização de arte do Illustrator)
  if (dielineBounds && dielineBounds.width > 0 && dielineBounds.height > 0) {
    const pos = geom.attributes.position;
    const uv = geom.attributes.uv;
    const margin = 15.0; // Margem de respiro idêntica ao script do Illustrator
    const totalWidth = dielineBounds.width + margin * 2;
    const totalHeight = dielineBounds.height + margin * 2;
    const originX = margin - dielineBounds.minX;
    const originY = margin - dielineBounds.minY;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const u = (x + originX) / totalWidth;
      const v = (y + originY) / totalHeight;
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
  }

  // Rotaciona a geometria por -PI/2 em torno de X:
  // - A espessura fica no eixo vertical +Y (de 0 a +thickness)
  // - O plano 2D da faca (X, Y) mapeia exatamente para (X, -Z) no plano horizontal
  // - A projeção superior (Top View) olhando para baixo de +Y para Y=0 coincide 1:1 com a faca 2D
  geom.rotateX(-Math.PI / 2);

  const mesh = new THREE.Mesh(geom, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = panel.id;
  mesh.userData = { panelId: panel.id, panelName: panel.name, isPanel: true };

  // Arestas CAD da faca para visualização nítida de vincos, cortes e abas sobre o papel branco
  const edgeGeo = new THREE.EdgesGeometry(geom, 20);
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x64748b,
    transparent: true,
    opacity: 0.5,
  });
  const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
  edgeLines.name = `edges_${panel.id}`;
  mesh.add(edgeLines);

  return mesh;
}

interface KinematicNodeItem {
  panel: TopologicalPanel;
  pivotGroup: THREE.Group;
  mesh: THREE.Mesh;
  hingeAxis: THREE.Vector3;
  nominalAngleRad: number;
  targetAngleRad: number;
  foldOrder: number;
}

/**
 * Constrói a árvore cinemática 3D a partir da topologia da faca 2D real
 */
export function buildFoldable3DTree(
  dieline: DielineResult,
  thickness: number,
  outerColor: string = '#FFFFFF',
  innerColor: string = '#FFFFFF',
  roughness: number = 0.28,
  customAngles?: Record<string, number>,
  artworkTexture?: THREE.Texture | null
): FoldableTreeResult {
  const rootGroup = new THREE.Group();
  const topology: DielineTopology = dieline.customTopology || buildFoldingTopology(dieline);
  const panels = topology.panels;

  if (!panels || panels.length === 0) {
    return {
      rootGroup,
      panelsCount: 0,
      topology,
      updateProgress: () => {},
      setHingeAngle: () => {},
      resetHingeAngle: () => {},
      resetAllHingeAngles: () => {},
      getHingeInfoList: () => [],
      highlightPanel: () => {},
      updateArtwork: () => {},
    };
  }

  // Painel Raiz (Base/Fundo)
  const rootPanel = panels.find((p) => p.isRoot) || panels[0];
  const itemsMap = new Map<string, KinematicNodeItem>();

  for (const p of panels) {
    // Cada painel possui materiais individuais para permitir realce emissivo CAD independente
    const matFace = new THREE.MeshStandardMaterial({
      color: artworkTexture ? '#FFFFFF' : outerColor,
      map: artworkTexture || null,
      roughness: roughness,
      metalness: 0.01,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0.0,
    });
    const matEdge = new THREE.MeshStandardMaterial({
      color: innerColor,
      roughness: Math.min(1.0, roughness + 0.15),
      metalness: 0.01,
      side: THREE.DoubleSide,
    });
    const materials = [matFace, matEdge];

    const mesh = createPanelMesh(p, thickness, materials, dieline.bounds);
    const pivotGroup = new THREE.Group();
    pivotGroup.name = `pivot_${p.id}`;

    let hingeAxis = new THREE.Vector3(1, 0, 0);
    let nominalAngleRad = 0;
    let foldOrder = 1;

    if (p.hingeToParent) {
      const h = p.hingeToParent;
      hingeAxis = new THREE.Vector3(h.axis.x, h.axis.y, h.axis.z).normalize();
      nominalAngleRad = (h.targetAngleDeg * Math.PI) / 180;
      foldOrder = h.foldOrder;
    }

    const overrideDeg = customAngles?.[p.id];
    const targetAngleRad = overrideDeg !== undefined
      ? (overrideDeg * Math.PI) / 180
      : nominalAngleRad;

    itemsMap.set(p.id, {
      panel: p,
      pivotGroup,
      mesh,
      hingeAxis,
      nominalAngleRad,
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

  // Centraliza o rootGroup exatamente na BASE da embalagem (Root Panel)
  const baseCx = rootPanel.centroid?.x ?? 0;
  const baseCz = -(rootPanel.centroid?.y ?? 0);
  rootGroup.position.set(-baseCx, 0, -baseCz);

  let currentProgress = 0;

  // Atualização contínua e 100% reversível de 0% a 100%
  const updateProgress = (progress: number) => {
    currentProgress = progress;
    const t = Math.max(0, Math.min(1, progress));

    for (const [id, item] of itemsMap.entries()) {
      if (id === rootPanel.id) continue;

      let localT = t;
      // Ordem física sequencial de montagem:
      // Ordem 1: paredes principais (0% a 50%)
      // Ordem 2: abas de poeira e topo duplo (20% a 70%)
      // Ordem 3: retorno das paredes duplas (40% a 85%)
      // Ordem 4: tampa fecha por cima (55% a 95%)
      // Ordem 5: abas da tampa e trava frontal inserem (70% a 100%)
      if (item.foldOrder === 1) {
        localT = Math.min(1, t / 0.5);
      } else if (item.foldOrder === 2) {
        localT = Math.max(0, Math.min(1, (t - 0.2) / 0.5));
      } else if (item.foldOrder === 3) {
        localT = Math.max(0, Math.min(1, (t - 0.4) / 0.45));
      } else if (item.foldOrder === 4) {
        localT = Math.max(0, Math.min(1, (t - 0.55) / 0.4));
      } else {
        localT = Math.max(0, Math.min(1, (t - 0.70) / 0.3));
      }

      const currentAngle = item.targetAngleRad * localT;
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(item.hingeAxis, currentAngle);
      item.pivotGroup.quaternion.copy(q);
    }
  };

  const setHingeAngle = (panelId: string, angleDeg: number) => {
    const item = itemsMap.get(panelId);
    if (!item || !item.panel.hingeToParent) return;
    item.targetAngleRad = (angleDeg * Math.PI) / 180;
    updateProgress(currentProgress);
  };

  const resetHingeAngle = (panelId: string) => {
    const item = itemsMap.get(panelId);
    if (!item || !item.panel.hingeToParent) return;
    item.targetAngleRad = item.nominalAngleRad;
    updateProgress(currentProgress);
  };

  const resetAllHingeAngles = () => {
    for (const item of itemsMap.values()) {
      item.targetAngleRad = item.nominalAngleRad;
    }
    updateProgress(currentProgress);
  };

  const getHingeInfoList = (): HingeControlInfo[] => {
    const list: HingeControlInfo[] = [];
    for (const p of panels) {
      if (p.isRoot || !p.hingeToParent) continue;
      const item = itemsMap.get(p.id);
      if (!item) continue;
      const parent = panels.find((pp) => pp.id === p.parentId);
      const nominalDeg = Math.round((item.nominalAngleRad * 180) / Math.PI * 10) / 10;
      const currentDeg = Math.round((item.targetAngleRad * 180) / Math.PI * 10) / 10;
      const isModified = Math.abs(nominalDeg - currentDeg) > 0.05;

      list.push({
        panelId: p.id,
        panelName: p.name,
        parentId: p.parentId,
        parentName: parent?.name,
        creaseLength: Math.round(p.hingeToParent.length * 10) / 10,
        foldOrder: p.hingeToParent.foldOrder,
        nominalAngleDeg: nominalDeg,
        currentAngleDeg: currentDeg,
        isModified,
      });
    }
    return list;
  };

  const highlightPanel = (panelId: string | null) => {
    for (const [id, item] of itemsMap.entries()) {
      const isTarget = id === panelId;
      const mats = Array.isArray(item.mesh.material) ? item.mesh.material : [item.mesh.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.emissive.set(isTarget ? 0x00d2b4 : 0x000000);
          m.emissiveIntensity = isTarget ? 0.35 : 0.0;
        }
      }
      // Destaque das linhas de aresta
      const edges = item.mesh.getObjectByName(`edges_${id}`) as THREE.LineSegments | undefined;
      if (edges && edges.material instanceof THREE.LineBasicMaterial) {
        edges.material.color.set(isTarget ? 0x00ffff : 0x64748b);
        edges.material.opacity = isTarget ? 1.0 : 0.5;
      }
    }
  };

  const updateArtwork = (texture: THREE.Texture | null) => {
    for (const item of itemsMap.values()) {
      const mesh = item.mesh;
      if (Array.isArray(mesh.material) && mesh.material[0] instanceof THREE.MeshStandardMaterial) {
        const mat = mesh.material[0];
        mat.map = texture;
        mat.color.set(texture ? '#FFFFFF' : outerColor);
        mat.needsUpdate = true;
      }
    }
  };

  // Inicializa aberto em 0%
  updateProgress(0);

  return {
    rootGroup,
    panelsCount: panels.length,
    topology,
    updateProgress,
    setHingeAngle,
    resetHingeAngle,
    resetAllHingeAngles,
    getHingeInfoList,
    highlightPanel,
    updateArtwork,
  };
}
