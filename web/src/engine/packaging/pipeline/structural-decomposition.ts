// ============================================================================
// Stage 4 V3 — Structural Decomposition
// ----------------------------------------------------------------------------
// Única camada que decide se uma região topológica é painel estrutural real ou
// feature local absorvida. KIND continua separado de ROLE: um crease local pode
// existir visualmente sem virar hinge global.
// ============================================================================

import type { Pt } from "../dieline-types";
import {
  setLastStructuralReport,
  type FeatureKind,
  type RejectReason,
  type StructuralReport,
} from "../structural-panels";
import type { AbsorbedFeature, AbsorbedFeatureType, PanelCandidate, StructuralFoldAxis, StructuralPanel } from "./types";
import { axisCrossesPanelInterior } from "./structural-panel-split";


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

function fullBBox(poly: Pt[]): PanelCandidate["bbox"] {
  const bb = polygonBBox(poly);
  return { ...bb, x: bb.minX, y: bb.minY, w: bb.maxX - bb.minX, h: bb.maxY - bb.minY };
}

function ringCentroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
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
    if (crosses && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y + 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

function polygonStrictlyContainsPolygon(outer: Pt[], inner: Pt[]): boolean {
  const o = polygonBBox(outer);
  const i = polygonBBox(inner);
  if (i.minX < o.minX + 0.35 || i.maxX > o.maxX - 0.35 || i.minY < o.minY + 0.35 || i.maxY > o.maxY - 0.35) return false;
  if (!pointInPolygon(ringCentroid(inner), outer)) return false;
  return inner.every((p) => pointInPolygon(p, outer));
}

function edgeOverlapLength(a1: Pt, a2: Pt, b1: Pt, b2: Pt, tol = 0.45): number {
  const adx = a2.x - a1.x, ady = a2.y - a1.y;
  const bdx = b2.x - b1.x, bdy = b2.y - b1.y;
  const alen = Math.hypot(adx, ady), blen = Math.hypot(bdx, bdy);
  if (alen < 1e-6 || blen < 1e-6) return 0;
  const ux = adx / alen, uy = ady / alen;
  const cross = Math.abs(ux * (bdy / blen) - uy * (bdx / blen));
  if (cross > 0.04) return 0;
  const nx = -uy, ny = ux;
  if (Math.abs((b1.x - a1.x) * nx + (b1.y - a1.y) * ny) > tol) return 0;
  if (Math.abs((b2.x - a1.x) * nx + (b2.y - a1.y) * ny) > tol) return 0;
  const s0 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
  const s1 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
  return Math.max(0, Math.min(alen, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1)));
}

function sharedBoundaryLength(a: Pt[], b: Pt[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) total += edgeOverlapLength(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]);
  return total;
}

function distancePointToPoly(pt: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(pt.x - (a.x + dx * t), pt.y - (a.y + dy * t)));
  }
  return best;
}

function signedSide(p: Pt, axis: StructuralFoldAxis): number {
  return (p.x - axis.axisLine.origin.x) * -axis.axisLine.direction.y + (p.y - axis.axisLine.origin.y) * axis.axisLine.direction.x;
}

function pointAxisDist(p: Pt, axis: StructuralFoldAxis): number {
  return Math.abs(signedSide(p, axis));
}

function projOnAxis(p: Pt, axis: StructuralFoldAxis): number {
  return (p.x - axis.axisLine.origin.x) * axis.axisLine.direction.x + (p.y - axis.axisLine.origin.y) * axis.axisLine.direction.y;
}

function axisSpanRange(axis: StructuralFoldAxis): [number, number] {
  const a = projOnAxis(axis.span.a, axis), b = projOnAxis(axis.span.b, axis);
  return a <= b ? [a, b] : [b, a];
}

function edgeMatchesAxis(p: Pt, q: Pt, axis: StructuralFoldAxis, tolMm: number): boolean {
  if (pointAxisDist(p, axis) > tolMm || pointAxisDist(q, axis) > tolMm) return false;
  const [lo, hi] = [Math.min(projOnAxis(p, axis), projOnAxis(q, axis)), Math.max(projOnAxis(p, axis), projOnAxis(q, axis))];
  const [sLo, sHi] = axisSpanRange(axis);
  return Math.min(hi, sHi) - Math.max(lo, sLo) >= 0.6;
}

