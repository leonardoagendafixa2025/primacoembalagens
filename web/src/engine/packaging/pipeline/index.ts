// ============================================================================
// Pipeline de Cartonagem — Entry-point
// ----------------------------------------------------------------------------
// Reexporta tudo da nova pipeline. Conforme novas etapas forem implementadas,
// adicionar aqui (`structural-classifier`, `fold-axis-reconstructor`, etc).
// ============================================================================

export * from "./types";
export { buildDielineSource } from "./dieline-source";
export { normalizeGeometry } from "./geometry-normalizer";
export type { NormalizerOptions } from "./geometry-normalizer";
export { buildTopology } from "./topology-builder";
export { classifyTopology } from "./structural-classifier";
export { reconstructFoldAxes } from "./fold-axis-reconstructor";
export { buildPanels } from "./panel-builder";
export type { PanelBuildResult } from "./panel-builder";
export { buildStructuralDecomposition, classifyRegionCandidate } from "./structural-decomposition";
export { packagingV3RegressionFixtures } from "./regression-fixtures";
export { runPackagingRegressionCase } from "./regression-report";
export type { PackagingRegressionCaseReport } from "./regression-report";
export { buildFoldGraph } from "./fold-graph-builder";
export { planFolding } from "./fold-planner";
export { runPipeline } from "./run-pipeline";
export type { RunPipelineOptions } from "./run-pipeline";
export { buildFoldPlayer, progressForStep } from "./fold-player";
export type { FoldPlayer, PlayerPivot } from "./fold-player";
export { annotatePipelineIds } from "./annotate-ids";
export { buildFoldPlanV2 } from "./fold-plan-builder";
export { buildFoldPlanExecutor } from "./fold-plan-executor";
export type {
  FoldPlanExecutor,
  FoldPlanExecutorStatus,
} from "./fold-plan-executor";

export {
  sanitizeHinges,
  DEFAULT_MIN_HINGE_LENGTH_MM,
  DEFAULT_TOPOLOGY_SNAP_TOLERANCE_MM,
} from "./hinge-sanitizer";
export type {
  SanitizedHingeGraph,
  ValidHinge,
  RejectedHinge,
  OrphanPanel,
  SanitizationReport,
  HingeSanitizerOptions,
} from "./hinge-sanitizer";
export { buildStructural2DTo3DModel } from "../adapter-3d";
export type {
  PackageStructuralModel3D,
  StructuralPanel3D,
  Hinge3D,
  PanelRole3D,
  Hinge3DRole,
  ValidationReport as Structural3DValidationReport,
  ValidationIssue as Structural3DValidationIssue,
  RepairLog as Structural3DRepairLog,
} from "../adapter-3d";

export { validatePipeline } from "./pipeline-validator";
export type { ValidationReport, ValidationIssue, ValidationSeverity } from "./pipeline-validator";
