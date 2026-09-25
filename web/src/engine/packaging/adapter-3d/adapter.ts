// ============================================================================
// Structural2DTo3DAdapter — orquestrador principal.
// ----------------------------------------------------------------------------
// Consome a saída do pipeline 2D (panels + foldAxes + plan + sanitized) e
// produz um PackageStructuralModel3D coerente, semântico e auditável.
//
// Estratégia:
//   1. classifyRoles(panels, sanitized.hinges, root) → papéis por painel.
//   2. extractMainBodyBackbone(root, bodyIds, hinges) → conjunto do corpo.
//   3. buildRoleAwareSpanningTree(root, hinges, body/seam/flap)
//      + classificação tree/support/closure.
//   4. Constrói Hinge3D[] anotadas, FoldGraph3D semântico.
//   5. validateStructural3DModel → relatório auditável.
//   6. Produz sanitizedRefined (drop-in p/ o solver atual) com parentOf/topoOrder
//      vindos do spanning tree role-aware.
//
// NÃO altera nenhum painel/segmento/eixo. 2D permanece intocado.
// ============================================================================

import type { SanitizedHingeGraph, ValidHinge } from "../pipeline/hinge-sanitizer";
import type { FoldPlan, FoldStep, PipelinePanel, StructuralFoldAxis } from "../pipeline/types";
import { classifyRoles } from "./classify-roles";
import { extractMainBodyBackbone } from "./extract-backbone";
import { buildRoleAwareSpanningTree } from "./build-fold-tree";
import { validateStructural3DModel } from "./validate";
import { computePanelContacts } from "./cad-adjacency";
import { buildCadSpanningTree } from "./cad-spanning-tree";
import type {
  AdapterInputs,
  Hinge3D,
  PackageStructuralModel3D,
  RepairLog,
  StructuralPanel3D,
} from "./types";

function centroidOf(poly: { x: number; y: number }[]): { x: number; y: number } {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  const n = Math.max(1, poly.length);
  return { x: cx / n, y: cy / n };
}

function connectedComponents(
  nodeIds: string[],
  hinges: Hinge3D[],
): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) adj.set(id, new Set());
  for (const h of hinges) {
    if (!adj.has(h.panelA) || !adj.has(h.panelB)) continue;
    adj.get(h.panelA)!.add(h.panelB);
    adj.get(h.panelB)!.add(h.panelA);
  }
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const id of nodeIds) {
    if (seen.has(id)) continue;
    const stack = [id];
    const cc: string[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      cc.push(cur);
      for (const nb of adj.get(cur) ?? []) if (!seen.has(nb)) stack.push(nb);
    }
    comps.push(cc.sort());
  }
  return comps.sort((a, b) => b.length - a.length);
}

function computeSign(
  parent: PipelinePanel,
  child: PipelinePanel,
  hinge: ValidHinge,
): 1 | -1 {
  // IMPORTANTE: usa hinge.origin/axisDir (a aresta compartilhada real entre
  // parent e child), NÃO o axisLine bruto do StructuralFoldAxis. Em PDFs
  // reais o vinco pode estar deslocado/fracionado em relação ao boundary do
  // painel; usar a axisLine bruta leva o teste de "qual lado do eixo" a
  // dar a resposta errada quando o eixo passa do lado errado do centróide.
  const ox = hinge.origin.x;
  const oy = hinge.origin.y;
  const dx = hinge.axisDir.x;
  const dy = hinge.axisDir.y;
  const nx = -dy;
  const ny = dx;

  const cChild = centroidOf(child.polygon);
  const sideChild = (cChild.x - ox) * nx + (cChild.y - oy) * ny;
  if (Math.abs(sideChild) > 1e-4) return sideChild > 0 ? 1 : -1;

  // Fallback raro: centróide em cima do eixo (painel muito fino/triangular).
  let sum = 0;
  let count = 0;
  for (const p of child.polygon) {
    const s = (p.x - ox) * nx + (p.y - oy) * ny;
    if (Math.abs(s) <= 0.25) continue;
    sum += s;
    count++;
  }
  if (count > 0) return sum / count > 0 ? 1 : -1;
  void parent;
  return 1;
}

