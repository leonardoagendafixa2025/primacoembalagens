// ============================================================================
// Stage 5 — Panel Builder
// ----------------------------------------------------------------------------
// Converte cada Face do kernel em um PipelinePanel com:
//   - id estável (hash do polígono normalizado)
//   - polygon (loop externo) + holes (loops internos marcados como hole)
//   - foldAxisIds: lista de StructuralFoldAxis que tocam o boundary do painel
//
// "Tocar o boundary" significa: existe pelo menos um fragmento do eixo cujos
// dois endpoints estão no boundary do painel (dentro de tolerância). Isso
// preenche o `connectedFaceIds` de cada eixo, base para o FoldGraph (Stage 6).
//
// Esta etapa NÃO decide parent/child. Apenas materializa painéis e conexões.
// ============================================================================

import type { Pt } from "../dieline-types";
import type {
  AbsorbedFeature,
  AbsorbedFeatureType,
  ClassifiedTopology,
  NormalizedGeometry,
  PanelCandidate,
  StructuralPanel,
  StructuralFoldAxis,
} from "./types";
import type { Face } from "../cad/kernel/types";
import {
  setLastStructuralReport,
  type FeatureKind,
  type RejectReason,
  type StructuralReport,
} from "../structural-panels";
import { buildStructuralDecomposition } from "./structural-decomposition";
import { splitStructuralPanelsByValidatedAxes } from "./structural-panel-split";


function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(a) / 2;
}

function signedPolygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}

function polygonBBox(poly: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function candidateBBox(poly: Pt[]): PanelCandidate["bbox"] {
  const bb = polygonBBox(poly);
  return { ...bb, x: bb.minX, y: bb.minY, w: bb.maxX - bb.minX, h: bb.maxY - bb.minY };
}

/** ID estável: hash determinístico a partir dos vértices ordenados. */
function panelIdFromPolygon(poly: Pt[]): string {
  // Encontra o vértice "menor" (menor x, depois menor y) como ponto de partida
  // canônico, garantindo o mesmo id mesmo se o loop começar em índice diferente.
  let startIdx = 0;
  for (let i = 1; i < poly.length; i++) {
    if (
      poly[i].x < poly[startIdx].x ||
      (poly[i].x === poly[startIdx].x && poly[i].y < poly[startIdx].y)
    ) startIdx = i;
  }
  const parts: string[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[(startIdx + i) % poly.length];
    parts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  // Hash FNV-1a 32 bits — barato e estável.
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return `panel-${h.toString(16).padStart(8, "0")}`;
}

function polygonFromLoop(points: Pt[]): Pt[] {
  // Garante CCW.
  const a = signedPolygonArea(points);
  return a >= 0 ? points : points.slice().reverse();
}

function holeFromLoop(points: Pt[]): Pt[] {
  const a = signedPolygonArea(points);
  // Holes em CW.
  return a < 0 ? points : points.slice().reverse();
}

function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len > 1e-6 && Math.abs((pt.x - a.x) * ey - (pt.y - a.y) * ex) / len <= 0.1) {
      const dot = (pt.x - a.x) * (pt.x - b.x) + (pt.y - a.y) * (pt.y - b.y);
      if (dot <= 0.01) return true;
    }
    const crosses = (a.y > pt.y) !== (b.y > pt.y);
    if (crosses && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y + 1e-12) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function bboxContainsOuter(outer: Pt[], inner: Pt[], margin = 0.35): boolean {
  const o = polygonBBox(outer);
  const i = polygonBBox(inner);
  return (
    i.minX >= o.minX + margin &&
    i.maxX <= o.maxX - margin &&
    i.minY >= o.minY + margin &&
    i.maxY <= o.maxY - margin
  );
}

function polygonStrictlyContainsPolygon(outer: Pt[], inner: Pt[]): boolean {
  if (!bboxContainsOuter(outer, inner)) return false;
  if (!pointInPolygon(ringCentroid(inner), outer)) return false;
  return inner.every((p) => pointInPolygon(p, outer));
}

function edgeOverlapLength(a1: Pt, a2: Pt, b1: Pt, b2: Pt, tol = 0.45): number {
  const adx = a2.x - a1.x;
  const ady = a2.y - a1.y;
  const alen = Math.hypot(adx, ady);
  const bdx = b2.x - b1.x;
  const bdy = b2.y - b1.y;
  const blen = Math.hypot(bdx, bdy);
  if (alen < 1e-6 || blen < 1e-6) return 0;
  const ux = adx / alen;
  const uy = ady / alen;
  const cross = Math.abs(ux * (bdy / blen) - uy * (bdx / blen));
  if (cross > 0.04) return 0;
  const nx = -uy;
  const ny = ux;
  const d1 = Math.abs((b1.x - a1.x) * nx + (b1.y - a1.y) * ny);
  const d2 = Math.abs((b2.x - a1.x) * nx + (b2.y - a1.y) * ny);
  if (d1 > tol || d2 > tol) return 0;
  const t0 = 0;
  const t1 = alen;
  const s0 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
  const s1 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
  return Math.max(0, Math.min(t1, Math.max(s0, s1)) - Math.max(t0, Math.min(s0, s1)));
}

function sharedBoundaryLength(a: Pt[], b: Pt[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      total += edgeOverlapLength(a1, a2, b[j], b[(j + 1) % b.length]);
    }
  }
  return total;
}

