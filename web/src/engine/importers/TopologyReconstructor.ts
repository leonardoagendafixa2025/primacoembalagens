import type { Point2D, Segment2D, Arc2D } from '../types';
import type { PackagingGeometry } from '../geometry';

export interface TopologyToleranceConfig {
  coincidentToleranceMm: number; // Tolerância para pontos idênticos (ex: 0.05 mm)
  gapToleranceMm: number;        // Tolerância para micro-gaps (ex: 0.40 mm)
  tJunctionToleranceMm: number;  // Tolerância para T-junctions (ex: 0.40 mm)
  colinearToleranceRad: number;  // Tolerância angular para colinearidade (ex: 0.005 rad)
  overshootToleranceMm?: number; // Tolerância para aparar rebarbas/overshoots (ex: 0.50 mm)
}

export const DEFAULT_TOPOLOGY_TOLERANCES: TopologyToleranceConfig = {
  coincidentToleranceMm: 0.08,
  gapToleranceMm: 0.80,
  tJunctionToleranceMm: 0.80,
  colinearToleranceRad: 0.005,
  overshootToleranceMm: 0.60,
};

export interface TopologyRepairEvent {
  action:
    | 'SNAP_VERTICES'
    | 'SPLIT_T_JUNCTION'
    | 'SPLIT_X_INTERSECTION'
    | 'MERGE_COLINEAR_OVERLAP'
    | 'REMOVE_DUPLICATE'
    | 'TRIM_OVERSHOOT'
    | 'SNAP_ARC_ENDPOINT';
  entityAId?: string;
  entityBId?: string;
  distanceMm: number;
  toleranceMm: number;
  location: Point2D;
  reason: string;
  before?: unknown;
  after?: unknown;
}

export interface TopologyReconstructionResult {
  geometry: PackagingGeometry;
  repairs: TopologyRepairEvent[];
  stats: {
    originalSegmentsCount: number;
    originalArcsCount: number;
    finalSegmentsCount: number;
    finalArcsCount: number;
    xIntersectionsSplit: number;
    tJunctionsSplit: number;
    gapsHealed: number;
    duplicatesRemoved: number;
    colinearMerged: number;
    maxGeometricDeviationMm: number;
  };
}

/**
 * Gera ID determinístico baseado nas coordenadas geométricas quantizadas a 3 casas decimais
 */
export function generateDeterministicSegmentId(
  type: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): string {
  let pAx = x0, pAy = y0, pBx = x1, pBy = y1;
  if (pAx > pBx || (Math.abs(pAx - pBx) < 1e-4 && pAy > pBy)) {
    pAx = x1; pAy = y1;
    pBx = x0; pBy = y0;
  }
  return `seg_${type}_${pAx.toFixed(3)}_${pAy.toFixed(3)}_to_${pBx.toFixed(3)}_${pBy.toFixed(3)}`;
}

export function generateDeterministicArcId(
  type: string,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  return `arc_${type}_${cx.toFixed(3)}_${cy.toFixed(3)}_r${r.toFixed(3)}_a${startAngle.toFixed(1)}_${endAngle.toFixed(1)}`;
}

export function generateDeterministicPointId(x: number, y: number): string {
  return `pt_${x.toFixed(3)}_${y.toFixed(3)}`;
}

/**
 * Distância euclidiana e projeção ortogonal de um ponto a um segmento de reta
 */
function distancePointToSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D
): { distance: number; projection: Point2D; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) {
    return {
      distance: Math.hypot(p.x - a.x, p.y - a.y),
      projection: { x: a.x, y: a.y },
      t: 0,
    };
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return {
    distance: Math.hypot(p.x - projX, p.y - projY),
    projection: { x: projX, y: projY },
    t,
  };
}

/**
 * Calcula a interseção analítica entre dois segmentos de reta A-B e C-D
 * Suporta interseções estritas e quase-interseções com overshoots
 */
function computeSegmentIntersection(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
  overshootTol: number = 0.5
): {
  intersects: boolean;
  point?: Point2D;
  t1?: number;
  t2?: number;
  isOvershoot1?: boolean;
  isOvershoot2?: boolean;
} {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = d.x - c.x;
  const d2y = d.y - c.y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-8) {
    return { intersects: false };
  }

  const t1 = ((c.x - a.x) * d2y - (c.y - a.y) * d2x) / denom;
  const t2 = ((c.x - a.x) * d1y - (c.y - a.y) * d1x) / denom;

  const len1 = Math.hypot(d1x, d1y);
  const len2 = Math.hypot(d2x, d2y);
  if (len1 < 1e-4 || len2 < 1e-4) return { intersects: false };

  const deltaT1 = overshootTol / len1;
  const deltaT2 = overshootTol / len2;

  // Interseção interna estrita ou com leve overshoot
  const inRange1 = t1 >= -deltaT1 && t1 <= 1 + deltaT1;
  const inRange2 = t2 >= -deltaT2 && t2 <= 1 + deltaT2;

  if (inRange1 && inRange2) {
    const isStrict1 = t1 > 0.0005 && t1 < 0.9995;
    const isStrict2 = t2 > 0.0005 && t2 < 0.9995;

    // Se ambos são quase os endpoints originais, não precisa quebrar no meio
    const isEndpoint1 = !isStrict1 && (t1 <= 0.0005 || t1 >= 0.9995);
    const isEndpoint2 = !isStrict2 && (t2 <= 0.0005 || t2 >= 0.9995);
    if (isEndpoint1 && isEndpoint2) {
      return { intersects: false };
    }

    const clampedT1 = Math.max(0, Math.min(1, t1));
    const interPt: Point2D = {
      x: a.x + clampedT1 * d1x,
      y: a.y + clampedT1 * d1y,
    };

    return {
      intersects: true,
      point: interPt,
      t1: clampedT1,
      t2: Math.max(0, Math.min(1, t2)),
      isOvershoot1: t1 < 0 || t1 > 1,
      isOvershoot2: t2 < 0 || t2 > 1,
    };
  }

  return { intersects: false };
}

