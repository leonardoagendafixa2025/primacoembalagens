import type {
  ImportedCadDocument,
  ClassificationRule,
  ClassificationProfile,
  ImportValidationReport,
  CadClassificationTarget,
} from './types';
import { targetToLineType } from './types';
import { classifyEntity } from './ClassificationEngine';
import type { Segment2D, Arc2D, DimensionLine, DielineResult, Point2D } from '../types';
import type { PackagingGeometry } from '../geometry';
import { computeBoundingBox } from '../geometry';
import { TopologyReconstructor } from './TopologyReconstructor';

export interface NormalizerOptions {
  customRules?: ClassificationRule[];
  profile?: ClassificationProfile;
  gapToleranceMm?: number;
  maxBridgeDistanceMm?: number;
  userScaleFactor?: number;
  originZeroZero?: boolean;
}

/**
 * Converte curva de Bézier cúbica em segmentos de reta com tolerância de erro controlada (Chordal Tolerance <= 0.02 mm)
 */
function subdivideBezier(
  p0: Point2D,
  cp1: Point2D,
  cp2: Point2D,
  p1: Point2D,
  maxErrorMm: number = 0.02
): Point2D[] {
  const points: Point2D[] = [p0];

  function recurse(a: Point2D, b: Point2D, c: Point2D, d: Point2D) {
    // Distância dos pontos de controle à reta secante a -> d
    const dx = d.x - a.x;
    const dy = d.y - a.y;
    const len = Math.hypot(dx, dy);

    let d1 = 0;
    let d2 = 0;
    if (len > 1e-6) {
      d1 = Math.abs((b.x - a.x) * dy - (b.y - a.y) * dx) / len;
      d2 = Math.abs((c.x - a.x) * dy - (c.y - a.y) * dx) / len;
    } else {
      d1 = Math.hypot(b.x - a.x, b.y - a.y);
      d2 = Math.hypot(c.x - a.x, c.y - a.y);
    }

    if (Math.max(d1, d2) <= maxErrorMm) {
      points.push(d);
      return;
    }

    // De Casteljau subdivisão em t = 0.5
    const ab = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const bc = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    const cd = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
    const abc = { x: (ab.x + bc.x) / 2, y: (ab.y + bc.y) / 2 };
    const bcd = { x: (bc.x + cd.x) / 2, y: (bc.y + cd.y) / 2 };
    const mid = { x: (abc.x + bcd.x) / 2, y: (abc.y + bcd.y) / 2 };

    recurse(a, ab, abc, mid);
    recurse(mid, bcd, cd, d);
  }

  recurse(p0, cp1, cp2, p1);
  return points;
}

/**
 * Converte segmento de polilinha com Bulge em arco analítico exato (Arc2D)
 */
