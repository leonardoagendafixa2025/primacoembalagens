import type { Arc2D } from '../types';
import type { StructuralPanel } from './LoopTopologyEngine';
import type {
  FoldingTreeResult,
  TopologicalHinge,
} from './FoldingTreeEngine';

/**
 * Ponto tridimensional no espaço cartesiano (mm)
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Matriz afim 4x4 homogênea em representação column-major (16 floats)
 */
export interface Matrix4x4 {
  elements: number[];
}

export class Mat4 {
  public static identity(): Matrix4x4 {
    return {
      elements: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ],
    };
  }

  public static translation(tx: number, ty: number, tz: number): Matrix4x4 {
    return {
      elements: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        tx, ty, tz, 1,
      ],
    };
  }

  /**
   * Rotação em torno de um eixo unitário arbitrário u pelo ângulo em radianos (Fórmula de Rodrigues)
   */
  public static rotationAxis(axis: Vector3D, angleRad: number): Matrix4x4 {
    const len = Math.hypot(axis.x, axis.y, axis.z);
    if (len < 1e-9) return Mat4.identity();

    const ux = axis.x / len;
    const uy = axis.y / len;
    const uz = axis.z / len;

    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const t = 1 - c;

    // Coluna 0
    const m00 = t * ux * ux + c;
    const m10 = t * ux * uy + s * uz;
    const m20 = t * ux * uz - s * uy;
    const m30 = 0;

    // Coluna 1
    const m01 = t * ux * uy - s * uz;
    const m11 = t * uy * uy + c;
    const m21 = t * uy * uz + s * ux;
    const m31 = 0;

    // Coluna 2
    const m02 = t * ux * uz + s * uy;
    const m12 = t * uy * uz - s * ux;
    const m22 = t * uz * uz + c;
    const m32 = 0;

    // Coluna 3
    const m03 = 0;
    const m13 = 0;
    const m23 = 0;
    const m33 = 1;

    return {
      elements: [
        m00, m10, m20, m30,
        m01, m11, m21, m31,
        m02, m12, m22, m32,
        m03, m13, m23, m33,
      ],
    };
  }

  /**
   * Multiplicação de matrizes 4x4 (A * B)
   */
  public static multiply(a: Matrix4x4, b: Matrix4x4): Matrix4x4 {
    const ae = a.elements;
    const be = b.elements;
    const te = new Array<number>(16);

    const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
    const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
    const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
    const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];

    const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
    const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
    const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
    const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];

    te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;

    te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;

    te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;

    te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;

    return { elements: te };
  }

  /**
   * Transforma um ponto 3D (coordenada afim homogênea w=1)
   */
  public static transformPoint(m: Matrix4x4, p: Vector3D): Vector3D {
    const e = m.elements;
    const x = p.x, y = p.y, z = p.z;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    const invW = Math.abs(w) > 1e-9 ? 1 / w : 1;

    return {
      x: (e[0] * x + e[4] * y + e[8] * z + e[12]) * invW,
      y: (e[1] * x + e[5] * y + e[9] * z + e[13]) * invW,
      z: (e[2] * x + e[6] * y + e[10] * z + e[14]) * invW,
    };
  }

  /**
   * Transforma um vetor diretor (coordenada homogênea w=0, sem translação)
   */
  public static transformVector(m: Matrix4x4, v: Vector3D): Vector3D {
    const e = m.elements;
    return {
      x: e[0] * v.x + e[4] * v.y + e[8] * v.z,
      y: e[1] * v.x + e[5] * v.y + e[9] * v.z,
      z: e[2] * v.x + e[6] * v.y + e[10] * v.z,
    };
  }
}

/**
 * Aresta 3D preservando analiticamente a entidade original 2D
 */
export interface Edge3D {
  sourceEntityId: string;
  sourceType: string;
  type: 'segment' | 'arc';
  p0: Vector3D;
  p1: Vector3D;
  arcData?: {
    cx: number;
    cy: number;
    cz: number;
    r: number;
    startAngle: number;
    endAngle: number;
    normal: Vector3D;
  };
}

