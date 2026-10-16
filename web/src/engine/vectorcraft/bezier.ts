/**
 * VectorCraft Engine — Motor de Geometria Bézier
 * Reimplementação TypeScript das operações de vectorcraft-geom (Rust)
 *
 * Funcionalidades:
 *  - Avaliação de curvas Bézier (cúbicas e quadráticas)
 *  - Subdivisão de De Casteljau
 *  - Cálculo de bounding box apertado (tight bounds)
 *  - Interseção curva-curva
 *  - Ponto mais próximo em curva
 *  - Offset de paths (para sangria / bleed)
 *  - Conversão path ↔ pontos de amostra
 */

import type { Vec2, AnchorPoint, VectorPath, BezierSegment } from './types';
import type { Segment2D, Arc2D, DielineResult } from '../types';

// ─── Constantes ─────────────────────────────────────────────────────
const EPSILON = 1e-10;
const FLATNESS = 0.25; // tolerância para achatamento (mm)

// ─── Operações Básicas com Vec2 ─────────────────────────────────────

export function vec2(x: number, y: number): Vec2 { return { x, y }; }
export function add(a: Vec2, b: Vec2): Vec2 { return { x: a.x + b.x, y: a.y + b.y }; }
export function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, y: a.y - b.y }; }
export function scale(v: Vec2, s: number): Vec2 { return { x: v.x * s, y: v.y * s }; }
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
export function dot(a: Vec2, b: Vec2): number { return a.x * b.x + a.y * b.y; }
export function cross2d(a: Vec2, b: Vec2): number { return a.x * b.y - a.y * b.x; }
export function len(v: Vec2): number { return Math.sqrt(v.x * v.x + v.y * v.y); }
export function dist(a: Vec2, b: Vec2): number { return len(sub(b, a)); }
export function normalize(v: Vec2): Vec2 { const l = len(v); return l < EPSILON ? { x: 0, y: 0 } : scale(v, 1 / l); }
export function perpCW(v: Vec2): Vec2 { return { x: v.y, y: -v.x }; }
export function perpCCW(v: Vec2): Vec2 { return { x: -v.y, y: v.x }; }
export function mid(a: Vec2, b: Vec2): Vec2 { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
export function angleBetween(a: Vec2, b: Vec2): number { return Math.atan2(cross2d(a, b), dot(a, b)); }

// ─── Avaliação de Curvas Bézier ─────────────────────────────────────

/** Avalia uma curva Bézier cúbica no parâmetro t ∈ [0, 1] */
export function evalCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

/** Derivada de uma curva Bézier cúbica em t */
export function evalCubicDerivative(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
    y: 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y),
  };
}

