// ============================================================================
// Pipeline de Cartonagem — Contratos
// ----------------------------------------------------------------------------
// Cada etapa da pipeline consome o tipo da etapa anterior e produz o tipo da
// próxima. Isso impede o vazamento dos Segment[] originais para camadas mais
// altas (e o reaparecimento dos bugs históricos de "edge UNKNOWN").
//
// Ordem canônica:
//
//   Dieline.segments[]
//      │  Stage 1: GeometryNormalizer
//      ▼
//   NormalizedGeometry
//      │  Stage 2: TopologyBuilder (delega para cad/kernel)
//      ▼
//   PipelineTopology
//      │  Stage 3: StructuralClassifier
//      ▼
//   ClassifiedTopology
//      │  Stage 4: FoldAxisReconstructor
//      ▼
//   StructuralFoldAxis[]
//      │  Stage 5: PanelBuilder
//      ▼
//   PipelinePanel[]
//      │  Stage 6: FoldGraphBuilder
//      ▼
//   FoldGraph
//      │  Stage 7: FoldPlanner
//      ▼
//   FoldPlan
//      │  Stage 8: FoldPlayer (Three.js)
//      ▼
//   Animação
// ============================================================================

import type { Pt, Segment, SegmentKind } from "../dieline-types";
import type { EdgeKind, Face, Loop, Vertex } from "../cad/kernel/types";

// ---------------------------------------------------------------------------
// Stage 0 — DielineSource imutável
// ---------------------------------------------------------------------------

export type SourceSegmentKind = SegmentKind | "unknown" | "score";

export interface SourceSegmentFlags {
  healed: boolean;
  snapped: boolean;
  merged: boolean;
  reclassified: boolean;
  dropped: boolean;
}

export interface SourceSegmentUsage {
  structuralRole?: StructuralRole;
  structuralPanelIds: ReadonlyArray<string>;
  absorbedFeatureIds: ReadonlyArray<string>;
  foldAxisIds: ReadonlyArray<string>;
}

export interface SourceSegment {
  id: string;
  kindOriginal: SourceSegmentKind;
  kindNormalized: StructuralKind;
  source?: Segment["source"];
  endpointsOriginal: { a: Pt; b: Pt };
  endpointsSnapped: { a: Pt; b: Pt };
  pointsOriginal: ReadonlyArray<Pt>;
  pointsNormalized: ReadonlyArray<Pt>;
  parentLoopIds: ReadonlyArray<string>;
  flags: SourceSegmentFlags;
  usage: SourceSegmentUsage;
}

