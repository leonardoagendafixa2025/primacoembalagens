// PIPELINE É O CAMINHO ÚNICO.
// A flag `pkg3d.usePipeline` foi descontinuada como parte da reconstrução em
// 3 camadas. O motor anterior permanece apenas como referência histórica;
// o viewer-3d sempre usa a
// pipeline (Stages 1→8). Este hook é mantido por compat (sempre retorna true).
export function usePipelineFlag(): boolean {
  return true;
}

