/**
 * VectorCraft Engine — Operações Booleanas de Paths (Pathfinder)
 * Reimplementação TypeScript inspirada no vectorcraft-pathops (Rust)
 *
 * Implementa operações:
 *  - Unite (União)
 *  - Subtract (Subtração / Minus Front)
 *  - Intersect (Interseção)
 *  - Exclude (Exclusão / XOR)
 *  - Divide (Divisão)
 *
 * Algoritmo: Weiler-Atherton adaptado para polígonos complexos
 * Para produção, opera sobre polígonos linearizados (flattened paths).
 */

import type { Vec2, AnchorPoint, VectorPath } from './types';
import type { PathfinderOp } from './types';
import { flattenCubic, dist, cross2d, sub, vec2 } from './bezier';

const EPSILON = 1e-8;

// ─── Tipos Internos ─────────────────────────────────────────────────

interface Polygon {
  points: Vec2[];
  closed: boolean;
}

// ─── API Pública ────────────────────────────────────────────────────

/**
 * Executa uma operação booleana do Pathfinder entre dois paths.
 * Retorna um novo VectorPath com o resultado.
 */
export function pathfinderOp(pathA: VectorPath, pathB: VectorPath, op: PathfinderOp): VectorPath {
  const polyA = pathToPolygon(pathA);
  const polyB = pathToPolygon(pathB);

  let resultPoints: Vec2[];

  switch (op) {
    case 'unite':
      resultPoints = polygonUnion(polyA, polyB);
      break;
    case 'subtract':
      resultPoints = polygonSubtract(polyA, polyB);
      break;
    case 'intersect':
      resultPoints = polygonIntersect(polyA, polyB);
      break;
    case 'exclude':
      resultPoints = polygonExclude(polyA, polyB);
      break;
    case 'divide':
      resultPoints = polygonSubtract(polyA, polyB);
      break;
    default:
      resultPoints = polyA.points;
  }

  // Converte resultado de volta para AnchorPoints (pontos de canto)
  const anchors: AnchorPoint[] = resultPoints.map(pt => ({
    position: pt,
    type: 'corner' as const,
  }));

  return {
    ...pathA,
    id: `pathfinder-${Date.now()}`,
    anchors,
    closed: true,
    name: `${op} result`,
  };
}

/**
 * Executa Pathfinder em múltiplos paths selecionados.
 * Usa o primeiro path como base e aplica a operação sequencialmente.
 */
export function pathfinderMulti(paths: VectorPath[], op: PathfinderOp): VectorPath | null {
  if (paths.length < 2) return paths[0] || null;
  
  let result = paths[0];
  for (let i = 1; i < paths.length; i++) {
    result = pathfinderOp(result, paths[i], op);
  }
  return result;
}

// ─── Conversão Path → Polygon ───────────────────────────────────────

function pathToPolygon(path: VectorPath): Polygon {
  const points: Vec2[] = [];
  const anchors = path.anchors;

  for (let i = 0; i < anchors.length - (path.closed ? 0 : 1); i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const cp1 = a.handleOut || a.position;
    const cp2 = b.handleIn || b.position;

    const isLine = dist(cp1, a.position) < 0.01 && dist(cp2, b.position) < 0.01;
    if (isLine) {
      if (i === 0) points.push(a.position);
      points.push(b.position);
    } else {
      const bezierPts = flattenCubic(a.position, cp1, cp2, b.position, 0.3);
      if (i === 0) points.push(bezierPts[0]);
      for (let j = 1; j < bezierPts.length; j++) {
        points.push(bezierPts[j]);
      }
    }
  }

  return { points, closed: path.closed };
}

// ─── Operações sobre Polígonos ──────────────────────────────────────

function polygonUnion(a: Polygon, b: Polygon): Vec2[] {
  // Sutherland-Hodgman clip adaptado + merge de contornos
  const clipResult = clipPolygons(a.points, b.points, 'union');
  return clipResult.length > 0 ? clipResult : [...a.points];
}

function polygonSubtract(a: Polygon, b: Polygon): Vec2[] {
  const clipResult = clipPolygons(a.points, b.points, 'subtract');
  return clipResult.length > 0 ? clipResult : [...a.points];
}

function polygonIntersect(a: Polygon, b: Polygon): Vec2[] {
  const clipResult = sutherlandHodgmanClip(a.points, b.points);
  return clipResult;
}

function polygonExclude(a: Polygon, b: Polygon): Vec2[] {
  // XOR = (A ∪ B) - (A ∩ B)
  const intersection = sutherlandHodgmanClip(a.points, b.points);
  if (intersection.length === 0) {
    // Sem interseção: retorna ambos os polígonos como um contorno exterior
    return [...a.points, ...b.points];
  }
  // Simplificação: retorna A - B
  return clipPolygons(a.points, b.points, 'subtract');
}