function buildCadEffectivePlan(
  sourcePlan: FoldPlan,
  panels: PipelinePanel[],
  rootPanelId: string,
  topoOrder: string[],
  parentOf: Record<string, string>,
  treeHingeByChild: Record<string, ValidHinge>,
): FoldPlan {
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const steps: FoldStep[] = [];
  const byPanel: Record<string, FoldStep> = {};
  for (const panelId of topoOrder) {
    if (panelId === rootPanelId) continue;
    const parentId = parentOf[panelId];
    const hinge = treeHingeByChild[panelId];
    const parent = panelById.get(parentId);
    const child = panelById.get(panelId);
    if (!parentId || !hinge || !parent || !child) continue;

    const prior = sourcePlan.byPanel[panelId];
    const targetAngle = prior?.targetAngle ?? Math.PI / 2;
    const sign = computeSign(parent, child, hinge);

    const step: FoldStep = {
      step: steps.length,
      panelId,
      parentId,
      hingeId: hinge.axisId,
      targetAngle,
      sign,
    };
    steps.push(step);
    byPanel[panelId] = step;
  }

  return { rootPanelId, steps, byPanel };
}

function buildEffectivePlan(
  sourcePlan: FoldPlan,
  panels: PipelinePanel[],
  axes: StructuralFoldAxis[],
  rootPanelId: string,
  topoOrder: string[],
  parentOf: Record<string, string>,
  treeHingeByChild: Record<string, ValidHinge>,
): FoldPlan {
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const steps: FoldStep[] = [];
  const byPanel: Record<string, FoldStep> = {};

  for (const panelId of topoOrder) {
    if (panelId === rootPanelId) continue;
    const parentId = parentOf[panelId];
    const hinge = treeHingeByChild[panelId];
    if (!parentId || !hinge) continue;

    const prior = sourcePlan.byPanel[panelId];
    const parent = panelById.get(parentId);
    const child = panelById.get(panelId);
    const sign = parent && child ? computeSign(parent, child, hinge) : (prior?.sign ?? 1);
    const step: FoldStep = {
      step: steps.length,
      panelId,
      parentId,
      hingeId: hinge.axisId,
      targetAngle: prior?.targetAngle ?? Math.PI / 2,
      sign,
    };
    steps.push(step);
    byPanel[panelId] = step;
  }
  void axes;

  return { rootPanelId, steps, byPanel };
}

function hingeFromStep(
  step: FoldStep,
  axis: StructuralFoldAxis,
): ValidHinge | null {
  const dx = axis.span.b.x - axis.span.a.x;
  const dy = axis.span.b.y - axis.span.a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return {
    axisId: step.hingeId,
    panelA: step.parentId,
    panelB: step.panelId,
    length: axis.length > 0 ? axis.length : len,
    axisDir: { x: dx / len, y: dy / len },
    origin: { x: axis.span.a.x, y: axis.span.a.y },
    isTree: true,
  };
}

