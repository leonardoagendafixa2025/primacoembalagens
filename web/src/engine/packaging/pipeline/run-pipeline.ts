// ============================================================================
// Pipeline orchestrator — runPipeline()
// ----------------------------------------------------------------------------
// Executa Stages 1→7 em ordem e devolve `PipelineResult` agregado.
// Stage 8 (player Three.js) consome `result.plan` + `result.panels` para
// montar a cena animada — fica em outro módulo.
// ============================================================================

import type { Segment } from "../dieline-types";
import { normalizeGeometry } from "./geometry-normalizer";
import { buildTopology } from "./topology-builder";
import { classifyTopology } from "./structural-classifier";
import { reconstructFoldAxes } from "./fold-axis-reconstructor";
import { buildPanels } from "./panel-builder";
import { buildFoldGraph } from "./fold-graph-builder";
import { planFolding } from "./fold-planner";
import type { NormalizerOptions } from "./geometry-normalizer";
import type { PipelineResult } from "./types";
import { buildDielineSource } from "./dieline-source";
import type { FoldHinge } from "./fold-constraint-engine";
import { sanitizeHinges } from "./hinge-sanitizer";
import { buildStructural2DTo3DModel } from "../adapter-3d";
import { validatePipeline } from "./pipeline-validator";
import { buildFoldPlanV2 } from "./fold-plan-builder";
import type { FoldGraph, FoldGraphEdge, FoldGraphNode, FoldPlan, PipelinePanel, StructuralFoldAxis } from "./types";
import type { PackageStructuralModel3D } from "../adapter-3d/types";


/**
 * AUTORIDADE ÚNICA da árvore pai-filho.
 *
 * O `model3D.foldTree` (produzido pelo Structural2DTo3DAdapter via CAD
 * spanning-tree + role-aware) é a ÚNICA fonte de verdade da topologia de
 * dobras. Este helper deriva DETERMINISTICAMENTE `FoldGraph` e cruza-o com
 * `effectivePlan` para garantir que ambas as estruturas concordem painel a
 * painel. Se divergir, lança erro fail-fast.
 */
function deriveCanonicalGraphAndPlan(
  panels: PipelinePanel[],
  model3D: PackageStructuralModel3D,
): { graph: FoldGraph; plan: FoldPlan } {
  const tree = model3D.foldTree;
  const plan = model3D.effectivePlan;

  // ---- Nodes a partir do foldTree ----
  const nodes: Record<string, FoldGraphNode> = {};
  for (const p of panels) {
    nodes[p.id] = {
      panelId: p.id,
      parentId: null,
      hingeAxisId: null,
      depth: 0,
      childrenIds: [],
    };
  }

  // Calcula profundidade BFS a partir do root, seguindo parentOf.
  const depthOf = new Map<string, number>();
  depthOf.set(tree.rootPanelId, 0);
  const order = [...tree.topoOrder];
  for (const id of order) {
    if (id === tree.rootPanelId) continue;
    const parent = tree.parentOf[id];
    if (parent == null) continue;
    const pd = depthOf.get(parent) ?? 0;
    depthOf.set(id, pd + 1);
  }

  // ---- Edges: 1 por painel não-root, derivada do treeHingeByChild ----
  const treeHingeByChild = model3D.sanitizedRefined.treeHingeByChild;
  const edges: FoldGraphEdge[] = [];
  for (const childId of Object.keys(tree.parentOf)) {
    const parentId = tree.parentOf[childId];
    const hinge = treeHingeByChild[childId];
    if (!parentId || !hinge || !nodes[childId] || !nodes[parentId]) continue;
    nodes[childId].parentId = parentId;
    nodes[childId].hingeAxisId = hinge.axisId;
    nodes[childId].depth = depthOf.get(childId) ?? 1;
    nodes[parentId].childrenIds.push(childId);
    edges.push({
      id: `edge-${hinge.axisId}-${parentId}-${childId}`,
      axisId: hinge.axisId,
      hingeAxisId: hinge.axisId,
      panelA: parentId,
      panelB: childId,
      parentPanelId: parentId,
      childPanelId: childId,
      defaultAngle: Math.PI / 2,
    });
  }

  // ---- Cross-validation: graph parent ≡ plan parent para cada painel não-root ----
  const planParentOf = new Map<string, string>();
  for (const step of plan.steps) planParentOf.set(step.panelId, step.parentId);
  const graphParentOf = new Map<string, string>();
  for (const edge of edges) {
    if (edge.childPanelId && edge.parentPanelId) graphParentOf.set(edge.childPanelId, edge.parentPanelId);
  }
  for (const [childId, planParent] of planParentOf) {
    const graphParent = graphParentOf.get(childId);
    if (!graphParent) {
      throw new Error(
        `[run-pipeline] Divergência canônica: painel ${childId} aparece no foldingPlan ` +
        `(parent=${planParent}) mas não em foldGraph.edges.`,
      );
    }
    if (graphParent !== planParent) {
      throw new Error(
        `[run-pipeline] Divergência canônica: painel ${childId} tem pai diferente em ` +
        `foldGraph.edges (${graphParent}) e foldingPlan (${planParent}). ` +
        `Ambos devem derivar da mesma autoridade (model3D.foldTree).`,
      );
    }
  }
  for (const [childId] of graphParentOf) {
    if (!planParentOf.has(childId)) {
      throw new Error(
        `[run-pipeline] Divergência canônica: painel ${childId} aparece em foldGraph.edges ` +
        `mas não no foldingPlan.`,
      );
    }
  }

  return {
    graph: { rootPanelId: tree.rootPanelId, nodes, edges },
    plan,
  };
}