/** Avalia uma curva Bézier quadrática no parâmetro t ∈ [0, 1] */
export function evalQuadratic(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

/** Normal unitária em um ponto da curva cúbica */
export function cubicNormal(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const d = evalCubicDerivative(p0, p1, p2, p3, t);
  return normalize(perpCCW(d));
}

// ─── Subdivisão de De Casteljau ─────────────────────────────────────

/** Subdivide uma Bézier cúbica em t, retornando duas curvas */
export function splitCubicAt(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number
): { left: [Vec2, Vec2, Vec2, Vec2]; right: [Vec2, Vec2, Vec2, Vec2] } {
  const q0 = lerp(p0, p1, t);
  const q1 = lerp(p1, p2, t);
  const q2 = lerp(p2, p3, t);
  const r0 = lerp(q0, q1, t);
  const r1 = lerp(q1, q2, t);
  const s = lerp(r0, r1, t);
  return {
    left: [p0, q0, r0, s],
    right: [s, r1, q2, p3],
  };
}

// ─── Bounding Box de Curvas Bézier ──────────────────────────────────

/** Bounding box apertado de uma Bézier cúbica (considerando extremos da derivada) */
export function cubicBounds(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): { min: Vec2; max: Vec2 } {
  let minX = Math.min(p0.x, p3.x);
  let maxX = Math.max(p0.x, p3.x);
  let minY = Math.min(p0.y, p3.y);
  let maxY = Math.max(p0.y, p3.y);

  // Encontra zeros da derivada em X e Y para localizar extremos
  for (const axis of ['x', 'y'] as const) {
    const a = -3 * p0[axis] + 9 * p1[axis] - 9 * p2[axis] + 3 * p3[axis];
    const b = 6 * p0[axis] - 12 * p1[axis] + 6 * p2[axis];
    const c = -3 * p0[axis] + 3 * p1[axis];

    if (Math.abs(a) < EPSILON) {
      if (Math.abs(b) > EPSILON) {
        const t = -c / b;
        if (t > 0 && t < 1) {
          const val = evalCubic(p0, p1, p2, p3, t);
          if (axis === 'x') { minX = Math.min(minX, val.x); maxX = Math.max(maxX, val.x); }
          else { minY = Math.min(minY, val.y); maxY = Math.max(maxY, val.y); }
        }
      }
      continue;
    }

    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;

    const sqrtDisc = Math.sqrt(disc);
    for (const sign of [-1, 1]) {
      const t = (-b + sign * sqrtDisc) / (2 * a);
      if (t > 0 && t < 1) {
        const val = evalCubic(p0, p1, p2, p3, t);
        if (axis === 'x') { minX = Math.min(minX, val.x); maxX = Math.max(maxX, val.x); }
        else { minY = Math.min(minY, val.y); maxY = Math.max(maxY, val.y); }
      }
    }
  }

  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

// ─── Flatten / Linearização de Curvas ───────────────────────────────

/** Converte curva Bézier cúbica em segmentos de linha (adaptativo) */
export function flattenCubic(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number = FLATNESS
): Vec2[] {
  const points: Vec2[] = [p0];
  _flattenCubicRecursive(p0, p1, p2, p3, tolerance, points, 0);
  return points;
}

function _flattenCubicRecursive(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number, points: Vec2[], depth: number
): void {
  if (depth > 16) {
    points.push(p3);
    return;
  }

  // Teste de planaridade: distância dos pontos de controle à reta p0-p3
  const d = sub(p3, p0);
  const dLen = len(d);
  if (dLen < EPSILON) {
    if (dist(p0, p1) + dist(p1, p2) + dist(p2, p3) > tolerance) {
      const { left, right } = splitCubicAt(p0, p1, p2, p3, 0.5);
      _flattenCubicRecursive(...left, tolerance, points, depth + 1);
      _flattenCubicRecursive(...right, tolerance, points, depth + 1);
    } else {
      points.push(p3);
    }
    return;
  }

  const dn = scale(d, 1 / dLen);
  const d1 = sub(p1, p0);
  const d2 = sub(p2, p0);
  const err1 = Math.abs(cross2d(dn, d1));
  const err2 = Math.abs(cross2d(dn, d2));

  if (Math.max(err1, err2) <= tolerance) {
    points.push(p3);
  } else {
    const { left, right } = splitCubicAt(p0, p1, p2, p3, 0.5);
    _flattenCubicRecursive(...left, tolerance, points, depth + 1);
    _flattenCubicRecursive(...right, tolerance, points, depth + 1);
  }
}

// ─── Ponto Mais Próximo em Bézier Cúbica ────────────────────────────

/** Encontra o parâmetro t do ponto mais próximo em uma curva cúbica */
export function closestPointOnCubic(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, target: Vec2, steps: number = 50
): { t: number; point: Vec2; distance: number } {
  let bestT = 0;
  let bestDist = Infinity;
  let bestPt = p0;

  // Busca grosseira
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = evalCubic(p0, p1, p2, p3, t);
    const d = dist(pt, target);
    if (d < bestDist) { bestDist = d; bestT = t; bestPt = pt; }
  }

  // Refinamento por Newton-Raphson (3 iterações)
  for (let iter = 0; iter < 3; iter++) {
    const pt = evalCubic(p0, p1, p2, p3, bestT);
    const d1 = evalCubicDerivative(p0, p1, p2, p3, bestT);
    const diff = sub(pt, target);
    const num = dot(diff, d1);
    const den = dot(d1, d1) + dot(diff, evalCubicSecondDerivative(p0, p1, p2, p3, bestT));
    if (Math.abs(den) < EPSILON) break;
    bestT = Math.max(0, Math.min(1, bestT - num / den));
    bestPt = evalCubic(p0, p1, p2, p3, bestT);
    bestDist = dist(bestPt, target);
  }

  return { t: bestT, point: bestPt, distance: bestDist };
}

function evalCubicSecondDerivative(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  return {
    x: 6 * (1 - t) * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
    y: 6 * (1 - t) * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
  };
}

// ─── Comprimento de Arco ────────────────────────────────────────────

/** Calcula comprimento de arco de curva Bézier cúbica por quadratura de Gauss-Legendre */
export function cubicArcLength(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): number {
  // Quadratura de 5 pontos
  const abscissae = [0.0, -0.5384693, 0.5384693, -0.9061798, 0.9061798];
  const weights = [0.5688889, 0.4786287, 0.4786287, 0.2369269, 0.2369269];

  let length = 0;
  for (let i = 0; i < 5; i++) {
    const t = 0.5 * (abscissae[i] + 1);
    const d = evalCubicDerivative(p0, p1, p2, p3, t);
    length += weights[i] * len(d);
  }
  return length * 0.5;
}

// ─── Offset de Path (para Sangria / Bleed) ──────────────────────────

/**
 * Gera offset de um path composto de Béziers cúbicas.
 * Desloca cada curva na direção da normal por `distance` mm.
 * Positivo = exterior (bleed), Negativo = interior.
 */
export function offsetPath(anchors: AnchorPoint[], closed: boolean, distance: number): AnchorPoint[] {
  if (anchors.length < 2) return [...anchors];

  const segments = anchorsToSegmentData(anchors, closed);
  const offsetAnchors: AnchorPoint[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    // Amostra 4 pontos ao longo da curva e desloca
    const sampleTs = [0, 1 / 3, 2 / 3, 1];
    const offsetPoints: Vec2[] = [];

    for (const t of sampleTs) {
      const pt = evalCubic(seg.p0, seg.p1, seg.p2, seg.p3, t);
      const n = cubicNormal(seg.p0, seg.p1, seg.p2, seg.p3, t);
      offsetPoints.push(add(pt, scale(n, distance)));
    }

    // Reconstrói a curva cúbica a partir dos 4 pontos amostrados (interpolação)
    const anchor = fitCubicFromPoints(offsetPoints);
    if (i === 0) {
      offsetAnchors.push({
        position: anchor.p0,
        handleOut: anchor.p1,
        type: 'smooth',
      });
    }
    offsetAnchors.push({
      position: anchor.p3,
      handleIn: anchor.p2,
      handleOut: i < segments.length - 1 ? undefined : undefined,
      type: 'smooth',
    });
  }

  return offsetAnchors;
}

interface SegmentData {
  p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2;
}

function anchorsToSegmentData(anchors: AnchorPoint[], closed: boolean): SegmentData[] {
  const segs: SegmentData[] = [];
  const n = anchors.length;
  const limit = closed ? n : n - 1;

  for (let i = 0; i < limit; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % n];
    segs.push({
      p0: a.position,
      p1: a.handleOut || a.position,
      p2: b.handleIn || b.position,
      p3: b.position,
    });
  }
  return segs;
}