/**
 * Loop fechado 3D (contorno externo ou furo)
 */
export interface PanelBoundary3D {
  id: string;
  edges: Edge3D[];
  vertices: Vector3D[];
}

/**
 * Representação cinemática tridimensional completa de um painel estrutural
 */
export interface FoldedPanel3D {
  sourcePanelId: string;
  parentPanelId?: string;
  incomingHingeId?: string;
  sourceCreaseId?: string;
  matchedHalfEdgeId?: string;
  depth: number;
  transform: Matrix4x4;
  localVertices: Vector3D[];  // Vértices no plano original da faca (Z = 0)
  worldVertices: Vector3D[];  // Vértices após aplicação de transform
  outerBoundary: PanelBoundary3D;
  holes: PanelBoundary3D[];
  area: number;
  centroid: Vector3D;
  isRoot: boolean;
}

/**
 * Diagnósticos estruturados do motor 3D
 */
export interface Kinematic3DDiagnostic {
  code:
    | 'INVALID_HINGE_AXIS'
    | 'INVALID_PANEL_GEOMETRY'
    | 'DISCONNECTED_FOLD_COMPONENT'
    | 'FOLD_GRAPH_CYCLE'
    | 'INVALID_HINGE_CREASE_MAPPING'
    | 'NON_RIGID_TRANSFORMATION'
    | 'PROJECTION_MISMATCH';
  message: string;
  panelId?: string;
  creaseId?: string;
}

/**
 * Resultado completo da cinemática 3D (Fase 3)
 */
export interface Kinematic3DResult {
  panels: FoldedPanel3D[];
  rootPanelId: string;
  rootSource: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC';
  foldPercent: number;
  diagnostics: Kinematic3DDiagnostic[];
  manifest: string;
  stats: {
    totalPanels: number;
    totalVertices: number;
    totalHinges: number;
    rigidLengthMaxErrorMm: number;
    isReversible: boolean;
  };
}

/**
 * Opções de configuração para o motor cinemático 3D
 */
export interface Kinematic3DOptions {
  customAngles?: Record<string, number>; // Sobrescreve ângulo alvo para cada hinge/painel
  toleranceMm?: number;                  // Tolerância geométrica (padrão: 0.001mm)
}

/**
 * Motor Cinemático 3D Real do PLMPackLib Web (Fase 3)
 * 
 * Regra Absoluta:
 * - Não cria cubos, caixas genéricas ou bounding boxes.
 * - Toda geometria 3D é uma transformação rígida exata da faca 2D original.
 * - A 0% de dobra, toda a geometria reside coplanar no plano Z=0 e projeta exatamente a faca.
 */
