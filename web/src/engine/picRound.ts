import type { Arc2D } from './types';

class Vec2 {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  add(v: Vec2) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v: Vec2) { return new Vec2(this.x - v.x, this.y - v.y); }
  mul(s: number) { return new Vec2(this.x * s, this.y * s); }
  len() { return Math.hypot(this.x, this.y); }
  normalize() { const l = this.len(); return l > 1e-9 ? new Vec2(this.x / l, this.y / l) : new Vec2(0, 0); }
  dot(v: Vec2) { return this.x * v.x + this.y * v.y; }
  cross(v: Vec2) { return this.x * v.y - this.y * v.x; }
}

class Segment {
  p0: Vec2;
  p1: Vec2;
  constructor(p0: Vec2, p1: Vec2) {
    this.p0 = p0;
    this.p1 = p1;
  }
}

function intersectLines(s0: Segment, s1: Segment): Vec2 | null {
  const d0 = s0.p1.sub(s0.p0);
  const d1 = s1.p1.sub(s1.p0);
  const den = d0.x * d1.y - d0.y * d1.x;
  if (Math.abs(den) < 1e-9) return null;
  const numR = (s0.p0.y - s1.p0.y) * d1.x - (s0.p0.x - s1.p0.x) * d1.y;
  const r = numR / den;
  return s0.p0.add(d0.mul(r));
}

function intersectSegments(s0: Segment, s1: Segment): Vec2 | null {
  const d0 = s0.p1.sub(s0.p0);
  const d1 = s1.p1.sub(s1.p0);
  const den = d0.x * d1.y - d0.y * d1.x;
  if (Math.abs(den) < 1e-9) return null;
  const r = ((s0.p0.y - s1.p0.y) * d1.x - (s0.p0.x - s1.p0.x) * d1.y) / den;
  const s = ((s0.p0.y - s1.p0.y) * d0.x - (s0.p0.x - s1.p0.x) * d0.y) / den;
  if (r >= -1e-5 && r <= 1 + 1e-5 && s >= -1e-5 && s <= 1 + 1e-5) {
    return s0.p0.add(d0.mul(r));
  }
  return null;
}

function extendSegment(seg: Segment, pt: Vec2): Segment {
  const d = seg.p1.sub(seg.p0);
  const prod0 = seg.p0.sub(pt).dot(d);
  const prod1 = seg.p1.sub(pt).dot(d);
  if (prod0 > 0 && prod1 > 0) return new Segment(pt, seg.p1);
  if (prod0 < 0 && prod1 < 0) return new Segment(pt, seg.p0);
  return new Segment(seg.p0, seg.p1);
}

function getParallelSegments(seg: Segment, dist: number): [Segment, Segment] {
  const d = seg.p1.sub(seg.p0).normalize();
  const norm = new Vec2(-d.y, d.x);
  const p00 = seg.p0.add(norm.mul(dist));
  const p01 = seg.p1.add(norm.mul(dist));
  const p10 = seg.p0.sub(norm.mul(dist));
  const p11 = seg.p1.sub(norm.mul(dist));
  return [new Segment(p00, p01), new Segment(p10, p11)];
}

function projectOnLine(seg: Segment, pt: Vec2): Vec2 {
  const d = seg.p1.sub(seg.p0);
  const len2 = d.dot(d);
  if (len2 < 1e-9) return seg.p0;
  const t = pt.sub(seg.p0).dot(d) / len2;
  return seg.p0.add(d.mul(t));
}

export function applyPicToolRound(
  seg0Ent: { x0: number; y0: number; x1: number; y1: number },
  seg1Ent: { x0: number; y0: number; x1: number; y1: number },
  radius: number,
  arcsList: Arc2D[],
  arcId: string
) {
  let seg0 = new Segment(new Vec2(seg0Ent.x0, seg0Ent.y0), new Vec2(seg0Ent.x1, seg0Ent.y1));
  let seg1 = new Segment(new Vec2(seg1Ent.x0, seg1Ent.y0), new Vec2(seg1Ent.x1, seg1Ent.y1));
  const ptExt = intersectLines(seg0, seg1);
  if (!ptExt) return;
  seg0 = extendSegment(seg0, ptExt);
  seg1 = extendSegment(seg1, ptExt);
  const [seg00, seg01] = getParallelSegments(seg0, radius);
  const [seg10, seg11] = getParallelSegments(seg1, radius);
  let ptCenter = intersectSegments(seg00, seg10) || intersectSegments(seg00, seg11) || intersectSegments(seg01, seg10) || intersectSegments(seg01, seg11);
  if (!ptCenter) return;
  const pt0 = projectOnLine(seg0, ptCenter);
  const pt1 = projectOnLine(seg1, ptCenter);
  const ptInter = ptExt;
  if (seg0.p0.sub(ptInter).len() < seg0.p1.sub(ptInter).len()) {
    seg0Ent.x0 = pt0.x; seg0Ent.y0 = pt0.y;
  } else {
    seg0Ent.x1 = pt0.x; seg0Ent.y1 = pt0.y;
  }
  if (seg1.p0.sub(ptInter).len() < seg1.p1.sub(ptInter).len()) {
    seg1Ent.x0 = pt1.x; seg1Ent.y0 = pt1.y;
  } else {
    seg1Ent.x1 = pt1.x; seg1Ent.y1 = pt1.y;
  }
  let a0 = (Math.atan2(pt0.y - ptCenter.y, pt0.x - ptCenter.x) * 180) / Math.PI;
  let a1 = (Math.atan2(pt1.y - ptCenter.y, pt1.x - ptCenter.x) * 180) / Math.PI;
  if (a0 < 0) a0 += 360;
  if (a1 < 0) a1 += 360;
  const cross = pt0.sub(ptCenter).cross(pt1.sub(ptCenter));
  let startAngle = cross > 0 ? a0 : a1;
  let endAngle = cross > 0 ? a1 : a0;
  if (endAngle < startAngle) endAngle += 360;
  arcsList.push({
    id: arcId,
    type: 'cut',
    cx: Math.round(ptCenter.x * 1000) / 1000,
    cy: Math.round(ptCenter.y * 1000) / 1000,
    r: Math.round(radius * 1000) / 1000,
    startAngle: Math.round(startAngle * 1000) / 1000,
    endAngle: Math.round(endAngle * 1000) / 1000,
  });
}