function buildPlanFallbackSanitized(
  panels: PipelinePanel[],
  foldAxes: StructuralFoldAxis[],
  plan: FoldPlan,
  sanitized: SanitizedHingeGraph,
): SanitizedHingeGraph {
  const panelIds = new Set(panels.map((p) => p.id));
  const axisById = new Map(foldAxes.map((a) => [a.id, a]));
  const sortedSteps = [...plan.steps].sort((a, b) => a.step - b.step || a.panelId.localeCompare(b.panelId));

  const parentOf: Record<string, string> = {};
  const treeHingeByChild: Record<string, ValidHinge> = {};
  const hinges: ValidHinge[] = [];
  const reachable = new Set<string>();
  const rootId = panelIds.has(plan.rootPanelId) ? plan.rootPanelId : sanitized.rootPanelId;
  if (rootId) reachable.add(rootId);
  let syntheticIndex = 0;

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const step of sortedSteps) {
      if (treeHingeByChild[step.panelId]) continue;
      if (!panelIds.has(step.parentId) || !panelIds.has(step.panelId)) continue;
      if (!reachable.has(step.parentId)) continue;
      const axis = axisById.get(step.hingeId);
      if (!axis) continue;
      const parentPanel = panels.find((p) => p.id === step.parentId);
      const childPanel = panels.find((p) => p.id === step.panelId);
      const contact = parentPanel && childPanel ? edgeContactsForPanels(parentPanel, childPanel, foldAxes) : null;
      let hinge: ValidHinge | null = null;
      if (contact) {
        const axisId = `cad-plan-axis-${syntheticIndex++}-from-${contact.matchedAxisId}`;
        const dx = contact.span.b.x - contact.span.a.x;
        const dy = contact.span.b.y - contact.span.a.y;
        const len = Math.hypot(dx, dy);
        if (len >= 1e-6) {
          foldAxes.push({
            id: axisId,
            axisLine: { origin: contact.span.a, direction: { x: dx / len, y: dy / len } },
            span: contact.span,
            fragments: [],
            type: "crease",
            role: "structural_fold_axis",
            structuralEligibility: true,
            structuralConfidence: 1,
            confidence: 1,
            length: len,
            connectedFaceIds: [],
          });
          hinge = {
            axisId,
            panelA: step.parentId,
            panelB: step.panelId,
            length: len,
            axisDir: { x: dx / len, y: dy / len },
            origin: { x: contact.span.a.x, y: contact.span.a.y },
            isTree: true,
          };
        }
      }
      hinge = hinge ?? hingeFromStep(step, axis);
      if (!hinge) continue;
      parentOf[step.panelId] = step.parentId;
      treeHingeByChild[step.panelId] = hinge;
      hinges.push(hinge);
      reachable.add(step.panelId);
      progressed = true;
    }
  }

  const topoOrder = [rootId, ...sortedSteps.map((s) => s.panelId).filter((id) => reachable.has(id))]
    .filter((id, index, arr): id is string => Boolean(id) && arr.indexOf(id) === index);
  const orphanPanels = panels
    .filter((p) => !reachable.has(p.id))
    .map((p) => ({ panelId: p.id, reason: "no_valid_hinge" as const }));
  const orphanSet = new Set(orphanPanels.map((o) => o.panelId));
  const reachablePanels = panels.filter((p) => reachable.has(p.id));

  return {
    ...sanitized,
    rootPanelId: rootId,
    panels: reachablePanels,
    hinges,
    orphanPanels,
    parentOf,
    topoOrder,
    orphanSet,
    treeHingeByChild,
    report: {
      ...sanitized.report,
      validHinges: hinges.length,
      treeHinges: hinges.length,
      cycleHinges: 0,
      orphanCount: orphanPanels.length,
    },
  };
}

function countReachableFromPlan(plan: FoldPlan, panels: PipelinePanel[], foldAxes: StructuralFoldAxis[]): number {
  const panelIds = new Set(panels.map((p) => p.id));
  const axisIds = new Set(foldAxes.map((a) => a.id));
  const rootId = panelIds.has(plan.rootPanelId) ? plan.rootPanelId : panels[0]?.id;
  if (!rootId) return 0;

  const reachable = new Set<string>([rootId]);
  const sortedSteps = [...plan.steps].sort((a, b) => a.step - b.step || a.panelId.localeCompare(b.panelId));
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const step of sortedSteps) {
      if (reachable.has(step.panelId)) continue;
      if (!panelIds.has(step.parentId) || !panelIds.has(step.panelId)) continue;
      if (!axisIds.has(step.hingeId)) continue;
      if (!reachable.has(step.parentId)) continue;
      reachable.add(step.panelId);
      progressed = true;
    }
  }
  return reachable.size;
}

interface PanelEdgeContact {
  panelA: string;
  panelB: string;
  overlap: number;
  distance: number;
  span: { a: { x: number; y: number }; b: { x: number; y: number } };
  matchedAxisId: string;
}