function bulgeToArc(
  p1: Point2D,
  p2: Point2D,
  bulge: number
): { cx: number; cy: number; r: number; startAngleDeg: number; endAngleDeg: number } {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const r = (d * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const perp = { x: -(p2.y - p1.y) / d, y: (p2.x - p1.x) / d };
  const h = (d * (1 - bulge * bulge)) / (4 * bulge);
  const cx = mid.x + h * perp.x;
  const cy = mid.y + h * perp.y;

  let startAngle = (Math.atan2(p1.y - cy, p1.x - cx) * 180) / Math.PI;
  let endAngle = (Math.atan2(p2.y - cy, p2.x - cx) * 180) / Math.PI;

  if (startAngle < 0) startAngle += 360;
  if (endAngle < 0) endAngle += 360;

  if (bulge > 0 && endAngle < startAngle) {
    endAngle += 360;
  } else if (bulge < 0 && startAngle < endAngle) {
    startAngle += 360;
  }

  return { cx, cy, r, startAngleDeg: startAngle, endAngleDeg: endAngle };
}

/**
 * Normaliza e reconstrói o documento CAD importado para a estrutura nativa PackagingGeometry
 */
export function normalizeAndBuildGeometry(
  doc: ImportedCadDocument,
  options: NormalizerOptions = {}
): {
  geometry: PackagingGeometry;
  dieline: DielineResult;
  report: ImportValidationReport;
} {
  const gapTol = options.gapToleranceMm ?? 0.05;
  const scale = (options.userScaleFactor ?? doc.scaleFactorToMm) || 1.0;

  const segments: Segment2D[] = [];
  const arcs: Arc2D[] = [];
  const dimensions: DimensionLine[] = [];

  const autoRepairs: ImportValidationReport['autoRepairs'] = [];
  let duplicatesRemoved = 0;
  let bezierConvertedCount = 0;

  const classifiedCounts = {
    cut: 0,
    crease: 0,
    perf: 0,
    dimension: 0,
    ignored: 0,
    unclassified: 0,
  };

  let totalCutMm = 0;
  let totalCreaseMm = 0;
  let totalPerfMm = 0;

  // 1. Processa cada entidade bruta
  let segIdCounter = 0;
  let arcIdCounter = 0;

  for (const ent of doc.entities) {
    const target: CadClassificationTarget = classifyEntity(ent, options.customRules, options.profile);
    const lineType = targetToLineType(target);

    if (target === 'IGNORE') {
      classifiedCounts.ignored++;
      continue;
    }

    if (target === 'UNCLASSIFIED' || !lineType) {
      classifiedCounts.unclassified++;
      // Entidades não classificadas são mantidas como dimension/guia para visualização segura
    } else {
      if (lineType === 'cut') classifiedCounts.cut++;
      else if (lineType === 'crease') classifiedCounts.crease++;
      else if (lineType === 'perfo') classifiedCounts.perf++;
      else if (lineType === 'dimension') classifiedCounts.dimension++;
    }

    const finalLineType = lineType || 'dimension';

    // 1.1 Linha
    if (ent.sourceType === 'LINE') {
      const x0 = ent.x0 * scale;
      const y0 = ent.y0 * scale;
      const x1 = ent.x1 * scale;
      const y1 = ent.y1 * scale;
      const len = Math.hypot(x1 - x0, y1 - y0);

      if (len > 0.001) {
        segIdCounter++;
        segments.push({
          id: `seg_${segIdCounter}`,
          x0,
          y0,
          x1,
          y1,
          type: finalLineType,
        });

        if (finalLineType === 'cut') totalCutMm += len;
        else if (finalLineType === 'crease') totalCreaseMm += len;
        else if (finalLineType === 'perfo') totalPerfMm += len;
      }
      continue;
    }

    // 1.2 Arco
    if (ent.sourceType === 'ARC') {
      const cx = ent.cx * scale;
      const cy = ent.cy * scale;
      const r = ent.r * scale;
      if (r > 0.001) {
        arcIdCounter++;
        arcs.push({
          id: `arc_${arcIdCounter}`,
          cx,
          cy,
          r,
          startAngle: ent.startAngleDeg,
          endAngle: ent.endAngleDeg,
          type: finalLineType,
        });

        const spanDeg = Math.abs(ent.endAngleDeg - ent.startAngleDeg);
        const arcLen = r * ((spanDeg * Math.PI) / 180);
        if (finalLineType === 'cut') totalCutMm += arcLen;
        else if (finalLineType === 'crease') totalCreaseMm += arcLen;
        else if (finalLineType === 'perfo') totalPerfMm += arcLen;
      }
      continue;
    }

    // 1.3 Círculo
    if (ent.sourceType === 'CIRCLE') {
      const cx = ent.cx * scale;
      const cy = ent.cy * scale;
      const r = ent.r * scale;
      if (r > 0.001) {
        arcIdCounter++;
        arcs.push({
          id: `arc_${arcIdCounter}`,
          cx,
          cy,
          r,
          startAngle: 0,
          endAngle: 360,
          type: finalLineType,
        });
        const circleLen = 2 * Math.PI * r;
        if (finalLineType === 'cut') totalCutMm += circleLen;
        else if (finalLineType === 'crease') totalCreaseMm += circleLen;
        else if (finalLineType === 'perfo') totalPerfMm += circleLen;
      }
      continue;
    }

    // 1.4 Polilinha (LWPOLYLINE / POLYLINE)
    if (ent.sourceType === 'LWPOLYLINE' || ent.sourceType === 'POLYLINE') {
      const verts = ent.vertices.map((v) => ({
        x: v.x * scale,
        y: v.y * scale,
        bulge: v.bulge,
      }));

      for (let k = 0; k < verts.length - 1; k++) {
        const v1 = verts[k];
        const v2 = verts[k + 1];
        if (v1.bulge && Math.abs(v1.bulge) > 1e-4) {
          const arcGeom = bulgeToArc(v1, v2, v1.bulge);
          arcIdCounter++;
          arcs.push({
            id: `arc_${arcIdCounter}`,
            cx: arcGeom.cx,
            cy: arcGeom.cy,
            r: arcGeom.r,
            startAngle: arcGeom.startAngleDeg,
            endAngle: arcGeom.endAngleDeg,
            type: finalLineType,
          });
        } else {
          const len = Math.hypot(v2.x - v1.x, v2.y - v1.y);
          if (len > 0.001) {
            segIdCounter++;
            segments.push({
              id: `seg_${segIdCounter}`,
              x0: v1.x,
              y0: v1.y,
              x1: v2.x,
              y1: v2.y,
              type: finalLineType,
            });
            if (finalLineType === 'cut') totalCutMm += len;
            else if (finalLineType === 'crease') totalCreaseMm += len;
            else if (finalLineType === 'perfo') totalPerfMm += len;
          }
        }
      }

      if (ent.isClosed && verts.length >= 3) {
        const vLast = verts[verts.length - 1];
        const vFirst = verts[0];
        const len = Math.hypot(vFirst.x - vLast.x, vFirst.y - vLast.y);
        if (len > 0.001) {
          segIdCounter++;
          segments.push({
            id: `seg_${segIdCounter}`,
            x0: vLast.x,
            y0: vLast.y,
            x1: vFirst.x,
            y1: vFirst.y,
            type: finalLineType,
          });
          if (finalLineType === 'cut') totalCutMm += len;
          else if (finalLineType === 'crease') totalCreaseMm += len;
          else if (finalLineType === 'perfo') totalPerfMm += len;
        }
      }
      continue;
    }

    // 1.5 Curva Bézier
    if (ent.sourceType === 'BEZIER') {
      bezierConvertedCount++;
      const p0 = { x: ent.p0.x * scale, y: ent.p0.y * scale };
      const cp1 = { x: ent.cp1.x * scale, y: ent.cp1.y * scale };
      const cp2 = ent.cp2 ? { x: ent.cp2.x * scale, y: ent.cp2.y * scale } : cp1;
      const p1 = { x: ent.p1.x * scale, y: ent.p1.y * scale };

      const subPts = subdivideBezier(p0, cp1, cp2, p1, 0.02);
      for (let k = 0; k < subPts.length - 1; k++) {
        const ptA = subPts[k];
        const ptB = subPts[k + 1];
        const len = Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y);
        if (len > 0.001) {
          segIdCounter++;
          segments.push({
            id: `seg_${segIdCounter}`,
            x0: ptA.x,
            y0: ptA.y,
            x1: ptB.x,
            y1: ptB.y,
            type: finalLineType,
          });
          if (finalLineType === 'cut') totalCutMm += len;
          else if (finalLineType === 'crease') totalCreaseMm += len;
          else if (finalLineType === 'perfo') totalPerfMm += len;
        }
      }
      continue;
    }
  }

  // 2. Reconstrução de Conectividade e Normalização Topológica Estrutural (Fase 2A)
  const initialGeometry: PackagingGeometry = {
    segments,
    arcs,
    dimensions,
    bounds: computeBoundingBox({ segments, arcs }),
  };

  const topoResult = TopologyReconstructor.reconstructConnectivity(initialGeometry, {
    gapToleranceMm: Math.max(gapTol, 0.40),
    coincidentToleranceMm: 0.05,
    tJunctionToleranceMm: 0.40,
    overshootToleranceMm: 0.45,
  });

  const uniqueSegments = topoResult.geometry.segments;
  const uniqueArcs = topoResult.geometry.arcs;
  duplicatesRemoved = topoResult.stats.duplicatesRemoved;

  for (const r of topoResult.repairs) {
    autoRepairs.push({
      entityAId: r.entityAId,
      entityBId: r.entityBId,
      gapMm: r.distanceMm,
      action: r.action,
      location: r.location,
    });
  }

  // 3. Bounding Box da Geometria Unificada
  const rawBounds = computeBoundingBox({ segments: uniqueSegments, arcs: uniqueArcs });

  // Normalização para origem (0, 0) se solicitado (padrão CAD web)
  let finalSegments = uniqueSegments;
  let finalArcs = uniqueArcs;
  let finalBounds = rawBounds;

  if (options.originZeroZero && rawBounds.width > 0) {
    const offX = rawBounds.minX;
    const offY = rawBounds.minY;
    finalSegments = uniqueSegments.map((s) => ({
      ...s,
      x0: Number((s.x0 - offX).toFixed(3)),
      y0: Number((s.y0 - offY).toFixed(3)),
      x1: Number((s.x1 - offX).toFixed(3)),
      y1: Number((s.y1 - offY).toFixed(3)),
    }));
    finalArcs = uniqueArcs.map((a) => ({
      ...a,
      cx: Number((a.cx - offX).toFixed(3)),
      cy: Number((a.cy - offY).toFixed(3)),
    }));
    finalBounds = {
      minX: 0,
      minY: 0,
      maxX: Number((rawBounds.maxX - offX).toFixed(3)),
      maxY: Number((rawBounds.maxY - offY).toFixed(3)),
      width: rawBounds.width,
      height: rawBounds.height,
    };
  }

  const geometry: PackagingGeometry = {
    segments: finalSegments,
    arcs: finalArcs,
    dimensions,
    bounds: finalBounds,
    metadata: {
      sourceFile: doc.filename,
      sourceFormat: doc.format,
      scaleApplied: scale,
    },
  };

  const dieline: DielineResult = {
    segments: finalSegments,
    arcs: finalArcs,
    dimensions,
    bounds: finalBounds,
  };

  const report: ImportValidationReport = {
    file: doc.filename,
    format: doc.format,
    units: doc.detectedUnit,
    scaleFactorApplied: scale,
    totalEntitiesFound: doc.entities.length,
    classifiedCounts,
    totalCutMm: Math.round(totalCutMm * 10) / 10,
    totalCreaseMm: Math.round(totalCreaseMm * 10) / 10,
    totalPerfMm: Math.round(totalPerfMm * 10) / 10,
    autoRepairs,
    duplicatesRemoved,
    bezierConvertedCount,
    unsupportedEntities: doc.unsupportedEntities,
    warnings: [...doc.warnings],
    errors: [...doc.errors],
    bounds: finalBounds,
    geometryStatus: doc.errors.length > 0 ? 'FAIL' : doc.warnings.length > 0 ? 'WARNING' : 'PASS',
    maxDeviationMm: Math.max(0.001, topoResult.stats.maxGeometricDeviationMm),
  };

  return { geometry, dieline, report };
}
