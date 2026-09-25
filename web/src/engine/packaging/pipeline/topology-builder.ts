// ============================================================================
// Stage 2 — Topology Builder
// ----------------------------------------------------------------------------
// Wrapper fino sobre `cad/kernel` (que já produz Vertex/Edge/Loop/Face com
// orientação e detecção de holes). Esta etapa traduz o KernelResult para o
// shape `PipelineTopology` consumido pelas etapas seguintes.
//
// Não decide kind final, não agrupa eixos, não constrói painéis. Apenas
// devolve a topologia "geométrica" pronta para o classificador (Stage 3).
// ============================================================================

import { runCadKernel } from "../cad/kernel";
import type { NormalizedGeometry, PipelineEdge, PipelineTopology } from "./types";

export function buildTopology(geometry: NormalizedGeometry): PipelineTopology {
  const kernel = runCadKernel(geometry.segments, {
    snapMm: geometry.tolerances.weldMm,
    minSegmentMm: geometry.tolerances.minSegmentMm,
    gapBridgeMm: geometry.tolerances.gapBridgeMm,
    angleRad: geometry.tolerances.parallelTolRad,
  });

  const edges: PipelineEdge[] = kernel.edges.map((e) => ({
    id: e.id,
    a: e.a,
    b: e.b,
    kindRaw: e.kind,
    length: Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y),
    sourceSegIdx: e.sourceSegIdx,
  }));

  return {
    vertices: kernel.vertices,
    edges,
    loops: kernel.loops,
    faces: kernel.faces,
    holeOnlySegIdxs: kernel.holeOnlySegIdxs,
    boundarySegIdxs: kernel.boundarySegIdxs,
    issues: kernel.issues.map((i) => ({ kind: i.kind, message: i.message, points: i.points })),
  };
}