export class Kinematic3DEngine {
  /**
   * Constrói o estado cinemático 3D completo para um dado percentual de dobra (0 a 100%)
   */
  public static computeFoldedState(
    panels: StructuralPanel[],
    foldingTree: FoldingTreeResult,
    foldPercent: number,
    options: Kinematic3DOptions = {}
  ): Kinematic3DResult {
    const tolerance = options.toleranceMm ?? 0.001;
    const clampedFold = Math.max(0, Math.min(100, foldPercent));
    const diagnostics: Kinematic3DDiagnostic[] = [];

    // Propaga diagnósticos da Fase 2C se existirem
    for (const cyc of foldingTree.cycles) {
      diagnostics.push({
        code: 'FOLD_GRAPH_CYCLE',
        message: `Ciclo topológico no grafo de dobragem: [${cyc.panelsInvolved.join(' -> ')}]`,
      });
    }

    for (const dc of foldingTree.disconnectedComponents) {
      diagnostics.push({
        code: 'DISCONNECTED_FOLD_COMPONENT',
        message: `Componente desconexo de dobragem ${dc.componentId} com ${dc.panelsCount} painéis.`,
      });
    }

    for (const im of foldingTree.invalidHingeCreaseMappings) {
      diagnostics.push({
        code: 'INVALID_HINGE_CREASE_MAPPING',
        message: im.description,
        panelId: im.parentPanelId,
        creaseId: im.creaseId,
      });
    }

    // Mapa de painéis estruturais por ID
    const panelMap = new Map<string, StructuralPanel>();
    for (const p of panels) {
      panelMap.set(p.id, p);
    }

    // Mapa de dobradiças por painel filho
    const childHingeMap = new Map<string, TopologicalHinge>();
    for (const h of foldingTree.hinges) {
      childHingeMap.set(h.childPanelId, h);
    }

    // Matrizes de transformação de mundo acumuladas por painel (T_world)
    const worldTransforms = new Map<string, Matrix4x4>();

    // Função de rotação local rígida da dobradiça
    function computeHingeTransform(hinge: TopologicalHinge): Matrix4x4 {
      const p0: Vector3D = { x: hinge.axisStart.x, y: hinge.axisStart.y, z: 0 };
      const p1: Vector3D = { x: hinge.axisEnd.x, y: hinge.axisEnd.y, z: 0 };

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);

      if (len < 1e-6) {
        diagnostics.push({
          code: 'INVALID_HINGE_AXIS',
          message: `Eixo de vinco degenerado com comprimento ${len.toFixed(6)}mm na hinge ${hinge.id}.`,
          panelId: hinge.childPanelId,
          creaseId: hinge.creaseId,
        });
        return Mat4.identity();
      }

      // Se o mapeamento entre vinco e contorno do pai teve aviso, mantém rotação suave com sinal padrão
      if (hinge.kinematics.signSource === 'INVALID_MAPPING') {
        diagnostics.push({
          code: 'INVALID_HINGE_CREASE_MAPPING',
          message: `Aviso na hinge ${hinge.id} (crease ${hinge.creaseId}): sinal estimado por fallback geométrico.`,
          panelId: hinge.childPanelId,
          creaseId: hinge.creaseId,
        });
      }

      const axis: Vector3D = { x: dx / len, y: dy / len, z: 0 };

      // Ângulo alvo em graus
      const targetDeg =
        options.customAngles?.[hinge.childPanelId] ??
        options.customAngles?.[hinge.id] ??
        hinge.kinematics.targetAngle;

      const angleRad = (targetDeg * Math.PI) / 180;

      // Progressão física de fechamento sequencial por abas (Padrão Heidelberg Package Designer / ArtiosCAD)
      const t = clampedFold / 100;
      const order = hinge.foldOrder ?? 1;
      let localProgress = t;

      if (t <= 0) {
        localProgress = 0;
      } else if (t >= 1) {
        localProgress = 1;
      } else if (order === 1) {
        // Paredes principais erguem de 0% a 40%
        localProgress = Math.min(1, t / 0.40);
      } else if (order === 2) {
        // Abas de poeira e cantos recolhem de 20% a 60%
        localProgress = Math.max(0, Math.min(1, (t - 0.20) / 0.40));
      } else if (order === 3) {
        // Paredes duplas e travamento interno de 40% a 75%
        localProgress = Math.max(0, Math.min(1, (t - 0.40) / 0.35));
      } else if (order === 4) {
        // Tampa fecha de 60% a 90%
        localProgress = Math.max(0, Math.min(1, (t - 0.60) / 0.30));
      } else {
        // Abas da tampa e trava frontal inserem de 75% a 100%
        localProgress = Math.max(0, Math.min(1, (t - 0.75) / 0.25));
      }

      // Ângulo interpolado sequencialmente pela ordem da aba
      const currentAngleRad = localProgress * angleRad * hinge.kinematics.topologicalSign;

      // Hinge rigid transform: T(P0) * Rot(axis, theta) * T(-P0)
      const tToOrigin = Mat4.translation(-p0.x, -p0.y, -p0.z);
      const rot = Mat4.rotationAxis(axis, currentAngleRad);
      const tFromOrigin = Mat4.translation(p0.x, p0.y, p0.z);

      return Mat4.multiply(tFromOrigin, Mat4.multiply(rot, tToOrigin));
    }

