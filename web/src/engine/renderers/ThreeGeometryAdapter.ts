import * as THREE from 'three';
import type { Arc2D, BoundingBox2D } from '../types';
import type { StructuralPanel } from '../importers/LoopTopologyEngine';
import type { FoldingTreeResult, TopologicalHinge } from '../importers/FoldingTreeEngine';
import {
  Kinematic3DEngine,
  type FoldedPanel3D,
  type Kinematic3DResult,
  type Kinematic3DOptions,
} from '../importers/Kinematic3DEngine';

/**
 * Opções de configuração para o ThreeGeometryAdapter
 */
export interface ThreeGeometryAdapterOptions extends Kinematic3DOptions {
  outerColor?: string;
  innerColor?: string;
  cutLineColor?: string;
  creaseLineColor?: string;
  perfLineColor?: string;
  roughness?: number;
  metalness?: number;
  arcSegments?: number;
  dielineBounds?: BoundingBox2D;
  artworkTexture?: THREE.Texture | null;
}

/**
 * Estatísticas da triangulação de GPU comparadas com a geometria canônica
 */
export interface TriangulationStats {
  totalTriangles: number;
  totalVertices: number;
  panels: Array<{
    panelId: string;
    trianglesCount: number;
    gpuAreaMm2: number;
    canonicalAreaMm2: number;
    areaErrorMm2: number;
    areaErrorPercent: number;
  }>;
}

/**
 * Informações de controle de vinco/aba compatíveis com UI do inspetor
 */
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

/**
 * Proveniência forense completa de um painel selecionado no 3D
 */
export interface PanelProvenanceData {
  panelId: string;
  sourceEntityIds: string[];
  areaMm2: number;
  trianglesCount: number;
  holesCount: number;
  boundarySegmentsCount: number;
  boundaryArcsCount: number;
}

/**
 * Proveniência forense completa de uma crease/hinge selecionada no 3D
 */
export interface CreaseProvenanceData {
  creaseId: string;
  sourceCreaseId: string;
  matchedHalfEdgeId: string;
  parentPanelId: string;
  childPanelId: string;
  targetAngleDeg: number;
  angleSource: string;
  topologicalSign: number;
  signSource: string;
  physicalDirection: 'MOUNTAIN' | 'VALLEY' | 'NOT_DETERMINED';
  lengthMm: number;
}

/**
 * Controlador da cena Three.js derivado da cinemática pura
 */
export interface ThreeModelController {
  rootGroup: THREE.Group;
  panelsCount: number;
  panelMeshes: Map<string, THREE.Mesh>;
  creasePickTubes: Map<string, THREE.Mesh>;
  updateFoldPercent: (foldPercent: number, customAngles?: Record<string, number>) => Kinematic3DResult;
  setHingeAngle: (panelId: string, angleDeg: number) => void;
  resetHingeAngle: (panelId: string) => void;
  resetAllHingeAngles: () => void;
  getHingeInfoList: () => HingeControlInfo[];
  updateArtwork: (texture: THREE.Texture | null) => void;
  highlightPanel: (panelId: string | null) => void;
  highlightCrease: (creaseId: string | null) => void;
  raycastPanel: (raycaster: THREE.Raycaster) => {
    panelId: string;
    mesh: THREE.Mesh;
    p3d?: FoldedPanel3D;
    provenance: PanelProvenanceData;
  } | null;
  raycastCrease: (raycaster: THREE.Raycaster) => {
    creaseId: string;
    hinge: TopologicalHinge;
    provenance: CreaseProvenanceData;
  } | null;
  getTriangulationStats: () => TriangulationStats;
  dispose: () => void;
}

/**
 * Adaptador que converte a representação canônica analítica (Fase 2B / 2C.2 / 3)
 * para buffers estáticos do Three.js (WebGL/GPU), desacoplando a renderização da cinemática.
 * 
 * Regra Absoluta:
 * - NÃO recalcula hinges nem painéis.
 * - NÃO cria BoxGeometry nem PlaneGeometry retangular.
 * - Triangulação estática gerada uma única vez; o slider atualiza exclusivamente as matrizes 4x4 em 60 FPS.
 */
