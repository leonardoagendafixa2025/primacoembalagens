import type {
  Point2D,
  Segment2D,
  Arc2D,
  DimensionLine,
  BoundingBox2D,
  DielineResult,
} from './types';

export interface PackagingGeometry {
  segments: Segment2D[];
  arcs: Arc2D[];
  dimensions: DimensionLine[];
  bounds: BoundingBox2D;
  metadata?: Record<string, unknown>;
}

export interface TransformMatrix {
  // Matriz de transformação afim 2D 3x3:
  // | a  c  tx |
  // | b  d  ty |
  // | 0  0  1  |
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export const IdentityTransform: TransformMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
};

/**
 * Cria matriz de translação
 */
export function translationMatrix(tx: number, ty: number): TransformMatrix {
  return { a: 1, b: 0, c: 0, d: 1, tx, ty };
}

/**
 * Cria matriz de rotação em graus em torno da origem (0,0)
 */
export function rotationMatrix(angleDeg: number): TransformMatrix {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    a: Math.abs(cos) < 1e-9 ? 0 : cos,
    b: Math.abs(sin) < 1e-9 ? 0 : sin,
    c: Math.abs(-sin) < 1e-9 ? 0 : -sin,
    d: Math.abs(cos) < 1e-9 ? 0 : cos,
    tx: 0,
    ty: 0,
  };
}

/**
 * Cria matriz de espelhamento (reflexão)
 */
export function reflectionMatrix(reflectX: boolean, reflectY: boolean): TransformMatrix {
  return {
    a: reflectX ? -1 : 1,
    b: 0,
    c: 0,
    d: reflectY ? -1 : 1,
    tx: 0,
    ty: 0,
  };
}

/**
 * Multiplica duas matrizes de transformação afim (M1 * M2)
 */
export function multiplyMatrices(m1: TransformMatrix, m2: TransformMatrix): TransformMatrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
    ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty,
  };
}

/**
 * Transforma um ponto 2D pela matriz afim
 */
export function transformPoint(pt: Point2D, m: TransformMatrix): Point2D {
  return {
    x: m.a * pt.x + m.c * pt.y + m.tx,
    y: m.b * pt.x + m.d * pt.y + m.ty,
  };
}

/**
 * Converte vetor relativo em ângulo em graus [0, 360)
 */
export function vecToAngleDeg(dx: number, dy: number): number {
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
}

/**
 * Transforma um segmento 2D
 */
export function transformSegment(seg: Segment2D, m: TransformMatrix): Segment2D {
  const p0 = transformPoint({ x: seg.x0, y: seg.y0 }, m);
  const p1 = transformPoint({ x: seg.x1, y: seg.y1 }, m);
  return {
    ...seg,
    x0: p0.x,
    y0: p0.y,
    x1: p1.x,
    y1: p1.y,
  };
}

/**
 * Transforma um arco 2D mantendo consistência geométrica rigorosa
 * Fiel à lógica de PicArc.cs (TransformData)
 */
export function transformArc(arc: Arc2D, m: TransformMatrix): Arc2D {
  const center = transformPoint({ x: arc.cx, y: arc.cy }, m);

  // Calcula escala média em caso de reflexão/escala
  const det = m.a * m.d - m.b * m.c;
  const isReflected = det < 0;

  const radBeg = (arc.startAngle * Math.PI) / 180;
  const radEnd = (arc.endAngle * Math.PI) / 180;

  const ptBegOrig = {
    x: arc.cx + arc.r * Math.cos(radBeg),
    y: arc.cy + arc.r * Math.sin(radBeg),
  };
  const ptEndOrig = {
    x: arc.cx + arc.r * Math.cos(radEnd),
    y: arc.cy + arc.r * Math.sin(radEnd),
  };

  const ptBegTrans = transformPoint(ptBegOrig, m);
  const ptEndTrans = transformPoint(ptEndOrig, m);

  let newStartAngle = vecToAngleDeg(ptBegTrans.x - center.x, ptBegTrans.y - center.y);
  let newEndAngle = vecToAngleDeg(ptEndTrans.x - center.x, ptEndTrans.y - center.y);

  if (isReflected) {
    const temp = newStartAngle;
    newStartAngle = newEndAngle;
    newEndAngle = temp;
  }

  // Raio transformado considerando a matriz
  const scale = Math.sqrt(Math.abs(det));
  const newRadius = arc.r * scale;

  return {
    ...arc,
    cx: center.x,
    cy: center.y,
    r: newRadius,
    startAngle: newStartAngle,
    endAngle: newEndAngle,
  };
}