export interface SourceLoop {
  id: string;
  sourceSegmentIds?: string[];
  kind: "outer" | "hole" | "open" | "unknown";
  area?: number;
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface SourceIntersection {
  id: string;
  point: Pt;
  sourceSegmentIds: string[];
  kind: "endpoint" | "t-junction" | "crossing" | "snap";
}

export interface DielineSource {
  version: "v3";
  segments: ReadonlyArray<SourceSegment>;
  loops: ReadonlyArray<SourceLoop>;
  intersections: ReadonlyArray<SourceIntersection>;
  metadata: {
    segmentCount: number;
    byOriginalKind: Record<string, number>;
    frozenAt: number;
  };
}

// ---------------------------------------------------------------------------
// Stage 1 — NormalizedGeometry
// ---------------------------------------------------------------------------
// Saída do GeometryNormalizer. Os segmentos aqui estão SEM duplicidades,
// SEM micro-fragmentos, SEM gaps menores que o limite e com vértices welded
// (qualquer endpoint dentro de `weldToleranceMm` é o MESMO ponto).

export interface NormalizedGeometry {
  /** Lista canônica de segmentos (cut/crease/perf apenas — bleed/safe drop). */
  segments: Segment[];
  /** Tolerâncias usadas — propagadas para etapas posteriores. */
  tolerances: {
    weldMm: number;
    minSegmentMm: number;
    gapBridgeMm: number;
    parallelTolRad: number;
    perpendicularTolMm: number;
  };
  /** Contadores para debug/UI. */
  stats: {
    inputSegments: number;
    outputSegments: number;
    snappedPoints: number;
    mergedColinear: number;
    droppedMicro: number;
    bridgedGaps: number;
    splitIntersections: number;
    healedOvershoots: number;
    unresolvedTopologyWarnings: number;
  };
  logs: Array<{
    stage: "snap" | "bridge-gap" | "t-junction" | "merge-colinear" | "drop-micro" | "dedupe" | "warning";
    message: string;
    count: number;
  }>;
}

// ---------------------------------------------------------------------------
// Stage 2 — PipelineTopology
// ---------------------------------------------------------------------------
// Saída do TopologyBuilder. Wrapper fino sobre o cad/kernel já existente:
// devolve as entidades canônicas (Vertex/Edge/Loop/Face) já validadas.
// As Edges ainda carregam o `kind` ORIGINAL — o classificador estrutural
// (Stage 3) decide o kind final levando em conta sobreposições.

export interface PipelineEdge {
  id: number;
  /** Endpoints (vértices welded do kernel). */
  a: Vertex;
  b: Vertex;
  /** Kind herdado do segmento original. */
  kindRaw: EdgeKind;
  /** Tamanho em mm. */
  length: number;
  /** Índice do Segment original no array `NormalizedGeometry.segments`. */
  sourceSegIdx: number;
}

export interface PipelineTopology {
  vertices: Vertex[];
  edges: PipelineEdge[];
  loops: Loop[];
  faces: Face[];
  /** sourceSegIdx pertencentes EXCLUSIVAMENTE a holes (vazados). */
  holeOnlySegIdxs: Set<number>;
  /** sourceSegIdx do contorno externo livre (silhueta da faca). */
  boundarySegIdxs: Set<number>;
  /** Issues do kernel (loops abertos, micro-gaps, etc). */
  issues: Array<{ kind: string; message: string; points?: Pt[] }>;
}

// ---------------------------------------------------------------------------
// Stage 3 — ClassifiedTopology
// ---------------------------------------------------------------------------
// Cada Edge ganha um `kindFinal` definitivo. Regra dura: se existe qualquer
// fragmento `crease`/`perf` colinear e sobreposto com a edge, ela É vinco/perf,
// independentemente de também existir `cut` sobre o mesmo eixo.

export type StructuralKind = "cut" | "crease" | "perf" | "score" | "unknown" | "boundary" | "hole";

export type StructuralRole =
  | "panel_boundary_candidate"
  | "fold_axis_candidate"
  | "feature_boundary"
  | "internal_cutout"
  | "decorative"
  | "unknown";

export interface ClassifiedEdge extends PipelineEdge {
  kindFinal: StructuralKind;
  /** KIND é o que a linha é; ROLE é para que ela serve estruturalmente. */
  roleFinal: StructuralRole;
  roleReasons: string[];
  /** Kinds vistos no mesmo eixo (debug). */
  kindCandidates: EdgeKind[];
}

export interface ClassifiedTopology extends Omit<PipelineTopology, "edges"> {
  edges: ClassifiedEdge[];
}

// ---------------------------------------------------------------------------
// Stage 4 — StructuralFoldAxis
// ---------------------------------------------------------------------------
// Agrupa todas as Edges colineares de mesmo kind (crease/perf) em UM eixo
// estrutural. Cortes transversais NÃO destroem o eixo — eles só fragmentam
// a geometria, mas o eixo continua existindo e ligando os painéis das duas
// faces opostas.

export interface StructuralFoldAxis {
  id: string;
  sourceSegmentIds?: string[];
  /** Reta infinita normalizada (a→b com |b-a|=1). */
  axisLine: { origin: Pt; direction: Pt };
  /** Pontos extremos do eixo (envolve todos os fragmentos). */
  span: { a: Pt; b: Pt };
  /** Edges que compõem o eixo (mesmo se separadas por cortes). */
  fragments: ClassifiedEdge[];
  type: "crease" | "perf";
  axisKind?: "crease" | "perf" | "score";
  /**
   * Papel estrutural do eixo, atribuído pelo Stage 4 (StructuralDecomposition).
   * Antes da decomposição todo eixo nasce `unknown`; só após a decisão
   * StructuralPanel vs AbsorbedFeature o eixo é classificado:
   *  - `structural_fold_axis` — liga 2 painéis estruturais reais OU atravessa
   *    o interior de um painel estrutural (causa split estrutural na próxima etapa).
   *  - `local_crease` — toca apenas 1 painel estrutural; vinco local sem hinge global.
   *  - `local_lock_crease` — toca 1 painel estrutural + 1+ feature absorvida (trava local).
   *  - `absorbed_feature_axis` — pertence apenas a features absorvidas (slot/tongue/notch).
   *  - `unknown` — não classificado.
   */
  role?: "structural_fold_axis" | "local_crease" | "local_lock_crease" | "absorbed_feature_axis" | "unknown";
  /** Comprimento total coberto pelo span. */
  length: number;
  confidence?: number;
  /** Painéis estruturais REAIS conectados — preenchido pela decomposição. */
  connectedStructuralPanelIds?: string[];
  /** Features absorvidas conectadas — preenchido pela decomposição. */
  connectedFeatureIds?: string[];
  /** Elegível para dividir painéis estruturais (split posterior). */
  structuralEligibility?: boolean;
  /** Confiança [0..1] de que este eixo é estrutural global. */
  structuralConfidence?: number;
  panelAId?: string;
  panelBId?: string;