function edgeContactsForPanels(
  a: PipelinePanel,
  b: PipelinePanel,
  foldAxes: StructuralFoldAxis[],
): PanelEdgeContact | null {
  const CLOSE_MM = 1.8;
  const MIN_OVERLAP_MM = 2.0;
  let best: PanelEdgeContact | null = null;

  for (let ia = 0; ia < a.polygon.length; ia++) {
    const a0 = a.polygon[ia];
    const a1 = a.polygon[(ia + 1) % a.polygon.length];
    const adx = a1.x - a0.x;
    const ady = a1.y - a0.y;
    const alen = Math.hypot(adx, ady);
    if (alen < MIN_OVERLAP_MM) continue;
    const ux = adx / alen;
    const uy = ady / alen;
    const nx = -uy;
    const ny = ux;
    const aLo = 0;
    const aHi = alen;

    for (let ib = 0; ib < b.polygon.length; ib++) {
      const b0 = b.polygon[ib];
      const b1 = b.polygon[(ib + 1) % b.polygon.length];
      const bdx = b1.x - b0.x;
      const bdy = b1.y - b0.y;
      const blen = Math.hypot(bdx, bdy);
      if (blen < MIN_OVERLAP_MM) continue;
      const cross = Math.abs(ux * (bdy / blen) - uy * (bdx / blen));
      if (cross > 0.035) continue;
      const d0 = (b0.x - a0.x) * nx + (b0.y - a0.y) * ny;
      const d1 = (b1.x - a0.x) * nx + (b1.y - a0.y) * ny;
      const distance = (Math.abs(d0) + Math.abs(d1)) / 2;
      if (distance > CLOSE_MM) continue;
      const bt0 = (b0.x - a0.x) * ux + (b0.y - a0.y) * uy;
      const bt1 = (b1.x - a0.x) * ux + (b1.y - a0.y) * uy;
      const bLo = Math.min(bt0, bt1);
      const bHi = Math.max(bt0, bt1);
      const lo = Math.max(aLo, bLo);
      const hi = Math.min(aHi, bHi);
      const overlap = hi - lo;
      if (overlap < MIN_OVERLAP_MM) continue;

      const midOffset = (d0 + d1) / 4;
      const span = {
        a: { x: a0.x + ux * lo + nx * midOffset, y: a0.y + uy * lo + ny * midOffset },
        b: { x: a0.x + ux * hi + nx * midOffset, y: a0.y + uy * hi + ny * midOffset },
      };
      let matchedAxisId = "";
      for (const axis of foldAxes) {
        if (axis.role !== "structural_fold_axis" || axis.structuralEligibility === false) continue;
        const ax = axis.axisLine.direction.x;
        const ay = axis.axisLine.direction.y;
        if (Math.abs(ux * ay - uy * ax) > 0.05) continue;
        const mx = (span.a.x + span.b.x) / 2;
        const my = (span.a.y + span.b.y) / 2;
        const anx = -ay;
        const any = ax;
        if (Math.abs((mx - axis.axisLine.origin.x) * anx + (my - axis.axisLine.origin.y) * any) > 2.5) continue;
        const ca = (span.a.x - axis.axisLine.origin.x) * ax + (span.a.y - axis.axisLine.origin.y) * ay;
        const cb = (span.b.x - axis.axisLine.origin.x) * ax + (span.b.y - axis.axisLine.origin.y) * ay;
        const ta = (axis.span.a.x - axis.axisLine.origin.x) * ax + (axis.span.a.y - axis.axisLine.origin.y) * ay;
        const tb = (axis.span.b.x - axis.axisLine.origin.x) * ax + (axis.span.b.y - axis.axisLine.origin.y) * ay;
        const overlapWithAxis = Math.min(Math.max(ca, cb), Math.max(ta, tb) + 2.5) - Math.max(Math.min(ca, cb), Math.min(ta, tb) - 2.5);
        if (overlapWithAxis < Math.min(1.0, overlap * 0.25)) continue;
        matchedAxisId = axis.id;
        break;
      }
      if (!matchedAxisId) continue;
      const candidate = { panelA: a.id, panelB: b.id, overlap, distance, span, matchedAxisId };
      if (!best || overlap - distance * 4 > best.overlap - best.distance * 4) best = candidate;
    }
  }
  return best;
}

