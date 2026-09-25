// ============================================================================
// Hinge Sanitization Layer — ESTÁGIO 0 da camada 3D
// ----------------------------------------------------------------------------
// Responsabilidade ÚNICA: transformar a saída crua do pipeline 2D
// (panels + foldAxes + foldGraph + foldPlan) em um SanitizedHingeGraph
// validado, determinístico e auditável, antes que QUALQUER coisa do 3D leia.
//
// O 2D continua intocado. Esta camada apenas FILTRA e CLASSIFICA — não muda
// segmentos, não muda polígonos, não reescreve eixos. Decide somente quais
// hinges são geometricamente seguros o suficiente para rotacionar painéis 3D.
//
// Regras (ver prompt definitivo):
//   1. MIN_HINGE_LENGTH (default 2.0mm): eixo < esse limite NÃO é hinge
//      rotacionável. Stage 4 (FoldAxisReconstructor) já mescla colineares;
//      se mesmo após a mesclagem o span ficou curto, é too_short.
//   2. TOPOLOGY_SNAP_TOLERANCE (1.2mm): usada para BFS de conectividade.
//   3. Eixo com direção não-finita ou |dir|≈0 → degenerate_axis.
//   4. Painéis não-alcançáveis a partir da raiz (no subgrafo de hinges
//      válidos) → ORPHAN, reportados, fora do solver.
//   5. Saída = SanitizedHingeGraph (contrato fechado).
//
// Determinismo: toda iteração ordena por id estável; BFS usa fila ordenada
// por (-length, axisId). Rodar duas vezes produz o mesmo resultado.
// ============================================================================

import type {
  FoldGraph,
  FoldPlan,
  PipelinePanel,
  StructuralFoldAxis,
} from "./types";

export const DEFAULT_MIN_HINGE_LENGTH_MM = 2.0;
export const DEFAULT_TOPOLOGY_SNAP_TOLERANCE_MM = 1.2;

export interface ValidHinge {
  axisId: string;
  panelA: string;
  panelB: string;
  /** Comprimento efetivo do eixo em mm (span). */
  length: number;
  /** Direção unitária 2D (z=0 implícito). */
  axisDir: { x: number; y: number };
  /** Origem do eixo no plano 2D (span.a). */
  origin: { x: number; y: number };
  /** Aresta da spanning tree do grafo de hinges válidos. */
  isTree: boolean;
}

export type RejectedReason = "too_short" | "degenerate_axis" | "disconnected";

export interface RejectedHinge {
  axisId: string;
  panelA: string;
  panelB: string;
  length: number;
  reason: RejectedReason;
}

export interface OrphanPanel {
  panelId: string;
  /** Por que ficou órfão (sem caminho válido até o root). */
  reason: "no_valid_hinge" | "only_short_hinges";
}

export interface SanitizationReport {
  totalAxes: number;
  validHinges: number;
  treeHinges: number;
  cycleHinges: number;
  rejectedTooShort: number;
  rejectedDegenerate: number;
  orphanCount: number;
  minHingeLengthMm: number;
  snapToleranceMm: number;
}

export interface SanitizedHingeGraph {
  rootPanelId: string;
  /** Painéis alcançáveis a partir do root via hinges válidos. */
  panels: PipelinePanel[];
  /** Hinges válidos (tree + cycle). */
  hinges: ValidHinge[];
  /** Eixos descartados, com motivo. */
  rejectedHinges: RejectedHinge[];
  /** Painéis sem caminho válido até o root. */
  orphanPanels: OrphanPanel[];
  /** Parent→child do spanning tree (panelId → parentId). Root não aparece. */
  parentOf: Record<string, string>;
  /** Ordem topológica BFS a partir do root. */
  topoOrder: string[];
  /** Mapa rápido: panelId → true se órfão (ignorar no solver). */
  orphanSet: Set<string>;
  /** Mapa rápido: panelId → hinge tree que liga ao parent. */
  treeHingeByChild: Record<string, ValidHinge>;
  report: SanitizationReport;
}

export interface HingeSanitizerOptions {
  minHingeLengthMm?: number;
  snapToleranceMm?: number;
  /** Se fornecido, força esse painel como root (caso esteja alcançável). */
  rootPanelId?: string;
}

interface RawEdge {
  axisId: string;
  panelA: string;
  panelB: string;
  length: number;
  axisDir: { x: number; y: number };
  origin: { x: number; y: number };
}

