// ============================================================================
// PartScene compatibility shim
// ----------------------------------------------------------------------------
// O renderer legado foi desativado como fonte estrutural. Este módulo mantém os
// imports antigos apontando para a pipeline V3, sem árvore estrutural paralela.
// ============================================================================

export {
  buildPartScenePipeline as buildPartScene,
  applyFoldToPipelineScene as applyFoldToPart,
  recenterPipelineScene as recenterPart,
  type PipelinePartScene as PartScene,
  type PipelinePivotEntry as PivotEntry,
} from "./part-scene-pipeline";