function candidateCentroid(c: PanelCandidate): Pt {
  return ringCentroid(c.polygon);
}

function distancePointToPoly(pt: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2)) : 0;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    best = Math.min(best, Math.hypot(pt.x - px, pt.y - py));
  }
  return best;
}

function ringCentroid(poly: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
}

function cleanPolygon(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of poly) {
    const q = { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - q.x, prev.y - q.y) < 0.05) continue;
    out.push(q);
  }
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 0.05) {
    out.pop();
  }
  return out;
}

function splitCompoundRings(points: Pt[]): Pt[][] {
  const key = (p: Pt) => `${p.x.toFixed(3)}_${p.y.toFixed(3)}`;
  const firstAt = new Map<string, number>();
  const rings: Pt[][] = [];
  const seenRing = new Set<string>();

  for (let i = 0; i < points.length; i++) {
    const k = key(points[i]);
    const start = firstAt.get(k);
    if (start === undefined) {
      firstAt.set(k, i);
      continue;
    }
    if (i - start < 3) continue;
    const ring = cleanPolygon(points.slice(start, i));
    if (ring.length < 3 || polygonArea(ring) < 1) continue;
    const canonical = panelIdFromPolygon(polygonFromLoop(ring));
    if (seenRing.has(canonical)) continue;
    seenRing.add(canonical);
    rings.push(ring);
  }

  // Loops CAD importados às vezes chegam como caminhos compostos: dois ou mais
  // contornos simples costurados por um trecho de vinco longo. Esse trecho NÃO
  // é painel, é hinge; manter o caminho composto cria uma face impossível e o
  // 3D dobra como se corte fosse vinco. Quando achamos 2+ anéis fechados reais,
  // usamos os anéis simples e descartamos a costura artificial.
  return rings.length >= 2 ? rings : [points];
}

/** Distância de ponto P à reta infinita do eixo. */
function pointAxisDist(p: Pt, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  // Componente perpendicular (normal = (-dy, dx))
  const nx = -dy, ny = dx;
  return Math.abs((p.x - ox) * nx + (p.y - oy) * ny);
}

/** Projeção do ponto na direção do eixo, em coordenada paramétrica. */
function projOnAxis(p: Pt, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  return (p.x - ox) * dx + (p.y - oy) * dy;
}

