import type { Pt, Segment } from "../dieline-types";
import { CAD_TOL } from "./tolerances";

export interface CurveDebugChain {
  points: Pt[];
  closed: boolean;
  inferredLoop: boolean;
  failedClosure: boolean;
  kind: Segment["kind"];
  fit?: "circle" | "oval";
}

export interface CurveHealingDebug {
  openCurveChains: CurveDebugChain[];
  inferredLoops: CurveDebugChain[];
  failedClosures: CurveDebugChain[];
  healedGeometry: CurveDebugChain[];
  continuityMap: Array<{
    point: Pt;
    tangentDeg: number;
    curvature: number;
  }>;
}

export interface CurveHealingResult {
  segments: Segment[];
  healedCurves: number;
  healedLoops: number;
  failedClosures: number;
  openCurveChains: number;
  inferredOvals: number;
  inferredCircles: number;
  debug: CurveHealingDebug;
}

type Chain = {
  kind: Segment["kind"];
  points: Pt[];
  sourceIndexes: number[];
  changed: boolean;
  source?: Segment["source"];
};


const EPS = 1e-6;

function clonePoint(p: Pt): Pt {
  return { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(vx: number, vy: number) {
  const len = Math.hypot(vx, vy);
  if (len < EPS) return { x: 0, y: 0 };
  return { x: vx / len, y: vy / len };
}

function tangentAt(points: Pt[], atStart: boolean) {
  if (points.length < 2) return { x: 0, y: 0 };
  if (atStart) {
    const p0 = points[0];
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (dist(p0, p) > EPS) return normalize(p.x - p0.x, p.y - p0.y);
    }
    return { x: 0, y: 0 };
  }
  const p1 = points[points.length - 1];
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i];
    if (dist(p1, p) > EPS) return normalize(p1.x - p.x, p1.y - p.y);
  }
  return { x: 0, y: 0 };
}

function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  const da = Math.hypot(a.x, a.y);
  const db = Math.hypot(b.x, b.y);
  if (da < EPS || db < EPS) return 0;
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return Math.acos(dot);
}

function reversePoints(points: Pt[]) {
  return [...points].reverse().map(clonePoint);
}

function dedupeSequential(points: Pt[]) {
  const out: Pt[] = [];
  for (const p of points) {
    if (!out.length || dist(out[out.length - 1], p) > 0.05) out.push(clonePoint(p));
  }
  return out;
}

function approximateCurvature(points: Pt[]) {
  if (points.length < 3) return 0;
  let total = 0;
  let count = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const ab = dist(a, b);
    const bc = dist(b, c);
    const ac = dist(a, c);
    if (ab < EPS || bc < EPS || ac < EPS) continue;
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const curvature = area2 / (ab * bc * ac);
    total += curvature;
    count++;
  }
  return count ? total / count : 0;
}

function bbox(points: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function centroid(points: Pt[]) {
  let x = 0, y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, points.length), y: y / Math.max(1, points.length) };
}

function classifyLoopShape(points: Pt[]): { fit?: "circle" | "oval"; error: number } {
  if (points.length < 6) return { error: Infinity };
  const c = centroid(points);
  const rs = points.map((p) => dist(p, c));
  const meanR = rs.reduce((sum, v) => sum + v, 0) / rs.length;
  const circleError = meanR > EPS
    ? rs.reduce((sum, v) => sum + Math.abs(v - meanR), 0) / rs.length / meanR
    : Infinity;
  const bb = bbox(points);
  if (bb.w < EPS || bb.h < EPS) return { error: Infinity };
  const rx = bb.w / 2;
  const ry = bb.h / 2;
  const ovalError = points.reduce((sum, p) => {
    const nx = (p.x - (bb.minX + rx)) / Math.max(rx, EPS);
    const ny = (p.y - (bb.minY + ry)) / Math.max(ry, EPS);
    return sum + Math.abs(nx * nx + ny * ny - 1);
  }, 0) / points.length;

  if (circleError <= CAD_TOL.ellipseFitError && Math.abs(bb.w - bb.h) <= Math.max(0.8, meanR * 0.18)) {
    return { fit: "circle", error: circleError };
  }
  if (ovalError <= CAD_TOL.ellipseFitError * 1.3) {
    return { fit: "oval", error: ovalError };
  }
  return { error: Math.min(circleError, ovalError) };
}

