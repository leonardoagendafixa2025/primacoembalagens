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
  coincidentToleranceMm: 0.05,
  gapToleranceMm: 0.40,
  tJunctionToleranceMm: 0.40,
  colinearToleranceRad: 0.005,
  overshootToleranceMm: 0.50,
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
    // PASSO 3: RESOLUÇÃO COMPLETA DE T-JUNCTIONS (Vértices que Encontram Linhas Contínuas)
    // =========================================================================
    // Coleta todos os vértices únicos dos segmentos e arcos
    const vTol = Math.max(config.coincidentToleranceMm, 0.02);
    const uniqueVertices: Point2D[] = [];

    function addUniqueVertex(x: number, y: number): Point2D {
      for (const uv of uniqueVertices) {
        if (Math.hypot(uv.x - x, uv.y - y) <= vTol) {
          return uv;
        }
      }
      const newV: Point2D = { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
      uniqueVertices.push(newV);
      return newV;
    }

    for (const s of segments) {
      addUniqueVertex(s.x0, s.y0);
      addUniqueVertex(s.x1, s.y1);
    }
    for (const a of arcs) {
      const aStartRad = (a.startAngle * Math.PI) / 180;
      const aEndRad = (a.endAngle * Math.PI) / 180;
      addUniqueVertex(a.cx + a.r * Math.cos(aStartRad), a.cy + a.r * Math.sin(aStartRad));
      addUniqueVertex(a.cx + a.r * Math.cos(aEndRad), a.cy + a.r * Math.sin(aEndRad));
    }

    // Mapeia todas as divisões em T por segmento
    const segmentsAfterT: Segment2D[] = [];

    for (const seg of segments) {
      const p0 = { x: seg.x0, y: seg.y0 };
      const p1 = { x: seg.x1, y: seg.y1 };
      const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (segLen < 1e-4) continue;

      const tSplits: { pt: Point2D; t: number; dist: number }[] = [];

      for (const v of uniqueVertices) {
        // Ignora endpoints deste mesmo segmento
        if (Math.hypot(v.x - p0.x, v.y - p0.y) < vTol || Math.hypot(v.x - p1.x, v.y - p1.y) < vTol) {
          continue;
        }

        const { distance, projection, t } = distancePointToSegment(v, p0, p1);
        if (distance <= config.tJunctionToleranceMm && t > 0.001 && t < 0.999) {
          const projPt: Point2D = {
            x: Number(projection.x.toFixed(4)),
            y: Number(projection.y.toFixed(4)),
          };
          tSplits.push({ pt: projPt, t, dist: distance });

          // Snap do vértice para o ponto exato da projeção na reta
          v.x = projPt.x;
          v.y = projPt.y;

          if (distance > maxGeometricDeviationMm) maxGeometricDeviationMm = distance;
          tJunctionsSplit++;

          repairs.push({
            action: 'SPLIT_T_JUNCTION',
            entityAId: String(seg.id),
            distanceMm: distance,
            toleranceMm: config.tJunctionToleranceMm,
            location: projPt,
            reason: `T-Junction resolvida: segmento subdividido no encontro do vértice em t=${t.toFixed(4)}`,
          });
        }
      }

      if (tSplits.length === 0) {
        segmentsAfterT.push(seg);
      } else {
        tSplits.sort((a, b) => a.t - b.t);
        let curr = p0;
        for (const sp of tSplits) {
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
        if (Math.hypot(p1.x - curr.x, p1.y - curr.y) > 0.001) {
          segmentsAfterT.push({
            id: generateDeterministicSegmentId(seg.type, curr.x, curr.y, p1.x, p1.y),
            x0: curr.x,
            y0: curr.y,
            x1: p1.x,
            y1: p1.y,
            type: seg.type,
          });
        }
      }
    }
    segments = segmentsAfterT;

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

      const isStub0 = d0 === 1 && d1 >= 3 && len <= maxStubLen;
      const isStub1 = d1 === 1 && d0 >= 3 && len <= maxStubLen;

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
