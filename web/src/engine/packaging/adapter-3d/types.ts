// ============================================================================
// Structural2DTo3DAdapter — Contracts
// ----------------------------------------------------------------------------
// Camada explícita entre o pipeline 2D (imutável) e o sistema 3D
// (solver / animação por etapas / fechamento). Produz um único modelo
// estrutural que TODO o 3D consome.
// ============================================================================

import type {
  FoldPlan,
  PipelinePanel,
  StructuralFoldAxis,
} from "../pipeline/types";
import type { SanitizedHingeGraph, ValidHinge } from "../pipeline/hinge-sanitizer";

export type PanelRole3D =
  | "body"
  | "body-side"
  | "seam"
  | "glue-flap"
  | "top-flap"
  | "bottom-flap"
  | "dust-flap"
  | "lock-flap"
  | "tuck-flap"
  | "flap"
  | "aux";

export interface StructuralPanel3D {
  id: string;
  sourcePanelId: string;
  role: PanelRole3D;
  area: number;
  centroid: { x: number; y: number };
  /** Painel 2D original (referência — não mutado). */
  ref: PipelinePanel;
}

export type Hinge3DRole =
  | "body-body"
  | "body-flap"
  | "body-seam"
  | "flap-flap"
  | "aux";

export interface Hinge3D {
  id: string;
  sourceAxisId: string;
  panelA: string;
  panelB: string;
  length: number;
  role: Hinge3DRole;
  isStructural: boolean;
  isTreeEdge: boolean;
  isSupportEdge: boolean;
  isClosureEdge: boolean;
  /** Score determinístico usado na escolha do spanning tree (maior = melhor). */
  score: number;
  /** Hinge sanitizado original. */
  ref: ValidHinge;
}

export type ValidationCode =
  | "BODY_PANEL_WITHOUT_HINGE"
  | "GLUE_FLAP_DISCONNECTED"
  | "FLAP_WITHOUT_BODY_PARENT"
  | "MAIN_BODY_FRAGMENTED"
  | "HINGE_COUNT_BELOW_2D"
  | "CLOSURE_EDGES_MISSING"
  | "FRAGMENT_AS_STRUCTURAL"
  | "GRAPH_MUTILATED_BY_TREE";

export interface ValidationIssue {
  code: ValidationCode;
  message: string;
  panelIds?: string[];
  hingeIds?: string[];
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface RepairLog {
  reparentedFlaps: number;
  consolidatedHinges: number;
  rescuedClosureEdges: number;
  notes: string[];
}

export interface PackageStructuralModel3D {
  /** Painéis 2D originais (referência, NUNCA mutados). */
  sourcePanels2D: PipelinePanel[];
  structuralPanels3D: StructuralPanel3D[];
  panelRoles: Record<string, PanelRole3D>;
  hinges3D: Hinge3D[];

  foldGraph3D: {
    nodes: string[];
    hinges: string[];
    treeEdges: string[];
    supportEdges: string[];
    closureEdges: string[];
    connectedComponents: string[][];
    rootPanelId: string;
    mainBodyNodes: string[];
    flapNodes: string[];
    seamNodes: string[];
    closureNodes: string[];
    orphanPanels: string[];
  };

  foldTree: {
    rootPanelId: string;
    parentOf: Record<string, string>;
    children: Record<string, string[]>;
    topoOrder: string[];
  };

  /** Plano efetivo 3D, derivado do foldTree estrutural e consumido por rig + solver. */
  effectivePlan: FoldPlan;

  /**
   * Graph "refinado" no formato exato consumido pelo
   * UnifiedRigidFoldingSolver atual — drop-in replacement do
   * `pipeline.sanitized`, mas com spanning tree role-aware e
   * cycle constraints semanticamente marcadas como closure.
   */
  sanitizedRefined: SanitizedHingeGraph;

  diagnostics: ValidationReport;
  repairs: RepairLog;
}

export interface AdapterInputs {
  panels: PipelinePanel[];
  foldAxes: StructuralFoldAxis[];
  plan: FoldPlan;
  sanitized: SanitizedHingeGraph;
}