export class ThreeGeometryAdapter {
  /**
   * Converte os painéis canônicos e a árvore de dobragem em um modelo articulado Three.js
   */
  public static createModelController(
    panels: StructuralPanel[],
    foldingTree: FoldingTreeResult,
    options: ThreeGeometryAdapterOptions = {}
  ): ThreeModelController {
    const rootGroup = new THREE.Group();
    rootGroup.name = 'KinematicModelRoot';

    const panelsGroup = new THREE.Group();
    panelsGroup.name = 'PanelsGroup';
    rootGroup.add(panelsGroup);

    const panelMeshes = new Map<string, THREE.Mesh>();
    const creasePickTubes = new Map<string, THREE.Mesh>();

    const outerColor = new THREE.Color(options.outerColor || '#FFFFFF');
    const cutLineColor = options.cutLineColor || '#0F172A';
    const creaseLineColor = options.creaseLineColor || '#0284C7';
    const perfLineColor = options.perfLineColor || '#10B981';
    const roughness = options.roughness ?? 0.35;
    const metalness = options.metalness ?? 0.05;
    const arcSamples = options.arcSegments ?? 32;

    // Material padrão para os painéis
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: outerColor,
      roughness,
      metalness,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide,
      map: options.artworkTexture || null,
    });

    // Material de destaque quando selecionado
    const highlightMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#38BDF8'),
      emissive: new THREE.Color('#0284C7'),
      emissiveIntensity: 0.3,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });

    // Material de linha de corte
    const cutLineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(cutLineColor),
      linewidth: 1.5,
    });

    // Material de vinco (CREASE)
    const creaseLineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(creaseLineColor),
      linewidth: 1.5,
    });

    // Material de picote (PERF)
    const perfLineMaterial = new THREE.LineDashedMaterial({
      color: new THREE.Color(perfLineColor),
      linewidth: 1.2,
      dashSize: 3,
      gapSize: 2,
    });

    // Material invisível para tubos de clique do vinco
    const pickTubeMaterial = new THREE.MeshBasicMaterial({
      visible: false,
    });

    // 1. Triangulação Estática de Cada Painel Estrutural
    for (const panel of panels) {
      const shape = ThreeGeometryAdapter.buildPanelShape(panel, arcSamples);
      const geometry = new THREE.ShapeGeometry(shape);

      // Gera coordenadas UV proporcionais às dimensões globais da faca se fornecidas
      if (options.dielineBounds) {
        const pos = geometry.attributes.position;
        const uvs = new Float32Array(pos.count * 2);
        const b = options.dielineBounds;
        const w = b.width > 0 ? b.width : 1;
        const h = b.height > 0 ? b.height : 1;

        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          uvs[i * 2] = (x - b.minX) / w;
          uvs[i * 2 + 1] = (y - b.minY) / h;
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }

      geometry.computeVertexNormals();

      const mesh = new THREE.Mesh(geometry, panelMaterial);
      mesh.name = `PanelMesh_${panel.id}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; // Controle matricial direto via SE(3)

      mesh.userData = {
        sourcePanelId: panel.id,
        panel,
        originalMaterial: panelMaterial,
      };

      // 2. Constrói Linhas CAD em Espaço Local (Corte, Vinco, Picote)
      const cadLines = ThreeGeometryAdapter.buildPanelCadLines(
        panel,
        cutLineMaterial,
        creaseLineMaterial,
        perfLineMaterial,
        arcSamples
      );
      if (cadLines) {
        mesh.add(cadLines);
      }

      panelsGroup.add(mesh);
      panelMeshes.set(panel.id, mesh);
    }

    // 3. Constrói Tubos de Picking para as Hinges / CREASEs
    for (const hinge of foldingTree.hinges) {
      const parentMesh = panelMeshes.get(hinge.parentPanelId);
      if (!parentMesh) continue;

      const p0 = hinge.axisStart;
      const p1 = hinge.axisEnd;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);

      if (len > 0.001) {
        const tubeGeo = new THREE.CylinderGeometry(2.5, 2.5, len, 8);
        const tubeMesh = new THREE.Mesh(tubeGeo, pickTubeMaterial);
        tubeMesh.name = `CreasePickTube_${hinge.creaseId}`;

        // Alinha o cilindro com o segmento de eixo p0 -> p1
        const midX = (p0.x + p1.x) / 2;
        const midY = (p0.y + p1.y) / 2;
        tubeMesh.position.set(midX, midY, 0);

        const angle = Math.atan2(dy, dx);
        tubeMesh.rotation.z = angle - Math.PI / 2;

        tubeMesh.userData = {
          creaseId: hinge.creaseId,
          hinge,
          parentPanelId: hinge.parentPanelId,
          childPanelId: hinge.childPanelId,
        };

        parentMesh.add(tubeMesh);
        creasePickTubes.set(hinge.creaseId, tubeMesh);
      }
    }

    // Estado de ângulos customizados
    let currentCustomAngles: Record<string, number> = { ...(options.customAngles || {}) };

    // Função de atualização dinâmica ultra-rápida (60 FPS)
    const updateFoldPercent = (foldPercent: number, customAngles?: Record<string, number>): Kinematic3DResult => {
      if (customAngles) {
        currentCustomAngles = { ...currentCustomAngles, ...customAngles };
      }
      const result = Kinematic3DEngine.computeFoldedState(panels, foldingTree, foldPercent, {
        customAngles: currentCustomAngles,
        toleranceMm: options.toleranceMm,
      });

      for (const p3d of result.panels) {
        const mesh = panelMeshes.get(p3d.sourcePanelId);
        if (mesh) {
          mesh.matrix.fromArray(p3d.transform.elements);
          mesh.updateMatrixWorld(true);
          mesh.userData.p3d = p3d;
        }
      }

      return result;
    };

    // Aplica estado inicial (0% ou default)
    updateFoldPercent(0);

    const setHingeAngle = (panelId: string, angleDeg: number) => {
      currentCustomAngles[panelId] = angleDeg;
    };

    const resetHingeAngle = (panelId: string) => {
      delete currentCustomAngles[panelId];
    };

    const resetAllHingeAngles = () => {
      currentCustomAngles = {};
    };

    const getHingeInfoList = (): HingeControlInfo[] => {
      return foldingTree.hinges.map((h, idx) => {
        const dx = h.axisEnd.x - h.axisStart.x;
        const dy = h.axisEnd.y - h.axisStart.y;
        const creaseLength = Math.hypot(dx, dy);
        const targetAngle = h.kinematics ? h.kinematics.targetAngle : (h.foldAngle ?? 90);
        const nominalAngleDeg = Math.round(targetAngle * 10) / 10;
        const custom = currentCustomAngles[h.childPanelId];
        const currentAngleDeg = custom !== undefined ? custom : nominalAngleDeg;
        return {
          panelId: h.childPanelId,
          panelName: `Aba ${h.childPanelId}`,
          parentId: h.parentPanelId,
          parentName: `Painel ${h.parentPanelId}`,
          creaseLength: Number(creaseLength.toFixed(2)),
          foldOrder: idx + 1,
          nominalAngleDeg,
          currentAngleDeg,
          isModified: custom !== undefined && Math.abs(custom - nominalAngleDeg) > 0.01,
        };
      });
    };

    const updateArtwork = (texture: THREE.Texture | null) => {
      panelMaterial.map = texture;
      panelMaterial.needsUpdate = true;
    };

    // Destaca painel por ID
    const highlightPanel = (panelId: string | null) => {
      panelMeshes.forEach((mesh, id) => {
        if (panelId && id === panelId) {
          mesh.material = highlightMaterial;
        } else {
          mesh.material = mesh.userData.originalMaterial || panelMaterial;
        }
      });
    };

    // Destaca vinco por ID
    const highlightCrease = (creaseId: string | null) => {
      creasePickTubes.forEach((tube, cid) => {
        if (creaseId && cid === creaseId) {
          tube.visible = true;
          tube.material = highlightMaterial;
        } else {
          tube.visible = false;
          tube.material = pickTubeMaterial;
        }
      });
    };

    // Raycast para seleção de painel
    const raycastPanel = (raycaster: THREE.Raycaster) => {
      const meshes = Array.from(panelMeshes.values());
      const intersects = raycaster.intersectObjects(meshes, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const pid = hit.userData.sourcePanelId as string;
        const panel = hit.userData.panel as StructuralPanel;
        const geo = hit.geometry as THREE.BufferGeometry;
        const triCount = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;

        const boundaryEntityIds = panel && panel.outerBoundary
          ? panel.outerBoundary.edges.map((e, idx) => String(e.id && e.id !== 'undefined' ? e.id : `${e.sourceType}_${idx + 1}`))
          : [];
        const sourceEntityIds: string[] = boundaryEntityIds.length > 0
          ? boundaryEntityIds
          : [
              ...(panel.segments || []).map((s, idx) => String(s.id || `seg_${idx + 1}`)),
              ...(panel.arcs || []).map((a, idx) => String(a.id || `arc_${idx + 1}`)),
            ].filter((id) => id.length > 0 && id !== 'undefined');

        const provenance: PanelProvenanceData = {
          panelId: pid,
          sourceEntityIds,
          areaMm2: panel ? Number(panel.area.toFixed(2)) : 0,
          trianglesCount: triCount,
          holesCount: panel && panel.holes ? panel.holes.length : 0,
          boundarySegmentsCount: panel && panel.segments ? panel.segments.length : 0,
          boundaryArcsCount: panel && panel.arcs ? panel.arcs.length : 0,
        };

        return {
          panelId: pid,
          mesh: hit,
          p3d: hit.userData.p3d as FoldedPanel3D | undefined,
          provenance,
        };
      }
      return null;
    };

    // Raycast para seleção de vinco
    const raycastCrease = (raycaster: THREE.Raycaster) => {
      const tubes = Array.from(creasePickTubes.values());
      const intersects = raycaster.intersectObjects(tubes, false);
      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const hinge = hit.userData.hinge as TopologicalHinge;
        const dx = hinge.axisEnd.x - hinge.axisStart.x;
        const dy = hinge.axisEnd.y - hinge.axisStart.y;
        const k = hinge.kinematics;
        const provenance: CreaseProvenanceData = {
          creaseId: hinge.creaseId,
          sourceCreaseId: hinge.creaseId,
          matchedHalfEdgeId: hinge.matchedHalfEdgeId || 'N/A',
          parentPanelId: hinge.parentPanelId,
          childPanelId: hinge.childPanelId,
          targetAngleDeg: k ? Math.round(k.targetAngle * 10) / 10 : hinge.foldAngle,
          angleSource: k ? k.angleSource : 'DEFAULT',
          topologicalSign: k ? k.topologicalSign : hinge.foldSign,
          signSource: k ? k.signSource : 'DEFAULT',
          physicalDirection: k ? k.physicalDirection : 'NOT_DETERMINED',
          lengthMm: Number(Math.hypot(dx, dy).toFixed(2)),
        };

        return {
          creaseId: hit.userData.creaseId as string,
          hinge,
          provenance,
        };
      }
      return null;
    };

    // Estatísticas da triangulação de GPU comparadas com a geometria analítica
    const getTriangulationStats = (): TriangulationStats => {
      let totalTriangles = 0;
      let totalVertices = 0;
      const panelStats: TriangulationStats['panels'] = [];

      panelMeshes.forEach((mesh, pid) => {
        const geo = mesh.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        const index = geo.index;
        const triCount = index ? index.count / 3 : pos.count / 3;
        totalTriangles += triCount;
        totalVertices += pos.count;

        let gpuArea = 0;
        for (let i = 0; i < (index ? index.count : pos.count); i += 3) {
          const i0 = index ? index.getX(i) : i;
          const i1 = index ? index.getX(i + 1) : i + 1;
          const i2 = index ? index.getX(i + 2) : i + 2;

          const ax = pos.getX(i0), ay = pos.getY(i0);
          const bx = pos.getX(i1), by = pos.getY(i1);
          const cx = pos.getX(i2), cy = pos.getY(i2);

          gpuArea += 0.5 * Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
        }

        const canonicalPanel = mesh.userData.panel as StructuralPanel;
        const canonicalArea = canonicalPanel.area;
        const areaError = Math.abs(gpuArea - canonicalArea);
        const areaErrorPercent = canonicalArea > 0 ? (areaError / canonicalArea) * 100 : 0;

        panelStats.push({
          panelId: pid,
          trianglesCount: triCount,
          gpuAreaMm2: Number(gpuArea.toFixed(4)),
          canonicalAreaMm2: Number(canonicalArea.toFixed(4)),
          areaErrorMm2: Number(areaError.toFixed(6)),
          areaErrorPercent: Number(areaErrorPercent.toFixed(4)),
        });
      });

      return {
        totalTriangles,
        totalVertices,
        panels: panelStats,
      };
    };

    // Liberação limpa de recursos WebGL
    const dispose = () => {
      panelMeshes.forEach((mesh) => {
        mesh.geometry.dispose();
      });
      creasePickTubes.forEach((tube) => {
        tube.geometry.dispose();
      });
      panelMaterial.dispose();
      highlightMaterial.dispose();
      cutLineMaterial.dispose();
      creaseLineMaterial.dispose();
      perfLineMaterial.dispose();
      pickTubeMaterial.dispose();

      while (rootGroup.children.length > 0) {
        rootGroup.remove(rootGroup.children[0]);
      }
    };

    return {
      rootGroup,
      panelsCount: panels.length,
      panelMeshes,
      creasePickTubes,
      updateFoldPercent,
      setHingeAngle,
      resetHingeAngle,
      resetAllHingeAngles,
      getHingeInfoList,
      updateArtwork,
      highlightPanel,
      highlightCrease,
      raycastPanel,
      raycastCrease,
      getTriangulationStats,
      dispose,
    };
  }

  /**
   * Constrói o THREE.Shape analítico respeitando outerBoundary e subtraindo todos os furos (holes)
   */
  private static buildPanelShape(panel: StructuralPanel, arcSamples: number): THREE.Shape {
    const shape = new THREE.Shape();

    // 1. Amostra o contorno externo preservando curvas analíticas Arc2D
    const outerPts = ThreeGeometryAdapter.sampleBoundaryPoints(panel.outerBoundary.edges, arcSamples);
    if (outerPts.length > 0) {
      shape.moveTo(outerPts[0].x, outerPts[0].y);
      for (let i = 1; i < outerPts.length; i++) {
        shape.lineTo(outerPts[i].x, outerPts[i].y);
      }
      shape.closePath();
    }

    // 2. Subtrai furos internos analíticos (holes)
    for (const hole of panel.holes) {
      const holePts = ThreeGeometryAdapter.sampleBoundaryPoints(hole.edges, arcSamples);
      if (holePts.length >= 3) {
        const holePath = new THREE.Path();
        holePath.moveTo(holePts[0].x, holePts[0].y);
        for (let i = 1; i < holePts.length; i++) {
          holePath.lineTo(holePts[i].x, holePts[i].y);
        }
        holePath.closePath();
        shape.holes.push(holePath);
      }
    }

    return shape;
  }

  /**
   * Amostra a sequência de arestas do contorno preservando arcos de curvatura suave
   */
  private static sampleBoundaryPoints(edges: any[], arcSamples: number): THREE.Vector2[] {
    const pts: THREE.Vector2[] = [];

    for (const e of edges) {
      if (e.type === 'arc') {
        const arc = e.entity as Arc2D;
        const isFwd = e.direction !== 'REVERSE';
        const aStartRad = (arc.startAngle * Math.PI) / 180;
        const aEndRad = (arc.endAngle * Math.PI) / 180;

        let a0 = aStartRad;
        let a1 = aEndRad;
        if (!isFwd) {
          a0 = aEndRad;
          a1 = aStartRad;
        }

        let sweep = a1 - a0;
        if (isFwd && sweep < 0) sweep += 2 * Math.PI;
        if (!isFwd && sweep > 0) sweep -= 2 * Math.PI;

        const numSegs = Math.max(8, Math.ceil((Math.abs(sweep) / Math.PI) * (arcSamples / 2)));
        for (let s = 0; s < numSegs; s++) {
          const t = s / numSegs;
          const ang = a0 + t * sweep;
          pts.push(new THREE.Vector2(arc.cx + arc.r * Math.cos(ang), arc.cy + arc.r * Math.sin(ang)));
        }
      } else {
        pts.push(new THREE.Vector2(e.p0.x, e.p0.y));
      }
    }

    return pts;
  }

  /**
   * Constrói as linhas CAD tridimensionais associadas ao painel
   */
  private static buildPanelCadLines(
    panel: StructuralPanel,
    cutMat: THREE.LineBasicMaterial,
    creaseMat: THREE.LineBasicMaterial,
    perfMat: THREE.LineDashedMaterial,
    arcSamples: number
  ): THREE.Group | null {
    const group = new THREE.Group();
    group.name = `CadLines_${panel.id}`;

    const cutPositions: number[] = [];
    const creasePositions: number[] = [];
    const perfPositions: number[] = [];

    // Processa arestas do outerBoundary
    for (const e of panel.outerBoundary.edges) {
      const target = e.sourceType === 'crease' ? creasePositions : cutPositions;
      if (e.type === 'arc') {
        const arc = e.entity as Arc2D;
        const isFwd = e.direction !== 'REVERSE';
        const aStartRad = (arc.startAngle * Math.PI) / 180;
        const aEndRad = (arc.endAngle * Math.PI) / 180;
        let a0 = isFwd ? aStartRad : aEndRad;
        let a1 = isFwd ? aEndRad : aStartRad;
        let sweep = a1 - a0;
        if (isFwd && sweep < 0) sweep += 2 * Math.PI;
        if (!isFwd && sweep > 0) sweep -= 2 * Math.PI;

        const numSegs = Math.max(8, Math.ceil((Math.abs(sweep) / Math.PI) * (arcSamples / 2)));
        for (let s = 0; s < numSegs; s++) {
          const t1 = s / numSegs;
          const t2 = (s + 1) / numSegs;
          const ang1 = a0 + t1 * sweep;
          const ang2 = a0 + t2 * sweep;
          target.push(
            arc.cx + arc.r * Math.cos(ang1), arc.cy + arc.r * Math.sin(ang1), 0.05,
            arc.cx + arc.r * Math.cos(ang2), arc.cy + arc.r * Math.sin(ang2), 0.05
          );
        }
      } else {
        target.push(e.p0.x, e.p0.y, 0.05, e.p1.x, e.p1.y, 0.05);
      }
    }

    // Processa furos
    for (const hole of panel.holes) {
      for (const e of hole.edges) {
        cutPositions.push(e.p0.x, e.p0.y, 0.05, e.p1.x, e.p1.y, 0.05);
      }
    }

    if (cutPositions.length > 0) {
      const cutGeo = new THREE.BufferGeometry();
      cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));
      group.add(new THREE.LineSegments(cutGeo, cutMat));
    }

    if (creasePositions.length > 0) {
      const creaseGeo = new THREE.BufferGeometry();
      creaseGeo.setAttribute('position', new THREE.Float32BufferAttribute(creasePositions, 3));
      group.add(new THREE.LineSegments(creaseGeo, creaseMat));
    }

    if (perfPositions.length > 0) {
      const perfGeo = new THREE.BufferGeometry();
      perfGeo.setAttribute('position', new THREE.Float32BufferAttribute(perfPositions, 3));
      const line = new THREE.LineSegments(perfGeo, perfMat);
      line.computeLineDistances();
      group.add(line);
    }

    return group.children.length > 0 ? group : null;
  }
}