function buildBoundaryFallbackSanitized(
  panels: PipelinePanel[],
  foldAxes: StructuralFoldAxis[],
  sanitized: SanitizedHingeGraph,
): SanitizedHingeGraph | null {
  const contacts: PanelEdgeContact[] = [];
  const sortedPanels = [...panels].sort((a, b) => (b.area ?? 0) - (a.area ?? 0) || a.id.localeCompare(b.id));
  for (let i = 0; i < sortedPanels.length; i++) {
    for (let j = i + 1; j < sortedPanels.length; j++) {
      const c = edgeContactsForPanels(sortedPanels[i], sortedPanels[j], foldAxes);
      if (c) contacts.push(c);
    }
  }
  if (contacts.length === 0) return null;

  const rootId = panels.some((p) => p.id === sanitized.rootPanelId)
    ? sanitized.rootPanelId
    : sortedPanels[0]?.id ?? "";
  if (!rootId) return null;

  const adj = new Map<string, PanelEdgeContact[]>();
  for (const c of contacts) {
    if (!adj.has(c.panelA)) adj.set(c.panelA, []);
    if (!adj.has(c.panelB)) adj.set(c.panelB, []);
    adj.get(c.panelA)!.push(c);
    adj.get(c.panelB)!.push(c);
  }
  for (const list of adj.values()) {
    list.sort((a, b) => b.overlap - a.overlap || a.panelA.localeCompare(b.panelA) || a.panelB.localeCompare(b.panelB));
  }

  const visited = new Set<string>([rootId]);
  const topoOrder = [rootId];
  const parentOf: Record<string, string> = {};
  const treeHingeByChild: Record<string, ValidHinge> = {};
  const hinges: ValidHinge[] = [];
  const queue = [rootId];
  let syntheticIndex = 0;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const c of adj.get(cur) ?? []) {
      const other = c.panelA === cur ? c.panelB : c.panelA;
      if (visited.has(other)) continue;
      const axisId = `cad-boundary-axis-${syntheticIndex++}-from-${c.matchedAxisId}`;
      const dx = c.span.b.x - c.span.a.x;
      const dy = c.span.b.y - c.span.a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      foldAxes.push({
        id: axisId,
        axisLine: { origin: c.span.a, direction: { x: dx / len, y: dy / len } },
        span: c.span,
        fragments: [],
        type: "crease",
        role: "structural_fold_axis",
        structuralEligibility: true,
        structuralConfidence: 1,
        confidence: 1,
        length: len,
        connectedFaceIds: [],
      });
      const hinge: ValidHinge = {
        axisId,
        panelA: cur,
        panelB: other,
        length: len,
        axisDir: { x: dx / len, y: dy / len },
        origin: c.span.a,
        isTree: true,
      };
      visited.add(other);
      topoOrder.push(other);
      parentOf[other] = cur;
      treeHingeByChild[other] = hinge;
      hinges.push(hinge);
      queue.push(other);
    }
  }

  if (hinges.length === 0) return null;
  const orphanPanels = panels
    .filter((p) => !visited.has(p.id))
    .map((p) => ({ panelId: p.id, reason: "no_valid_hinge" as const }));
  const orphanSet = new Set(orphanPanels.map((o) => o.panelId));

  return {
    ...sanitized,
    rootPanelId: rootId,
    panels: panels.filter((p) => visited.has(p.id)),
    hinges,
    orphanPanels,
    parentOf,
    topoOrder,
    orphanSet,
    treeHingeByChild,
    report: {
      ...sanitized.report,
      validHinges: hinges.length,
      treeHinges: hinges.length,
      cycleHinges: 0,
      orphanCount: orphanPanels.length,
    },
  };
}