function closedLoop(points: Pt[]) {
  return points.length >= 4 && dist(points[0], points[points.length - 1]) <= CAD_TOL.curveClosureMm;
}

function joinPoints(base: Pt[], incoming: Pt[]) {
  const out = base.map(clonePoint);
  const start = dist(out[out.length - 1], incoming[0]) <= 0.05 ? 1 : 0;
  for (let i = start; i < incoming.length; i++) out.push(clonePoint(incoming[i]));
  return dedupeSequential(out);
}

function orientedPoints(points: Pt[], reverse: boolean) {
  return reverse ? reversePoints(points) : points;
}

function prependPoints(base: Pt[], incoming: Pt[]) {
  return joinPoints(incoming, base);
}

type MergePlan = {
  score: number;
  merge: (a: Chain, b: Chain) => Pt[];
};

function connectionScore(from: Pt[], to: Pt[]) {
  const chainEnd = from[from.length - 1];
  const candidateStart = to[0];
  const d = dist(chainEnd, candidateStart);
  if (d > CAD_TOL.curveJoinMm) return null;

  const t1 = tangentAt(from, false);
  const t2 = tangentAt(to, true);
  const tangentGap = angleBetween(t1, t2);
  if (tangentGap > CAD_TOL.curveAngleRad) return null;

  const c1 = approximateCurvature(from);
  const c2 = approximateCurvature(to);
  const curvatureGap = Math.abs(c1 - c2);
  if (Math.min(c1, c2) > EPS && curvatureGap > Math.max(0.12, Math.min(c1, c2) * 1.5)) return null;

  return d * 0.65 + tangentGap * 8 + curvatureGap * 6;
}

function chainScore(chain: Chain, candidate: Chain): MergePlan | null {
  const options: MergePlan[] = [];
  const a = chain.points;
  const b = candidate.points;

  const endToStart = connectionScore(a, b);
  if (endToStart !== null) options.push({ score: endToStart, merge: (x, y) => joinPoints(x.points, y.points) });

  const endToEnd = connectionScore(a, orientedPoints(b, true));
  if (endToEnd !== null) options.push({ score: endToEnd, merge: (x, y) => joinPoints(x.points, reversePoints(y.points)) });

  const startToStart = connectionScore(orientedPoints(a, true), b);
  if (startToStart !== null) options.push({ score: startToStart, merge: (x, y) => prependPoints(x.points, reversePoints(y.points)) });

  const startToEnd = connectionScore(orientedPoints(a, true), orientedPoints(b, true));
  if (startToEnd !== null) options.push({ score: startToEnd, merge: (x, y) => prependPoints(x.points, y.points) });

  options.sort((x, y) => x.score - y.score);
  return options[0] ?? null;
}

function canPredictClosure(chain: Chain) {
  if (chain.points.length < 4) return { close: false, fit: undefined as undefined | "circle" | "oval" };
  const start = chain.points[0];
  const end = chain.points[chain.points.length - 1];
  const d = dist(start, end);
  if (d > CAD_TOL.curveClosureMm) return { close: false, fit: undefined };

  const tStart = tangentAt(chain.points, true);
  const tEnd = tangentAt(chain.points, false);
  const closureAngle = angleBetween({ x: -tStart.x, y: -tStart.y }, tEnd);
  const shape = classifyLoopShape(chain.points);
  const plausible = closureAngle <= CAD_TOL.curveAngleRad * 1.35 || shape.fit !== undefined;
  return { close: plausible, fit: shape.fit };
}

function chainCenter(chain: Chain) {
  return centroid(chain.points);
}

function rotateChains(chains: Chain[], start: number) {
  return [...chains.slice(start), ...chains.slice(0, start)];
}

function endpointProximity(a: Chain, b: Chain) {
  const pairs = [
    dist(a.points[0], b.points[0]),
    dist(a.points[0], b.points[b.points.length - 1]),
    dist(a.points[a.points.length - 1], b.points[0]),
    dist(a.points[a.points.length - 1], b.points[b.points.length - 1]),
  ];
  return Math.min(...pairs);
}

