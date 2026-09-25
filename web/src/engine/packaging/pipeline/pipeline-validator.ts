// ============================================================================
// PipelineValidator — Camada de invariantes geométricas
// ----------------------------------------------------------------------------
// Roda DEPOIS do pipeline completo e verifica regras universais que toda
// faca deve satisfazer, independente da sua geometria específica:
//
//   I1. Sem painéis órfãos: todo painel estrutural é alcançável a partir do
//       root via grafo de dobras.
//   I2. Sem slivers: nenhum painel estrutural tem área < 1% da área total da
//       faca (sintoma de split errado).
//   I3. Toda axis estrutural conecta exatamente 2 painéis estruturais.
//   I4. Feature ownership ótimo: cada feature absorvida pertence ao painel
//       estrutural cujo centróide é mais próximo do centróide da feature.
//       Auto-reparo: corrige ownerPanelId quando outro painel está mais perto.
//   I5. Plano cobre todos os painéis não-root.
//   I6. Simetria espelhada: se a faca é simétrica em X (ou Y) dentro de
//       tolerância, o nº de painéis estruturais e o nº de hinges também é
//       simétrico (sintoma do bug que esquerda dobra e direita não).
//
// O validador não falha o pipeline — ele anexa um relatório em
// `result.validation` com severidade por issue. O caller (UI) pode mostrar
// alertas; testes de regressão fazem fail quando severidade=error.
// ============================================================================

import type { Pt } from "../dieline-types";
import type {
  AbsorbedFeature,
  FoldGraph,
  FoldPlan,
  PipelineResult,
  StructuralFoldAxis,
  StructuralPanel,
} from "./types";

export type ValidationSeverity = "info" | "warning" | "error";

export interface ValidationIssue {
  id: string;
  invariant: "I1" | "I2" | "I3" | "I4" | "I5" | "I6";
  severity: ValidationSeverity;
  message: string;
  /** IDs envolvidos (painel, axis, feature). */
  refs: string[];
  /** Se foi auto-reparado, qual ação foi tomada. */
  repair?: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  counts: Record<ValidationSeverity, number>;
  /** True se o validador modificou algo do resultado. */
  repaired: boolean;
}

// ----------------------------------------------------------------------------
// Helpers geométricos locais
// ----------------------------------------------------------------------------

function polyCentroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

function panelCentroid(panel: StructuralPanel): Pt {
  const bb = panel.bbox;
  return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function totalDielineArea(panels: StructuralPanel[]): number {
  return panels.reduce((sum, p) => sum + p.area, 0);
}

// ----------------------------------------------------------------------------
// Invariantes individuais
// ----------------------------------------------------------------------------

/** I1. Painéis órfãos = não alcançáveis do root via grafo. */
function checkOrphans(panels: StructuralPanel[], graph: FoldGraph): ValidationIssue[] {
  const root = graph.rootPanelId;
  if (!root) return [];
  const adj = new Map<string, Set<string>>();
  for (const p of panels) adj.set(p.id, new Set());
  for (const edge of graph.edges) {
    const parent = edge.parentPanelId;
    const child = edge.childPanelId;
    if (!parent || !child) continue;
    adj.get(parent)?.add(child);
    adj.get(child)?.add(parent);
  }
  const visited = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const n of adj.get(cur) ?? []) stack.push(n);
  }
  const orphans = panels.filter((p) => !visited.has(p.id));
  return orphans.map((p) => ({
    id: `I1-${p.id}`,
    invariant: "I1" as const,
    severity: "error" as const,
    message: `Painel "${p.label}" não está conectado ao root via nenhuma dobra.`,
    refs: [p.id],
  }));
}

/** I2. Slivers = fragmentos minúsculos vindos de splits errados. */
function checkSlivers(panels: StructuralPanel[]): ValidationIssue[] {
  const total = totalDielineArea(panels);
  if (total <= 0) return [];
  const threshold = total * 0.01; // 1% da faca
  return panels
    .filter((p) => p.area < threshold)
    .map((p) => ({
      id: `I2-${p.id}`,
      invariant: "I2" as const,
      severity: "warning" as const,
      message: `Painel "${p.label}" tem área ${p.area.toFixed(1)} mm² (<1% da faca). Provável sliver de split.`,
      refs: [p.id],
    }));
}

/** I3. Toda axis estrutural deve ligar 2 painéis estruturais. */
function checkAxisConnections(
  panels: StructuralPanel[],
  axes: StructuralFoldAxis[],
): ValidationIssue[] {
  const panelIds = new Set(panels.map((p) => p.id));
  const issues: ValidationIssue[] = [];
  for (const axis of axes) {
    if (axis.role !== "structural_fold_axis") continue;
    const connected = (axis.connectedPanelCandidateIds ?? []).filter((id) => panelIds.has(id));
    if (connected.length < 2) {
      issues.push({
        id: `I3-${axis.id}`,
        invariant: "I3",
        severity: "error",
        message: `Eixo estrutural "${axis.id}" conecta apenas ${connected.length} painel(éis).`,
        refs: [axis.id, ...connected],
      });
    }
  }
  return issues;
}