/**
 * Transforma uma linha de cota
 */
export function transformDimension(dim: DimensionLine, m: TransformMatrix): DimensionLine {
  const p0 = transformPoint({ x: dim.x0, y: dim.y0 }, m);
  const p1 = transformPoint({ x: dim.x1, y: dim.y1 }, m);
  const isVertical = Math.abs(p1.x - p0.x) < Math.abs(p1.y - p0.y);
  return {
    ...dim,
    x0: p0.x,
    y0: p0.y,
    x1: p1.x,
    y1: p1.y,
    isVertical,
  };
}

/**
 * Calcula o Bounding Box 2D preciso para segmentos e arcos
 */
export function computeBoundingBox(geom: {
  segments: Segment2D[];
  arcs?: Arc2D[];
}): BoundingBox2D {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const seg of geom.segments) {
    if (seg.type === 'dimension') continue;
    minX = Math.min(minX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  if (geom.arcs && geom.arcs.length > 0) {
    for (const arc of geom.arcs) {
      if (arc.type === 'dimension') continue;
      if (!arc.r || arc.r < 0.001) continue;
      const isDegrees = Math.abs(arc.startAngle) > 2 * Math.PI || Math.abs(arc.endAngle) > 2 * Math.PI || (Math.abs(arc.endAngle - arc.startAngle) >= 10);
      const startRad = isDegrees ? (arc.startAngle * Math.PI) / 180 : arc.startAngle;
      const endRad = isDegrees ? (arc.endAngle * Math.PI) / 180 : arc.endAngle;

      const spanRad = endRad - startRad;
      const steps = 16;
      const da = spanRad / steps;
      for (let i = 0; i <= steps; i++) {
        const a = startRad + i * da;
        const px = arc.cx + arc.r * Math.cos(a);
        const py = arc.cy + arc.r * Math.sin(a);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
  }

  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Aplica uma matriz de transformação arbitrária em toda a geometria
 */
export function transformGeometry(geom: PackagingGeometry, m: TransformMatrix): PackagingGeometry {
  const transformedSegments = geom.segments.map((s) => transformSegment(s, m));
  const transformedArcs = geom.arcs.map((a) => transformArc(a, m));
  const transformedDimensions = geom.dimensions.map((d) => transformDimension(d, m));
  const bounds = computeBoundingBox({ segments: transformedSegments, arcs: transformedArcs });

  return {
    segments: transformedSegments,
    arcs: transformedArcs,
    dimensions: transformedDimensions,
    bounds,
    metadata: geom.metadata ? { ...geom.metadata } : undefined,
  };
}

/**
 * Translada a geometria em dx e dy
 */
export function translateGeometry(geom: PackagingGeometry, dx: number, dy: number): PackagingGeometry {
  const m = translationMatrix(dx, dy);
  return transformGeometry(geom, m);
}

/**
 * Rotaciona a geometria por um ângulo em graus
 * Se origin for fornecido, rotaciona em torno de origin; caso contrário, em torno do centro do bounding box
 */
export function rotateGeometry(
  geom: PackagingGeometry,
  angleDeg: number,
  origin?: Point2D
): PackagingGeometry {
  const center = origin || {
    x: (geom.bounds.minX + geom.bounds.maxX) / 2,
    y: (geom.bounds.minY + geom.bounds.maxY) / 2,
  };

  // M = T(center) * R(angle) * T(-center)
  const toOrigin = translationMatrix(-center.x, -center.y);
  const rot = rotationMatrix(angleDeg);
  const back = translationMatrix(center.x, center.y);

  const combined = multiplyMatrices(back, multiplyMatrices(rot, toOrigin));
  return transformGeometry(geom, combined);
}

/**
 * Espelha a geometria horizontalmente ou verticalmente
 */
export function mirrorGeometry(
  geom: PackagingGeometry,
  axisX: boolean = false,
  axisY: boolean = false
): PackagingGeometry {
  const m = reflectionMatrix(axisX, axisY);
  return transformGeometry(geom, m);
}

/**
 * Clona a geometria profundamente
 */
export function cloneGeometry(geom: PackagingGeometry): PackagingGeometry {
  return {
    segments: geom.segments.map((s) => ({ ...s })),
    arcs: geom.arcs.map((a) => ({ ...a })),
    dimensions: geom.dimensions.map((d) => ({ ...d })),
    bounds: { ...geom.bounds },
    metadata: geom.metadata ? { ...geom.metadata } : undefined,
  };
}

/**
 * Normaliza a geometria para que o canto inferior esquerdo (minX, minY) seja (0, 0)
 */
export function normalizeGeometry(geom: PackagingGeometry): PackagingGeometry {
  const b = computeBoundingBox(geom);
  if (Math.abs(b.minX) < 1e-6 && Math.abs(b.minY) < 1e-6) {
    return geom;
  }
  return translateGeometry(geom, -b.minX, -b.minY);
}

/**
 * Converte DielineResult antigo para PackagingGeometry padronizado
 */
export function toPackagingGeometry(dieline: DielineResult): PackagingGeometry {
  return {
    segments: dieline.segments,
    arcs: dieline.arcs || [],
    dimensions: dieline.dimensions || [],
    bounds: dieline.bounds || computeBoundingBox(dieline),
  };
}

export interface DielineMetrics {
  totalCutMm: number;
  totalCutM: number;
  totalCreaseMm: number;
  totalCreaseM: number;
  totalPerfoMm: number;
  totalPerfoM: number;
  totalSteelMm: number;
  totalSteelM: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  sheetAreaM2: number;
  cutsCount: number;
  creasesCount: number;
}

/**
 * Calcula a metragem linear de lâminas de aço (Corte, Vinco, Picote) e área industrial da faca
 */
export function computeDielineMetrics(dieline: DielineResult): DielineMetrics {
  let cutMm = 0;
  let creaseMm = 0;
  let perfoMm = 0;
  let cutsCount = 0;
  let creasesCount = 0;

  for (const s of dieline.segments) {
    const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    if (s.type === 'cut') {
      cutMm += len;
      cutsCount++;
    } else if (s.type === 'crease') {
      creaseMm += len;
      creasesCount++;
    } else if (s.type === 'perfo') {
      perfoMm += len;
      cutsCount++;
    }
  }

  for (const a of dieline.arcs || []) {
    let spanDeg = Math.abs(a.endAngle - a.startAngle);
    if (spanDeg > 360) spanDeg = spanDeg % 360;
    if (spanDeg === 0 && a.r > 0 && a.startAngle === a.endAngle) {
      spanDeg = 360;
    }
    const arcLen = a.r * ((spanDeg * Math.PI) / 180);
    if (a.type === 'cut') {
      cutMm += arcLen;
      cutsCount++;
    } else if (a.type === 'crease') {
      creaseMm += arcLen;
      creasesCount++;
    } else if (a.type === 'perfo') {
      perfoMm += arcLen;
      cutsCount++;
    }
  }

  const b = dieline.bounds || computeBoundingBox(dieline);
  const totalSteelMm = cutMm + creaseMm + perfoMm;
  const sheetWidthMm = b.width;
  const sheetHeightMm = b.height;
  const sheetAreaM2 = (sheetWidthMm * sheetHeightMm) / 1_000_000;

  return {
    totalCutMm: Math.round(cutMm * 10) / 10,
    totalCutM: Math.round((cutMm / 1000) * 100) / 100,
    totalCreaseMm: Math.round(creaseMm * 10) / 10,
    totalCreaseM: Math.round((creaseMm / 1000) * 100) / 100,
    totalPerfoMm: Math.round(perfoMm * 10) / 10,
    totalPerfoM: Math.round((perfoMm / 1000) * 100) / 100,
    totalSteelMm: Math.round(totalSteelMm * 10) / 10,
    totalSteelM: Math.round((totalSteelMm / 1000) * 100) / 100,
    sheetWidthMm: Math.round(sheetWidthMm * 10) / 10,
    sheetHeightMm: Math.round(sheetHeightMm * 10) / 10,
    sheetAreaM2: Math.round(sheetAreaM2 * 1000) / 1000,
    cutsCount,
    creasesCount,
  };
}