    // Travessia BFS da Spanning Tree a partir de cada raiz de componente
    const componentsToTraverse =
      foldingTree.components && foldingTree.components.length > 0
        ? foldingTree.components
        : [
            {
              componentId: 'COMP_DEFAULT',
              rootPanelId:
                foldingTree.rootPanelId ||
                (panels.find((p) => !childHingeMap.has(p.id))?.id || panels[0]?.id || ''),
              panelIds: panels.map((p) => p.id),
              hinges: foldingTree.hinges,
            },
          ];

    for (const comp of componentsToTraverse) {
      const rootId = comp.rootPanelId;
      if (!panelMap.has(rootId)) continue;

      // Raiz do componente tem transformação de mundo identidade
      worldTransforms.set(rootId, Mat4.identity());

      // Fila para propagar transformações da hierarquia
      const queue: string[] = [rootId];
      const visited = new Set<string>([rootId]);

      while (queue.length > 0) {
        const currParentId = queue.shift()!;
        const parentWorld = worldTransforms.get(currParentId) || Mat4.identity();

        // Encontra todos os filhos imediatos
        const childHinges = foldingTree.hinges.filter((h) => h.parentPanelId === currParentId);

        for (const h of childHinges) {
          const childId = h.childPanelId;
          if (visited.has(childId)) continue;
          visited.add(childId);

          // Rotação local da dobradiça
          const rHinge = computeHingeTransform(h);
          // T_world(child) = T_world(parent) * rHinge
          const childWorld = Mat4.multiply(parentWorld, rHinge);

          worldTransforms.set(childId, childWorld);
          queue.push(childId);
        }
      }
    }

    // Constrói os painéis 3D dobrados (FoldedPanel3D)
    const foldedPanels: FoldedPanel3D[] = [];
    let rigidLengthMaxErrorMm = 0;
    let totalVertices = 0;

    for (const p of panels) {
      const transform = worldTransforms.get(p.id) || Mat4.identity();
      const incomingHinge = childHingeMap.get(p.id);

      // Converte vértices locais 2D -> 3D (com Z = 0)
      const localVertices: Vector3D[] = p.outerBoundary.vertices.map((v) => ({
        x: v.x,
        y: v.y,
        z: 0,
      }));

      // Vértices de mundo calculados por transformação rígida pura
      const worldVertices: Vector3D[] = localVertices.map((v) => Mat4.transformPoint(transform, v));
      totalVertices += worldVertices.length;

      // Verificação da conservação rígida de distâncias intra-painel
      for (let i = 0; i < localVertices.length; i++) {
        const next = (i + 1) % localVertices.length;
        const dLocal = Math.hypot(
          localVertices[next].x - localVertices[i].x,
          localVertices[next].y - localVertices[i].y
        );
        const dWorld = Math.hypot(
          worldVertices[next].x - worldVertices[i].x,
          worldVertices[next].y - worldVertices[i].y,
          worldVertices[next].z - worldVertices[i].z
        );
        const err = Math.abs(dWorld - dLocal);
        if (err > rigidLengthMaxErrorMm) rigidLengthMaxErrorMm = err;
        if (err > tolerance) {
          diagnostics.push({
            code: 'NON_RIGID_TRANSFORMATION',
            message: `Deformação não-rígida detectada no painel ${p.id}: erro de comprimento = ${err.toFixed(6)}mm`,
            panelId: p.id,
          });
        }
      }

      // Constrói outerBoundary 3D analítico
      const outerEdges3D: Edge3D[] = p.outerBoundary.edges.map((e) => {
        const p0w = Mat4.transformPoint(transform, { x: e.p0.x, y: e.p0.y, z: 0 });
        const p1w = Mat4.transformPoint(transform, { x: e.p1.x, y: e.p1.y, z: 0 });

        let arcData: Edge3D['arcData'] = undefined;
        if (e.type === 'arc') {
          const arc2d = e.entity as Arc2D;
          const centerW = Mat4.transformPoint(transform, { x: arc2d.cx, y: arc2d.cy, z: 0 });
          const normalW = Mat4.transformVector(transform, { x: 0, y: 0, z: 1 });

          arcData = {
            cx: centerW.x,
            cy: centerW.y,
            cz: centerW.z,
            r: arc2d.r,
            startAngle: arc2d.startAngle,
            endAngle: arc2d.endAngle,
            normal: normalW,
          };
        }

        return {
          sourceEntityId: String(e.id),
          sourceType: e.sourceType,
          type: e.type,
          p0: p0w,
          p1: p1w,
          arcData,
        };
      });

      const outerBoundary3D: PanelBoundary3D = {
        id: p.outerBoundary.id,
        edges: outerEdges3D,
        vertices: worldVertices,
      };

      // Constrói holes 3D analíticos
      const holes3D: PanelBoundary3D[] = p.holes.map((h) => {
        const hVerts: Vector3D[] = h.vertices.map((v) =>
          Mat4.transformPoint(transform, { x: v.x, y: v.y, z: 0 })
        );
        const hEdges: Edge3D[] = h.edges.map((e) => {
          const p0w = Mat4.transformPoint(transform, { x: e.p0.x, y: e.p0.y, z: 0 });
          const p1w = Mat4.transformPoint(transform, { x: e.p1.x, y: e.p1.y, z: 0 });
          return {
            sourceEntityId: String(e.id),
            sourceType: e.sourceType,
            type: e.type,
            p0: p0w,
            p1: p1w,
          };
        });

        return {
          id: h.id,
          edges: hEdges,
          vertices: hVerts,
        };
      });

      const centroidW = Mat4.transformPoint(transform, { x: p.centroid.x, y: p.centroid.y, z: 0 });

      foldedPanels.push({
        sourcePanelId: p.id,
        parentPanelId: incomingHinge?.parentPanelId,
        incomingHingeId: incomingHinge?.id,
        sourceCreaseId: incomingHinge?.creaseId,
        matchedHalfEdgeId: incomingHinge?.matchedHalfEdgeId,
        depth: incomingHinge?.foldOrder ?? 0,
        transform,
        localVertices,
        worldVertices,
        outerBoundary: outerBoundary3D,
        holes: holes3D,
        area: p.area,
        centroid: centroidW,
        isRoot: p.id === foldingTree.rootPanelId,
      });
    }