/**
 * Precedência normativa estrita de camadas CAD de embalagem:
 * CUT (4) > CREASE (3) > PERFO (2) > DIMENSION (1)
 */
const TYPE_PRECEDENCE: Record<string, number> = {
  cut: 4,
  crease: 3,
  perfo: 2,
  dimension: 1,
};

/**
 * Módulo de Reconstrução de Conectividade e Topologia 2D Estrutural Hiper-Inteligente
 * 
 * Capacidades Industriais:
 * 1. Resolução analítica completa de cruzamentos em X (X-Junctions) com divisão dos segmentos.
 * 2. Detecção e subdivisão analítica de encontros em T (T-Junctions) e linhas contínuas cruzadas.
 * 3. Aparo automático de rebarbas/overshoots (micro-linhas que passam ligeiramente do vinco).
 * 4. Snapping bidirecional robusto de micro-gaps via Spatial Hash Grid O(N).
 * 5. Concordância com arcos (Arc2D) e linhas tangentes.
 * 6. Fusão colinear com precedência normativa estrita (Corte > Vinco > Picote).
 */
export class TopologyReconstructor {
  public static reconstructPlanarTopology(
    inputGeometry: PackagingGeometry,
    tolerances: Partial<TopologyToleranceConfig> = {}
  ): TopologyReconstructionResult {
    return TopologyReconstructor.reconstructConnectivity(inputGeometry, tolerances);
  }

  public static reconstructConnectivity(
    inputGeometry: PackagingGeometry,
    tolerances: Partial<TopologyToleranceConfig> = {}
  ): TopologyReconstructionResult {
    const config: TopologyToleranceConfig = {
      ...DEFAULT_TOPOLOGY_TOLERANCES,
      ...tolerances,
    };

    const repairs: TopologyRepairEvent[] = [];
    let xIntersectionsSplit = 0;
    let tJunctionsSplit = 0;
    let gapsHealed = 0;
    let duplicatesRemoved = 0;
    let colinearMerged = 0;
    let maxGeometricDeviationMm = 0;

    // 1. Sanitização e quantização inicial
    let segments: Segment2D[] = inputGeometry.segments
      .filter((s) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0) > 0.001)
      .map((s) => ({
        id: s.id,
        x0: Number(s.x0.toFixed(4)),
        y0: Number(s.y0.toFixed(4)),
        x1: Number(s.x1.toFixed(4)),
        y1: Number(s.y1.toFixed(4)),
        type: s.type,
      }));

    const arcs: Arc2D[] = inputGeometry.arcs
      .filter((a) => a.r > 0.001)
      .map((a) => ({
        id: a.id,
        cx: Number(a.cx.toFixed(4)),
        cy: Number(a.cy.toFixed(4)),
        r: Number(a.r.toFixed(4)),
        startAngle: Number(a.startAngle.toFixed(4)),
        endAngle: Number(a.endAngle.toFixed(4)),
        type: a.type,
      }));

    // =========================================================================
    // PASSO 0: CURA INDUSTRIAL DE ALÍVIOS, RECUOS E DEGRAUS (Setback & Relief Healer)
    // Em arquivos CAD (Artios, AutoCAD, Illustrator), vincos frequentemente possuem
    // recuos técnicos de 0.8mm a 2.5mm antes dos cortes e entalhes de alívio circular.
    // =========================================================================
    // 0a: Fechamento de gaps entre vincos colineares (relief notches <= 3.5mm)
    const creaseSegs = segments.filter((s) => s.type === 'crease');
    const bridgeCreases: Segment2D[] = [];
    for (let i = 0; i < creaseSegs.length; i++) {
      const c1 = creaseSegs[i];
      const dx1 = c1.x1 - c1.x0;
      const dy1 = c1.y1 - c1.y0;
      const l1 = Math.hypot(dx1, dy1);
      if (l1 < 1e-4) continue;
      const u1x = dx1 / l1, u1y = dy1 / l1;

      for (let j = i + 1; j < creaseSegs.length; j++) {
        const c2 = creaseSegs[j];
        const dx2 = c2.x1 - c2.x0;
        const dy2 = c2.y1 - c2.y0;
        const l2 = Math.hypot(dx2, dy2);
        if (l2 < 1e-4) continue;
        const u2x = dx2 / l2, u2y = dy2 / l2;

        const cross = Math.abs(u1x * u2y - u1y * u2x);
        if (cross > 0.06) continue;

        const v0x = c2.x0 - c1.x0;
        const v0y = c2.y0 - c1.y0;
        if (Math.abs(v0x * u1y - v0y * u1x) > 0.3) continue;

        const pairs: [{ x: number; y: number }, { x: number; y: number }][] = [
          [{ x: c1.x0, y: c1.y0 }, { x: c2.x0, y: c2.y0 }],
          [{ x: c1.x0, y: c1.y0 }, { x: c2.x1, y: c2.y1 }],
          [{ x: c1.x1, y: c1.y1 }, { x: c2.x0, y: c2.y0 }],
          [{ x: c1.x1, y: c1.y1 }, { x: c2.x1, y: c2.y1 }],
        ];
        for (const [pA, pB] of pairs) {
          const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
          if (d > 0.05 && d <= 3.5) {
            const bdx = (pB.x - pA.x) / d;
            const bdy = (pB.y - pA.y) / d;
            if (Math.abs(Math.abs(bdx * u1x + bdy * u1y) - 1.0) < 0.15) {
              bridgeCreases.push({
                id: generateDeterministicSegmentId('crease', pA.x, pA.y, pB.x, pB.y),
                x0: pA.x,
                y0: pA.y,
                x1: pB.x,
                y1: pB.y,
                type: 'crease',
              });
              gapsHealed++;
              repairs.push({
                action: 'SNAP_VERTICES',
                distanceMm: d,
                toleranceMm: 3.5,
                location: { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 },
                reason: `Ponte de vinco colinear criada para fechar alívio de ${d.toFixed(3)}mm`,
              });
            }
          }
        }
      }
    }
    segments.push(...bridgeCreases);