interface AxisContact {
  panelId: string;
  side: number;
  intervals: Array<[number, number]>;
}

function isFiniteVec(v: { x: number; y: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y);
}

function dirOfAxis(axis: StructuralFoldAxis): { x: number; y: number } | null {
  const dx = axis.span.b.x - axis.span.a.x;
  const dy = axis.span.b.y - axis.span.a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-9) return null;
  const v = { x: dx / len, y: dy / len };
  return isFiniteVec(v) ? v : null;
}

function projOnAxis(p: { x: number; y: number }, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x;
  const oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x;
  const dy = axis.axisLine.direction.y;
  return (p.x - ox) * dx + (p.y - oy) * dy;
}

function signedPerpToAxis(p: { x: number; y: number }, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x;
  const oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x;
  const dy = axis.axisLine.direction.y;
  const nx = -dy;
  const ny = dx;
  return (p.x - ox) * nx + (p.y - oy) * ny;
}

function axisSpanRange(axis: StructuralFoldAxis): [number, number] {
  const ta = projOnAxis(axis.span.a, axis);
  const tb = projOnAxis(axis.span.b, axis);
  return ta <= tb ? [ta, tb] : [tb, ta];
}

function centroid(poly: { x: number; y: number }[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
}

function robustPanelSide(panel: PipelinePanel, axis: StructuralFoldAxis): number {
  const cSide = signedPerpToAxis(centroid(panel.polygon), axis);
  if (Math.abs(cSide) > 0.05) return cSide;

  // Fallback para painéis finos/centróides quase em cima do eixo: média dos
  // vértices que não pertencem ao próprio vinco.
  let sum = 0;
  let count = 0;
  for (const p of panel.polygon) {
    const s = signedPerpToAxis(p, axis);
    if (Math.abs(s) <= 0.25) continue;
    sum += s;
    count++;
  }
  return count > 0 ? sum / count : cSide;
}

function intervalOverlap(a: [number, number], b: [number, number]): number {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
}

function panelAxisContact(panel: PipelinePanel, axis: StructuralFoldAxis): AxisContact | null {
  const poly = panel.polygon;
  if (poly.length < 2) return null;
  const [sLo, sHi] = axisSpanRange(axis);
  const perpTolMm = 1.5;
  const minOverlapMm = 0.35;
  const intervals: Array<[number, number]> = [];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (Math.abs(signedPerpToAxis(a, axis)) > perpTolMm) continue;
    if (Math.abs(signedPerpToAxis(b, axis)) > perpTolMm) continue;
    const ta = projOnAxis(a, axis);
    const tb = projOnAxis(b, axis);
    const lo = Math.max(Math.min(ta, tb), sLo);
    const hi = Math.min(Math.max(ta, tb), sHi);
    if (hi - lo >= minOverlapMm) intervals.push([lo, hi]);
  }

  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const side = robustPanelSide(panel, axis);
  if (Math.abs(side) <= 0.05) return null;
  return { panelId: panel.id, side, intervals };
}

function contactsShareRealHinge(a: AxisContact, b: AxisContact): boolean {
  // Um vinco físico liga painéis em lados opostos do eixo e com trecho de
  // boundary realmente sobreposto. Isso evita o erro anterior de criar grafo
  // completo entre todos os painéis que apenas tocavam a mesma reta longa.
  if (a.side * b.side >= 0) return false;
  for (const ia of a.intervals) {
    for (const ib of b.intervals) {
      if (intervalOverlap(ia, ib) >= 0.35) return true;
    }
  }
  return false;
}

function isStructuralFoldAxis(axis: StructuralFoldAxis): boolean {
  return axis.role === "structural_fold_axis" && axis.structuralEligibility !== false;
}

