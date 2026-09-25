import type { Dieline } from "../dieline-types";
import { runPipeline } from "./run-pipeline";

export interface PackagingRegressionCaseReport {
  id: string;
  name: string;
  originalSegments: number;
  segmentsByKind: Record<string, number>;
  structuralPanels: number;
  absorbedFeatures: number;
  structuralFoldAxis: number;
  localFoldAxis: number;
  topologyIssues: number;
  foldGraphConnected: boolean;
  foldingPlanGenerated: boolean;
  promotedLocalFeatures: number;
}

export function runPackagingRegressionCase(dieline: Dieline, id = dieline.meta.fefco): PackagingRegressionCaseReport {
  const result = runPipeline(dieline.segments);
  const segmentsByKind = dieline.segments.reduce<Record<string, number>>((acc, segment) => {
    acc[segment.kind] = (acc[segment.kind] ?? 0) + 1;
    return acc;
  }, {});
  const graphNodes = Object.keys(result.graph.nodes);
  const connectedNodes = new Set<string>();
  if (result.graph.rootPanelId) {
    const stack = [result.graph.rootPanelId];
    while (stack.length) {
      const nodeId = stack.pop()!;
      if (connectedNodes.has(nodeId)) continue;
      connectedNodes.add(nodeId);
      for (const child of result.graph.nodes[nodeId]?.childrenIds ?? []) stack.push(child);
    }
  }
  const absorbedRegions = new Set(result.absorbedFeatures.flatMap((feature) => feature.sourceRegionIds));
  const promotedLocalFeatures = result.structuralPanels.filter((panel) => panel.sourceRegionIds.some((id) => absorbedRegions.has(id))).length;
  return {
    id,
    name: dieline.meta.name,
    originalSegments: dieline.segments.length,
    segmentsByKind,
    structuralPanels: result.structuralPanels.length,
    absorbedFeatures: result.absorbedFeatures.length,
    structuralFoldAxis: result.foldAxes.filter((axis) => axis.role === "structural_fold_axis").length,
    localFoldAxis: result.foldAxes.filter((axis) => axis.role === "local_crease").length,
    topologyIssues: result.topology.issues.length,
    foldGraphConnected: graphNodes.length === 0 || connectedNodes.size === graphNodes.length,
    foldingPlanGenerated: result.model3D.effectivePlan.steps.length > 0 || result.structuralPanels.length <= 1,
    promotedLocalFeatures,
  };
}