  /** Faces conectadas (preenchido em Stage 5). */
  connectedFaceIds: number[];
  /** Candidatos/painéis que tocam esse eixo estrutural (Camada 2, sem olhar face bruta). */
  connectedPanelCandidateIds?: string[];
}

// ---------------------------------------------------------------------------
// Stage 5 — PipelinePanel
// ---------------------------------------------------------------------------
// Painel = Face do kernel + holes. ID estável (hash do polígono normalizado).

export interface PipelinePanel {
  id: string;
  label: string;
  /** Face do kernel que originou o painel. */
  faceId: number;
  polygon: Pt[];
  holes: Pt[][];
  /** Eixos estruturais que tocam o boundary deste painel. */
  foldAxisIds: string[];
  /** Bounding box (mm). */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** Área (mm²). */
  area: number;
}

export interface PanelCandidate {
  id: string;
  label: string;
  polygon: Pt[];
  holes: Pt[][];
  area: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number; x: number; y: number; w: number; h: number };
  boundaryEdgeIds: string[];
  boundaryRoles: StructuralRole[];
  touchingFoldAxisIds: string[];
  sourceSegmentIds: string[];
  sourceFaceIds: string[];
  adjacentRegionIds: string[];
  structuralScore: number;
  featureScore: number;
  classification?: "structural-panel" | "absorbed-feature";
  classificationReason?: string;
  /** Compatibilidade enquanto os renderers ainda aceitam PipelinePanel. */
  faceId: number;
}

export type RegionCandidate = PanelCandidate;

export type AbsorbedFeatureType =
  | "tongue_lock"
  | "slot"
  | "notch"
  | "internal_cut_feature"
  | "local_lock_feature"
  | "decorative_fragment";

export interface AbsorbedFeature {
  id: string;
  type: AbsorbedFeatureType;
  featureType: AbsorbedFeatureType;
  polygon: Pt[];
  holes: Pt[][];
  area: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number; x: number; y: number; w: number; h: number };
  hostPanelId: string;
  ownerPanelId: string;
  sourceRegionIds: string[];
  sourceCandidateIds: string[];
  sourceSegmentIds: string[];
  localCreaseIds: string[];
  localCutIds: string[];
  classificationReason: string;
  score: { structural: number; feature: number };
}

export interface StructuralPanel extends PipelinePanel {
  role?: string;
  parentId?: string;
  parentPanelId?: string;
  childPanelIds: string[];
  hingeAxisIds: string[];
  sourceRegionIds: string[];
  absorbedFeatureIds: string[];
  sourceCandidateIds: string[];
  sourceSegmentIds: string[];
  classificationReason: string;
  score: { structural: number; feature: number };
}

/** Feature geométrico que deve aparecer colado ao painel hospedeiro, mas NÃO
 * participa do FoldGraph nem do FoldPlan (travas, slots, entalhes, fragmentos). */
export interface PipelineStaticFeature {
  id: string;
  label: string;
  parentPanelId: string;
  polygon: Pt[];
  holes: Pt[][];
}

// ---------------------------------------------------------------------------
// Stage 6 — FoldGraph
// ---------------------------------------------------------------------------

export interface FoldGraphEdge {
  id?: string;
  axisId: string;
  /** IDs dos dois painéis ligados pelo eixo. */
  panelA: string;
  panelB: string;
  parentPanelId?: string;
  childPanelId?: string;
  hingeAxisId?: string;
  defaultAngle?: number;
}

export interface FoldGraphNode {
  panelId: string;
  parentId: string | null;
  /** Eixo que liga este painel ao parent. */
  hingeAxisId: string | null;
  /** Profundidade na árvore (root = 0). */
  depth: number;
  /** IDs dos painéis filhos. */
  childrenIds: string[];
}

export interface FoldGraph {
  rootPanelId: string;
  nodes: Record<string, FoldGraphNode>;
  edges: FoldGraphEdge[];
}

// ---------------------------------------------------------------------------
// Stage 7 — FoldPlan
// ---------------------------------------------------------------------------