export function sanitizeHinges(
  panels: PipelinePanel[],
  foldAxes: StructuralFoldAxis[],
  graph: FoldGraph,
  plan: FoldPlan,
  opts: HingeSanitizerOptions = {},
): SanitizedHingeGraph {
  const MIN = opts.minHingeLengthMm ?? DEFAULT_MIN_HINGE_LENGTH_MM;
  const SNAP = opts.snapToleranceMm ?? DEFAULT_TOPOLOGY_SNAP_TOLERANCE_MM;
  void SNAP; // tolerância de snap topológico é absorvida pelo grafo 2D existente

  const axisById = new Map(foldAxes.filter(isStructuralFoldAxis).map((a) => [a.id, a]));
  const panelById = new Map(panels.map((p) => [p.id, p]));

  // ---- Passo A: classificar TODAS as arestas do grafo cru ----
  const valid: RawEdge[] = [];
  const rejected: RejectedHinge[] = [];

  // Ordena edges por axisId para determinismo total.
  const sortedEdges = [...graph.edges].sort((a, b) => a.axisId.localeCompare(b.axisId));
  const seenPair = new Set<string>();

  const tryAddEdge = (axisId: string, pA: string, pB: string): void => {
    if (pA === pB) return;
    if (!panelById.has(pA) || !panelById.has(pB)) return;
    const axis = axisById.get(axisId);
    if (!axis) return;
    const key = [axisId, ...[pA, pB].sort()].join("|");
    if (seenPair.has(key)) return;
    seenPair.add(key);
    const dir = dirOfAxis(axis);
    const length = axis.length ?? 0;
    if (!dir) {
      rejected.push({ axisId, panelA: pA, panelB: pB, length, reason: "degenerate_axis" });
      return;
    }
    if (!(length >= MIN)) {
      rejected.push({ axisId, panelA: pA, panelB: pB, length, reason: "too_short" });
      return;
    }
    const panelA = panelById.get(pA);
    const panelB = panelById.get(pB);
    const contactA = panelA ? panelAxisContact(panelA, axis) : null;
    const contactB = panelB ? panelAxisContact(panelB, axis) : null;
    if (!contactA || !contactB || !contactsShareRealHinge(contactA, contactB)) {
      rejected.push({ axisId, panelA: pA, panelB: pB, length, reason: "disconnected" });
      return;
    }
    valid.push({
      axisId,
      panelA: pA,
      panelB: pB,
      length,
      axisDir: dir,
      origin: { x: axis.span.a.x, y: axis.span.a.y },
    });
  };

  for (const e of sortedEdges) tryAddEdge(e.axisId, e.panelA, e.panelB);

  // RECUPERAÇÃO DE ÓRFÃOS (3D-only): reconstrói adjacência cruzando
  // `panel.foldAxisIds`, mas agora com prova geométrica de hinge real:
  //   - os dois painéis precisam tocar o eixo por uma aresta de boundary;
  //   - precisam estar em lados opostos do eixo;
  //   - os intervalos projetados no eixo precisam se sobrepor.
  // Isso recupera pares válidos descartados por `connectedFaceIds.length !== 2`
  // sem criar hinges fantasmas entre todos os painéis de uma reta longa.
  const panelsByAxis = new Map<string, string[]>();
  for (const p of panels) {
    for (const axisId of p.foldAxisIds ?? []) {
      if (!axisById.has(axisId)) continue;
      const arr = panelsByAxis.get(axisId) ?? [];
      arr.push(p.id);
      panelsByAxis.set(axisId, arr);
    }
  }
  const axisIdsSorted = [...panelsByAxis.keys()].sort();
  for (const axisId of axisIdsSorted) {
    const axis = axisById.get(axisId);
    if (!axis) continue;
    const contacts = [...new Set(panelsByAxis.get(axisId) ?? [])]
      .sort()
      .map((pid) => {
        const panel = panelById.get(pid);
        return panel ? panelAxisContact(panel, axis) : null;
      })
      .filter((c): c is AxisContact => Boolean(c))
      .sort((a, b) => {
        const da = Math.min(...a.intervals.map((it) => it[0]));
        const db = Math.min(...b.intervals.map((it) => it[0]));
        if (Math.abs(da - db) > 1e-9) return da - db;
        return a.panelId.localeCompare(b.panelId);
      });
    if (contacts.length < 2) continue;
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        if (!contactsShareRealHinge(contacts[i], contacts[j])) continue;
        tryAddEdge(axisId, contacts[i].panelId, contacts[j].panelId);
      }
    }
  }

  // ---- Passo B: escolher root determinístico ----
  // Preferência: opts.rootPanelId, depois plan.rootPanelId se ainda existir
  // entre os painéis, senão o de MAIOR ÁREA.
  let rootId = "";
  const candidates = [opts.rootPanelId, plan.rootPanelId, graph.rootPanelId].filter(
    (v): v is string => Boolean(v && panelById.has(v)),
  );
  if (candidates.length > 0) {
    rootId = candidates[0];
  } else {
    const sorted = [...panels].sort((a, b) => {
      const da = (b.area ?? 0) - (a.area ?? 0);
      if (da !== 0) return da;
      return a.id.localeCompare(b.id);
    });
    rootId = sorted[0]?.id ?? "";
  }

  // ---- Passo C: BFS no subgrafo de hinges válidos a partir do root ----
  // Para cada vizinho, escolhe o hinge mais longo (mais estável) como tree edge.
  const adj = new Map<string, RawEdge[]>();
  for (const v of valid) {
    if (!adj.has(v.panelA)) adj.set(v.panelA, []);
    if (!adj.has(v.panelB)) adj.set(v.panelB, []);
    adj.get(v.panelA)!.push(v);
    adj.get(v.panelB)!.push(v);
  }
  // Ordena adjacências por (-length, axisId) → BFS determinístico.
  for (const list of adj.values()) {
    list.sort((a, b) => {
      const dl = b.length - a.length;
      if (Math.abs(dl) > 1e-9) return dl;
      return a.axisId.localeCompare(b.axisId);
    });
  }

  const visited = new Set<string>();
  const parentOf: Record<string, string> = {};
  const treeHingeByChild: Record<string, ValidHinge> = {};
  const topoOrder: string[] = [];
  const usedTreeAxisKey = new Set<string>();

  if (rootId) {
    visited.add(rootId);
    topoOrder.push(rootId);
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const neighbors = adj.get(cur) ?? [];
      for (const e of neighbors) {
        const other = e.panelA === cur ? e.panelB : e.panelA;
        if (visited.has(other)) continue;
        visited.add(other);
        topoOrder.push(other);
        parentOf[other] = cur;
        const hinge: ValidHinge = {
          axisId: e.axisId,
          panelA: cur,
          panelB: other,
          length: e.length,
          axisDir: e.axisDir,
          origin: e.origin,
          isTree: true,
        };
        treeHingeByChild[other] = hinge;
        usedTreeAxisKey.add(`${e.axisId}|${[cur, other].sort().join("_")}`);
        queue.push(other);
      }
    }
  }

  // ---- Passo D: montar lista final de hinges (tree + cycle) ----
  const hinges: ValidHinge[] = [];
  // Tree primeiro (ordem topológica determinística).
  for (const childId of topoOrder) {
    const h = treeHingeByChild[childId];
    if (h) hinges.push(h);
  }
  // Cycle: arestas válidas restantes cujos dois painéis foram visitados.
  for (const e of valid) {
    if (!visited.has(e.panelA) || !visited.has(e.panelB)) continue;
    const k = `${e.axisId}|${[e.panelA, e.panelB].sort().join("_")}`;
    if (usedTreeAxisKey.has(k)) continue;
    hinges.push({
      axisId: e.axisId,
      panelA: e.panelA,
      panelB: e.panelB,
      length: e.length,
      axisDir: e.axisDir,
      origin: e.origin,
      isTree: false,
    });
  }

  // ---- Passo E: órfãos ----
  const orphanPanels: OrphanPanel[] = [];
  const orphanSet = new Set<string>();
  for (const p of panels) {
    if (visited.has(p.id)) continue;
    const hasAnyEdge = (adj.get(p.id)?.length ?? 0) > 0;
    orphanPanels.push({
      panelId: p.id,
      reason: hasAnyEdge ? "no_valid_hinge" : "only_short_hinges",
    });
    orphanSet.add(p.id);
    // Marca arestas que só ligavam órfãos como disconnected (reporta).
  }
  for (const e of valid) {
    if (visited.has(e.panelA) && visited.has(e.panelB)) continue;
    rejected.push({
      axisId: e.axisId,
      panelA: e.panelA,
      panelB: e.panelB,
      length: e.length,
      reason: "disconnected",
    });
  }

  const reachable = panels.filter((p) => visited.has(p.id));

  const report: SanitizationReport = {
    totalAxes: foldAxes.length,
    validHinges: hinges.length,
    treeHinges: hinges.filter((h) => h.isTree).length,
    cycleHinges: hinges.filter((h) => !h.isTree).length,
    rejectedTooShort: rejected.filter((r) => r.reason === "too_short").length,
    rejectedDegenerate: rejected.filter((r) => r.reason === "degenerate_axis").length,
    orphanCount: orphanPanels.length,
    minHingeLengthMm: MIN,
    snapToleranceMm: SNAP,
  };

  return {
    rootPanelId: rootId,
    panels: reachable,
    hinges,
    rejectedHinges: rejected,
    orphanPanels,
    parentOf,
    topoOrder,
    orphanSet,
    treeHingeByChild,
    report,
  };
}