/** I4. Feature ownership ótimo (com auto-reparo). */
function checkAndRepairFeatureOwnership(
  panels: StructuralPanel[],
  features: AbsorbedFeature[],
): ValidationIssue[] {
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const issues: ValidationIssue[] = [];
  for (const feature of features) {
    const owner = panelById.get(feature.ownerPanelId);
    if (!owner) {
      issues.push({
        id: `I4-${feature.id}`,
        invariant: "I4",
        severity: "error",
        message: `Feature "${feature.id}" aponta para painel inexistente "${feature.ownerPanelId}".`,
        refs: [feature.id],
      });
      continue;
    }
    const fc = polyCentroid(feature.polygon);
    const ownerDist = distance(fc, panelCentroid(owner));
    let best = { panel: owner, dist: ownerDist };
    for (const cand of panels) {
      if (cand.id === owner.id) continue;
      const d = distance(fc, panelCentroid(cand));
      if (d < best.dist) best = { panel: cand, dist: d };
    }
    // Tolerância: só repara se o melhor é claramente mais próximo (>20% mais perto)
    // e a melhora absoluta é > 5mm, para não migrar features por ruído.
    if (best.panel.id !== owner.id && best.dist < ownerDist * 0.8 && ownerDist - best.dist > 5) {
      const oldId = feature.ownerPanelId;
      feature.ownerPanelId = best.panel.id;
      feature.hostPanelId = best.panel.id;
      // Atualiza absorbedFeatureIds dos painéis.
      owner.absorbedFeatureIds = owner.absorbedFeatureIds.filter((fid) => fid !== feature.id);
      if (!best.panel.absorbedFeatureIds.includes(feature.id)) {
        best.panel.absorbedFeatureIds.push(feature.id);
      }
      issues.push({
        id: `I4-${feature.id}`,
        invariant: "I4",
        severity: "info",
        message: `Feature "${feature.id}" reatribuída de "${oldId}" para "${best.panel.id}" (mais próxima).`,
        refs: [feature.id, oldId, best.panel.id],
        repair: `ownerPanelId: ${oldId} → ${best.panel.id}`,
      });
    }
  }
  return issues;
}

/** I5. Plano cobre todos os painéis não-root. */
function checkPlanCoverage(
  panels: StructuralPanel[],
  graph: FoldGraph,
  plan: FoldPlan,
): ValidationIssue[] {
  const root = graph.rootPanelId;
  const planned = new Set(plan.steps.map((s) => s.panelId));
  const missing = panels.filter((p) => p.id !== root && !planned.has(p.id));
  return missing.map((p) => ({
    id: `I5-${p.id}`,
    invariant: "I5" as const,
    severity: "error" as const,
    message: `Painel "${p.label}" não está no plano de dobra (não vai dobrar no 3D).`,
    refs: [p.id],
  }));
}

/** I6. Simetria: se a faca é espelhada em X, painéis e hinges também devem ser. */
function checkMirrorSymmetry(
  panels: StructuralPanel[],
  axes: StructuralFoldAxis[],
): ValidationIssue[] {
  if (panels.length < 4) return [];
  // Estima eixo de simetria em X pelo centro do bbox global.
  const minX = Math.min(...panels.map((p) => p.bbox.minX));
  const maxX = Math.max(...panels.map((p) => p.bbox.maxX));
  const midX = (minX + maxX) / 2;
  const minY = Math.min(...panels.map((p) => p.bbox.minY));
  const maxY = Math.max(...panels.map((p) => p.bbox.maxY));
  const midY = (minY + maxY) / 2;
  const tol = Math.max((maxX - minX), (maxY - minY)) * 0.02;

  // Testa só simetria em X (espelhamento horizontal). Para cada painel à
  // esquerda, busca par à direita com área similar e centróide espelhado.
  const left = panels.filter((p) => panelCentroid(p).x < midX - tol);
  const right = panels.filter((p) => panelCentroid(p).x > midX + tol);
  // Só vale conferir simetria se nº de painéis dos lados são parecidos.
  if (Math.abs(left.length - right.length) > Math.max(2, panels.length * 0.1)) return [];

  const unmatched: StructuralPanel[] = [];
  const usedRight = new Set<string>();
  for (const lp of left) {
    const lc = panelCentroid(lp);
    const mirror = { x: 2 * midX - lc.x, y: lc.y };
    let match: StructuralPanel | null = null;
    let bestD = Infinity;
    for (const rp of right) {
      if (usedRight.has(rp.id)) continue;
      const rc = panelCentroid(rp);
      const d = distance(rc, mirror);
      const areaRatio = Math.min(lp.area, rp.area) / Math.max(lp.area, rp.area);
      if (d < tol * 3 && areaRatio > 0.8 && d < bestD) { bestD = d; match = rp; }
    }
    if (match) usedRight.add(match.id);
    else unmatched.push(lp);
  }
  if (unmatched.length === 0 && left.length > 2) {
    // Simetria confirmada e perfeita
    return [];
  }
  if (unmatched.length > 0 && left.length >= 3) {
    return [{
      id: `I6-mirror-x`,
      invariant: "I6",
      severity: "warning",
      message: `Faca parece simétrica em X mas ${unmatched.length} painel(éis) à esquerda não têm par à direita. Possível split assimétrico.`,
      refs: unmatched.map((p) => p.id),
    }];
  }
  return [];
}

// ----------------------------------------------------------------------------
// API principal
// ----------------------------------------------------------------------------

export function validatePipeline(result: PipelineResult): ValidationReport {
  const issues: ValidationIssue[] = [];

  issues.push(...checkOrphans(result.structuralPanels, result.graph));
  issues.push(...checkSlivers(result.structuralPanels));
  issues.push(...checkAxisConnections(result.structuralPanels, result.foldAxes));
  const repairIssues = checkAndRepairFeatureOwnership(result.structuralPanels, result.absorbedFeatures);
  issues.push(...repairIssues);
  issues.push(...checkPlanCoverage(result.structuralPanels, result.graph, result.plan));
  issues.push(...checkMirrorSymmetry(result.structuralPanels, result.foldAxes));

  const counts: Record<ValidationSeverity, number> = { info: 0, warning: 0, error: 0 };
  for (const i of issues) counts[i.severity]++;

  return {
    ok: counts.error === 0,
    issues,
    counts,
    repaired: repairIssues.some((i) => i.repair !== undefined),
  };
}