function fitCubicFromPoints(pts: Vec2[]): { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2 } {
  // Interpolação aproximada de 4 pontos para uma cúbica
  const p0 = pts[0];
  const p3 = pts[3];
  const p1 = {
    x: (-5 * pts[0].x + 18 * pts[1].x - 9 * pts[2].x + 2 * pts[3].x) / 6,
    y: (-5 * pts[0].y + 18 * pts[1].y - 9 * pts[2].y + 2 * pts[3].y) / 6,
  };
  const p2 = {
    x: (2 * pts[0].x - 9 * pts[1].x + 18 * pts[2].x - 5 * pts[3].x) / 6,
    y: (2 * pts[0].y - 9 * pts[1].y + 18 * pts[2].y - 5 * pts[3].y) / 6,
  };
  return { p0, p1, p2, p3 };
}

// ─── Conversão: AnchorPoints → SVG Path d ───────────────────────────

/** Converte AnchorPoints para string SVG path `d` */
export function anchorsToSvgPath(anchors: AnchorPoint[], closed: boolean): string {
  if (anchors.length === 0) return '';
  const parts: string[] = [];
  const first = anchors[0];
  parts.push(`M ${first.position.x.toFixed(3)} ${first.position.y.toFixed(3)}`);

  for (let i = 0; i < anchors.length - (closed ? 0 : 1); i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const cp1 = a.handleOut || a.position;
    const cp2 = b.handleIn || b.position;

    const isLine = dist(cp1, a.position) < EPSILON && dist(cp2, b.position) < EPSILON;
    if (isLine) {
      parts.push(`L ${b.position.x.toFixed(3)} ${b.position.y.toFixed(3)}`);
    } else {
      parts.push(
        `C ${cp1.x.toFixed(3)} ${cp1.y.toFixed(3)} ${cp2.x.toFixed(3)} ${cp2.y.toFixed(3)} ${b.position.x.toFixed(3)} ${b.position.y.toFixed(3)}`
      );
    }
  }

  if (closed) parts.push('Z');
  return parts.join(' ');
}

// ─── Conversão: PLMPackLib Segments/Arcs → VectorPath ───────────────