    // Manifesto forense cinemático 3D
    const manifestLines: string[] = [
      '============================================================',
      'PRIMACOR EMBALAGENS — MANIFESTO CINEMÁTICO 3D (FASE 3)',
      '============================================================\n',
      `Progresso de Dobra (foldPercent): ${clampedFold.toFixed(2)}%`,
      `Painel Raiz Primário           : ${foldingTree.rootPanelId} [${foldingTree.rootSource}]`,
      `Total de Painéis 3D            : ${foldedPanels.length}`,
      `Total de Vértices 3D           : ${totalVertices}`,
      `Erro Máximo de Comprimento     : ${rigidLengthMaxErrorMm.toExponential(4)} mm\n`,
      '------------------------------------------------------------',
      'ESTADO DOS PAINÉIS 3D:',
      '------------------------------------------------------------',
    ];

    for (const fp of foldedPanels) {
      manifestLines.push(`Panel ${fp.sourcePanelId} ${fp.isRoot ? '[ROOT]' : ''}`);
      manifestLines.push(`  Parent Hinge   : ${fp.incomingHingeId || 'NENHUMA (ROOT)'}`);
      manifestLines.push(`  Source CREASE  : ${fp.sourceCreaseId || 'N/A'}`);
      manifestLines.push(`  Half-Edge ID   : ${fp.matchedHalfEdgeId || 'N/A'}`);
      manifestLines.push(`  Centroid 3D    : (${fp.centroid.x.toFixed(3)}, ${fp.centroid.y.toFixed(3)}, ${fp.centroid.z.toFixed(3)})`);
      manifestLines.push(`  Vértices Outer : ${fp.worldVertices.length}`);
      manifestLines.push(`  Furos (Holes)  : ${fp.holes.length}`);
      manifestLines.push('');
    }