function foldOverlapForCandidate(candidate: PanelCandidate, axis: StructuralFoldAxis, tolMm: number): number {
  let total = 0;
  for (let i = 0; i < candidate.polygon.length; i++) {
    const p = candidate.polygon[i], q = candidate.polygon[(i + 1) % candidate.polygon.length];
    if (!edgeMatchesAxis(p, q, axis, tolMm)) continue;
    const [lo, hi] = [Math.min(projOnAxis(p, axis), projOnAxis(q, axis)), Math.max(projOnAxis(p, axis), projOnAxis(q, axis))];
    const [sLo, sHi] = axisSpanRange(axis);
    total += Math.max(0, Math.min(hi, sHi) - Math.max(lo, sLo));
  }
  return total;
}

function candidateSideForAxis(candidate: PanelCandidate, axis: StructuralFoldAxis): number {
  const cSide = signedSide(ringCentroid(candidate.polygon), axis);
  if (Math.abs(cSide) > 0.05) return cSide;
  let sum = 0;
  let count = 0;
  for (const p of candidate.polygon) {
    const side = signedSide(p, axis);
    if (Math.abs(side) <= 0.25) continue;
    sum += side;
    count++;
  }
  return count > 0 ? sum / count : cSide;
}

function axisSpanEndsOnCandidateBoundary(candidate: PanelCandidate, axis: StructuralFoldAxis, tolMm: number): boolean {
  const boundaryTol = Math.max(tolMm * 4, 0.6);
  return distancePointToPoly(axis.span.a, candidate.polygon) <= boundaryTol && distancePointToPoly(axis.span.b, candidate.polygon) <= boundaryTol;
}

function hasOppositeStructuralPair(axis: StructuralFoldAxis, candidates: PanelCandidate[], tolMm: number): boolean {
  const contacts = candidates
    .map((candidate) => ({ candidate, overlap: foldOverlapForCandidate(candidate, axis, tolMm), side: candidateSideForAxis(candidate, axis) }))
    .filter((contact) => contact.overlap >= 0.6 && Math.abs(contact.side) > 0.05);
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      if (contacts[i].side * contacts[j].side < 0) return true;
    }
  }
  return false;
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

export interface RegionDecisionContext {
  rootArea: number;
  minDim: number;
  maxHingeLen: number;
  totalCreaseLen: number;
  creaseNeighbors: number;
  containmentHost: string | null;
}

export function classifyRegionCandidate(region: PanelCandidate, context: RegionDecisionContext): {
  classification: "structural-panel" | "absorbed-feature";
  reason: RejectReason | "structural_score_pass" | "largest_root_panel";
  structuralScore: number;
  featureScore: number;
} {
  const isRoot = region.area >= context.rootArea * 0.999;
  const structuralPositive = [
    region.area >= context.rootArea * 0.025,
    context.minDim >= Math.max(6, Math.sqrt(context.rootArea) * 0.035),
    context.maxHingeLen >= Math.max(6, context.minDim * 0.18),
    context.creaseNeighbors >= 1,
    context.totalCreaseLen >= context.maxHingeLen,
    !context.containmentHost,
  ].filter(Boolean).length;
  const negativeFeature = [
    region.area < context.rootArea * 0.025,
    context.maxHingeLen > 0 && context.maxHingeLen < Math.max(6, context.minDim * 0.18),
    !!context.containmentHost,
    context.minDim <= Math.max(6, Math.sqrt(region.area) * 0.35),
    context.creaseNeighbors === 0,
  ].filter(Boolean).length;
  const structuralScore = structuralPositive / 6;
  const featureScore = negativeFeature / 5;

  if (isRoot) return { classification: "structural-panel", reason: "largest_root_panel", structuralScore: 1, featureScore };
  if (context.containmentHost) return { classification: "absorbed-feature", reason: "internal_cut_feature", structuralScore, featureScore: Math.max(featureScore, 0.9) };

  // REGRA "SE TEM VINCO, DOBRA": se a abinha tem um vinco real ligando-a ao
  // painel pai (comprimento do hinge ≥ 50% da menor dimensão da abinha, com
  // piso de 8 mm), ela NUNCA é absorvida. Travinhas e abas de canto com vinco
  // diagonal de trava (ex.: 17,68 mm a 45°) caíam aqui e ficavam coladas no
  // painel pai sem dobrar. Mantém todas as demais heurísticas intactas.
  const hasRealFoldCrease = context.maxHingeLen >= Math.max(8, context.minDim * 0.5);
  if (hasRealFoldCrease) {
    return { classification: "structural-panel", reason: "structural_score_pass", structuralScore: Math.max(structuralScore, 0.6), featureScore };
  }

  const isSmallLocal = region.area < context.rootArea * 0.025 && context.minDim <= Math.max(18, Math.sqrt(context.rootArea) * 0.08);
  if (isSmallLocal && context.maxHingeLen > 0) return { classification: "absorbed-feature", reason: "tongue_lock_feature", structuralScore, featureScore: Math.max(featureScore, 0.85) };
  if (isSmallLocal) return { classification: "absorbed-feature", reason: "slot_feature", structuralScore, featureScore: Math.max(featureScore, 0.85) };
  if (region.area < context.rootArea * 0.015 && context.creaseNeighbors <= 1) return { classification: "absorbed-feature", reason: "decorative_local_fragment", structuralScore, featureScore: Math.max(featureScore, 0.85) };
  if (region.area < context.rootArea * 0.04 && context.creaseNeighbors <= 1 && context.maxHingeLen < Math.max(8, context.minDim * 0.65)) return { classification: "absorbed-feature", reason: "tongue_lock_feature", structuralScore, featureScore: Math.max(featureScore, 0.82) };
  const isThreadLike = context.minDim <= Math.max(6, Math.sqrt(region.area) * 0.35) && region.area < context.rootArea * 0.04;
  if (isThreadLike && context.maxHingeLen < Math.max(6, context.minDim * 0.5)) return { classification: "absorbed-feature", reason: "decorative_local_fragment", structuralScore, featureScore: Math.max(featureScore, 0.8) };
  const isBridge = context.creaseNeighbors >= 2 && !isSmallLocal && !isThreadLike;
  if (!isBridge && context.maxHingeLen <= 0) return { classification: "absorbed-feature", reason: "no_structural_hinge", structuralScore, featureScore: Math.max(featureScore, 0.75) };
  if (!isBridge && context.maxHingeLen < Math.max(6, context.minDim * 0.18) && region.area < context.rootArea * 0.015) return { classification: "absorbed-feature", reason: "hinge_too_small", structuralScore, featureScore: Math.max(featureScore, 0.8) };
  return { classification: "structural-panel", reason: "structural_score_pass", structuralScore: Math.max(structuralScore, 0.55), featureScore };
}