export function buildStructural2DTo3DModel(
  inputs: AdapterInputs,
): PackageStructuralModel3D {
  const { panels, foldAxes, plan, sanitized } = inputs;

  // ============================================================
  // CAD path — caminho primário e genérico, válido para qualquer faca.
  // ----------------------------------------------------------------
  // Em vez de depender do que o sanitizador geométrico achou (que falha
  // quando o vinco do PDF está deslocado, fragmentado ou ausente), usamos
  // a adjacência POR ARESTA COMPARTILHADA entre painéis — o mesmo critério
  // que ArtiosCAD / Esko Studio / Pack3D usam internamente.
  //
  // Por construção:
  //   • todo painel conectado recebe um pai (zero órfão silencioso);
  //   • o hinge gera origin/axisDir do span da aresta real → sign correto;
  //   • painéis em componentes desconexos são reportados como órfãos
  //     reais (e o usuário sabe que falta algo no arquivo).
  // ============================================================
  const cadContacts = computePanelContacts(panels, foldAxes);
  const cadTree = buildCadSpanningTree(panels, foldAxes, cadContacts, {
    preferredRootId: sanitized.rootPanelId || plan.rootPanelId,
  });
  const planReachableCount = countReachableFromPlan(plan, panels, foldAxes);

  let effectiveSanitized: SanitizedHingeGraph;
  let pathUsed: "cad" | "legacy-boundary" | "legacy-plan" | "sanitized" = "sanitized";
  if (
    cadTree.hinges.length > 0 &&
    cadTree.reachablePanels.length >= sanitized.panels.length &&
    cadTree.reachablePanels.length >= planReachableCount
  ) {
    pathUsed = "cad";
    if (cadTree.synthesizedAxes.length > 0) {
      for (const axis of cadTree.synthesizedAxes) foldAxes.push(axis);
    }
    const treeCount = cadTree.hinges.filter((h) => h.isTree).length;
    effectiveSanitized = {
      ...sanitized,
      rootPanelId: cadTree.rootPanelId,
      panels: cadTree.reachablePanels,
      hinges: cadTree.hinges,
      orphanPanels: cadTree.orphanPanels.map((id) => ({ panelId: id, reason: "no_valid_hinge" as const })),
      parentOf: cadTree.parentOf,
      topoOrder: cadTree.topoOrder,
      orphanSet: new Set(cadTree.orphanPanels),
      treeHingeByChild: cadTree.treeHingeByChild,
      report: {
        ...sanitized.report,
        validHinges: cadTree.hinges.length,
        treeHinges: treeCount,
        cycleHinges: cadTree.hinges.length - treeCount,
        orphanCount: cadTree.orphanPanels.length,
      },
    };
  } else if (
    plan.steps.length > 0 &&
    (sanitized.hinges.length < Math.max(1, Math.ceil(plan.steps.length * 0.5)) ||
      sanitized.panels.length < planReachableCount)
  ) {
    const fb = buildBoundaryFallbackSanitized(panels, foldAxes, sanitized);
    if (fb && fb.panels.length >= planReachableCount) {
      pathUsed = "legacy-boundary";
      effectiveSanitized = fb;
    } else {
      pathUsed = "legacy-plan";
      effectiveSanitized = buildPlanFallbackSanitized(panels, foldAxes, plan, sanitized);
    }
  } else {
    effectiveSanitized = sanitized;
  }
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as { __cadPathUsed?: string }).__cadPathUsed = pathUsed;
    (globalThis as unknown as { __cadTreeStats?: unknown }).__cadTreeStats = {
      contacts: cadContacts.length,
      reachable: cadTree.reachablePanels.length,
      sanitizedReachable: sanitized.panels.length,
      planReachable: planReachableCount,
      synthesizedAxes: cadTree.synthesizedAxes.length,
      hinges: cadTree.hinges.length,
      components: cadTree.components.map((c) => c.length),
    };
  }

  // Trabalha somente com painéis alcançáveis (sanitized.panels). Demais ficam
  // explicitamente em foldGraph3D.orphanPanels.
  const reachablePanels = effectiveSanitized.panels;
  const reachableIds = new Set(reachablePanels.map((p) => p.id));
  const orphanIds = panels
    .map((p) => p.id)
    .filter((id) => !reachableIds.has(id));

  const rootId = effectiveSanitized.rootPanelId;

  // ---- 1. Roles ----
  const { roles, bodyIds, seamIds, flapIds } = classifyRoles(
    reachablePanels,
    effectiveSanitized.hinges,
    rootId,
  );

  // ---- 2. Backbone ----
  const backbone = extractMainBodyBackbone(rootId, bodyIds, effectiveSanitized.hinges);

  // ---- 3. Spanning tree role-aware ----
  const tree = buildRoleAwareSpanningTree(
    rootId,
    effectiveSanitized.hinges,
    bodyIds,
    seamIds,
    flapIds,
  );

  // ---- 4. StructuralPanels + Hinges 3D ----
  const structuralPanels3D: StructuralPanel3D[] = reachablePanels.map((p) => ({
    id: p.id,
    sourcePanelId: p.id,
    role: roles[p.id] ?? "aux",
    area: p.area ?? 0,
    centroid: centroidOf(p.polygon),
    ref: p,
  }));

  const hinges3D: Hinge3D[] = tree.annotated.map((a, i) => ({
    id: `h3d_${i}_${a.hinge.axisId}`,
    sourceAxisId: a.hinge.axisId,
    panelA: a.hinge.panelA,
    panelB: a.hinge.panelB,
    length: a.hinge.length,
    role: a.role,
    isStructural:
      a.role === "body-body" || a.role === "body-seam" || a.role === "body-flap",
    isTreeEdge: a.isTreeEdge,
    isSupportEdge: a.isSupportEdge,
    isClosureEdge: a.isClosureEdge,
    score: a.score,
    ref: a.hinge,
  }));

  // ---- 5. FoldGraph3D semântico ----
  const nodes = structuralPanels3D.map((p) => p.id);
  const treeEdges = hinges3D.filter((h) => h.isTreeEdge).map((h) => h.id);
  const supportEdges = hinges3D.filter((h) => h.isSupportEdge).map((h) => h.id);
  const closureEdges = hinges3D.filter((h) => h.isClosureEdge).map((h) => h.id);
  const mainBodyNodes = [...backbone.panelIds].sort();
  const flapNodes = nodes.filter((id) => flapIds.has(id) && !seamIds.has(id));
  const seamNodes = nodes.filter((id) => seamIds.has(id));
  const closureNodes = nodes.filter((id) =>
    hinges3D.some((h) => h.isClosureEdge && (h.panelA === id || h.panelB === id)),
  );
  const comps = connectedComponents(nodes, hinges3D);

  const foldGraph3D = {
    nodes,
    hinges: hinges3D.map((h) => h.id),
    treeEdges,
    supportEdges,
    closureEdges,
    connectedComponents: comps,
    rootPanelId: rootId,
    mainBodyNodes,
    flapNodes,
    seamNodes,
    closureNodes,
    orphanPanels: orphanIds,
  };

  // ---- 6. Validation ----
  const diagnostics = validateStructural3DModel(
    structuralPanels3D,
    hinges3D,
    foldGraph3D,
    panels.length,
    effectiveSanitized.hinges.length,
  );

  // ---- 7. Repairs (registrados, não destrutivos) ----
  const repairs: RepairLog = {
    reparentedFlaps: 0,
    consolidatedHinges: 0,
    rescuedClosureEdges: closureEdges.length,
    notes: [],
  };
  // Contagem de reparenting: quantos painéis trocaram de parent vs sanitized.
  for (const childId of Object.keys(tree.parentOf)) {
    const newParent = tree.parentOf[childId];
    const oldParent = effectiveSanitized.parentOf[childId];
    if (oldParent && oldParent !== newParent) repairs.reparentedFlaps++;
  }
  if (repairs.reparentedFlaps > 0) {
    repairs.notes.push(
      `Spanning tree role-aware re-parented ${repairs.reparentedFlaps} painéis.`,
    );
  }

  // ---- 8. sanitizedRefined: drop-in p/ o solver atual ----
  // Reconstrói treeHingeByChild + topoOrder a partir do spanning tree
  // role-aware, mantendo o resto idêntico.
  const treeHingeByChild: Record<string, ValidHinge> = {};
  for (const a of tree.annotated) {
    if (!a.isTreeEdge) continue;
    const parent = tree.parentOf[a.hinge.panelB] === a.hinge.panelA ? a.hinge.panelA : a.hinge.panelB;
    const child = parent === a.hinge.panelA ? a.hinge.panelB : a.hinge.panelA;
    treeHingeByChild[child] = {
      ...a.hinge,
      panelA: parent,
      panelB: child,
      isTree: true,
    };
  }
  const refinedHinges: ValidHinge[] = [];
  for (const childId of tree.topoOrder) {
    const h = treeHingeByChild[childId];
    if (h) refinedHinges.push(h);
  }
  for (const a of tree.annotated) {
    if (a.isTreeEdge) continue;
    refinedHinges.push({ ...a.hinge, isTree: false });
  }

  const sanitizedRefined: SanitizedHingeGraph = {
    ...effectiveSanitized,
    hinges: refinedHinges,
    parentOf: { ...tree.parentOf },
    topoOrder: [...tree.topoOrder],
    treeHingeByChild,
    report: {
      ...sanitized.report,
      validHinges: refinedHinges.length,
      treeHinges: refinedHinges.filter((h) => h.isTree).length,
      cycleHinges: refinedHinges.filter((h) => !h.isTree).length,
    },
  };

  const effectivePlan = pathUsed === "cad"
    ? buildCadEffectivePlan(
        plan,
        reachablePanels,
        rootId,
        tree.topoOrder,
        tree.parentOf,
        treeHingeByChild,
      )
    : buildEffectivePlan(
        plan,
        reachablePanels,
        foldAxes,
        rootId,
        tree.topoOrder,
        tree.parentOf,
        treeHingeByChild,
      );

  return {
    sourcePanels2D: panels,
    structuralPanels3D,
    panelRoles: roles,
    hinges3D,
    foldGraph3D,
    foldTree: {
      rootPanelId: rootId,
      parentOf: { ...tree.parentOf },
      children: { ...tree.children },
      topoOrder: [...tree.topoOrder],
    },
    effectivePlan,
    sanitizedRefined,
    diagnostics,
    repairs,
  };
}
