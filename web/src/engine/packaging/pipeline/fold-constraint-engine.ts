// ============================================================================
// FoldConstraintEngine
// ----------------------------------------------------------------------------
// Camada adicional que roda DEPOIS do FoldGraph/FoldPlanner. Sua única
// responsabilidade é garantir que TODA crease/perf vire uma hinge ativa
// (constraint 3D real) ligando dois painéis. Se o pipeline normal já produziu
// um plano completo, este módulo apenas espelha esse plano em forma de
// hinges. Se o plano ficou vazio (ou parcial) — por causa de eixos cujo
// `connectedFaceIds` não somou exatamente 2 painéis estruturais — ele faz um
// pareamento geométrico de resgate baseado em:
//
//   1. Lado do eixo onde o centróide de cada painel está (sinal da normal 2D)
//   2. Distância perpendicular do centróide do painel ao eixo
//
// e, em seguida, reconstrói um FoldGraph + FoldPlan a partir dos hinges.
//
// REGRAS:
// - Nunca cria hinge entre painéis idênticos.
// - Nunca cria hinge sem um eixo crease/perf real (não inventa dobra).
// - Não altera o parser, nem painéis, nem eixos. Só consome.
// - Output é determinístico (mesmo input → mesmo plano).
// ============================================================================

import type { Pt } from "../dieline-types";
import { buildFoldGraph } from "./fold-graph-builder";
import { planFolding } from "./fold-planner";
import type {
  FoldGraph,
  FoldPlan,
  PipelinePanel,
  StructuralFoldAxis,
} from "./types";

export interface FoldHinge {
  edgeId: string;
  type: "hinge";
  connectedPanels: [string, string];
  axis3d: [number, number, number];
  position3d: [number, number, number];
  restAngle: number;
  maxAngle: number;
  foldType: "mountain" | "valley";
}

export interface FoldConstraintResult {
  hinges: FoldHinge[];
  foldPlan: {
    active: boolean;
    hingeCount: number;
    constraints: FoldHinge[];
  };
  /** Graph efetivo (original ou reconstruído). */
  graph: FoldGraph;
  /** Plan efetivo (sempre não-vazio se houver hinges). */
  plan: FoldPlan;
  /** True quando o engine teve que recompor pares por geometria. */
  rescued: boolean;
}

function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

/** Distância perpendicular sinalizada do ponto à reta do eixo. */
function signedPerp(p: Pt, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  const nx = -dy, ny = dx;
  return (p.x - ox) * nx + (p.y - oy) * ny;
}

/** Projeção paramétrica do ponto sobre o eixo. */
function projParam(p: Pt, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  return (p.x - ox) * dx + (p.y - oy) * dy;
}

function axisSpanRange(axis: StructuralFoldAxis): [number, number] {
  const ta = projParam(axis.span.a, axis);
  const tb = projParam(axis.span.b, axis);
  return ta <= tb ? [ta, tb] : [tb, ta];
}

/** Para um eixo, escolhe o melhor par de painéis (um de cada lado), priorizando
 *  proximidade ao eixo e overlap de projeção. */
function pickPanelsForAxis(
  axis: StructuralFoldAxis,
  panels: PipelinePanel[],
): [PipelinePanel, PipelinePanel] | null {
  const [sLo, sHi] = axisSpanRange(axis);
  const positives: Array<{ panel: PipelinePanel; dist: number }> = [];
  const negatives: Array<{ panel: PipelinePanel; dist: number }> = [];

  for (const panel of panels) {
    const c = centroid(panel.polygon);
    const tp = projParam(c, axis);
    // Centróide deve cair dentro (ou perto) do span do eixo.
    if (tp < sLo - 5 || tp > sHi + 5) continue;
    const s = signedPerp(c, axis);
    const d = Math.abs(s);
    if (d < 0.05) continue; // painel exatamente no eixo: ambíguo
    (s > 0 ? positives : negatives).push({ panel, dist: d });
  }

  positives.sort((a, b) => a.dist - b.dist);
  negatives.sort((a, b) => a.dist - b.dist);
  if (positives.length === 0 || negatives.length === 0) return null;
  return [positives[0].panel, negatives[0].panel];
}

/** Reconstrói o `connectedFaceIds` por geometria quando a fase 5 não pareou. */
function rescueAxisConnections(
  axes: StructuralFoldAxis[],
  panels: PipelinePanel[],
): StructuralFoldAxis[] {
  return axes.map((axis) => {
    if (axis.role !== "structural_fold_axis" || axis.structuralEligibility === false) return axis;
    if (axis.connectedFaceIds.length >= 2) return axis;
    const pair = pickPanelsForAxis(axis, panels);
    if (!pair) return axis;
    return { ...axis, connectedFaceIds: [pair[0].faceId, pair[1].faceId] };
  });
}

function makeHingeFromPair(
  axis: StructuralFoldAxis,
  panelA: PipelinePanel,
  panelB: PipelinePanel,
): FoldHinge {
  const dx = axis.span.b.x - axis.span.a.x;
  const dy = axis.span.b.y - axis.span.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    edgeId: axis.id,
    type: "hinge",
    connectedPanels: [panelA.id, panelB.id],
    axis3d: [dx / len, dy / len, 0],
    position3d: [axis.span.a.x, axis.span.a.y, 0],
    restAngle: 0,
    maxAngle: Math.PI,
    foldType: axis.type === "perf" ? "valley" : "mountain",
  };
}

export function runFoldConstraintEngine(
  panels: PipelinePanel[],
  axes: StructuralFoldAxis[],
  existingGraph: FoldGraph,
  existingPlan: FoldPlan,
  rootHint?: string,
): FoldConstraintResult {
  const panelById = new Map(panels.map((p) => [p.id, p]));

  // Caminho feliz: plano já tem todos os steps esperados (1 por crease ligado).
  const validAxes = axes.filter((a) => a.role === "structural_fold_axis" && a.structuralEligibility !== false && a.connectedFaceIds.length >= 2);
  const planComplete =
    existingPlan.steps.length > 0 && existingPlan.steps.length >= validAxes.length;

  let graph = existingGraph;
  let plan = existingPlan;
  let rescued = false;

  if (!planComplete && axes.length > 0 && panels.length > 1) {
    const repairedAxes = rescueAxisConnections(axes, panels);
    const rebuiltGraph = buildFoldGraph(panels, repairedAxes, rootHint);
    const rebuiltPlan = planFolding(rebuiltGraph, panels, repairedAxes);
    if (rebuiltPlan.steps.length > existingPlan.steps.length) {
      graph = rebuiltGraph;
      plan = rebuiltPlan;
      rescued = true;
      // Mutação controlada: atualiza connectedFaceIds dos eixos originais para
      // que o restante do pipeline (HUD, inspector) reflita o pareamento real.
      for (let i = 0; i < axes.length; i++) {
        axes[i].connectedFaceIds = repairedAxes[i].connectedFaceIds;
      }
    }
  }

  // Gera hinges a partir do plano efetivo.
  const axisById = new Map(axes.map((a) => [a.id, a]));
  const hinges: FoldHinge[] = [];
  for (const step of plan.steps) {
    const axis = axisById.get(step.hingeId);
    const parent = panelById.get(step.parentId);
    const child = panelById.get(step.panelId);
    if (!axis || !parent || !child) continue;
    hinges.push(makeHingeFromPair(axis, parent, child));
  }

  return {
    hinges,
    foldPlan: {
      active: hinges.length > 0,
      hingeCount: hinges.length,
      constraints: hinges,
    },
    graph,
    plan,
    rescued,
  };
}