    // 0b: Cura de pontas soltas de vincos (Crease Setback Healer <= 3.5mm)
    for (const s of segments) {
      if (s.type !== 'crease') continue;
      for (const ep of ['p0', 'p1'] as const) {
        const ptX = ep === 'p0' ? s.x0 : s.x1;
        const ptY = ep === 'p0' ? s.y0 : s.y1;
        const otherX = ep === 'p0' ? s.x1 : s.x0;
        const otherY = ep === 'p0' ? s.y1 : s.y0;

        let touchesAny = false;
        for (const o of segments) {
          if (o === s) continue;
          if (Math.hypot(o.x0 - ptX, o.y0 - ptY) < 0.25 || Math.hypot(o.x1 - ptX, o.y1 - ptY) < 0.25) {
            touchesAny = true;
            break;
          }
          const { distance } = distancePointToSegment({ x: ptX, y: ptY }, { x: o.x0, y: o.y0 }, { x: o.x1, y: o.y1 });
          if (distance < 0.25) {
            touchesAny = true;
            break;
          }
        }
        if (touchesAny) continue;

        const dirx = ptX - otherX;
        const diry = ptY - otherY;
        const dlen = Math.hypot(dirx, diry);
        if (dlen < 1e-4) continue;
        const udx = dirx / dlen;
        const udy = diry / dlen;

        let bestT = 3.5;
        let bestInter: Point2D | null = null;
        for (const o of segments) {
          if (o === s) continue;
          const x3 = o.x0, y3 = o.y0;
          const x4 = o.x1, y4 = o.y1;
          const denom = udx * (y4 - y3) - udy * (x4 - x3);
          if (Math.abs(denom) < 1e-5) continue;
          const t = ((x3 - ptX) * (y4 - y3) - (y3 - ptY) * (x4 - x3)) / denom;
          const u = ((x3 - ptX) * udy - (y3 - ptY) * udx) / denom;
          if (t > 0.02 && t <= bestT && u >= -0.02 && u <= 1.02) {
            bestT = t;
            bestInter = { x: Number((ptX + t * udx).toFixed(4)), y: Number((ptY + t * udy).toFixed(4)) };
          }
        }
        if (bestInter) {
          if (ep === 'p0') {
            s.x0 = bestInter.x;
            s.y0 = bestInter.y;
          } else {
            s.x1 = bestInter.x;
            s.y1 = bestInter.y;
          }
          gapsHealed++;
          repairs.push({
            action: 'SNAP_VERTICES',
            entityAId: String(s.id),
            distanceMm: bestT,
            toleranceMm: 3.5,
            location: bestInter,
            reason: `Extensão de recuo de vinco (setback ${bestT.toFixed(3)}mm) conectada à linha adjacente`,
          });
        }
      }
    }

    // 0c: Fechamento de degraus no contorno de corte (Boundary Step Closures <= 3.6mm)
    const cutEndpoints: { pt: Point2D; seg: Segment2D }[] = [];
    for (const s of segments) {
      if (s.type !== 'cut') continue;
      for (const ep of ['p0', 'p1'] as const) {
        const ptX = ep === 'p0' ? s.x0 : s.x1;
        const ptY = ep === 'p0' ? s.y0 : s.y1;
        let meets = 0;
        for (const o of segments) {
          if (Math.hypot(o.x0 - ptX, o.y0 - ptY) < 0.2 || Math.hypot(o.x1 - ptX, o.y1 - ptY) < 0.2) {
            meets++;
          } else if (o !== s) {
            const { distance } = distancePointToSegment({ x: ptX, y: ptY }, { x: o.x0, y: o.y0 }, { x: o.x1, y: o.y1 });
            if (distance < 0.2) meets++;
          }
        }
        if (meets <= 1) {
          cutEndpoints.push({ pt: { x: ptX, y: ptY }, seg: s });
        }
      }
    }
    const boundaryBridges: Segment2D[] = [];
    for (let i = 0; i < cutEndpoints.length; i++) {
      for (let j = i + 1; j < cutEndpoints.length; j++) {
        const pA = cutEndpoints[i].pt;
        const pB = cutEndpoints[j].pt;
        const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        if (d > 0.05 && d <= 3.6) {
          boundaryBridges.push({
            id: generateDeterministicSegmentId('cut', pA.x, pA.y, pB.x, pB.y),
            x0: pA.x,
            y0: pA.y,
            x1: pB.x,
            y1: pB.y,
            type: 'cut',
          });
          gapsHealed++;
          repairs.push({
            action: 'SNAP_VERTICES',
            distanceMm: d,
            toleranceMm: 3.6,
            location: { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 },
            reason: `Fechamento de degrau de corte de ${d.toFixed(3)}mm`,
          });
        }
      }
    }
    segments.push(...boundaryBridges);

    // =========================================================================
    // PASSO 1: SNAP DE MICRO-GAPS INICIAIS (Spatial Hash Grid O(N))
    // =========================================================================
    const gapCellSize = Math.max(1.0, config.gapToleranceMm * 5);
    const getGridKey = (gx: number, gy: number) => `${gx}_${gy}`;

