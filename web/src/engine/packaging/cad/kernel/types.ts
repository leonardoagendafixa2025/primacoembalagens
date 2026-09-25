// Industrial CAD Topology Kernel — tipos canônicos.
//
// Equivalente conceitual ao modelo BREP simplificado usado por
// ArtiosCAD/Impact/Heidelberg Package Designer para dielines planas.
//
// Hierarquia:
//   Vertex (ponto 2D welded)
//     └── Edge  (segmento entre 2 vértices, com kind cut/crease/perf)
//          └── Loop  (cadeia fechada de edges, com winding CCW/CW)
//               └── Face (loop externo + loops internos como holes)
//
// Regra dura:
//   Todo Loop fechado formado APENAS por edges `cut` que esteja contido
//   estritamente em outro Loop é marcado como `isHole=true`. NUNCA gera
//   parede lateral, NUNCA gera dobra. Vira buraco da Face hospedeira.

import type { Pt, SegmentKind } from "../../dieline-types";

export type EdgeKind = Extract<SegmentKind, "cut" | "crease" | "perf">;

export interface Vertex {
  id: number;
  x: number;
  y: number;
}

export interface Edge {
  id: number;
  a: Vertex;
  b: Vertex;
  kind: EdgeKind;
  /** Índice do segment original (para rastreabilidade no debug). */
  sourceSegIdx: number;
}

export interface Loop {
  id: number;
  /** Pontos do loop em ordem (último não repete o primeiro). */
  points: Pt[];
  /** Verdadeiro quando a caminhada retornou ao semi-edge inicial. */
  closed: boolean;
  /** Edges que compõem o loop (mesma ordem dos pontos). */
  edgeIds: number[];
  /** Soma sinalizada (shoelace/2). Positivo = CCW. */
  signedArea: number;
  /** Bounding box em mm. */
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  /** Distribuição dos kinds das edges do loop. */
  edgeKindCounts: { cut: number; crease: number; perf: number };
  /** True se TODAS as edges são `cut`. Pré-requisito para virar hole. */
  cutOnly: boolean;
  /** Profundidade na hierarquia de nesting (0 = top-level). */
  depth: number;
  /** ID do loop pai (continente) ou null se top-level. */
  parentId: number | null;
  /** True se classificado como hole pela regra de nesting. */
  isHole: boolean;
}

export interface Face {
  id: number;
  /** Loop externo (contorno da face). */
  outer: Loop;
  /** Holes internos (loops fechados de cut contidos). */
  holes: Loop[];
}

export interface KernelLoopAuditEntry {
  loopId: number;
  area: number;
  signedArea: number;
  orientation: "CCW" | "CW";
  isHole: boolean;
  parentId: number | null;
  vertices: Array<[number, number]>;
  closed: boolean;
  sourceSegments: number[];
  cutOnly: boolean;
  depth: number;
  stage: string;
  classificationReason: string;
  faceId: number | null;
}

export interface KernelDebugAudit {
  allLoops: KernelLoopAuditEntry[];
  unassignedLoops: KernelLoopAuditEntry[];
  suspectedHoleLoopId: number | null;
  suspectedHoleReason: string | null;
}

export interface ValidationIssue {
  kind:
    | "open-loop"
    | "self-intersection"
    | "invalid-winding"
    | "non-manifold"
    | "micro-gap"
    | "t-junction";
  message: string;
  /** Pontos relacionados (para destacar no canvas 2D). */
  points?: Pt[];
}

export interface KernelResult {
  vertices: Vertex[];
  edges: Edge[];
  loops: Loop[];
  faces: Face[];
  /** Loops que são holes (atalho). */
  holeLoops: Loop[];
  /** Conjunto de sourceSegIdx que pertencem EXCLUSIVAMENTE a holes. */
  holeOnlySegIdxs: Set<number>;
  /** Segmentos do contorno exterior (loop CW de maior área descartado por
   * orientação). Borda livre: não pertencem a nenhuma face interna, não
   * dobram. Registrar previne referências pendentes no BFS de faces. */
  boundarySegIdxs: Set<number>;
  issues: ValidationIssue[];
  debug: KernelDebugAudit;
}
