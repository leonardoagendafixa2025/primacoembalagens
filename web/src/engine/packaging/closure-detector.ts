// Heurística para reconhecer o tipo de fechamento (topo e fundo) de uma faca
// importada — inspirada no comportamento do Heidelberg Prinect / ArtiosCAD.
//
// Estratégia:
//  1. Encontra a "fileira do corpo" — a faixa horizontal contígua de painéis
//     com a MAIOR altura média. É o corpo da caixa (Frente/Lateral/Verso/Lateral).
//  2. Painéis com centróide ABAIXO dessa faixa = abas de fundo.
//     Painéis ACIMA = abas de topo.
//  3. Se as abas não virarem painéis fechados (muito comum em PDFs com fundo
//     automático/interlock), cai para uma leitura direta dos segmentos do PDF.
//  4. Para cada conjunto de abas, mede número de abas, desvio das larguras,
//     altura média e presença de diagonais.
//  5. Aplica regras na ordem: crash_lock → tuck → rsc → seal_end → open.

import type { ClosureInfo, ClosureKind, Panel, Segment } from "./dieline-types";

interface PanelMetric {
  panel: Panel;
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  w: number;
  h: number;
  /** Quantos cantos do polígono têm ângulo significativamente diferente de 90°. */
  diagonalCorners: number;
  /** Total de vértices do polígono. */
  vertexCount: number;
}

interface FlapMetric {
  panelId?: string;
  cx: number;
  w: number;
  h: number;
  diagonalCorners: number;
  polygon?: Panel["polygon"];
}

interface RecoveredFlapMetric extends FlapMetric {
  panelId: string;
  polygon: Panel["polygon"];
}

function intervalOverlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function metric(panel: Panel): PanelMetric {
  const poly = panel.polygon;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let cx = 0, cy = 0;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;

  let diag = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i - 1 + poly.length) % poly.length];
    const b = poly[i];
    const c = poly[(i + 1) % poly.length];
    const v1x = a.x - b.x, v1y = a.y - b.y;
    const v2x = c.x - b.x, v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 0.5 || l2 < 0.5) continue;
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    const dev = Math.abs(ang - 90);
    if (dev > 15 && Math.abs(ang - 180) > 15 && ang > 15) diag++;
  }

  return {
    panel,
    cx, cy,
    minX, maxX, minY, maxY,
    w: maxX - minX,
    h: maxY - minY,
    diagonalCorners: diag,
    vertexCount: poly.length,
  };
}

function toFlapMetric(m: Pick<PanelMetric, "cx" | "w" | "h" | "diagonalCorners">): FlapMetric {
  return {
    cx: m.cx,
    w: m.w,
    h: m.h,
    diagonalCorners: m.diagonalCorners,
  };
}

/** Agrupa por banda Y (painéis cujo centróide cai num intervalo similar de Y). */
function boundarySupportAtY(
  y: number,
  xMin: number,
  xMax: number,
  bandH: number,
  segments: Segment[],
) {
  if (!segments.length) return 0;

  const yTol = Math.max(1.2, bandH * 0.04);
  let total = 0;
  for (const seg of segments) {
    if (seg.kind !== "crease" && seg.kind !== "perf") continue;
    for (const [a, b] of segmentPairs(seg)) {
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      if (dx < 2 || dy > yTol) continue;

      const minSegY = Math.min(a.y, b.y);
      const maxSegY = Math.max(a.y, b.y);
      if (y < minSegY - yTol || y > maxSegY + yTol) continue;

      total += intervalOverlap(Math.min(a.x, b.x), Math.max(a.x, b.x), xMin, xMax);
    }
  }
  return total;
}