function buildChainComponents(chains: Chain[]) {
  const comps: number[][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < chains.length; i++) {
    if (seen.has(i)) continue;
    const stack = [i];
    const comp: number[] = [];
    seen.add(i);
    while (stack.length) {
      const idx = stack.pop()!;
      comp.push(idx);
      for (let j = 0; j < chains.length; j++) {
        if (seen.has(j) || chains[idx].kind !== chains[j].kind) continue;
        if (endpointProximity(chains[idx], chains[j]) <= CAD_TOL.curveClosureMm * 1.8) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

function sequenceScore(order: Chain[], reverseFirst: boolean) {
  let assembled = orientedPoints(order[0].points, reverseFirst).map(clonePoint);
  let totalGap = 0;
  for (let i = 1; i < order.length; i++) {
    const next = order[i];
    const normal = next.points;
    const reversed = reversePoints(next.points);
    const dNormal = dist(assembled[assembled.length - 1], normal[0]);
    const dReverse = dist(assembled[assembled.length - 1], reversed[0]);
    const chosen = dReverse < dNormal ? reversed : normal;
    totalGap += Math.min(dNormal, dReverse);
    assembled = joinPoints(assembled, chosen);
  }
  const closureGap = dist(assembled[0], assembled[assembled.length - 1]);
  return { assembled, totalGap, closureGap };
}

function recoverLoopFromComponent(component: Chain[]) {
  if (component.length < 2) return null;
  const cloud = component.flatMap((chain) => chain.points);
  const center = centroid(cloud);
  const sorted = [...component].sort((a, b) => {
    const ca = chainCenter(a);
    const cb = chainCenter(b);
    const aa = Math.atan2(ca.y - center.y, ca.x - center.x);
    const ab = Math.atan2(cb.y - center.y, cb.x - center.x);
    return aa - ab;
  });

  let best: { assembled: Pt[]; totalGap: number; closureGap: number } | null = null;
  for (let start = 0; start < sorted.length; start++) {
    const rotated = rotateChains(sorted, start);
    for (const reverseFirst of [false, true]) {
      const trial = sequenceScore(rotated, reverseFirst);
      if (!best || trial.totalGap + trial.closureGap < best.totalGap + best.closureGap) best = trial;
    }
  }
  if (!best) return null;
  const shape = classifyLoopShape(best.assembled);
  const plausible = best.closureGap <= CAD_TOL.curveClosureMm * 1.8 && (
    shape.fit !== undefined ||
    best.totalGap / component.length <= CAD_TOL.curveJoinMm * 1.25
  );
  if (!plausible) return null;
  const points = closedLoop(best.assembled) ? best.assembled : [...best.assembled, clonePoint(best.assembled[0])];
  return { points, fit: classifyLoopShape(points).fit };
}

function shouldTreatAsCurve(seg: Segment) {
  if (seg.points.length < 3) return false;
  const curvature = approximateCurvature(seg.points);
  if (curvature > 0.01) return true;
  const bb = bbox(seg.points);
  return seg.points.length >= 5 && Math.min(bb.w, bb.h) > CAD_TOL.minSegmentMm * 3;
}

export function healExplodedCurves(segments: Segment[]): CurveHealingResult {
  const passthrough: Segment[] = [];
  const chains: Chain[] = [];

  segments.forEach((seg, index) => {
    const points = dedupeSequential(seg.points);
    if (points.length < 2) return;
    if (seg.closed || !shouldTreatAsCurve({ ...seg, points })) {
      passthrough.push({ ...seg, points, closed: seg.closed, source: seg.source });
      return;
    }
    chains.push({ kind: seg.kind, points, sourceIndexes: [index], changed: false, source: seg.source });
  });


  let healedCurves = 0;

  for (let changed = true; changed;) {
    changed = false;
    let best: { i: number; j: number; score: number; mergePlan: MergePlan } | null = null;

    for (let i = 0; i < chains.length; i++) {
      for (let j = 0; j < chains.length; j++) {
        if (i === j) continue;
        if (chains[i].kind !== chains[j].kind) continue;
        const mergePlan = chainScore(chains[i], chains[j]);
        if (mergePlan && (!best || mergePlan.score < best.score)) {
          best = { i, j, score: mergePlan.score, mergePlan };
        }
      }
    }

    if (!best) break;
    const a = chains[best.i];
    const b = chains[best.j];
    a.points = best.mergePlan.merge(a, b);
    a.sourceIndexes.push(...b.sourceIndexes);
    a.changed = true;
    healedCurves++;
    chains.splice(best.j, 1);
    changed = true;
  }

  const inferredLoops: CurveDebugChain[] = [];
  const failedClosures: CurveDebugChain[] = [];
  const openCurveChains: CurveDebugChain[] = [];
  const healedGeometry: CurveDebugChain[] = [];
  const continuityMap: CurveHealingDebug["continuityMap"] = [];
  const healedSegments: Segment[] = [...passthrough];
  const recoveredComponents = new Set<number>();

  let healedLoops = 0;
  let failedCount = 0;
  let inferredOvals = 0;
  let inferredCircles = 0;

  for (const comp of buildChainComponents(chains)) {
    const recovered = recoverLoopFromComponent(comp.map((idx) => chains[idx]));
    if (!recovered) continue;
    comp.forEach((idx) => recoveredComponents.add(idx));
    if (recovered.fit === "oval") inferredOvals++;
    if (recovered.fit === "circle") inferredCircles++;
    healedLoops++;
    healedSegments.push({ kind: chains[comp[0]].kind, points: recovered.points, closed: true, source: chains[comp[0]].source });
    healedGeometry.push({
      points: recovered.points,
      kind: chains[comp[0]].kind,
      inferredLoop: true,
      failedClosure: false,
      closed: true,
      fit: recovered.fit,
    });
    inferredLoops.push({
      points: recovered.points,
      kind: chains[comp[0]].kind,
      inferredLoop: true,
      failedClosure: false,
      closed: true,
      fit: recovered.fit,
    });
  }

  for (const [index, chain] of chains.entries()) {
    if (recoveredComponents.has(index)) continue;
    const points = dedupeSequential(chain.points);
    const curve = {
      points,
      kind: chain.kind,
      inferredLoop: false,
      failedClosure: false,
      closed: false,
    } satisfies CurveDebugChain;

    continuityMap.push(
      { point: clonePoint(points[0]), tangentDeg: Math.atan2(tangentAt(points, true).y, tangentAt(points, true).x) * 180 / Math.PI, curvature: approximateCurvature(points) },
      { point: clonePoint(points[points.length - 1]), tangentDeg: Math.atan2(tangentAt(points, false).y, tangentAt(points, false).x) * 180 / Math.PI, curvature: approximateCurvature(points) },
    );

    const predicted = canPredictClosure(chain);
    const alreadyClosed = closedLoop(points);
    if (alreadyClosed || predicted.close) {
      const closedPts = alreadyClosed ? points : [...points, clonePoint(points[0])];
      const shape = classifyLoopShape(closedPts);
      if (shape.fit === "oval") inferredOvals++;
      if (shape.fit === "circle") inferredCircles++;
      healedSegments.push({ kind: chain.kind, points: closedPts, closed: true, source: chain.source });
      healedGeometry.push({ ...curve, points: closedPts, closed: true, inferredLoop: !alreadyClosed, fit: shape.fit });
      inferredLoops.push({ ...curve, points: closedPts, closed: true, inferredLoop: true, fit: predicted.fit ?? shape.fit });
      healedLoops += alreadyClosed ? 0 : 1;
      continue;
    }

    const endGap = dist(points[0], points[points.length - 1]);
    const shape = classifyLoopShape(points);
    if (endGap <= CAD_TOL.curveClosureMm * 1.8 || shape.fit) {
      failedCount++;
      failedClosures.push({ ...curve, failedClosure: true, fit: shape.fit });
    } else {
      openCurveChains.push(curve);
    }
    healedSegments.push({ kind: chain.kind, points, closed: false, source: chain.source });
    healedGeometry.push({ ...curve, fit: shape.fit });
  }

  return {
    segments: healedSegments,
    healedCurves,
    healedLoops,
    failedClosures: failedCount,
    openCurveChains: openCurveChains.length,
    inferredOvals,
    inferredCircles,
    debug: {
      openCurveChains,
      inferredLoops,
      failedClosures,
      healedGeometry,
      continuityMap,
    },
  };
}