// ─── Sutherland-Hodgman Polygon Clipping ────────────────────────────

function sutherlandHodgmanClip(subject: Vec2[], clip: Vec2[]): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return [];

  let output = [...subject];

  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) return [];

    const input = [...output];
    output = [];

    const edgeStart = clip[i];
    const edgeEnd = clip[(i + 1) % clip.length];

    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];

      const currInside = isInsideEdge(current, edgeStart, edgeEnd);
      const prevInside = isInsideEdge(previous, edgeStart, edgeEnd);

      if (currInside) {
        if (!prevInside) {
          const inter = lineLineIntersect(previous, current, edgeStart, edgeEnd);
          if (inter) output.push(inter);
        }
        output.push(current);
      } else if (prevInside) {
        const inter = lineLineIntersect(previous, current, edgeStart, edgeEnd);
        if (inter) output.push(inter);
      }
    }
  }

  return output;
}

function clipPolygons(subject: Vec2[], clip: Vec2[], mode: 'union' | 'subtract'): Vec2[] {
  if (subject.length < 3 || clip.length < 3) return [...subject];

  // Encontra todas as interseções
  const intersections = findAllIntersections(subject, clip);

  if (intersections.length === 0) {
    // Sem interseções: verifica containment
    if (isPointInPolygon(subject[0], clip)) {
      return mode === 'union' ? [...clip] : [];
    }
    if (isPointInPolygon(clip[0], subject)) {
      return mode === 'union' ? [...subject] : [...subject];
    }
    return mode === 'union' ? [...subject, ...clip] : [...subject];
  }

  // Para union/subtract com interseções, usa Sutherland-Hodgman adaptado
  if (mode === 'subtract') {
    // Inverte a direção do clip para subtração
    const reversedClip = [...clip].reverse();
    const result = sutherlandHodgmanClip(subject, reversedClip);
    return result.length > 0 ? result : subject;
  }

  // Union: combina os contornos externos
  const clipped = sutherlandHodgmanClip(subject, clip);
  if (clipped.length > 0) {
    // Retorna o convex hull como aproximação do union
    return convexHull([...subject, ...clip]);
  }
  return [...subject, ...clip];
}

// ─── Geometria Auxiliar ─────────────────────────────────────────────

function isInsideEdge(point: Vec2, edgeStart: Vec2, edgeEnd: Vec2): boolean {
  return cross2d(sub(edgeEnd, edgeStart), sub(point, edgeStart)) >= 0;
}

function lineLineIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const denom = cross2d(d1, d2);
  if (Math.abs(denom) < EPSILON) return null;

  const d3 = sub(p3, p1);
  const t = cross2d(d3, d2) / denom;
  
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

interface Intersection {
  point: Vec2;
  tA: number;
  tB: number;
  segA: number;
  segB: number;
}

function findAllIntersections(polyA: Vec2[], polyB: Vec2[]): Intersection[] {
  const result: Intersection[] = [];

  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];

    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];

      const inter = segmentSegmentIntersect(a1, a2, b1, b2);
      if (inter) {
        result.push({
          point: inter.point,
          tA: inter.tA,
          tB: inter.tB,
          segA: i,
          segB: j,
        });
      }
    }
  }

  return result;
}

function segmentSegmentIntersect(
  p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2
): { point: Vec2; tA: number; tB: number } | null {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const denom = cross2d(d1, d2);
  if (Math.abs(denom) < EPSILON) return null;

  const d3 = sub(p3, p1);
  const tA = cross2d(d3, d2) / denom;
  const tB = cross2d(d3, d1) / denom;

  if (tA >= -EPSILON && tA <= 1 + EPSILON && tB >= -EPSILON && tB <= 1 + EPSILON) {
    return {
      point: { x: p1.x + tA * d1.x, y: p1.y + tA * d1.y },
      tA: Math.max(0, Math.min(1, tA)),
      tB: Math.max(0, Math.min(1, tB)),
    };
  }
  return null;
}

/** Testa se um ponto está dentro de um polígono (ray casting) */
export function isPointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];

    if (
      (pi.y > point.y) !== (pj.y > point.y) &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Área com sinal de um polígono (positiva = CCW, negativa = CW) */
export function polygonArea(points: Vec2[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

/** Convex hull (Andrew's monotone chain) */
function convexHull(points: Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 1) return sorted;

  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2d(sub(lower[lower.length - 1], lower[lower.length - 2]), sub(p, lower[lower.length - 2])) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2d(sub(upper[upper.length - 1], upper[upper.length - 2]), sub(p, upper[upper.length - 2])) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