function findBodyBand(metrics: PanelMetric[], segments: Segment[] = []): { yMin: number; yMax: number } | null {
  if (!metrics.length) return null;
  let best: PanelMetric[] = [];
  let bestScore = -Infinity;
  const globalMinY = Math.min(...metrics.map((m) => m.minY));
  const globalMaxY = Math.max(...metrics.map((m) => m.maxY));
  const globalCenterY = (globalMinY + globalMaxY) / 2;

  for (const anchor of metrics) {
    const row = metrics.filter((m) => {
      const overlap = intervalOverlap(anchor.minY, anchor.maxY, m.minY, m.maxY);
      const minH = Math.max(1, Math.min(anchor.h, m.h));
      return overlap / minH >= 0.55;
    });
    if (row.length < 2) continue;

    const totalWidth = row.reduce((sum, m) => sum + m.w, 0);
    const avgHeight = row.reduce((sum, m) => sum + m.h, 0) / row.length;
    const heightSpread = Math.max(...row.map((m) => m.h)) - Math.min(...row.map((m) => m.h));
    const rowMinX = Math.min(...row.map((m) => m.minX));
    const rowMaxX = Math.max(...row.map((m) => m.maxX));
    const rowMinY = Math.min(...row.map((m) => m.minY));
    const rowMaxY = Math.max(...row.map((m) => m.maxY));
    const rowCenterY = (rowMinY + rowMaxY) / 2;
    const avgDiag = row.reduce((sum, m) => sum + m.diagonalCorners, 0) / row.length;
    const widths = row.map((m) => m.w).sort((a, b) => a - b);
    const medianW = widths[Math.floor(widths.length / 2)] ?? 0;
    const widthSpread = widths.length > 1 ? widths[widths.length - 1] - widths[0] : 0;
    const uniformWidth = medianW > 0 ? 1 - Math.min(1, widthSpread / medianW) : 0;
    const coverage = (rowMaxX - rowMinX) > 0 ? totalWidth / (rowMaxX - rowMinX) : 0;
    const topSupport = boundarySupportAtY(rowMinY, rowMinX, rowMaxX, avgHeight, segments);
    const bottomSupport = boundarySupportAtY(rowMaxY, rowMinX, rowMaxX, avgHeight, segments);
    const balancedSupport = Math.min(topSupport, bottomSupport) / Math.max(1, totalWidth);
    const combinedSupport = (topSupport + bottomSupport) / Math.max(1, totalWidth * 2);
    const centerPenalty = Math.abs(rowCenterY - globalCenterY);
    const score =
      row.length * 10000 +
      totalWidth * 10 +
      uniformWidth * 1800 +
      coverage * 1600 +
      balancedSupport * 4000 +
      combinedSupport * 1000 +
      avgHeight * 0.25 -
      heightSpread * 4 -
      avgDiag * 120 -
      centerPenalty * 8;

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  if (best.length < 2) return null;
  let yMin = Infinity, yMax = -Infinity;
  for (const m of best) {
    if (m.minY < yMin) yMin = m.minY;
    if (m.maxY > yMax) yMax = m.maxY;
  }
  return { yMin, yMax };
}

function segmentPairs(seg: Segment) {
  const pairs: Array<[Segment["points"][number], Segment["points"][number]]> = [];
  for (let i = 0; i < seg.points.length - 1; i++) pairs.push([seg.points[i], seg.points[i + 1]]);
  if (seg.closed && seg.points.length > 2) pairs.push([seg.points[seg.points.length - 1], seg.points[0]]);
  return pairs;
}

function ptDist(a: Segment["points"][number], b: Segment["points"][number]) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ptKey(p: Segment["points"][number]) {
  return `${p.x.toFixed(3)}_${p.y.toFixed(3)}`;
}

function lerpToY(a: Segment["points"][number], b: Segment["points"][number], y: number) {
  const dy = b.y - a.y;
  const t = Math.abs(dy) < 1e-6 ? 0 : (y - a.y) / dy;
  return { x: a.x + (b.x - a.x) * t, y };
}

function buildRecoveredFlapPolygon(
  side: "top" | "bottom",
  panel: PanelMetric,
  boundaryY: number,
  ySlack: number,
  segments: Segment[],
): { polygon: Panel["polygon"]; diagonalEdges: number; coverage: number; width: number; height: number } | null {
  const xMargin = Math.max(3, Math.min(12, panel.w * 0.08));
  const xMin = panel.minX - xMargin;
  const xMax = panel.maxX + xMargin;
  const snapTol = Math.max(0.8, ySlack * 0.8);
  const isOutside = (p: Segment["points"][number]) =>
    side === "bottom" ? p.y < boundaryY - ySlack : p.y > boundaryY + ySlack;

  const rawEdges: Array<[Segment["points"][number], Segment["points"][number]]> = [];
  let coverage = 0;
  let diagonalEdges = 0;

  for (const seg of segments) {
    if (seg.kind === "crease") continue;
    for (const [a, b] of segmentPairs(seg)) {
      const segMinX = Math.min(a.x, b.x);
      const segMaxX = Math.max(a.x, b.x);
      const overlapX = intervalOverlap(segMinX, segMaxX, xMin, xMax);
      if (overlapX <= 0) continue;

      const aOutside = isOutside(a);
      const bOutside = isOutside(b);
      if (!aOutside && !bOutside) continue;

      const edge: [Segment["points"][number], Segment["points"][number]] = aOutside === bOutside
        ? [a, b]
        : aOutside
          ? [a, lerpToY(a, b, boundaryY)]
          : [lerpToY(a, b, boundaryY), b];

      if (ptDist(edge[0], edge[1]) < 0.2) continue;
      rawEdges.push(edge);

      const farEnough = side === "bottom"
        ? Math.min(edge[0].y, edge[1].y) < boundaryY - ySlack
        : Math.max(edge[0].y, edge[1].y) > boundaryY + ySlack;
      if (farEnough) {
        coverage += overlapX;
        if (Math.abs(edge[1].x - edge[0].x) > 1.5 && Math.abs(edge[1].y - edge[0].y) > 1.5) diagonalEdges++;
      }
    }
  }

  if (!rawEdges.length) return null;

  const nodes: Segment["points"] = [];
  const snapNode = (p: Segment["points"][number]) => {
    const existing = nodes.find((node) => ptDist(node, p) <= snapTol);
    if (existing) return existing;
    const next = { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
    nodes.push(next);
    return next;
  };

  const edges = rawEdges
    .map(([a, b]) => [snapNode(a), snapNode(b)] as [Segment["points"][number], Segment["points"][number]])
    .filter(([a, b]) => ptDist(a, b) >= 0.2);

  if (!edges.length) return null;

  const adj = new Map<string, Segment["points"]>();
  const degree = new Map<string, number>();
  for (const [a, b] of edges) {
    const ka = ptKey(a);
    const kb = ptKey(b);
    adj.set(ka, [...(adj.get(ka) ?? []), b]);
    adj.set(kb, [...(adj.get(kb) ?? []), a]);
    degree.set(ka, (degree.get(ka) ?? 0) + 1);
    degree.set(kb, (degree.get(kb) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const components: Segment["points"][] = [];
  for (const node of nodes) {
    const key = ptKey(node);
    if (seen.has(key)) continue;
    const stack = [node];
    const comp: Segment["points"] = [];
    seen.add(key);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nxt of adj.get(ptKey(cur)) ?? []) {
        const nk = ptKey(nxt);
        if (seen.has(nk)) continue;
        seen.add(nk);
        stack.push(nxt);
      }
    }
    components.push(comp);
  }

  let best: { polygon: Panel["polygon"]; width: number; height: number } | null = null;
  for (const comp of components) {
    const compSet = new Set(comp.map(ptKey));
    const boundaryNodes = comp.filter((node) => Math.abs(node.y - boundaryY) <= snapTol * 1.2).sort((a, b) => a.x - b.x);
    if (boundaryNodes.length < 2) continue;

    const endpoints = boundaryNodes.filter((node) => (degree.get(ptKey(node)) ?? 0) <= 1);
    const start = (endpoints[0] ?? boundaryNodes[0])!;
    const end = (endpoints[endpoints.length - 1] ?? boundaryNodes[boundaryNodes.length - 1])!;
    if (ptKey(start) === ptKey(end)) continue;

    const visitedEdges = new Set<string>();
    const chain: Panel["polygon"] = [start];
    let prev: Segment["points"][number] | null = null;
    let cur = start;
    let safe = 0;
    while (ptKey(cur) !== ptKey(end) && safe++ < comp.length + edges.length + 8) {
      const neighbors = (adj.get(ptKey(cur)) ?? []).filter((node) => compSet.has(ptKey(node)));
      const candidates = neighbors.filter((node) => {
        const ek = [ptKey(cur), ptKey(node)].sort().join("|");
        return !visitedEdges.has(ek) && (!prev || ptKey(node) !== ptKey(prev));
      });
      if (!candidates.length) break;

      candidates.sort((a, b) => {
        const boundaryPenaltyA = Math.abs(a.y - boundaryY) <= snapTol && ptKey(a) !== ptKey(end) ? 1000 : 0;
        const boundaryPenaltyB = Math.abs(b.y - boundaryY) <= snapTol && ptKey(b) !== ptKey(end) ? 1000 : 0;
        const outsideScoreA = side === "bottom" ? boundaryY - a.y : a.y - boundaryY;
        const outsideScoreB = side === "bottom" ? boundaryY - b.y : b.y - boundaryY;
        return (boundaryPenaltyA - outsideScoreA) - (boundaryPenaltyB - outsideScoreB);
      });

      const next = candidates[0]!;
      visitedEdges.add([ptKey(cur), ptKey(next)].sort().join("|"));
      chain.push(next);
      prev = cur;
      cur = next;
    }

    if (ptKey(cur) !== ptKey(end) || chain.length < 3) continue;

    const ordered = chain[0].x <= chain[chain.length - 1].x ? chain : [...chain].reverse();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of ordered) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const width = maxX - minX;
    const height = side === "bottom" ? boundaryY - minY : maxY - boundaryY;
    if (!best || width * 2 + height > best.width * 2 + best.height) {
      best = { polygon: ordered, width, height };
    }
  }

  if (!best) return null;
  return {
    polygon: best.polygon,
    diagonalEdges,
    coverage,
    width: best.width,
    height: best.height,
  };
}

function detectFlapsFromSegments(
  side: "top" | "bottom",
  body: PanelMetric[],
  band: { yMin: number; yMax: number },
  segments: Segment[],
): RecoveredFlapMetric[] {
  if (!segments.length || !body.length) return [];

  const boundaryY = side === "bottom" ? band.yMin : band.yMax;
  const bandH = Math.max(1, band.yMax - band.yMin);
  const minHeight = Math.max(8, bandH * 0.12);
  const minWidthRatio = 0.35;
  const ySlack = Math.max(1.2, bandH * 0.02);

  return [...body]
    .sort((a, b) => a.cx - b.cx)
    .map((panel) => {
      const recovered = buildRecoveredFlapPolygon(side, panel, boundaryY, ySlack, segments);
      if (!recovered) return null;

      const { polygon, width, height, coverage, diagonalEdges } = recovered;

      if (height < minHeight) return null;
      if (width < panel.w * minWidthRatio) return null;
      if (coverage < panel.w * 0.25) return null;

      return {
        panelId: panel.panel.id,
        cx: panel.cx,
        w: width,
        h: height,
        diagonalCorners: diagonalEdges * 2,
        polygon,
      } satisfies FlapMetric;
    })
    .filter((m): m is RecoveredFlapMetric => !!m);
}

function chooseBestFlapSet(
  primary: FlapMetric[],
  fallback: FlapMetric[],
  bodyCount: number,
): FlapMetric[] {
  if (!fallback.length) return primary;
  if (!primary.length) return fallback;

  const primaryDiag = primary.reduce((sum, flap) => sum + flap.diagonalCorners, 0);
  const fallbackDiag = fallback.reduce((sum, flap) => sum + flap.diagonalCorners, 0);

  const primaryCoverage = primary.length / Math.max(1, bodyCount);
  const fallbackCoverage = fallback.length / Math.max(1, bodyCount);

  if (fallbackCoverage >= 0.75 && primaryCoverage < 0.75) return fallback;
  if (fallback.length > primary.length && fallbackCoverage >= primaryCoverage) return fallback;
  if (fallbackDiag >= primaryDiag + 2 && fallback.length >= primary.length) return fallback;

  return primary;
}

function classifyFlapRow(flaps: FlapMetric[], _bodyHeight: number): ClosureInfo {
  if (flaps.length === 0) {
    return { kind: "open", confidence: 0.9, reason: "Sem abas detectadas nessa face" };
  }

  flaps.sort((a, b) => a.cx - b.cx);
  const ws = flaps.map((f) => f.w);
  const hs = flaps.map((f) => f.h);
  const meanW = ws.reduce((s, v) => s + v, 0) / ws.length;
  const meanH = hs.reduce((s, v) => s + v, 0) / hs.length;
  const wDev = ws.reduce((s, v) => s + Math.abs(v - meanW), 0) / (ws.length * meanW || 1);
  const totalDiag = flaps.reduce((s, f) => s + f.diagonalCorners, 0);
  const anyDiag = flaps.some((f) => f.diagonalCorners >= 2);

  if (anyDiag && totalDiag >= 3) {
    return {
      kind: "crash_lock",
      confidence: 0.85,
      reason: `${flaps.length} abas com cortes diagonais (${totalDiag} cantos angulados) — fundo automático`,
    };
  }

  if (flaps.length >= 4 && wDev > 0.18) {
    return {
      kind: "tuck",
      confidence: 0.75,
      reason: `${flaps.length} abas com larguras desiguais (dust flaps + aba principal) — encaixe (tuck)`,
    };
  }

  if (flaps.length === 4 && wDev < 0.12 && meanH > 0) {
    const maxW = Math.max(...ws);
    const ratio = meanH / maxW;
    if (ratio > 0.35 && ratio < 0.65) {
      return {
        kind: "rsc",
        confidence: 0.85,
        reason: "4 abas iguais, altura ≈ metade da largura — americano (FEFCO 0201)",
      };
    }
  }

  if (wDev < 0.15 && totalDiag === 0) {
    return {
      kind: "seal_end",
      confidence: 0.6,
      reason: `${flaps.length} abas retangulares iguais — seal end (cola)`,
    };
  }

  return {
    kind: "unknown",
    confidence: 0.3,
    reason: `${flaps.length} abas detectadas, padrão não classificado`,
  };
}

export function detectClosure(panels: Panel[], segments: Segment[] = []): { top: ClosureInfo; bottom: ClosureInfo } {
  const empty: ClosureInfo = { kind: "unknown", confidence: 0, reason: "Sem painéis" };
  if (!panels.length) return { top: empty, bottom: empty };

  const metrics = panels.map(metric);
  const band = findBodyBand(metrics, segments);
  if (!band) return { top: empty, bottom: empty };

  const bandH = band.yMax - band.yMin;
  const bandCY = (band.yMin + band.yMax) / 2;
  const isBody = (m: PanelMetric) => {
    const overlap = intervalOverlap(m.minY, m.maxY, band.yMin, band.yMax);
    return overlap / Math.max(1, Math.min(m.h, bandH)) >= 0.55;
  };

  const body = metrics.filter(isBody).sort((a, b) => a.cx - b.cx);
  const flaps = metrics.filter((m) => !isBody(m));
  const topFlaps = flaps.filter((m) => m.cy > bandCY).map(toFlapMetric);
  const botFlaps = flaps.filter((m) => m.cy <= bandCY).map(toFlapMetric);

  const topFallback = detectFlapsFromSegments("top", body, band, segments);
  const bottomFallback = detectFlapsFromSegments("bottom", body, band, segments);
  const topResolved = chooseBestFlapSet(topFlaps, topFallback, body.length);
  const bottomResolved = chooseBestFlapSet(botFlaps, bottomFallback, body.length);

  return {
    top: classifyFlapRow(topResolved, bandH),
    bottom: classifyFlapRow(bottomResolved, bandH),
  };
}

export function recoverMissingBodyPanels(panels: Panel[], segments: Segment[] = []): Panel[] {
  if (!panels.length || !segments.length) return panels;

  const metrics = panels.map(metric);
  const band = findBodyBand(metrics, segments);
  if (!band) return panels;

  const bandH = Math.max(1, band.yMax - band.yMin);
  const isBody = (m: PanelMetric) => {
    const overlap = intervalOverlap(m.minY, m.maxY, band.yMin, band.yMax);
    return overlap / Math.max(1, Math.min(m.h, bandH)) >= 0.55;
  };
  const body = metrics.filter(isBody).sort((a, b) => a.minX - b.minX);
  if (!body.length) return panels;

  const boundaryXs: number[] = [];
  const xTol = Math.max(1.2, bandH * 0.02);
  for (const seg of segments) {
    for (const [a, b] of segmentPairs(seg)) {
      const dx = Math.abs(b.x - a.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      const overlapY = intervalOverlap(minY, maxY, band.yMin, band.yMax);
      if (dx > xTol || overlapY < bandH * 0.45) continue;
      boundaryXs.push((a.x + b.x) / 2);
    }
  }

  const xs = [...boundaryXs].sort((a, b) => a - b);
  if (xs.length < 2) return panels;

  const clustered: number[] = [];
  for (const x of xs) {
    const last = clustered[clustered.length - 1];
    if (last === undefined || Math.abs(x - last) > 2) clustered.push(x);
    else clustered[clustered.length - 1] = (last + x) / 2;
  }

  const snapX = (x: number) => {
    let best = x, bestD = 0.5;
    for (const seg of segments) {
      for (const p of seg.points) {
        const d = Math.abs(p.x - x);
        if (d < bestD) { bestD = d; best = p.x; }
      }
    }
    return best;
  };

  const syntheticPanels: Panel[] = [];
  for (let i = 0; i < clustered.length - 1; i++) {
    const minX = snapX(clustered[i]);
    const maxX = snapX(clustered[i + 1]);
    if (maxX - minX < 8) continue;

    const covered = body.some((panel) => {
      const overlapX = intervalOverlap(minX, maxX, panel.minX, panel.maxX);
      return overlapX / Math.max(1, Math.min(maxX - minX, panel.w)) >= 0.65;
    });
    if (covered) continue;

    syntheticPanels.push({
      id: `syn-body-${i + 1}`,
      label: "Corpo",
      polygon: [
        { x: minX, y: band.yMin },
        { x: maxX, y: band.yMin },
        { x: maxX, y: band.yMax },
        { x: minX, y: band.yMax },
      ],
    });
  }

  return syntheticPanels.length ? [...panels, ...syntheticPanels] : panels;
}

export function recoverMissingFlapPanels(panels: Panel[], segments: Segment[] = []): Panel[] {
  if (!panels.length || !segments.length) return panels;

  const metrics = panels.map(metric);
  const band = findBodyBand(metrics, segments);
  if (!band) return panels;

  const bandH = band.yMax - band.yMin;
  const bandCY = (band.yMin + band.yMax) / 2;
  const isBody = (m: PanelMetric) => {
    const overlap = intervalOverlap(m.minY, m.maxY, band.yMin, band.yMax);
    return overlap / Math.max(1, Math.min(m.h, bandH)) >= 0.55;
  };

  const body = metrics.filter(isBody).sort((a, b) => a.cx - b.cx);
  const flapsAll = metrics.filter((m) => !isBody(m));
  const topExisting = flapsAll.filter((m) => m.cy > bandCY);
  const bottomExisting = flapsAll.filter((m) => m.cy <= bandCY);
  const topFallback = detectFlapsFromSegments("top", body, band, segments);
  const bottomFallback = detectFlapsFromSegments("bottom", body, band, segments);

  const hasExistingForBody = (row: PanelMetric[], bodyPanel: PanelMetric) =>
    row.some((flap) => flap.cx >= bodyPanel.minX - 1 && flap.cx <= bodyPanel.maxX + 1);

  const syntheticPanels: Panel[] = [];
  for (const flap of topFallback) {
    const bodyPanel = body.find((candidate) => candidate.panel.id === flap.panelId);
    if (!bodyPanel || !flap.polygon || hasExistingForBody(topExisting, bodyPanel)) continue;
    syntheticPanels.push({ id: `syn-top-${bodyPanel.panel.id}`, label: "Aba topo", polygon: flap.polygon });
  }
  for (const flap of bottomFallback) {
    const bodyPanel = body.find((candidate) => candidate.panel.id === flap.panelId);
    if (!bodyPanel || !flap.polygon || hasExistingForBody(bottomExisting, bodyPanel)) continue;
    syntheticPanels.push({ id: `syn-bottom-${bodyPanel.panel.id}`, label: "Aba fundo", polygon: flap.polygon });
  }

  return syntheticPanels.length ? [...panels, ...syntheticPanels] : panels;
}

/**
 * Extrai "lobos" do polígono do corpo que se estendem além da banda do corpo.
 * Cenário típico: o vinco horizontal entre corpo e aba só cobre o trecho central
 * (entre as abas internas), então as abas das EXTREMIDADES ficam fundidas ao
 * polígono do corpo. Aqui detectamos esses lobos pela travessia da fronteira
 * horizontal da banda e os emitimos como abas sintéticas.
 */
export function extractAbsorbedFlapLobes(panels: Panel[], segments: Segment[] = []): Panel[] {
  if (!panels.length) return panels;
  const metrics = panels.map(metric);
  const band = findBodyBand(metrics, segments);
  if (!band) return panels;
  const bandH = Math.max(1, band.yMax - band.yMin);
  const tol = Math.max(0.6, bandH * 0.02);
  // Abas de travamento (locking tabs) podem ser muito estreitas (3–8 mm) e
  // relativamente altas — não exigimos largura proporcional à banda.
  const minLobeH = Math.max(3, bandH * 0.02);
  const minLobeW = 2.5;

  const isBody = (m: PanelMetric) => {
    const ov = intervalOverlap(m.minY, m.maxY, band.yMin, band.yMax);
    return ov / Math.max(1, Math.min(m.h, bandH)) >= 0.55;
  };

  const synth: Panel[] = [];
  let serial = 0;
  const lerpToY = (a: Panel["polygon"][number], b: Panel["polygon"][number], y: number) => {
    const dy = b.y - a.y;
    const t = Math.abs(dy) < 1e-6 ? 0 : (y - a.y) / dy;
    return { x: a.x + (b.x - a.x) * t, y };
  };

  for (const m of metrics) {
    if (!isBody(m)) continue;
    const poly = m.panel.polygon;
    const n = poly.length;
    if (n < 4) continue;

    for (const side of ["bottom", "top"] as const) {
      const yBound = side === "bottom" ? band.yMin : band.yMax;
      const outside = (p: Panel["polygon"][number]) =>
        side === "bottom" ? p.y < yBound - tol : p.y > yBound + tol;

      const visited = new Array(n).fill(false);
      for (let i = 0; i < n; i++) {
        if (visited[i]) continue;
        const a = poly[i];
        const b = poly[(i + 1) % n];
        if (outside(a) || !outside(b)) continue;
        // edge i→i+1 cruza a fronteira para fora; começa lobo
        const start = lerpToY(a, b, yBound);
        const collected: Panel["polygon"] = [start];
        let j = (i + 1) % n;
        let safe = 0;
        let closed = false;
        while (safe++ < n + 4) {
          collected.push(poly[j]);
          visited[j] = true;
          const cur = poly[j];
          const nxt = poly[(j + 1) % n];
          if (outside(cur) && !outside(nxt)) {
            collected.push(lerpToY(cur, nxt, yBound));
            closed = true;
            break;
          }
          j = (j + 1) % n;
          if (j === i) break;
        }
        if (!closed || collected.length < 3) continue;

        let lobeMinX = Infinity, lobeMaxX = -Infinity, lobeMinY = Infinity, lobeMaxY = -Infinity;
        for (const p of collected) {
          if (p.x < lobeMinX) lobeMinX = p.x;
          if (p.x > lobeMaxX) lobeMaxX = p.x;
          if (p.y < lobeMinY) lobeMinY = p.y;
          if (p.y > lobeMaxY) lobeMaxY = p.y;
        }
        const lobeW = lobeMaxX - lobeMinX;
        const lobeH = side === "bottom" ? yBound - lobeMinY : lobeMaxY - yBound;
        if (lobeW < minLobeW || lobeH < minLobeH) continue;
        // Evita duplicar com abas já existentes
        const dupe = metrics.some((other) => {
          if (other === m) return false;
          if (isBody(other)) return false; // só compara com não-corpo (abas)
          const oxOv = intervalOverlap(other.minX, other.maxX, lobeMinX, lobeMaxX);
          const oyOv = intervalOverlap(other.minY, other.maxY, lobeMinY, lobeMaxY);
          return oxOv > lobeW * 0.6 && oyOv > lobeH * 0.4;
        });
        if (dupe) continue;

        serial++;
        synth.push({
          id: `lobe-${side}-${m.panel.id}-${serial}`,
          label: side === "bottom" ? "Aba fundo" : "Aba topo",
          polygon: collected,
        });
      }
    }
  }

  return synth.length ? [...panels, ...synth] : panels;
}

export const CLOSURE_LABELS: Record<ClosureKind, string> = {
  tuck: "Tuck end (encaixe)",
  crash_lock: "Crash-lock (fundo automático)",
  rsc: "Americano (RSC / FEFCO 0201)",
  seal_end: "Seal end (cola)",
  open: "Aberto / bandeja",
  unknown: "Não classificado",
};

/** Renomeia painéis por posição (corpo/topo/fundo) para facilitar a leitura. */
export function relabelPanels(panels: Panel[], segments: Segment[] = []): Panel[] {
  if (!panels.length) return panels;
  const metrics = panels.map(metric);
  const band = findBodyBand(metrics, segments);
  if (!band) return panels;
  const bandH = band.yMax - band.yMin;
  const bandCY = (band.yMin + band.yMax) / 2;
  const isBody = (m: PanelMetric) => {
    const overlap = intervalOverlap(m.minY, m.maxY, band.yMin, band.yMax);
    return overlap / Math.max(1, Math.min(m.h, bandH)) >= 0.55;
  };

  const bodyAll = metrics.filter(isBody).sort((a, b) => a.cx - b.cx);
  const flapsAll = metrics.filter((m) => !isBody(m));
  const top = flapsAll.filter((m) => m.cy > bandCY).sort((a, b) => a.cx - b.cx);
  const bot = flapsAll.filter((m) => m.cy <= bandCY).sort((a, b) => a.cx - b.cx);

  // Detecta aba de cola: painel de corpo nas extremidades (esquerda ou direita)
  // significativamente mais estreito que os demais (< 45% da mediana de largura).
  const remap = new Map<string, string>();
  let body = bodyAll;
  if (bodyAll.length >= 4) {
    const widths = [...bodyAll.map((m) => m.w)].sort((a, b) => a - b);
    const median = widths[Math.floor(widths.length / 2)];
    const candidates = [bodyAll[0], bodyAll[bodyAll.length - 1]];
    let glue: PanelMetric | null = null;
    for (const c of candidates) {
      if (c.w < median * 0.45 && c.w <= 40) {
        if (!glue || c.w < glue.w) glue = c;
      }
    }
    if (glue) {
      remap.set(glue.panel.id, "Aba de cola");
      body = bodyAll.filter((m) => m.panel.id !== glue!.panel.id);
    }
  }

  const bodyLabels = body.length === 4
    ? ["Frente", "Lateral D", "Verso", "Lateral E"]
    : body.map((_, i) => `Corpo ${i + 1}`);

  body.forEach((m, i) => remap.set(m.panel.id, bodyLabels[i] ?? `Corpo ${i + 1}`));
  top.forEach((m, i) => remap.set(m.panel.id, `Aba topo ${i + 1}`));
  bot.forEach((m, i) => remap.set(m.panel.id, `Aba fundo ${i + 1}`));

  return panels.map((p) => ({ ...p, label: remap.get(p.id) ?? p.label }));
}