    type EndpointRef = { segIdx: number; ep: 'p0' | 'p1'; x: number; y: number };
    const snapGrid = new Map<string, EndpointRef[]>();

    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      for (const ep of ['p0', 'p1'] as const) {
        const x = ep === 'p0' ? s.x0 : s.x1;
        const y = ep === 'p0' ? s.y0 : s.y1;
        const gx = Math.floor(x / gapCellSize);
        const gy = Math.floor(y / gapCellSize);
        const key = getGridKey(gx, gy);
        let cell = snapGrid.get(key);
        if (!cell) { cell = []; snapGrid.set(key, cell); }
        cell.push({ segIdx: i, ep, x, y });
      }
    }

    for (let i = 0; i < segments.length; i++) {
      const s1 = segments[i];
      for (const epA of ['p0', 'p1'] as const) {
        const ax = epA === 'p0' ? s1.x0 : s1.x1;
        const ay = epA === 'p0' ? s1.y0 : s1.y1;
        const gx = Math.floor(ax / gapCellSize);
        const gy = Math.floor(ay / gapCellSize);

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const list = snapGrid.get(getGridKey(gx + dx, gy + dy));
            if (!list) continue;

            for (const cand of list) {
              if (cand.segIdx <= i) continue;
              const s2 = segments[cand.segIdx];
              const bx = cand.ep === 'p0' ? s2.x0 : s2.x1;
              const by = cand.ep === 'p0' ? s2.y0 : s2.y1;

              const gap = Math.hypot(ax - bx, ay - by);
              if (gap > 0.0005 && gap <= config.gapToleranceMm) {
                const midX = Number(((ax + bx) / 2).toFixed(4));
                const midY = Number(((ay + by) / 2).toFixed(4));

                if (epA === 'p0') { s1.x0 = midX; s1.y0 = midY; }
                else { s1.x1 = midX; s1.y1 = midY; }

                if (cand.ep === 'p0') { s2.x0 = midX; s2.y0 = midY; }
                else { s2.x1 = midX; s2.y1 = midY; }

                cand.x = midX;
                cand.y = midY;

                gapsHealed++;
                if (gap > maxGeometricDeviationMm) maxGeometricDeviationMm = gap;

                repairs.push({
                  action: 'SNAP_VERTICES',
                  entityAId: String(s1.id),
                  entityBId: String(s2.id),
                  distanceMm: gap,
                  toleranceMm: config.gapToleranceMm,
                  location: { x: midX, y: midY },
                  reason: `Micro-gap de ${gap.toFixed(4)}mm unido no ponto médio`,
                });
              }
            }
          }
        }
      }
    }

    // =========================================================================
    // PASSO 2: RESOLUÇÃO HIPER-INTELIGENTE DE X-INTERSECTIONS (Cruzamentos de Retas)
    // =========================================================================
    const xSplits = new Map<number, { pt: Point2D; t: number }[]>();
    for (let i = 0; i < segments.length; i++) xSplits.set(i, []);

    const segBboxes = segments.map((s) => ({
      minX: Math.min(s.x0, s.x1) - config.tJunctionToleranceMm,
      maxX: Math.max(s.x0, s.x1) + config.tJunctionToleranceMm,
      minY: Math.min(s.y0, s.y1) - config.tJunctionToleranceMm,
      maxY: Math.max(s.y0, s.y1) + config.tJunctionToleranceMm,
    }));

    const overshootTol = config.overshootToleranceMm ?? 0.50;

    for (let i = 0; i < segments.length; i++) {
      const s1 = segments[i];
      const bb1 = segBboxes[i];
      const p1A = { x: s1.x0, y: s1.y0 };
      const p1B = { x: s1.x1, y: s1.y1 };

      for (let j = i + 1; j < segments.length; j++) {
        const bb2 = segBboxes[j];
        if (bb1.maxX < bb2.minX || bb1.minX > bb2.maxX || bb1.maxY < bb2.minY || bb1.minY > bb2.maxY) {
          continue;
        }

        const s2 = segments[j];
        const p2A = { x: s2.x0, y: s2.y0 };
        const p2B = { x: s2.x1, y: s2.y1 };

        const inter = computeSegmentIntersection(p1A, p1B, p2A, p2B, overshootTol);
        if (inter.intersects && inter.point && inter.t1 !== undefined && inter.t2 !== undefined) {
          const pt: Point2D = {
            x: Number(inter.point.x.toFixed(4)),
            y: Number(inter.point.y.toFixed(4)),
          };

          if (inter.t1 > 0.001 && inter.t1 < 0.999) {
            xSplits.get(i)!.push({ pt, t: inter.t1 });
          }
          if (inter.t2 > 0.001 && inter.t2 < 0.999) {
            xSplits.get(j)!.push({ pt, t: inter.t2 });
          }

          xIntersectionsSplit++;
          repairs.push({
            action: 'SPLIT_X_INTERSECTION',
            entityAId: String(s1.id),
            entityBId: String(s2.id),
            distanceMm: 0,
            toleranceMm: 0.001,
            location: pt,
            reason: `Cruzamento em X particionado com precisão em (${pt.x.toFixed(3)}, ${pt.y.toFixed(3)})`,
          });
        }
      }
    }

    // Aplica a subdivisão em X
    const segmentsAfterX: Segment2D[] = [];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const splits = xSplits.get(i) || [];
      if (splits.length === 0) {
        segmentsAfterX.push(s);
      } else {
        splits.sort((a, b) => a.t - b.t);
        let curr = { x: s.x0, y: s.y0 };
        for (const sp of splits) {
          if (Math.hypot(sp.pt.x - curr.x, sp.pt.y - curr.y) > 0.001) {
            segmentsAfterX.push({
              id: generateDeterministicSegmentId(s.type, curr.x, curr.y, sp.pt.x, sp.pt.y),
              x0: curr.x,
              y0: curr.y,
              x1: sp.pt.x,
              y1: sp.pt.y,
              type: s.type,
            });
            curr = sp.pt;
          }
        }
        if (Math.hypot(s.x1 - curr.x, s.y1 - curr.y) > 0.001) {
          segmentsAfterX.push({
            id: generateDeterministicSegmentId(s.type, curr.x, curr.y, s.x1, s.y1),
            x0: curr.x,
            y0: curr.y,
            x1: s.x1,
            y1: s.y1,
            type: s.type,
          });
        }
      }
    }
    segments = segmentsAfterX;

    // =========================================================================
    // =========================================================================
    // PASSO 3: RESOLUÇÃO COMPLETA DE T-JUNCTIONS (Vértices que Encontram Linhas Contínuas)
    // =========================================================================
    interface VertexCluster {
      id: number;
      x: number;
      y: number;
      members: Array<{ seg: Segment2D; ep: 'p0' | 'p1' }>;
      arcMembers: Array<{ arc: Arc2D; ep: 'start' | 'end' }>;
    }

    const vTol = Math.max(config.coincidentToleranceMm, 0.04);
    const clusters: VertexCluster[] = [];

    function findOrCreateCluster(x: number, y: number): VertexCluster {
      for (const cl of clusters) {
        if (Math.hypot(cl.x - x, cl.y - y) <= vTol) {
          return cl;
        }
      }
      const newCl: VertexCluster = {
        id: clusters.length,
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        members: [],
        arcMembers: [],
      };
      clusters.push(newCl);
      return newCl;
    }

    for (const s of segments) {
      const c0 = findOrCreateCluster(s.x0, s.y0);
      c0.members.push({ seg: s, ep: 'p0' });
      const c1 = findOrCreateCluster(s.x1, s.y1);
      c1.members.push({ seg: s, ep: 'p1' });
    }

    for (const a of arcs) {
      const aStartRad = (a.startAngle * Math.PI) / 180;
      const aEndRad = (a.endAngle * Math.PI) / 180;
      const cStart = findOrCreateCluster(a.cx + a.r * Math.cos(aStartRad), a.cy + a.r * Math.sin(aStartRad));
      cStart.arcMembers.push({ arc: a, ep: 'start' });
      const cEnd = findOrCreateCluster(a.cx + a.r * Math.cos(aEndRad), a.cy + a.r * Math.sin(aEndRad));
      cEnd.arcMembers.push({ arc: a, ep: 'end' });
    }

    // Identifica divisões em T por segmento e muta os membros do cluster para o ponto projetado
    const segSplitsMap = new Map<Segment2D, { pt: Point2D; t: number; dist: number }[]>();

    for (const seg of segments) {
      const p0 = { x: seg.x0, y: seg.y0 };
      const p1 = { x: seg.x1, y: seg.y1 };
      const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (segLen < 1e-4) continue;

      const tSplits: { pt: Point2D; t: number; dist: number }[] = [];

      for (const cl of clusters) {
        // Se este cluster já contém um endpoint deste mesmo segmento, pula
        if (cl.members.some((m) => m.seg === seg)) continue;

        const { distance, projection, t } = distancePointToSegment({ x: cl.x, y: cl.y }, p0, p1);
        if (distance <= config.tJunctionToleranceMm && t > 0.001 && t < 0.999) {
          const projPt: Point2D = {
            x: Number(projection.x.toFixed(4)),
            y: Number(projection.y.toFixed(4)),
          };
          tSplits.push({ pt: projPt, t, dist: distance });

          // CRITICAL: Atualiza as coordenadas reais de TODOS os segmentos que terminam neste cluster!
          for (const m of cl.members) {
            if (m.ep === 'p0') {
              m.seg.x0 = projPt.x;
              m.seg.y0 = projPt.y;
            } else {
              m.seg.x1 = projPt.x;
              m.seg.y1 = projPt.y;
            }
          }
          cl.x = projPt.x;
          cl.y = projPt.y;

          if (distance > maxGeometricDeviationMm) maxGeometricDeviationMm = distance;
          tJunctionsSplit++;

          repairs.push({
            action: 'SPLIT_T_JUNCTION',
            entityAId: String(seg.id),
            distanceMm: distance,
            toleranceMm: config.tJunctionToleranceMm,
            location: projPt,
            reason: `T-Junction resolvida: segmento subdividido e vinco/corte conectado com precisão em t=${t.toFixed(4)}`,
          });
        }
      }

      if (tSplits.length > 0) {
        segSplitsMap.set(seg, tSplits);
      }
    }

    // Subdivide os segmentos contínuos nas divisões em T
    const segmentsAfterT: Segment2D[] = [];
    for (const seg of segments) {
      const splits = segSplitsMap.get(seg);
      if (!splits || splits.length === 0) {
        segmentsAfterT.push(seg);
      } else {
        splits.sort((a, b) => a.t - b.t);
        let curr = { x: seg.x0, y: seg.y0 };
        for (const sp of splits) {
          if (Math.hypot(sp.pt.x - curr.x, sp.pt.y - curr.y) > 0.001) {
            segmentsAfterT.push({
              id: generateDeterministicSegmentId(seg.type, curr.x, curr.y, sp.pt.x, sp.pt.y),
              x0: curr.x,
              y0: curr.y,
              x1: sp.pt.x,
              y1: sp.pt.y,
              type: seg.type,
            });
            curr = sp.pt;
          }
        }
        if (Math.hypot(seg.x1 - curr.x, seg.y1 - curr.y) > 0.001) {
          segmentsAfterT.push({
            id: generateDeterministicSegmentId(seg.type, curr.x, curr.y, seg.x1, seg.y1),
            x0: curr.x,
            y0: curr.y,
            x1: seg.x1,
            y1: seg.y1,
            type: seg.type,
          });
        }
      }
    }
    segments = segmentsAfterT;

    // =========================================================================
    // PASSO 3.5: EXTENSÃO E CONEXÃO DE VINCOS SOLTOS (Dangling Crease Extender)
    // Em embalagens, todo vinco DEVE conectar as duas extremidades a cortes ou outros vincos.
    // Vinco com grau 1 impede a partição de faces e impossibilita o fechamento 3D.
    // =========================================================================
    for (let round = 0; round < 2; round++) {
      const segmentsToAdd: Segment2D[] = [];
      const segmentsToRemove = new Set<Segment2D>();

      for (const s of segments) {
        if (s.type !== 'crease') continue;
        if (segmentsToRemove.has(s)) continue;

        for (const ep of ['p0', 'p1'] as const) {
          const pt = ep === 'p0' ? { x: s.x0, y: s.y0 } : { x: s.x1, y: s.y1 };
          const otherPt = ep === 'p0' ? { x: s.x1, y: s.y1 } : { x: s.x0, y: s.y0 };

          // Conta conectividade desta ponta
          let meets = 0;
          for (const o of segments) {
            if (o === s || segmentsToRemove.has(o)) continue;
            if (Math.hypot(o.x0 - pt.x, o.y0 - pt.y) <= 0.15 || Math.hypot(o.x1 - pt.x, o.y1 - pt.y) <= 0.15) {
              meets++;
              break;
            }
            const { distance, t } = distancePointToSegment(pt, { x: o.x0, y: o.y0 }, { x: o.x1, y: o.y1 });
            if (distance <= 0.08 && t > 0.01 && t < 0.99) {
              meets++;
              break;
            }
          }

          if (meets > 0) continue; // Conectado com sucesso

          // 1. Tenta snap a endpoint próximo (até 1.5mm)
          let closestEndPt: Point2D | null = null;
          let minEndDist = 1.5;
          for (const o of segments) {
            if (o === s || segmentsToRemove.has(o)) continue;
            const d0 = Math.hypot(o.x0 - pt.x, o.y0 - pt.y);
            const d1 = Math.hypot(o.x1 - pt.x, o.y1 - pt.y);
            if (d0 < minEndDist) { minEndDist = d0; closestEndPt = { x: o.x0, y: o.y0 }; }
            if (d1 < minEndDist) { minEndDist = d1; closestEndPt = { x: o.x1, y: o.y1 }; }
          }
          if (closestEndPt && minEndDist <= 1.5) {
            if (ep === 'p0') { s.x0 = closestEndPt.x; s.y0 = closestEndPt.y; }
            else { s.x1 = closestEndPt.x; s.y1 = closestEndPt.y; }
            continue;
          }

          // 2. Projeta raio na direção do vinco para interceptar cortes/vincos (até 4.0mm)
          const dirX = pt.x - otherPt.x;
          const dirY = pt.y - otherPt.y;
          const len = Math.hypot(dirX, dirY);
          if (len < 1e-4) continue;
          const ux = dirX / len;
          const uy = dirY / len;

          let bestHit: { pt: Point2D; dist: number; seg: Segment2D; t: number } | null = null;
          const maxReach = 4.0;

          for (const o of segments) {
            if (o === s || segmentsToRemove.has(o)) continue;
            const x3 = o.x0, y3 = o.y0, x4 = o.x1, y4 = o.y1;
            const denom = ux * (y4 - y3) - uy * (x4 - x3);
            if (Math.abs(denom) < 1e-5) continue;
            const rayT = ((x3 - pt.x) * (y4 - y3) - (y3 - pt.y) * (x4 - x3)) / denom;
            const segU = ((x3 - pt.x) * uy - (y3 - pt.y) * ux) / denom;
            if (rayT > 0.02 && rayT <= maxReach && segU >= -0.01 && segU <= 1.01) {
              if (!bestHit || rayT < bestHit.dist) {
                const clampedU = Math.max(0, Math.min(1, segU));
                bestHit = {
                  pt: {
                    x: Number((x3 + clampedU * (x4 - x3)).toFixed(4)),
                    y: Number((y3 + clampedU * (y4 - y3)).toFixed(4)),
                  },
                  dist: rayT,
                  seg: o,
                  t: clampedU,
                };
              }
            }
          }

          if (bestHit) {
            // Estende o vinco até o ponto de impacto
            if (ep === 'p0') { s.x0 = bestHit.pt.x; s.y0 = bestHit.pt.y; }
            else { s.x1 = bestHit.pt.x; s.y1 = bestHit.pt.y; }

            // Subdivide o segmento atingido se o impacto foi interno
            if (bestHit.t > 0.01 && bestHit.t < 0.99) {
              segmentsToRemove.add(bestHit.seg);
              segmentsToAdd.push({
                id: generateDeterministicSegmentId(bestHit.seg.type, bestHit.seg.x0, bestHit.seg.y0, bestHit.pt.x, bestHit.pt.y),
                x0: bestHit.seg.x0,
                y0: bestHit.seg.y0,
                x1: bestHit.pt.x,
                y1: bestHit.pt.y,
                type: bestHit.seg.type,
              });
              segmentsToAdd.push({
                id: generateDeterministicSegmentId(bestHit.seg.type, bestHit.pt.x, bestHit.pt.y, bestHit.seg.x1, bestHit.seg.y1),
                x0: bestHit.pt.x,
                y0: bestHit.pt.y,
                x1: bestHit.seg.x1,
                y1: bestHit.seg.y1,
                type: bestHit.seg.type,
              });
            }
            continue;
          }

          // 3. Projeção perpendicular mais próxima (até 1.5mm)
          let bestProj: { pt: Point2D; dist: number; seg: Segment2D; t: number } | null = null;
          for (const o of segments) {
            if (o === s || segmentsToRemove.has(o)) continue;
            const { distance, projection, t } = distancePointToSegment(pt, { x: o.x0, y: o.y0 }, { x: o.x1, y: o.y1 });
            if (distance <= 1.5 && t >= -0.01 && t <= 1.01) {
              if (!bestProj || distance < bestProj.dist) {
                bestProj = {
                  pt: { x: Number(projection.x.toFixed(4)), y: Number(projection.y.toFixed(4)) },
                  dist: distance,
                  seg: o,
                  t: Math.max(0, Math.min(1, t)),
                };
              }
            }
          }

          if (bestProj) {
            if (ep === 'p0') { s.x0 = bestProj.pt.x; s.y0 = bestProj.pt.y; }
            else { s.x1 = bestProj.pt.x; s.y1 = bestProj.pt.y; }

            if (bestProj.t > 0.01 && bestProj.t < 0.99) {
              segmentsToRemove.add(bestProj.seg);
              segmentsToAdd.push({
                id: generateDeterministicSegmentId(bestProj.seg.type, bestProj.seg.x0, bestProj.seg.y0, bestProj.pt.x, bestProj.pt.y),
                x0: bestProj.seg.x0,
                y0: bestProj.seg.y0,
                x1: bestProj.pt.x,
                y1: bestProj.pt.y,
                type: bestProj.seg.type,
              });
              segmentsToAdd.push({
                id: generateDeterministicSegmentId(bestProj.seg.type, bestProj.pt.x, bestProj.pt.y, bestProj.seg.x1, bestProj.seg.y1),
                x0: bestProj.pt.x,
                y0: bestProj.pt.y,
                x1: bestProj.seg.x1,
                y1: bestProj.seg.y1,
                type: bestProj.seg.type,
              });
            }
          }
        }
      }

      if (segmentsToRemove.size > 0 || segmentsToAdd.length > 0) {
        segments = segments.filter((s) => !segmentsToRemove.has(s)).concat(segmentsToAdd);
      }
    }

    // =========================================================================
    // PASSO 3.8: SNAP GLOBAL COALESCENTE DE VÉRTICES (0.20mm)
    // Garante identidade exata de float em todos os nós compartilhados
    // =========================================================================
    const finalPtGrid = new Map<string, Array<{ seg: Segment2D; ep: 'p0' | 'p1'; x: number; y: number }>>();
    const ptSnapTol = 0.20;
    const ptCell = 1.0;

    for (const s of segments) {
      for (const ep of ['p0', 'p1'] as const) {
        const x = ep === 'p0' ? s.x0 : s.x1;
        const y = ep === 'p0' ? s.y0 : s.y1;
        const gx = Math.floor(x / ptCell);
        const gy = Math.floor(y / ptCell);
        const k = `${gx}_${gy}`;
        let list = finalPtGrid.get(k);
        if (!list) { list = []; finalPtGrid.set(k, list); }
        list.push({ seg: s, ep, x, y });
      }
    }

    const processedPts = new Set<string>();
    for (const [, list] of finalPtGrid) {
      for (const item of list) {
        const key = `${item.x.toFixed(3)}_${item.y.toFixed(3)}`;
        if (processedPts.has(key)) continue;
        processedPts.add(key);

        const gx = Math.floor(item.x / ptCell);
        const gy = Math.floor(item.y / ptCell);
        const clusterItems: Array<{ seg: Segment2D; ep: 'p0' | 'p1' }> = [];
        let sumX = 0, sumY = 0;

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const neighborList = finalPtGrid.get(`${gx + dx}_${gy + dy}`);
            if (!neighborList) continue;
            for (const cand of neighborList) {
              if (Math.hypot(cand.x - item.x, cand.y - item.y) <= ptSnapTol) {
                clusterItems.push({ seg: cand.seg, ep: cand.ep });
                sumX += cand.x;
                sumY += cand.y;
              }
            }
          }
        }

        if (clusterItems.length > 1) {
          const avgX = Number((sumX / clusterItems.length).toFixed(4));
          const avgY = Number((sumY / clusterItems.length).toFixed(4));
          for (const ci of clusterItems) {
            if (ci.ep === 'p0') { ci.seg.x0 = avgX; ci.seg.y0 = avgY; }
            else { ci.seg.x1 = avgX; ci.seg.y1 = avgY; }
          }
        }
      }
    }

    // =========================================================================
    // PASSO 4: APARO DE MICRO-REBARBAS / DEAD-END STUBS (Overshoots <= 0.40mm)
    // =========================================================================
    // Calcula o grau (conectividade) de cada endpoint
    const vertexDeg = new Map<string, number>();
    const getPtKey = (x: number, y: number) => `${x.toFixed(3)}_${y.toFixed(3)}`;

    for (const s of segments) {
      const k0 = getPtKey(s.x0, s.y0);
      const k1 = getPtKey(s.x1, s.y1);
      vertexDeg.set(k0, (vertexDeg.get(k0) || 0) + 1);
      vertexDeg.set(k1, (vertexDeg.get(k1) || 0) + 1);
    }
    for (const a of arcs) {
      const aStartRad = (a.startAngle * Math.PI) / 180;
      const aEndRad = (a.endAngle * Math.PI) / 180;
      const k0 = getPtKey(a.cx + a.r * Math.cos(aStartRad), a.cy + a.r * Math.sin(aStartRad));
      const k1 = getPtKey(a.cx + a.r * Math.cos(aEndRad), a.cy + a.r * Math.sin(aEndRad));
      vertexDeg.set(k0, (vertexDeg.get(k0) || 0) + 1);
      vertexDeg.set(k1, (vertexDeg.get(k1) || 0) + 1);
    }

    // Remove pequenos toquinhos cegos (grau 1 com comprimento <= 0.4mm cujo outro lado conecta a >= 3)
    const prunedSegments: Segment2D[] = [];
    const maxStubLen = Math.min(0.45, config.tJunctionToleranceMm);

    for (const s of segments) {
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
      const d0 = vertexDeg.get(getPtKey(s.x0, s.y0)) || 0;
      const d1 = vertexDeg.get(getPtKey(s.x1, s.y1)) || 0;

      const isStub0 = s.type !== 'crease' && d0 === 1 && d1 >= 3 && len <= maxStubLen;
      const isStub1 = s.type !== 'crease' && d1 === 1 && d0 >= 3 && len <= maxStubLen;

      if (isStub0 || isStub1) {
        repairs.push({
          action: 'TRIM_OVERSHOOT',
          entityAId: String(s.id),
          distanceMm: len,
          toleranceMm: maxStubLen,
          location: isStub0 ? { x: s.x0, y: s.y0 } : { x: s.x1, y: s.y1 },
          reason: `Rebarba cega de overshoot de ${len.toFixed(3)}mm aparada para garantir contorno limpo`,
        });
      } else {
        prunedSegments.push(s);
      }
    }
    segments = prunedSegments;

    // =========================================================================
    // PASSO 5: DEDUPLICAÇÃO E FUSÃO COLINEAR COM PRECEDÊNCIA NORMATIVA ESTREITA
    // CUT (4) > CREASE (3) > PERFO (2) > DIMENSION (1)
    // =========================================================================
    const canonicalMap = new Map<string, Segment2D>();

    for (const seg of segments) {
      if (Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) < 0.001) continue;

      let pAx = seg.x0, pAy = seg.y0, pBx = seg.x1, pBy = seg.y1;
      if (pAx > pBx || (Math.abs(pAx - pBx) < 1e-4 && pAy > pBy)) {
        pAx = seg.x1; pAy = seg.y1;
        pBx = seg.x0; pBy = seg.y0;
      }
      const geomKey = `${pAx.toFixed(3)}_${pAy.toFixed(3)}_to_${pBx.toFixed(3)}_${pBy.toFixed(3)}`;

      const existing = canonicalMap.get(geomKey);
      if (!existing) {
        canonicalMap.set(geomKey, { ...seg, x0: pAx, y0: pAy, x1: pBx, y1: pBy });
      } else {
        const pSeg = TYPE_PRECEDENCE[seg.type] || 0;
        const pExist = TYPE_PRECEDENCE[existing.type] || 0;

        if (seg.type !== existing.type) {
          colinearMerged++;
          const winningType = pSeg > pExist ? seg.type : existing.type;
          const absorbedType = pSeg > pExist ? existing.type : seg.type;
          existing.type = winningType;

          repairs.push({
            action: 'MERGE_COLINEAR_OVERLAP',
            entityAId: String(existing.id),
            entityBId: String(seg.id),
            distanceMm: 0,
            toleranceMm: config.coincidentToleranceMm,
            location: { x: (pAx + pBx) / 2, y: (pAy + pBy) / 2 },
            reason: `Sobreposição colinear fundida: ${winningType.toUpperCase()} prevaleceu sobre ${absorbedType.toUpperCase()} por precedência normativa`,
          });
        } else {
          duplicatesRemoved++;
          repairs.push({
            action: 'REMOVE_DUPLICATE',
            entityAId: String(existing.id),
            entityBId: String(seg.id),
            distanceMm: 0,
            toleranceMm: config.coincidentToleranceMm,
            location: { x: (pAx + pBx) / 2, y: (pAy + pBy) / 2 },
            reason: `Segmento idêntico duplicado removido`,
          });
        }
      }
    }

    const finalSegmentsList = Array.from(canonicalMap.values());

    // IDs determinísticos finais
    const finalDeterministicSegments: Segment2D[] = finalSegmentsList.map((s) => ({
      ...s,
      id: generateDeterministicSegmentId(s.type, s.x0, s.y0, s.x1, s.y1),
    }));

    const finalDeterministicArcs: Arc2D[] = arcs.map((a) => ({
      ...a,
      id: generateDeterministicArcId(a.type, a.cx, a.cy, a.r, a.startAngle, a.endAngle),
    }));

    finalDeterministicSegments.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    finalDeterministicArcs.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

    const finalGeometry: PackagingGeometry = {
      ...inputGeometry,
      segments: finalDeterministicSegments,
      arcs: finalDeterministicArcs,
      bounds: {
        minX: Math.min(...finalDeterministicSegments.map((s) => Math.min(s.x0, s.x1)), 0),
        minY: Math.min(...finalDeterministicSegments.map((s) => Math.min(s.y0, s.y1)), 0),
        maxX: Math.max(...finalDeterministicSegments.map((s) => Math.max(s.x0, s.x1)), 100),
        maxY: Math.max(...finalDeterministicSegments.map((s) => Math.max(s.y0, s.y1)), 100),
        width: 0,
        height: 0,
      },
    };
    finalGeometry.bounds.width = finalGeometry.bounds.maxX - finalGeometry.bounds.minX;
    finalGeometry.bounds.height = finalGeometry.bounds.maxY - finalGeometry.bounds.minY;

    return {
      geometry: finalGeometry,
      repairs,
      stats: {
        originalSegmentsCount: inputGeometry.segments.length,
        originalArcsCount: inputGeometry.arcs.length,
        finalSegmentsCount: finalDeterministicSegments.length,
        finalArcsCount: finalDeterministicArcs.length,
        xIntersectionsSplit,
        tJunctionsSplit,
        gapsHealed,
        duplicatesRemoved,
        colinearMerged,
        maxGeometricDeviationMm,
      },
    };
  }
}