/** Range paramétrico do span do eixo. */
function axisSpanRange(axis: StructuralFoldAxis): [number, number] {
  const ta = projOnAxis(axis.span.a, axis);
  const tb = projOnAxis(axis.span.b, axis);
  return ta <= tb ? [ta, tb] : [tb, ta];
}

function signedSide(p: Pt, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  return (p.x - ox) * -dy + (p.y - oy) * dx;
}

function lineIntersection(a: Pt, b: Pt, axis: StructuralFoldAxis): Pt | null {
  const sa = signedSide(a, axis);
  const sb = signedSide(b, axis);
  const den = sa - sb;
  if (Math.abs(den) < 1e-9) return null;
  const t = sa / den;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function clipByAxis(poly: Pt[], axis: StructuralFoldAxis, keepPositive: boolean, tolMm: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = signedSide(a, axis);
    const sb = signedSide(b, axis);
    const ina = keepPositive ? sa >= -tolMm : sa <= tolMm;
    const inb = keepPositive ? sb >= -tolMm : sb <= tolMm;
    if (ina && inb) {
      out.push(b);
    } else if (ina && !inb) {
      const p = lineIntersection(a, b, axis);
      if (p) out.push(p);
    } else if (!ina && inb) {
      const p = lineIntersection(a, b, axis);
      if (p) out.push(p);
      out.push(b);
    }
  }
  return cleanPolygon(out);
}

function axisActuallyCrossesPanel(poly: Pt[], axis: StructuralFoldAxis, tolMm: number): boolean {
  let pos = false;
  let neg = false;
  const hits: Pt[] = [];
  const [sLo, sHi] = axisSpanRange(axis);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = signedSide(a, axis);
    const sb = signedSide(b, axis);
    if (sa > tolMm) pos = true;
    if (sa < -tolMm) neg = true;
    if (sa * sb > 0) continue;
    const p = Math.abs(sa) <= tolMm ? a : Math.abs(sb) <= tolMm ? b : lineIntersection(a, b, axis);
    if (!p) continue;
    const t = projOnAxis(p, axis);
    if (t < sLo - tolMm || t > sHi + tolMm) continue;
    if (!hits.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 0.2)) hits.push(p);
  }
  if (!pos || !neg) return false;
  // Quando o vinco físico começa/termina em outro vinco interno (caso comum em
  // RSC/FEFCO), o span pode tocar só uma borda externa do polígono atual. Ainda
  // assim a linha estrutural divide o corpo rígido; aceitar hits da reta
  // infinita evita depender de face bruta do kernel e mantém a divisão na
  // Camada 2, sem alterar o DielineModel.
  if (hits.length < 2) {
    const lineHits: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const sa = signedSide(a, axis);
      const sb = signedSide(b, axis);
      if (sa * sb > 0) continue;
      const p = Math.abs(sa) <= tolMm ? a : Math.abs(sb) <= tolMm ? b : lineIntersection(a, b, axis);
      if (!p) continue;
      if (!lineHits.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 0.2)) lineHits.push(p);
    }
    if (lineHits.length >= 2) hits.push(...lineHits);
  }
  if (hits.length < 2) return false;
  let maxHitDist = 0;
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      maxHitDist = Math.max(maxHitDist, Math.hypot(hits[i].x - hits[j].x, hits[i].y - hits[j].y));
    }
  }
  return maxHitDist >= 2.0;
}