export function buildStructuralDecomposition(candidates: PanelCandidate[], axes: StructuralFoldAxis[], tolMm: number): {
  structuralPanels: StructuralPanel[];
  absorbedFeatures: AbsorbedFeature[];
  report: StructuralReport;
} {
  if (candidates.length === 0) {
    const report: StructuralReport = { candidates: [], rejected: [], structural: [], summary: { candidatesCount: 0, rejectedCount: 0, structuralCount: 0, rootArea: 0 } };
    setLastStructuralReport(report);
    return { structuralPanels: [], absorbedFeatures: [], report };
  }

  const axisById = new Map(axes.map((axis) => [axis.id, axis]));
  const rootArea = Math.max(...candidates.map((candidate) => candidate.area));

  // -------------------------------------------------------------------------
  // DOMINANT FOLD DIRECTIONS — descoberta geométrica, sem hardcode.
  // Uma caixa real dobra ao longo de 1-3 direções (eixos L/H/P). Clusterizamos
  // todas as direções de eixo (mod 180°) ponderadas por comprimento; bins com
  // peso acumulado relevante são "direções dominantes". Eixos fora dessas
  // direções (tipicamente diagonais de trava) NUNCA são structural_fold_axis.
  // -------------------------------------------------------------------------
  const BIN_DEG = 5;
  const bins = new Map<number, number>(); // bin → comprimento total
  let totalLen = 0;
  for (const axis of axes) {
    const angDeg = (Math.atan2(axis.axisLine.direction.y, axis.axisLine.direction.x) * 180) / Math.PI;
    const norm = ((angDeg % 180) + 180) % 180; // 0..180
    const bin = Math.round(norm / BIN_DEG) * BIN_DEG;
    bins.set(bin, (bins.get(bin) ?? 0) + axis.length);
    totalLen += axis.length;
  }
  const sortedBins = [...bins.entries()].sort((a, b) => b[1] - a[1]);
  const dominantBins = new Set<number>();
  let acc = 0;
  for (const [bin, len] of sortedBins) {
    if (len >= totalLen * 0.12 || dominantBins.size < 2) {
      dominantBins.add(bin);
      acc += len;
    }
    if (acc >= totalLen * 0.85 && dominantBins.size >= 2) break;
    if (dominantBins.size >= 3) break;
  }
  const isOnDominantDirection = (axis: StructuralFoldAxis): boolean => {
    const angDeg = (Math.atan2(axis.axisLine.direction.y, axis.axisLine.direction.x) * 180) / Math.PI;
    const norm = ((angDeg % 180) + 180) % 180;
    for (const bin of dominantBins) {
      let d = Math.abs(norm - bin);
      if (d > 90) d = 180 - d;
      if (d <= BIN_DEG * 1.5) return true;
    }
    return false;
  };
  const axisDominantById = new Map<string, boolean>();
  for (const axis of axes) axisDominantById.set(axis.id, isOnDominantDirection(axis));

  const support = new Map<string, { maxHingeLen: number; maxDominantHingeLen: number; maxPairedHingeLen: number; totalCreaseLen: number; creaseNeighbors: number }>();
  const touchingByAxis = new Map<string, PanelCandidate[]>();

  for (const candidate of candidates) {
    let maxHingeLen = 0, maxDominantHingeLen = 0, totalCreaseLen = 0;
    for (const axisId of candidate.touchingFoldAxisIds) {
      const axis = axisById.get(axisId);
      if (!axis) continue;
      const overlap = foldOverlapForCandidate(candidate, axis, tolMm);
      if (overlap <= 0) continue;
      maxHingeLen = Math.max(maxHingeLen, overlap);
      if (axisDominantById.get(axisId)) maxDominantHingeLen = Math.max(maxDominantHingeLen, overlap);
      totalCreaseLen += overlap;
      const arr = touchingByAxis.get(axisId) ?? [];
      arr.push(candidate);
      touchingByAxis.set(axisId, arr);
    }
    support.set(candidate.id, { maxHingeLen, maxDominantHingeLen, maxPairedHingeLen: 0, totalCreaseLen, creaseNeighbors: 0 });
  }

  for (const [axisId, list] of touchingByAxis) {
    const axis = axisById.get(axisId);
    if (!axis) continue;
    for (const candidate of list) {
      let neighbors = 0;
      const cSide = candidateSideForAxis(candidate, axis);
      for (const other of list) if (other.id !== candidate.id && cSide * candidateSideForAxis(other, axis) < 0) neighbors++;
      const candidateSupport = support.get(candidate.id)!;
      candidateSupport.creaseNeighbors = Math.max(candidateSupport.creaseNeighbors, neighbors);
      if (neighbors > 0) candidateSupport.maxPairedHingeLen = Math.max(candidateSupport.maxPairedHingeLen, foldOverlapForCandidate(candidate, axis, tolMm));
    }
  }

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

  const rejectedRaw: Array<{ candidate: PanelCandidate; reason: RejectReason; hostHint: string | null; structuralScore: number; featureScore: number }> = [];
  const structuralRaw: Array<{ candidate: PanelCandidate; reason: string; structuralScore: number; featureScore: number }> = [];

  for (const candidate of candidates) {
    const s = support.get(candidate.id)!;
    const minDim = Math.max(1, Math.min(candidate.bbox.w, candidate.bbox.h));
    const containmentHost = pickContainmentHost(candidate);
    const decision = classifyRegionCandidate(candidate, { rootArea, minDim, maxHingeLen: s.maxHingeLen, totalCreaseLen: s.totalCreaseLen, creaseNeighbors: s.creaseNeighbors, containmentHost });

    // REGRA GEOMÉTRICA GLOBAL: se o candidato é pequeno-médio e a única dobra
    // que o conecta ao resto é fora das direções dominantes (diagonal de trava),
    // ele é uma orelha/trava de canto e deve ser absorvido na aba vizinha —
    // independente do score estrutural. Isso elimina painéis fantasma -a/-b
    // sem hardcode por faca, funcionando para qualquer dieline.
    //
    // EXCEÇÃO ("se é vinco, dobra"): se o hinge não-dominante é um vinco real
    // (>= 50% da menor dimensão da abinha, piso de 8 mm), preserva como painel
    // estrutural — abas com trava diagonal (ex.: 17,68 mm a 45°) dobram 90°
    // para encaixar, não são apenas decoração.
    const hasRealFoldCrease = s.maxHingeLen >= Math.max(8, minDim * 0.5);
    const isRootArea = candidate.area >= rootArea * 0.999;
    if (!isRootArea && !hasRealFoldCrease && decision.classification === "structural-panel" && s.maxDominantHingeLen <= 0 && s.maxPairedHingeLen <= 0 && s.maxHingeLen > 0 && candidate.area < rootArea * 0.08) {
      decision.classification = "absorbed-feature";
      decision.reason = "tongue_lock_feature";
      decision.featureScore = Math.max(decision.featureScore, 0.9);
    }

    candidate.classification = decision.classification;
    candidate.classificationReason = decision.reason;
    candidate.structuralScore = decision.structuralScore;
    candidate.featureScore = decision.featureScore;
    if (decision.classification === "absorbed-feature") rejectedRaw.push({ candidate, reason: decision.reason as RejectReason, hostHint: containmentHost, structuralScore: decision.structuralScore, featureScore: decision.featureScore });
    else structuralRaw.push({ candidate, reason: decision.reason, structuralScore: decision.structuralScore, featureScore: decision.featureScore });
  }

  if (structuralRaw.length === 0) {
    const largest = [...candidates].sort((a, b) => b.area - a.area)[0];
    structuralRaw.push({ candidate: largest, reason: "largest_root_panel", structuralScore: 1, featureScore: 0 });
    for (let i = rejectedRaw.length - 1; i >= 0; i--) if (rejectedRaw[i].candidate.id === largest.id) rejectedRaw.splice(i, 1);
  }

  const structuralIds = new Set(structuralRaw.map(({ candidate }) => candidate.id));
  const resolveHost = (feature: PanelCandidate, hostHint: string | null): string => {
    if (hostHint && structuralIds.has(hostHint)) return hostHint;
    let best: { id: string; score: number } | null = null;
    for (const { candidate: host } of structuralRaw) {
      if (host.id === feature.id) continue;
      let score = sharedBoundaryLength(host.polygon, feature.polygon) * 1000;
      if (polygonStrictlyContainsPolygon(host.polygon, feature.polygon)) score += 500000;
      score += Math.max(0, 1000 - distancePointToPoly(ringCentroid(feature.polygon), host.polygon));
      score += Math.min(host.area, rootArea) * 0.0001;
      if (!best || score > best.score) best = { id: host.id, score };
    }
    return best?.id ?? structuralRaw[0].candidate.id;
  };

  const absorbedFeatures: AbsorbedFeature[] = rejectedRaw.map(({ candidate, reason, hostHint, structuralScore, featureScore }) => {
    const type = featureTypeFromReason(reason);
    const localCreaseIds = candidate.touchingFoldAxisIds.filter((id) => axisById.get(id)?.type === "crease");
    const localCutIds = candidate.sourceSegmentIds.filter((id) => /cut|boundary/i.test(id));
    const hostPanelId = resolveHost(candidate, hostHint);
    return {
      id: `feature-${candidate.id}`,
      type,
      featureType: type,
      polygon: candidate.polygon,
      holes: candidate.holes,
      area: candidate.area,
      bbox: candidate.bbox,
      hostPanelId,
      ownerPanelId: hostPanelId,
      sourceRegionIds: [candidate.id],
      sourceCandidateIds: [candidate.id],
      sourceSegmentIds: candidate.sourceSegmentIds,
      localCreaseIds,
      localCutIds,
      classificationReason: reason,
      score: { structural: structuralScore, feature: featureScore },
    };
  });

  const absorbedByOwner = new Map<string, string[]>();
  for (const feature of absorbedFeatures) {
    const arr = absorbedByOwner.get(feature.ownerPanelId) ?? [];
    arr.push(feature.id);
    absorbedByOwner.set(feature.ownerPanelId, arr);
  }

  const structuralPanels: StructuralPanel[] = structuralRaw.map(({ candidate, reason, structuralScore, featureScore }, index) => ({
    id: candidate.id,
    label: candidate.label,
    faceId: index,
    polygon: candidate.polygon,
    holes: [
      ...candidate.holes,
      ...absorbedFeatures.filter((feature) => feature.ownerPanelId === candidate.id && feature.type === "internal_cut_feature").map((feature) => feature.polygon),
    ],
    foldAxisIds: [...candidate.touchingFoldAxisIds],
    hingeAxisIds: [...candidate.touchingFoldAxisIds],
    bbox: polygonBBox(candidate.polygon),
    area: candidate.area,
    parentPanelId: undefined,
    childPanelIds: [],
    sourceRegionIds: [candidate.id],
    absorbedFeatureIds: absorbedByOwner.get(candidate.id) ?? [],
    sourceCandidateIds: [candidate.id],
    sourceSegmentIds: candidate.sourceSegmentIds,
    classificationReason: reason,
    score: { structural: structuralScore, feature: featureScore },
  }));

  const faceIdByCandidate = new Map(structuralPanels.map((panel) => [panel.sourceCandidateIds[0], panel.faceId]));
  const structuralCandidateIds = new Set(structuralRaw.map(({ candidate }) => candidate.id));
  const featureByCandidateId = new Map(absorbedFeatures.map((f) => [f.sourceCandidateIds[0], f]));

  for (const axis of axes) {
    const touching = candidates.filter((candidate) => candidate.touchingFoldAxisIds.includes(axis.id));
    axis.connectedPanelCandidateIds = touching.map((c) => c.id);

    const structuralOnAxis = touching.filter((c) => structuralCandidateIds.has(c.id));
    const featuresOnAxis = touching.filter((c) => !structuralCandidateIds.has(c.id))
      .map((c) => featureByCandidateId.get(c.id))
      .filter((f): f is AbsorbedFeature => Boolean(f));

    const onDominant = axisDominantById.get(axis.id) === true;
    // Detecta se o eixo cruza o INTERIOR de algum painel estrutural — isso o
    // qualifica como structural_fold_axis mesmo se topologicamente só toca um
    // painel cru (ele vai dividi-lo na etapa 5D). Vincos longos nas direções
    // principais podem terminar em outro vinco interno; já vincos fora dessas
    // direções só dividem se o span realmente nasce/termina no contorno.
    const crossesStructuralInterior = structuralOnAxis.some((c) =>
      axisCrossesPanelInterior(c.polygon, axis, tolMm) && (onDominant || axisSpanEndsOnCandidateBoundary(c, axis, tolMm)),
    );
    const hasStructuralPair = hasOppositeStructuralPair(axis, structuralOnAxis, tolMm);

    axis.connectedFaceIds = structuralOnAxis
      .map((c) => faceIdByCandidate.get(c.id))
      .filter((id): id is number => id !== undefined);
    axis.connectedStructuralPanelIds = structuralOnAxis.map((c) => c.id);
    axis.connectedFeatureIds = featuresOnAxis.map((f) => f.id);

    // Atribuição de role — REGRA ÚNICA E EXPLÍCITA.
    // PRÉ-REGRA GEOMÉTRICA: se o eixo não está numa direção dominante da faca
    // (descoberta por clustering de comprimentos), ele NUNCA é structural_fold_axis,
    // mesmo que ligue 2 painéis. É sempre trava local.
    if ((onDominant || hasStructuralPair || crossesStructuralInterior) && (hasStructuralPair || crossesStructuralInterior)) {
      axis.role = "structural_fold_axis";
      axis.structuralEligibility = true;
      axis.structuralConfidence = Math.min(1, 0.55 + structuralOnAxis.length * 0.12 + (onDominant ? 0.12 : 0) + (hasStructuralPair ? 0.16 : 0) + (crossesStructuralInterior ? 0.2 : 0));
    } else if (!onDominant && (structuralOnAxis.length >= 1 || featuresOnAxis.length >= 1)) {
      // Diagonal / direção fora dos eixos dominantes → trava local.
      axis.role = "local_lock_crease";
      axis.structuralEligibility = false;
      axis.structuralConfidence = 0.1;
    } else if (structuralOnAxis.length === 1 && featuresOnAxis.length >= 1) {
      axis.role = "local_lock_crease";
      axis.structuralEligibility = false;
      axis.structuralConfidence = 0.2;
    } else if (structuralOnAxis.length === 0 && featuresOnAxis.length >= 1) {
      axis.role = "absorbed_feature_axis";
      axis.structuralEligibility = false;
      axis.structuralConfidence = 0.05;
    } else if (structuralOnAxis.length === 1) {
      axis.role = "local_crease";
      axis.structuralEligibility = false;
      axis.structuralConfidence = 0.15;
    } else {
      axis.role = "unknown";
      axis.structuralEligibility = false;
      axis.structuralConfidence = 0;
    }
    axis.confidence = axis.structuralConfidence;
    axis.panelAId = structuralOnAxis[0]?.id;
    axis.panelBId = structuralOnAxis[1]?.id;
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
      panel: { id: candidate.id, label: candidate.label, polygon: candidate.polygon, holes: candidate.holes, pipelinePanelId: candidate.id },
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
    summary: { candidatesCount: candidates.length, rejectedCount: rejectedRaw.length, structuralCount: structuralPanels.length, rootArea },
  };
  setLastStructuralReport(report);
  return { structuralPanels, absorbedFeatures, report };
}

export { fullBBox as candidateBBoxV3 };