export interface FoldStep {
  id?: string;
  /** Ordem de execução (0 = primeira dobra). */
  step: number;
  order?: number;
  panelId: string;
  parentId: string;
  hingeId: string;
  axisId?: string;
  /** Ângulo final em radianos (positivo = dobra para dentro do parent). */
  targetAngle: number;
  /** Sinal aplicado (1 ou -1) — qual lado do eixo dobra. */
  sign: 1 | -1;
  direction?: "mountain" | "valley";
  dependencies?: string[];
}

export interface FoldPlan {
  rootPanelId: string;
  steps: FoldStep[];
  /** Mapa rápido panelId → FoldStep (root não está aqui). */
  byPanel: Record<string, FoldStep>;
}

export type FoldingStep = FoldStep;
export type FoldingPlan = FoldPlan;

// ---------------------------------------------------------------------------
// Stage 7B — FoldPlanV2 (executor sequencial + hierarquia nativa Three.js)
// ---------------------------------------------------------------------------
// Substitui o "global constraint solver" abstrato por um plano de operações
// tipadas executadas em sequência. Cada step roda em paralelo internamente;
// os steps rodam em ordem. A árvore pai-filho é a própria hierarquia da cena
// Three.js (Object3D.parent), mutável passo a passo via Object3D.attach().

export interface FoldingOp {
  type: "folding";
  faceId: string;
  parentId: string;
  hingeAxisId: string;
  rotateAxis: "x" | "y" | "z";
  /** Ângulo inicial (graus). */
  from: number;
  /** Ângulo final (graus, sinal incluído). */
  to: number;
  /** Origem da rotação no espaço local do painel (linha de dobra). */
  x1: number;
  y1: number;
  foldInside?: boolean;
  foldingDepth?: number;
}

export interface FaceSetParentOp {
  type: "face_set_parent";
  faceId: string;
  parentId: string;
}

export interface MovementOp {
  type: "movement";
  faceId: string;
  axis: "x" | "y" | "z";
  from: number;
  to: number;
}

export interface HidingOp {
  type: "hiding";
  faceId: string;
  visible: boolean;
}

export interface FollowerAlignOp {
  type: "follower_align";
  faceId: string;
  followerAnchorFaceId: string;
  mainAnchorFaceId: string;
}

export type FoldOperation =
  | FoldingOp
  | FaceSetParentOp
  | MovementOp
  | HidingOp
  | FollowerAlignOp;

export interface FoldStepV2 {
  index: number;
  depth: number;
  /** Operações que rodam em paralelo dentro do step. */
  operations: FoldOperation[];
}

export interface FoldPlanV2 {
  rootPanelId: string;
  /** Steps em sequência (cada um aguarda o anterior terminar). */
  steps: FoldStepV2[];
}


// ---------------------------------------------------------------------------
// Pipeline agregado
// ---------------------------------------------------------------------------

export interface PipelineFoldHinge {
  edgeId: string;
  type: "hinge";
  connectedPanels: [string, string];
  axis3d: [number, number, number];
  position3d: [number, number, number];
  restAngle: number;
  maxAngle: number;
  foldType: "mountain" | "valley";
}

export interface PipelineResult {
  dielineSource: DielineSource;
  geometry: NormalizedGeometry;
  topology: ClassifiedTopology;
  foldAxes: StructuralFoldAxis[];
  /** Stage 5A — faces/loops candidatos, antes do filtro estrutural. */
  panelCandidates: PanelCandidate[];
  /** Stage 5B — painéis estruturais reais. Igual a `panels`, com contrato explícito. */
  structuralPanels: StructuralPanel[];
  /** Stage 5C — travas/slots/notches/recortes absorvidos, nunca entram no FoldGraph. */
  absorbedFeatures: AbsorbedFeature[];
  panels: PipelinePanel[];
  staticFeatures: PipelineStaticFeature[];
  graph: FoldGraph;
  plan: FoldPlan;
  /** Plano V2 — operações tipadas, executadas em sequência (executor + Three.js nativo). */
  foldPlanV2: FoldPlanV2;

  /** Hinges 3D ativos (1 por step do plan). Sempre não-vazio se houver creases. */
  hinges: PipelineFoldHinge[];
  /** Estado agregado da camada de constraints. */
  constraintState: {
    active: boolean;
    hingeCount: number;
    rescued: boolean;
  };
  /** Estágio 0 da camada 3D: hinges validados, órfãos, relatório auditável. */
  sanitized: import("./hinge-sanitizer").SanitizedHingeGraph;
  /** Estágio 1 da camada 3D: Structural2DTo3DAdapter — modelo semântico 3D. */
  model3D: import("../adapter-3d/types").PackageStructuralModel3D;
  /** Camada de invariantes: relatório com issues + auto-reparos aplicados. */
  validation: import("./pipeline-validator").ValidationReport;
}