function splitPanelByAxis(panel: PanelCandidate, axis: StructuralFoldAxis, tolMm: number): PanelCandidate[] | null {
  const poly = panel.polygon;
  if (!axisActuallyCrossesPanel(poly, axis, tolMm)) return null;
  const plus = clipByAxis(poly, axis, true, tolMm);
  const minus = clipByAxis(poly, axis, false, tolMm);
  if (plus.length < 3 || minus.length < 3) return null;
  const plusArea = polygonArea(plus);
  const minusArea = polygonArea(minus);
  if (plusArea < 1 || minusArea < 1) return null;
  const originalArea = Math.max(1, panel.area);
  if ((plusArea + minusArea) / originalArea < 0.92 || (plusArea + minusArea) / originalArea > 1.08) return null;

  const make = (polygon: Pt[], side: "a" | "b", index: number): PanelCandidate => {
    const oriented = polygonFromLoop(polygon);
    const holes = (panel.holes ?? []).filter((hole) => pointInPolygon(ringCentroid(hole), oriented));
    const id = `${panelIdFromPolygon(oriented)}-${side}-${index}`;
    return {
      ...panel,
      id,
      label: panel.label,
      polygon: oriented,
      holes,
      touchingFoldAxisIds: [],
      boundaryEdgeIds: [],
      bbox: candidateBBox(oriented),
      area: polygonArea(oriented),
    };
  };

  return [make(plus, "a", 0), make(minus, "b", 1)];
}

function splitPanelsByInteriorFoldAxes(
  panels: PanelCandidate[],
  axes: StructuralFoldAxis[],
  tolMm: number,
): PanelCandidate[] {
  let current = panels;
  const sortedAxes = [...axes].sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));
  for (const axis of sortedAxes) {
    const next: PanelCandidate[] = [];
    let changed = false;
    for (const panel of current) {
      const split = splitPanelByAxis(panel, axis, tolMm);
      if (split) {
        next.push(...split);
        changed = true;
      } else {
        next.push(panel);
      }
    }
    if (changed) current = next;
  }
  return current.map((panel, index) => ({
    ...panel,
    faceId: index,
    label: deriveLabel(index, panel.polygon),
    sourceFaceIds: panel.sourceFaceIds.length > 0 ? panel.sourceFaceIds : [String(panel.faceId)],
  }));
}

/** Verifica se uma aresta de painel (P→Q) coincide com algum trecho do eixo. */
function edgeMatchesAxis(
  p: Pt, q: Pt,
  axis: StructuralFoldAxis,
  perpTolMm: number,
): boolean {
  if (pointAxisDist(p, axis) > perpTolMm) return false;
  if (pointAxisDist(q, axis) > perpTolMm) return false;
  const tp = projOnAxis(p, axis);
  const tq = projOnAxis(q, axis);
  const [lo, hi] = tp <= tq ? [tp, tq] : [tq, tp];
  const [sLo, sHi] = axisSpanRange(axis);
  // Sobreposição mínima entre a aresta do painel e o span do eixo: 0.6 mm.
  const ovLo = Math.max(lo, sLo);
  const ovHi = Math.min(hi, sHi);
  return ovHi - ovLo >= 0.6;
}

function deriveLabel(panelIndex: number, poly: Pt[]): string {
  const bb = polygonBBox(poly);
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  return `Painel ${panelIndex + 1} (${w.toFixed(0)}×${h.toFixed(0)})`;
}