    return {
      panels: foldedPanels,
      rootPanelId: foldingTree.rootPanelId,
      rootSource: foldingTree.rootSource,
      foldPercent: clampedFold,
      diagnostics,
      manifest: manifestLines.join('\n'),
      stats: {
        totalPanels: foldedPanels.length,
        totalVertices,
        totalHinges: foldingTree.hinges.length,
        rigidLengthMaxErrorMm,
        isReversible: rigidLengthMaxErrorMm < tolerance,
      },
    };
  }

  /**
   * Validação central: Projeta o estado 3D em 0% de volta ao plano 2D e compara
   * com a geometria 2D original (entidade por entidade, vértice por vértice).
   */
  public static validateProjectedZeroMatchesOriginal(
    panels: StructuralPanel[],
    stateAtZero: Kinematic3DResult,
    toleranceMm: number = 0.001
  ): {
    matches: boolean;
    maxDiscrepancyMm: number;
    details: string;
  } {
    if (stateAtZero.foldPercent !== 0) {
      return {
        matches: false,
        maxDiscrepancyMm: Infinity,
        details: `Estado fornecido tem foldPercent = ${stateAtZero.foldPercent}%, esperado 0%.`,
      };
    }

    if (panels.length !== stateAtZero.panels.length) {
      return {
        matches: false,
        maxDiscrepancyMm: Infinity,
        details: `Contagem divergente de painéis: original=${panels.length}, 3D=${stateAtZero.panels.length}.`,
      };
    }

    let maxDiscrepancy = 0;

    for (let i = 0; i < panels.length; i++) {
      const orig = panels[i];
      const p3d = stateAtZero.panels.find((p) => p.sourcePanelId === orig.id);

      if (!p3d) {
        return {
          matches: false,
          maxDiscrepancyMm: Infinity,
          details: `Painel ${orig.id} não encontrado na representação 3D.`,
        };
      }

      // 1. Z deve ser rigorosamente 0 para todos os vértices em 0%
      for (const v of p3d.worldVertices) {
        const zErr = Math.abs(v.z);
        if (zErr > maxDiscrepancy) maxDiscrepancy = zErr;
        if (zErr > toleranceMm) {
          return {
            matches: false,
            maxDiscrepancyMm: zErr,
            details: `Vértice do painel ${orig.id} em 0% tem Z=${v.z}mm != 0.`,
          };
        }
      }

      // 2. Comparação exata dos vértices da outerBoundary (X, Y)
      const origVerts = orig.outerBoundary.vertices;
      if (origVerts.length !== p3d.worldVertices.length) {
        return {
          matches: false,
          maxDiscrepancyMm: Infinity,
          details: `Número de vértices do outerBoundary diverge no painel ${orig.id}.`,
        };
      }

      for (let j = 0; j < origVerts.length; j++) {
        const dx = Math.abs(p3d.worldVertices[j].x - origVerts[j].x);
        const dy = Math.abs(p3d.worldVertices[j].y - origVerts[j].y);
        const d = Math.hypot(dx, dy);
        if (d > maxDiscrepancy) maxDiscrepancy = d;
        if (d > toleranceMm) {
          return {
            matches: false,
            maxDiscrepancyMm: d,
            details: `Vértice ${j} do painel ${orig.id} diverge por ${d.toFixed(6)}mm em relação à faca 2D original.`,
          };
        }
      }

      // 3. Comparação analítica de arestas e entidades (source-linked / per-entity)
      if (orig.outerBoundary.edges.length !== p3d.outerBoundary.edges.length) {
        return {
          matches: false,
          maxDiscrepancyMm: Infinity,
          details: `Número de arestas do outerBoundary diverge no painel ${orig.id}: original=${orig.outerBoundary.edges.length}, 3D=${p3d.outerBoundary.edges.length}.`,
        };
      }

      for (let k = 0; k < orig.outerBoundary.edges.length; k++) {
        const oe = orig.outerBoundary.edges[k];
        const pe = p3d.outerBoundary.edges[k];

        if (oe.type !== pe.type) {
          return {
            matches: false,
            maxDiscrepancyMm: Infinity,
            details: `Tipo de aresta diverge no painel ${orig.id}, aresta ${k}: original=${oe.type}, 3D=${pe.type}.`,
          };
        }

        const dp0 = Math.hypot(pe.p0.x - oe.p0.x, pe.p0.y - oe.p0.y);
        const dp1 = Math.hypot(pe.p1.x - oe.p1.x, pe.p1.y - oe.p1.y);
        if (dp0 > maxDiscrepancy) maxDiscrepancy = dp0;
        if (dp1 > maxDiscrepancy) maxDiscrepancy = dp1;

        if (dp0 > toleranceMm || dp1 > toleranceMm) {
          return {
            matches: false,
            maxDiscrepancyMm: Math.max(dp0, dp1),
            details: `Extremidades da aresta ${k} (${oe.id}) no painel ${orig.id} divergem por dp0=${dp0.toFixed(6)}mm, dp1=${dp1.toFixed(6)}mm.`,
          };
        }

        // Validação analítica específica para Arc2D
        if (oe.type === 'arc') {
          const origArc = oe.entity as Arc2D;
          const pArc = pe.arcData;
          if (!pArc) {
            return {
              matches: false,
              maxDiscrepancyMm: Infinity,
              details: `Dados analíticos do arco ausentes no 3D para aresta ${k} do painel ${orig.id}.`,
            };
          }
          const dc = Math.hypot(pArc.cx - origArc.cx, pArc.cy - origArc.cy);
          const dr = Math.abs(pArc.r - origArc.r);
          if (dc > maxDiscrepancy) maxDiscrepancy = dc;
          if (dr > maxDiscrepancy) maxDiscrepancy = dr;

          if (dc > toleranceMm || dr > toleranceMm) {
            return {
              matches: false,
              maxDiscrepancyMm: Math.max(dc, dr),
              details: `Parâmetros do Arc2D (${oe.id}) divergem no painel ${orig.id}: centro err=${dc.toFixed(6)}mm, raio err=${dr.toFixed(6)}mm.`,
            };
          }
        }
      }

      // 4. Comparação rigorosa de furos (holes) per-entity
      if (orig.holes.length !== p3d.holes.length) {
        return {
          matches: false,
          maxDiscrepancyMm: Infinity,
          details: `Quantidade de furos (holes) diverge no painel ${orig.id}: original=${orig.holes.length}, 3D=${p3d.holes.length}.`,
        };
      }

      for (let hIdx = 0; hIdx < orig.holes.length; hIdx++) {
        const origH = orig.holes[hIdx];
        const p3dH = p3d.holes[hIdx];

        if (origH.vertices.length !== p3dH.vertices.length) {
          return {
            matches: false,
            maxDiscrepancyMm: Infinity,
            details: `Número de vértices do furo ${origH.id} diverge no painel ${orig.id}.`,
          };
        }

        for (let vIdx = 0; vIdx < origH.vertices.length; vIdx++) {
          const dx = Math.abs(p3dH.vertices[vIdx].x - origH.vertices[vIdx].x);
          const dy = Math.abs(p3dH.vertices[vIdx].y - origH.vertices[vIdx].y);
          const dz = Math.abs(p3dH.vertices[vIdx].z);
          const d = Math.hypot(dx, dy);
          if (d > maxDiscrepancy) maxDiscrepancy = d;
          if (dz > maxDiscrepancy) maxDiscrepancy = dz;

          if (d > toleranceMm || dz > toleranceMm) {
            return {
              matches: false,
              maxDiscrepancyMm: Math.max(d, dz),
              details: `Vértice ${vIdx} do furo ${origH.id} no painel ${orig.id} diverge por ${d.toFixed(6)}mm (Z=${dz.toFixed(6)}mm).`,
            };
          }
        }
      }
    }

    return {
      matches: maxDiscrepancy <= toleranceMm,
      maxDiscrepancyMm: maxDiscrepancy,
      details: `Projeção 3D@0% -> 2D idêntica à faca original (discrepância máx: ${maxDiscrepancy.toExponential(4)}mm <= ${toleranceMm}mm).`,
    };
  }
}