/** Converte DielineResult do PLMPackLib para VectorPaths do VectorCraft */
export function dielineToVectorPaths(dieline: DielineResult): VectorPath[] {
  const paths: VectorPath[] = [];
  let id = 0;

  // Converte segmentos (linhas retas) para paths com 2 anchors cada
  for (const seg of dieline.segments) {
    if (seg.type === 'dimension') continue;
    paths.push({
      id: `seg-${id++}`,
      anchors: [
        { position: { x: seg.x0, y: seg.y0 }, type: 'corner' },
        { position: { x: seg.x1, y: seg.y1 }, type: 'corner' },
      ],
      closed: false,
      stroke: {
        color: seg.type === 'cut' ? '#ef4444' : seg.type === 'crease' ? '#3b82f6' : '#10b981',
        width: seg.penWidth || 0.5,
        dashArray: seg.type === 'crease' ? [4, 3] : seg.type === 'perfo' ? [2, 2] : undefined,
      },
      fill: { color: 'none', opacity: 0, type: 'none' },
      semanticType: seg.type,
      visible: true,
      locked: false,
    });
  }

  // Converte arcos para paths com pontos de amostra
  for (const arc of dieline.arcs || []) {
    if (arc.type === 'dimension') continue;
    const anchors = arcToAnchors(arc);
    paths.push({
      id: `arc-${id++}`,
      anchors,
      closed: Math.abs(arc.endAngle - arc.startAngle) >= 359.9,
      stroke: {
        color: arc.type === 'cut' ? '#ef4444' : arc.type === 'crease' ? '#3b82f6' : '#10b981',
        width: 0.5,
        dashArray: arc.type === 'crease' ? [4, 3] : arc.type === 'perfo' ? [2, 2] : undefined,
      },
      fill: { color: 'none', opacity: 0, type: 'none' },
      semanticType: arc.type,
      visible: true,
      locked: false,
    });
  }

  return paths;
}

/** Converte um arco DXF/PLMPackLib para AnchorPoints com Bézier */
function arcToAnchors(arc: Arc2D): AnchorPoint[] {
  const startRad = (arc.startAngle * Math.PI) / 180;
  const endRad = (arc.endAngle * Math.PI) / 180;
  let spanRad = endRad - startRad;
  while (spanRad < 0) spanRad += 2 * Math.PI;
  if (spanRad < 0.001) spanRad = 2 * Math.PI;

  // Divide em segmentos de até 90° cada para manter precisão do Bézier
  const numSegments = Math.max(1, Math.ceil(spanRad / (Math.PI / 2)));
  const segmentAngle = spanRad / numSegments;
  const kappa = (4 / 3) * Math.tan(segmentAngle / 4);

  const anchors: AnchorPoint[] = [];

  for (let i = 0; i <= numSegments; i++) {
    const angle = startRad + i * segmentAngle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pos: Vec2 = {
      x: arc.cx + arc.r * cos,
      y: arc.cy + arc.r * sin,
    };

    const tangent: Vec2 = { x: -sin, y: cos };
    const anchor: AnchorPoint = {
      position: pos,
      type: 'smooth',
    };

    if (i > 0) {
      anchor.handleIn = {
        x: pos.x - tangent.x * arc.r * kappa,
        y: pos.y - tangent.y * arc.r * kappa,
      };
    }
    if (i < numSegments) {
      anchor.handleOut = {
        x: pos.x + tangent.x * arc.r * kappa,
        y: pos.y + tangent.y * arc.r * kappa,
      };
    }

    anchors.push(anchor);
  }

  return anchors;
}

/** Converte VectorPaths de volta para DielineResult do PLMPackLib */
export function vectorPathsToDieline(paths: VectorPath[]): DielineResult {
  const segments: Segment2D[] = [];
  const arcs: Arc2D[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const path of paths) {
    if (!path.visible) continue;
    const semanticType = path.semanticType || 'cut';
    const lineType = semanticType === 'annotation' ? 'dimension'
      : semanticType === 'bleed' ? 'cut'
      : semanticType === 'artwork' ? 'cut'
      : semanticType as 'cut' | 'crease' | 'perfo';

    // Achata cada segmento do path em linhas retas
    for (let i = 0; i < path.anchors.length - (path.closed ? 0 : 1); i++) {
      const a = path.anchors[i];
      const b = path.anchors[(i + 1) % path.anchors.length];
      const cp1 = a.handleOut || a.position;
      const cp2 = b.handleIn || b.position;

      const isLine = dist(cp1, a.position) < 0.01 && dist(cp2, b.position) < 0.01;
      if (isLine) {
        segments.push({
          x0: a.position.x, y0: a.position.y,
          x1: b.position.x, y1: b.position.y,
          type: lineType,
        });
        updateBounds(a.position);
        updateBounds(b.position);
      } else {
        // Lineariza a Bézier
        const pts = flattenCubic(a.position, cp1, cp2, b.position, 0.5);
        for (let j = 0; j < pts.length - 1; j++) {
          segments.push({
            x0: pts[j].x, y0: pts[j].y,
            x1: pts[j + 1].x, y1: pts[j + 1].y,
            type: lineType,
          });
          updateBounds(pts[j]);
          updateBounds(pts[j + 1]);
        }
      }
    }
  }

  function updateBounds(p: Vec2) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  return {
    segments,
    arcs,
    dimensions: [],
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}