function edgeIdFor(p: Pt, q: Pt): string {
  const a = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const b = `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function finalizeCandidateGeometry(candidate: PanelCandidate): PanelCandidate {
  const boundaryEdgeIds = candidate.polygon.map((p, i) => edgeIdFor(p, candidate.polygon[(i + 1) % candidate.polygon.length]));
  return { ...candidate, boundaryEdgeIds, bbox: candidateBBox(candidate.polygon), area: polygonArea(candidate.polygon) };
}

function foldOverlapForCandidate(candidate: PanelCandidate, axis: StructuralFoldAxis, tolMm: number): number {
  let total = 0;
  const poly = candidate.polygon;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (!edgeMatchesAxis(p, q, axis, tolMm)) continue;
    const tp = projOnAxis(p, axis);
    const tq = projOnAxis(q, axis);
    const [lo, hi] = tp <= tq ? [tp, tq] : [tq, tp];
    const [sLo, sHi] = axisSpanRange(axis);
    total += Math.max(0, Math.min(hi, sHi) - Math.max(lo, sLo));
  }
  return total;
}

function featureTypeFromReason(reason: RejectReason): AbsorbedFeatureType {
  switch (reason) {
    case "internal_cut_feature": return "internal_cut_feature";
    case "tongue_lock_feature": return "tongue_lock";
    case "slot_feature": return "slot";
    case "hinge_too_small": return "notch";
    case "no_structural_hinge": return "local_lock_feature";
    default: return "decorative_fragment";
  }
}

function legacyFeatureKind(type: AbsorbedFeatureType): FeatureKind {
  switch (type) {
    case "internal_cut_feature": return "internal_cut_feature";
    case "slot": return "slot_feature";
    case "tongue_lock":
    case "local_lock_feature": return "lock_feature";
    default: return "decorative_or_local_flap";
  }
}

function filterStructuralPanels(
  candidates: PanelCandidate[],
  axes: StructuralFoldAxis[],
  tolMm: number,
): { structuralPanels: StructuralPanel[]; absorbedFeatures: AbsorbedFeature[]; report: StructuralReport } {
  if (candidates.length === 0) {
    const report: StructuralReport = { candidates: [], rejected: [], structural: [], summary: { candidatesCount: 0, rejectedCount: 0, structuralCount: 0, rootArea: 0 } };
    return { structuralPanels: [], absorbedFeatures: [], report };
  }

  const axisById = new Map(axes.map((axis) => [axis.id, axis]));
  const rootArea = Math.max(...candidates.map((candidate) => candidate.area));
  const support = new Map<string, { maxHingeLen: number; totalCreaseLen: number; creaseNeighbors: number }>();
  const touchingByAxis = new Map<string, PanelCandidate[]>();

  for (const candidate of candidates) {
    let maxHingeLen = 0;
    let totalCreaseLen = 0;
    for (const axisId of candidate.touchingFoldAxisIds) {
      const axis = axisById.get(axisId);
      if (!axis) continue;
      const overlap = foldOverlapForCandidate(candidate, axis, tolMm);
      if (overlap <= 0) continue;
      maxHingeLen = Math.max(maxHingeLen, overlap);
      totalCreaseLen += overlap;
      const arr = touchingByAxis.get(axisId) ?? [];
      arr.push(candidate);
      touchingByAxis.set(axisId, arr);
    }
    support.set(candidate.id, { maxHingeLen, totalCreaseLen, creaseNeighbors: 0 });
  }

  for (const [axisId, list] of touchingByAxis) {
    const axis = axisById.get(axisId);
    if (!axis) continue;
    for (const candidate of list) {
      let neighbors = 0;
      const cSide = signedSide(candidateCentroid(candidate), axis);
      for (const other of list) {
        if (other.id === candidate.id) continue;
        const oSide = signedSide(candidateCentroid(other), axis);
        if (cSide * oSide < 0) neighbors++;
      }
      const s = support.get(candidate.id)!;
      s.creaseNeighbors = Math.max(s.creaseNeighbors, neighbors);
    }
  }

  const rejectedRaw: Array<{ candidate: PanelCandidate; reason: RejectReason; hostHint: string | null }> = [];
  const structuralRaw: PanelCandidate[] = [];

  const pickContainmentHost = (candidate: PanelCandidate): string | null => {
    let host: string | null = null;
    let bestArea = Infinity;
    for (const other of candidates) {
      if (other.id === candidate.id || other.area <= candidate.area * 1.02) continue;
      if (!polygonStrictlyContainsPolygon(other.polygon, candidate.polygon)) continue;
      if (other.area < bestArea) { bestArea = other.area; host = other.id; }
    }
    return host;
  };

  for (const candidate of candidates) {
    const s = support.get(candidate.id)!;
    const minDim = Math.max(1, Math.min(candidate.bbox.w, candidate.bbox.h));
    const isRoot = candidate.area >= rootArea * 0.999;
    const containmentHost = pickContainmentHost(candidate);
    const isSmallLocal = candidate.area < rootArea * 0.025 && minDim <= Math.max(18, Math.sqrt(rootArea) * 0.08);
    const isThreadLike = minDim <= Math.max(6, Math.sqrt(candidate.area) * 0.35) && candidate.area < rootArea * 0.04;
    const isBridge = s.creaseNeighbors >= 2 && !isSmallLocal && !isThreadLike;
    let reason: RejectReason | null = null;

    if (!isRoot) {
      if (containmentHost) reason = "internal_cut_feature";
      else if (isSmallLocal && s.maxHingeLen > 0) reason = "tongue_lock_feature";
      else if (isSmallLocal) reason = "slot_feature";
      else if (isThreadLike && s.maxHingeLen < Math.max(6, minDim * 0.5)) reason = "decorative_local_fragment";
      else if (!isBridge && s.maxHingeLen <= 0) reason = "no_structural_hinge";
      else if (!isBridge && s.maxHingeLen < Math.max(6, minDim * 0.18) && candidate.area < rootArea * 0.015) reason = "hinge_too_small";
    }

    if (reason) rejectedRaw.push({ candidate, reason, hostHint: containmentHost });
    else structuralRaw.push(candidate);
  }

  if (structuralRaw.length === 0) {
    const largest = [...candidates].sort((a, b) => b.area - a.area)[0];
    structuralRaw.push(largest);
    for (let i = rejectedRaw.length - 1; i >= 0; i--) {
      if (rejectedRaw[i].candidate.id === largest.id) rejectedRaw.splice(i, 1);
    }
  }

  const structuralIds = new Set(structuralRaw.map((candidate) => candidate.id));
  const resolveHost = (feature: PanelCandidate, hostHint: string | null): string => {
    if (hostHint && structuralIds.has(hostHint)) return hostHint;
    let best: { id: string; score: number } | null = null;
    for (const host of structuralRaw) {
      if (host.id === feature.id) continue;
      let score = sharedBoundaryLength(host.polygon, feature.polygon) * 1000;
      if (polygonStrictlyContainsPolygon(host.polygon, feature.polygon)) score += 500000;
      const d = distancePointToPoly(candidateCentroid(feature), host.polygon);
      score += Math.max(0, 1000 - d);
      score += Math.min(host.area, rootArea) * 0.0001;
      if (!best || score > best.score) best = { id: host.id, score };
    }
    return best?.id ?? structuralRaw[0].id;
  };

  const absorbedFeatures: any[] = rejectedRaw.map(({ candidate, reason, hostHint }) => ({
    id: `feature-${candidate.id}`,
    type: featureTypeFromReason(reason),
    polygon: candidate.polygon,
    holes: candidate.holes,
    ownerPanelId: resolveHost(candidate, hostHint),
    sourceCandidateIds: [candidate.id],
  }));

  const absorbedByOwner = new Map<string, string[]>();
  for (const feature of absorbedFeatures) {
    const arr = absorbedByOwner.get(feature.ownerPanelId) ?? [];
    arr.push(feature.id);
    absorbedByOwner.set(feature.ownerPanelId, arr);
  }

  const structuralPanels: any[] = structuralRaw.map((candidate, index) => ({
    id: candidate.id,
    label: candidate.label,
    faceId: index,
    polygon: candidate.polygon,
    holes: [
      ...candidate.holes,
      ...absorbedFeatures
        .filter((feature) => feature.ownerPanelId === candidate.id && feature.type === "internal_cut_feature")
        .map((feature) => feature.polygon),
    ],
    foldAxisIds: [...candidate.touchingFoldAxisIds],
    hingeAxisIds: [...candidate.touchingFoldAxisIds],
    bbox: polygonBBox(candidate.polygon),
    area: candidate.area,
    absorbedFeatureIds: absorbedByOwner.get(candidate.id) ?? [],
    sourceCandidateIds: [candidate.id],
  }));

  const faceIdByCandidate = new Map(structuralPanels.map((panel) => [panel.sourceCandidateIds[0], panel.faceId]));
  for (const axis of axes) {
    axis.connectedPanelCandidateIds = candidates
      .filter((candidate) => candidate.touchingFoldAxisIds.includes(axis.id))
      .map((candidate) => candidate.id);
    axis.connectedFaceIds = structuralRaw
      .filter((candidate) => candidate.touchingFoldAxisIds.includes(axis.id))
      .map((candidate) => faceIdByCandidate.get(candidate.id))
      .filter((id): id is number => id !== undefined);
  }

  const report: StructuralReport = {
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      area: candidate.area,
      bbox: { w: candidate.bbox.w, h: candidate.bbox.h },
      maxHingeLen: support.get(candidate.id)?.maxHingeLen ?? 0,
      totalCreaseLen: support.get(candidate.id)?.totalCreaseLen ?? 0,
      creaseNeighbors: support.get(candidate.id)?.creaseNeighbors ?? 0,
    })),
    rejected: rejectedRaw.map(({ candidate, reason }, i) => ({
      panel: {
        id: candidate.id,
        label: candidate.label,
        polygon: candidate.polygon,
        holes: candidate.holes,
        pipelinePanelId: candidate.id,
      },
      reason,
      featureKind: legacyFeatureKind(absorbedFeatures[i].type),
      attachedTo: absorbedFeatures[i].ownerPanelId,
      area: candidate.area,
    })),
    structural: structuralPanels.map((panel) => ({
      id: panel.id,
      label: panel.label,
      area: panel.area,
      maxHingeLen: support.get(panel.id)?.maxHingeLen ?? 0,
      absorbedFeatureIds: panel.absorbedFeatureIds,
    })),
    summary: {
      candidatesCount: candidates.length,
      rejectedCount: rejectedRaw.length,
      structuralCount: structuralPanels.length,
      rootArea,
    },
  };
  return { structuralPanels, absorbedFeatures, report };
}

export interface PanelBuildResult {
  panelCandidates: PanelCandidate[];
  structuralPanels: StructuralPanel[];
  absorbedFeatures: AbsorbedFeature[];
  panels: StructuralPanel[];
  /** Eixos mutados in-place com connectedFaceIds preenchidos. */
  axes: StructuralFoldAxis[];
  report: StructuralReport;
}

export function buildPanels(
  topology: ClassifiedTopology,
  axes: StructuralFoldAxis[],
  geometry: NormalizedGeometry,
): PanelBuildResult {
  const perpTolMm = geometry.tolerances.perpendicularTolMm;
  let candidates: PanelCandidate[] = [];
  const edgeById = new Map(topology.edges.map((edge) => [edge.id, edge]));

  topology.faces.forEach((face: Face) => {
    const rawRings = splitCompoundRings(face.outer.points);
    for (const rawRing of rawRings) {
      const outerPts = polygonFromLoop(rawRing);
      const holes = face.holes
        .map((h) => holeFromLoop(h.points))
        .filter((hole) => pointInPolygon(ringCentroid(hole), outerPts));
      const id = panelIdFromPolygon(outerPts);
      const bbox = candidateBBox(outerPts);
      const area = polygonArea(outerPts);
      const sourceSegmentIds = Array.from(new Set(face.outer.edgeIds
        .map((edgeId) => edgeById.get(edgeId)?.sourceSegIdx)
        .filter((idx): idx is number => idx !== undefined)
        .map((idx) => `normalized-seg-${idx}`)));
      const boundaryRoles = Array.from(new Set(face.outer.edgeIds
        .map((edgeId) => edgeById.get(edgeId)?.roleFinal)
        .filter((role): role is PanelCandidate["boundaryRoles"][number] => Boolean(role))));
      const panel: PanelCandidate = {
        id,
        label: deriveLabel(candidates.length, outerPts),
        faceId: face.id,
        polygon: outerPts,
        holes,
        boundaryEdgeIds: [],
        boundaryRoles,
        touchingFoldAxisIds: [],
        sourceSegmentIds,
        sourceFaceIds: [String(face.id)],
        adjacentRegionIds: [],
        structuralScore: 0,
        featureScore: 0,
        bbox,
        area,
      };
      candidates.push(panel);
    }
  });

  // ARQUITETURA V3 — ORDEM OBRIGATÓRIA:
  //
  //   1) materializa PanelCandidate brutos (faces do kernel) — JÁ FEITO acima.
  //   2) calcula touchingFoldAxisIds (qual eixo geométrico toca qual candidato).
  //   3) StructuralDecomposition: decide StructuralPanel vs AbsorbedFeature.
  //      É ali que cada eixo recebe role definitivo (structural_fold_axis,
  //      local_crease, local_lock_crease, absorbed_feature_axis, unknown).
  //   4) SplitStructuralPanelsByValidatedAxes: APÓS a decomposição, divide
  //      painéis estruturais apenas por eixos cujo role === "structural_fold_axis".
  //
  // PROIBIDO: cortar candidates por qualquer eixo antes do passo 3. Isso é o
  // que promovia crease local/trava/slot a divisor estrutural global e
  // produzia painéis falsos em todas as facas com features absorvidas.
  candidates = candidates.map(finalizeCandidateGeometry);

  // Passo 2: para cada eixo, identifica painéis cujo boundary coincide com
  // algum trecho do eixo (varredura por aresta do polígono).
  for (const axis of axes) {
    const connected = new Set<string>();
    for (const candidate of candidates) {
      const poly = candidate.polygon;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        if (edgeMatchesAxis(p, q, axis, perpTolMm)) {
          connected.add(candidate.id);
          if (!candidate.touchingFoldAxisIds.includes(axis.id)) candidate.touchingFoldAxisIds.push(axis.id);
          break;
        }
      }
    }
    axis.connectedPanelCandidateIds = Array.from(connected);
  }

  // Passo 3: decomposição estrutural — única autoridade para decidir
  // StructuralPanel vs AbsorbedFeature e atribuir role aos eixos.
  const decomposition = buildStructuralDecomposition(candidates, axes, perpTolMm);

  // Passo 4: SOMENTE AGORA cortamos painéis estruturais por eixos validados
  // como `structural_fold_axis`. Eixos de feature local/slot/trava NÃO podem
  // dividir o corpo principal.
  const splitTolMm = Math.max(0.12, perpTolMm);
  const splitResult = splitStructuralPanelsByValidatedAxes(

    decomposition.structuralPanels,
    axes,
    decomposition.absorbedFeatures,
    splitTolMm,
  );

  // Recalcula conexões eixo↔painel-final (faceIds reindexados após o split).
  const finalPanels = splitResult.structuralPanels;
  for (const axis of axes) {
    const newTouching: string[] = [];
    const newFaceIds: number[] = [];
    for (const panel of finalPanels) {
      let touches = false;
      const poly = panel.polygon;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        if (edgeMatchesAxis(p, q, axis, perpTolMm)) { touches = true; break; }
      }
      if (touches) {
        newTouching.push(panel.id);
        newFaceIds.push(panel.faceId);
        if (!panel.foldAxisIds.includes(axis.id)) panel.foldAxisIds.push(axis.id);
        if (!panel.hingeAxisIds.includes(axis.id)) panel.hingeAxisIds.push(axis.id);
      }
    }
    if (axis.role === "structural_fold_axis") {
      axis.connectedStructuralPanelIds = newTouching;
      axis.connectedFaceIds = newFaceIds;
    }
  }

  setLastStructuralReport(decomposition.report);

  return {
    panelCandidates: candidates,
    structuralPanels: finalPanels,
    absorbedFeatures: decomposition.absorbedFeatures,
    panels: finalPanels,
    axes,
    report: decomposition.report,
  };
}