export interface RunPipelineOptions extends NormalizerOptions {
  /** ID estável de painel forçado como root (sobrescreve heurística de área). */
  rootPanelId?: string;
}

export function runPipeline(
  rawSegments: Segment[],
  opts: RunPipelineOptions = {},
): PipelineResult {
  // Stage 0: fonte imutável da faca original. Usada para auditoria/debug; as
  // etapas seguintes operam em cópias normalizadas e nunca sobrescrevem KIND.
  const dielineSource = buildDielineSource(rawSegments);

  // Stage 1: normalização.
  const geometry = normalizeGeometry(rawSegments, opts);

  // Stage 2: topologia.
  const topology0 = buildTopology(geometry);

  // Stage 3: classificação estrutural.
  const topology = classifyTopology(topology0, geometry);

  // Stage 4: eixos estruturais.
  const foldAxes = reconstructFoldAxes(topology, geometry);

  // Stage 5: painéis + conexões eixo↔face.
  const built = buildPanels(topology, foldAxes, geometry);
  const axes = built.axes;

  // Stage 5A/B/C: candidates → structural panels + absorbed features.
  // A partir daqui, o FoldGraph NUNCA lê face bruta nem candidate cru.
  const panels = built.structuralPanels;
  const staticFeatures = built.absorbedFeatures
    .filter((feature) => feature.type !== "internal_cut_feature")
    .map((feature) => ({
      id: feature.id,
      label: feature.type,
      parentPanelId: feature.ownerPanelId,
      polygon: feature.polygon,
      holes: feature.holes,
    }));

  // Stage 6: fold graph PROVISÓRIO (somente para alimentar sanitizer/adapter).
  // O grafo definitivo é DERIVADO da árvore canônica do model3D (ver abaixo).
  const provisionalGraph = buildFoldGraph(panels, axes, opts.rootPanelId);
  const provisionalPlan = planFolding(provisionalGraph, panels, axes);

  // ESTÁGIO 0 da camada 3D — Hinge Sanitization Layer.
  const sanitized = sanitizeHinges(panels, axes, provisionalGraph, provisionalPlan, {
    rootPanelId: opts.rootPanelId,
  });

  // ESTÁGIO 1 da camada 3D — Structural2DTo3DAdapter.
  // É a AUTORIDADE ÚNICA da árvore pai-filho (CAD spanning tree role-aware).
  // Após este ponto, foldGraph e foldingPlan são DERIVADOS de model3D.foldTree
  // — nunca recalculados por lógica independente.
  const model3D = buildStructural2DTo3DModel({
    panels,
    foldAxes: axes,
    plan: provisionalPlan,
    sanitized,
  });

  // Deriva graph + plan canônicos da mesma autoridade (fail-fast se divergirem).
  const { graph, plan } = deriveCanonicalGraphAndPlan(panels, model3D);

  const axisById = new Map(axes.map((axis) => [axis.id, axis]));
  const hinges: FoldHinge[] = plan.steps.flatMap((step) => {
    const axis = axisById.get(step.hingeId);
    if (!axis) return [];
    const dx = axis.span.b.x - axis.span.a.x;
    const dy = axis.span.b.y - axis.span.a.y;
    const len = Math.hypot(dx, dy) || 1;
    return [{
      edgeId: axis.id,
      type: "hinge" as const,
      connectedPanels: [step.parentId, step.panelId] as [string, string],
      axis3d: [dx / len, dy / len, 0] as [number, number, number],
      position3d: [axis.span.a.x, axis.span.a.y, 0] as [number, number, number],
      restAngle: 0,
      maxAngle: Math.PI,
      foldType: axis.type === "perf" ? "valley" as const : "mountain" as const,
    }];
  });

  const result: PipelineResult = {
    dielineSource,
    geometry,
    topology,
    foldAxes: axes,
    panelCandidates: built.panelCandidates,
    structuralPanels: built.structuralPanels,
    absorbedFeatures: built.absorbedFeatures,
    panels,
    staticFeatures,
    graph,
    plan,
    foldPlanV2: buildFoldPlanV2(model3D),
    hinges,
    constraintState: {

      active: hinges.length > 0,
      hingeCount: hinges.length,
      rescued: false,
    },
    sanitized,
    model3D,
    validation: { ok: true, issues: [], counts: { info: 0, warning: 0, error: 0 }, repaired: false },
  };

  // Camada de invariantes: detecta problemas universais (slivers, órfãos,
  // ownership errado de features, assimetria) e aplica auto-reparos quando
  // possível. Não falha o pipeline — anexa relatório auditável.
  result.validation = validatePipeline(result);
  return result;
}

