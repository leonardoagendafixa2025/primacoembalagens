import type { Point2D, Segment2D, Arc2D } from '../types';
import type { PackagingGeometry } from '../geometry';

export interface TopologyToleranceConfig {
  coincidentToleranceMm: number; // Tolerância para pontos idênticos (ex: 0.001 mm)
  gapToleranceMm: number;        // Tolerância para micro-gaps (ex: 0.05 mm)
  tJunctionToleranceMm: number;  // Tolerância para T-junctions (ex: 0.05 mm)
  colinearToleranceRad: number;  // Tolerância angular para colinearidade (ex: 0.005 rad)
}

export const DEFAULT_TOPOLOGY_TOLERANCES: TopologyToleranceConfig = {
  coincidentToleranceMm: 0.001,
  gapToleranceMm: 0.05,
  tJunctionToleranceMm: 0.05,
  colinearToleranceRad: 0.005,
};

export interface TopologyRepairEvent {
  action: 'SNAP_VERTICES' | 'SPLIT_T_JUNCTION' | 'SPLIT_X_INTERSECTION' | 'MERGE_COLINEAR_OVERLAP' | 'REMOVE_DUPLICATE';
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
  // Ordena os pontos canonicamente para que A->B e B->A tenham o mesmo identificador determinístico
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
 * Distância euclidiana de um ponto a um segmento de reta
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
 * Calcula a interseção analítica exata entre dois segmentos de reta A-B e C-D
 */
function computeSegmentIntersection(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D
): { intersects: boolean; point?: Point2D; t1?: number; t2?: number } {
  const d1x = b.x - a.x;
  const d1y = b.y - a.y;
  const d2x = d.x - c.x;
  const d2y = d.y - c.y;

  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-8) {
    // Paralelos ou colineares
    return { intersects: false };
  }

  const t1 = ((c.x - a.x) * d2y - (c.y - a.y) * d2x) / denom;
  const t2 = ((c.x - a.x) * d1y - (c.y - a.y) * d1x) / denom;

  // Interseção interna estrita (não apenas nos endpoints)
  if (t1 > 0.001 && t1 < 0.999 && t2 > 0.001 && t2 < 0.999) {
    const interPt: Point2D = {
      x: a.x + t1 * d1x,
      y: a.y + t1 * d1y,
    };
    return { intersects: true, point: interPt, t1, t2 };
  }

  return { intersects: false };
}

/**
 * Módulo de Reconstrução de Conectividade e Topologia 2D Estrutural (Fase 2A.1)
 */
export class TopologyReconstructor {
  /**
   * Executa a normalização topológica com:
   * 1. Sanitização inicial
   * 2. SNAP rigoroso de micro-gaps (<= 0.05 mm)
   * 3. Resolução analítica de X-Intersections (cruzamentos de retas)
   * 4. Resolução analítica de T-Junctions (vértices incidentes no interior)
   * 5. Deduplicação e fusão colinear pós-particionamento com precedência estrita
   * 6. Preservação de Arc2D e PERF
   * 7. IDs determinísticos
   */
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

    // 1. Clona e quantiza segmentos preservando classificação estrita
    let currentSegments: Segment2D[] = inputGeometry.segments
      .filter((s) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0) > 0.001)
      .map((s) => ({
        id: s.id,
        x0: Number(s.x0.toFixed(4)),
        y0: Number(s.y0.toFixed(4)),
        x1: Number(s.x1.toFixed(4)),
        y1: Number(s.y1.toFixed(4)),
        type: s.type,
      }));

    const currentArcs: Arc2D[] = inputGeometry.arcs
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

    // 2. PASSO 1: SNAP e cicatrização de micro-gaps via Spatial Hash Grid O(N)
    // Agrupa endpoints em grade espacial (célula de tamanho seguro = gapToleranceMm * 10)
    // Reduz a complexidade de O(N^2) para O(N), evitando congelamentos na importação CAD
    const gapCellSize = Math.max(1.0, config.gapToleranceMm * 10);
    const snapGrid = new Map<string, Array<{ segIdx: number; endpoint: 'p0' | 'p1'; x: number; y: number }>>();

    function getSpatialKey(gx: number, gy: number): string {
      return `${gx}_${gy}`;
    }

    for (let i = 0; i < currentSegments.length; i++) {
      const s = currentSegments[i];
      const pts: Array<{ endpoint: 'p0' | 'p1'; x: number; y: number }> = [
        { endpoint: 'p0', x: s.x0, y: s.y0 },
        { endpoint: 'p1', x: s.x1, y: s.y1 },
      ];
      for (const p of pts) {
        const gx = Math.floor(p.x / gapCellSize);
        const gy = Math.floor(p.y / gapCellSize);
        const k = getSpatialKey(gx, gy);
        let list = snapGrid.get(k);
        if (!list) {
          list = [];
          snapGrid.set(k, list);
        }
        list.push({ segIdx: i, endpoint: p.endpoint, x: p.x, y: p.y });
      }
    }

    // Consulta apenas células vizinhas imediatas (dx: -1..1, dy: -1..1)
    for (let i = 0; i < currentSegments.length; i++) {
      const s1 = currentSegments[i];
      const endpointsA: ['p0' | 'p1', number, number][] = [
        ['p0', s1.x0, s1.y0],
        ['p1', s1.x1, s1.y1],
      ];

      for (const [keyA, ax, ay] of endpointsA) {
        const gx = Math.floor(ax / gapCellSize);
        const gy = Math.floor(ay / gapCellSize);

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const neighborList = snapGrid.get(getSpatialKey(gx + dx, gy + dy));
            if (!neighborList) continue;

            for (const cand of neighborList) {
              if (cand.segIdx <= i) continue; // Evita pares duplicados ou self-snap
              const s2 = currentSegments[cand.segIdx];
              const bx = cand.endpoint === 'p0' ? s2.x0 : s2.x1;
              const by = cand.endpoint === 'p0' ? s2.y0 : s2.y1;

              const gap = Math.hypot(ax - bx, ay - by);
              if (gap > 0.0005 && gap <= config.gapToleranceMm) {
                const midX = (ax + bx) / 2;
                const midY = (ay + by) / 2;

                if (keyA === 'p0') { s1.x0 = midX; s1.y0 = midY; }
                else { s1.x1 = midX; s1.y1 = midY; }

                if (cand.endpoint === 'p0') { s2.x0 = midX; s2.y0 = midY; }
                else { s2.x1 = midX; s2.y1 = midY; }

                cand.x = midX;
                cand.y = midY;

                gapsHealed++;
                if (gap > maxGeometricDeviationMm) {
                  maxGeometricDeviationMm = gap;
                }

                repairs.push({
                  action: 'SNAP_VERTICES',
                  entityAId: String(s1.id),
                  entityBId: String(s2.id),
                  distanceMm: gap,
                  toleranceMm: config.gapToleranceMm,
                  location: { x: midX, y: midY },
                  reason: `Micro-gap de ${gap.toFixed(4)} mm unificado no ponto médio antes das T-junctions`,
                  before: { a: { x: ax, y: ay }, b: { x: bx, y: by } },
                  after: { snappedPoint: { x: midX, y: midY } },
                });
              }
            }
          }
        }
      }
    }

    // 3. PASSO 2: Resolução Analítica de X-Intersections com filtragem rápida de Bounding Boxes
    const xSplitsMap = new Map<number, { pt: Point2D; t: number }[]>();
    for (let i = 0; i < currentSegments.length; i++) {
      xSplitsMap.set(i, []);
    }

    // Pré-calcula Bounding Box de cada segmento para descarte instantâneo
    const segBboxes = currentSegments.map((s) => ({
      minX: Math.min(s.x0, s.x1) - 0.001,
      maxX: Math.max(s.x0, s.x1) + 0.001,
      minY: Math.min(s.y0, s.y1) - 0.001,
      maxY: Math.max(s.y0, s.y1) + 0.001,
    }));

    // Limite de segurança de interseções para proteger o navegador em facas densas/gigantes
    const MAX_X_INTERSECTIONS = 3000;
    let totalIntersectionsFound = 0;

    for (let i = 0; i < currentSegments.length; i++) {
      if (totalIntersectionsFound >= MAX_X_INTERSECTIONS) break;
      const s1 = currentSegments[i];
      const bb1 = segBboxes[i];
      const p1A = { x: s1.x0, y: s1.y0 };
      const p1B = { x: s1.x1, y: s1.y1 };

      for (let j = i + 1; j < currentSegments.length; j++) {
        if (totalIntersectionsFound >= MAX_X_INTERSECTIONS) break;
        const bb2 = segBboxes[j];

        // Descarte rápido em O(1) de segmentos cujas bounding boxes não se sobrepõem
        if (bb1.maxX < bb2.minX || bb1.minX > bb2.maxX || bb1.maxY < bb2.minY || bb1.minY > bb2.maxY) {
          continue;
        }

        const s2 = currentSegments[j];
        const p2A = { x: s2.x0, y: s2.y0 };
        const p2B = { x: s2.x1, y: s2.y1 };

        const inter = computeSegmentIntersection(p1A, p1B, p2A, p2B);
        if (inter.intersects && inter.point && inter.t1 !== undefined && inter.t2 !== undefined) {
          xSplitsMap.get(i)!.push({ pt: inter.point, t: inter.t1 });
          xSplitsMap.get(j)!.push({ pt: inter.point, t: inter.t2 });
          xIntersectionsSplit++;
          totalIntersectionsFound++;

          repairs.push({
            action: 'SPLIT_X_INTERSECTION',
            entityAId: String(s1.id),
            entityBId: String(s2.id),
            distanceMm: 0,
            toleranceMm: 0.001,
            location: inter.point,
            reason: `X-Intersection analítica resolvida em (${inter.point.x.toFixed(3)}, ${inter.point.y.toFixed(3)})`,
            after: { intersectionPoint: inter.point },
          });
        }
      }
    }

    // Aplica subdivisão das X-Intersections
    const afterXSegments: Segment2D[] = [];
    for (let i = 0; i < currentSegments.length; i++) {
      const s = currentSegments[i];
      const splits = xSplitsMap.get(i) || [];
      if (splits.length === 0) {
        afterXSegments.push(s);
      } else {
        splits.sort((a, b) => a.t - b.t);
        let curr = { x: s.x0, y: s.y0 };
        for (const sp of splits) {
          if (Math.hypot(sp.pt.x - curr.x, sp.pt.y - curr.y) > 0.001) {
            afterXSegments.push({
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
          afterXSegments.push({
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
    currentSegments = afterXSegments;

    // 4. PASSO 3: Resolução Analítica de T-Junctions via Spatial Hash Grid O(N)
    // Coleta vértices únicos indexados por grid para busca e registro em O(1)
    const vCellSize = Math.max(1.0, config.tJunctionToleranceMm * 10);
    const vertexGrid = new Map<string, Point2D[]>();
    const allVertexPoints: Point2D[] = [];

    function registerVertex(x: number, y: number): Point2D {
      const gx = Math.floor(x / vCellSize);
      const gy = Math.floor(y / vCellSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = vertexGrid.get(getSpatialKey(gx + dx, gy + dy));
          if (list) {
            for (const vp of list) {
              if (Math.hypot(vp.x - x, vp.y - y) < config.coincidentToleranceMm) {
                return vp;
              }
            }
          }
        }
      }

      const newV: Point2D = { x, y };
      allVertexPoints.push(newV);
      const key = getSpatialKey(gx, gy);
      let cellList = vertexGrid.get(key);
      if (!cellList) {
        cellList = [];
        vertexGrid.set(key, cellList);
      }
      cellList.push(newV);
      return newV;
    }

    for (const s of currentSegments) {
      registerVertex(s.x0, s.y0);
      registerVertex(s.x1, s.y1);
    }
    for (const a of currentArcs) {
      const aStartRad = (a.startAngle * Math.PI) / 180;
      const aEndRad = (a.endAngle * Math.PI) / 180;
      registerVertex(a.cx + a.r * Math.cos(aStartRad), a.cy + a.r * Math.sin(aStartRad));
      registerVertex(a.cx + a.r * Math.cos(aEndRad), a.cy + a.r * Math.sin(aEndRad));
    }

    const afterTSegments: Segment2D[] = [];
    for (const seg of currentSegments) {
      const p0 = { x: seg.x0, y: seg.y0 };
      const p1 = { x: seg.x1, y: seg.y1 };
      const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (segLen < 1e-4) continue;

      const innerSplits: { pt: Point2D; t: number; dist: number }[] = [];

      // Consulta apenas células espaciais que tocam a bounding box do segmento
      const minX = Math.min(seg.x0, seg.x1) - config.tJunctionToleranceMm;
      const maxX = Math.max(seg.x0, seg.x1) + config.tJunctionToleranceMm;
      const minY = Math.min(seg.y0, seg.y1) - config.tJunctionToleranceMm;
      const maxY = Math.max(seg.y0, seg.y1) + config.tJunctionToleranceMm;

      const minGx = Math.floor(minX / vCellSize);
      const maxGx = Math.floor(maxX / vCellSize);
      const minGy = Math.floor(minY / vCellSize);
      const maxGy = Math.floor(maxY / vCellSize);

      const candidateVertices: Point2D[] = [];
      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
          const cList = vertexGrid.get(getSpatialKey(gx, gy));
          if (cList) {
            candidateVertices.push(...cList);
          }
        }
      }

      for (const v of candidateVertices) {
        const isEndpoint = (Math.hypot(v.x - p0.x, v.y - p0.y) < config.coincidentToleranceMm) ||
                           (Math.hypot(v.x - p1.x, v.y - p1.y) < config.coincidentToleranceMm);
        if (isEndpoint) continue;

        const { distance, projection, t } = distancePointToSegment(v, p0, p1);
        if (distance <= config.tJunctionToleranceMm && t > 0.002 && t < 0.998) {
          innerSplits.push({ pt: projection, t, dist: distance });
          v.x = projection.x;
          v.y = projection.y;
        }
      }

      if (innerSplits.length === 0) {
        afterTSegments.push(seg);
      } else {
        innerSplits.sort((a, b) => a.t - b.t);
        let currentStart = p0;

        for (const sp of innerSplits) {
          tJunctionsSplit++;
          if (sp.dist > maxGeometricDeviationMm) {
            maxGeometricDeviationMm = sp.dist;
          }

          if (Math.hypot(sp.pt.x - currentStart.x, sp.pt.y - currentStart.y) > 0.001) {
            afterTSegments.push({
              id: generateDeterministicSegmentId(seg.type, currentStart.x, currentStart.y, sp.pt.x, sp.pt.y),
              x0: currentStart.x,
              y0: currentStart.y,
              x1: sp.pt.x,
              y1: sp.pt.y,
              type: seg.type,
            });
          }

          repairs.push({
            action: 'SPLIT_T_JUNCTION',
            entityAId: String(seg.id),
            distanceMm: sp.dist,
            toleranceMm: config.tJunctionToleranceMm,
            location: sp.pt,
            reason: `T-Junction analítica resolvida: segmento particionado em t=${sp.t.toFixed(4)}`,
            before: { x0: seg.x0, y0: seg.y0, x1: seg.x1, y1: seg.y1 },
            after: { splitPoint: sp.pt },
          });

          currentStart = sp.pt;
        }

        if (Math.hypot(p1.x - currentStart.x, p1.y - currentStart.y) > 0.001) {
          afterTSegments.push({
            id: generateDeterministicSegmentId(seg.type, currentStart.x, currentStart.y, p1.x, p1.y),
            x0: currentStart.x,
            y0: currentStart.y,
            x1: p1.x,
            y1: p1.y,
            type: seg.type,
          });
        }
      }
    }
    currentSegments = afterTSegments;

    // 5. PASSO 4: Deduplicação e Fusão Colinear PÓS-PARTICIONAMENTO (Correção Obrigatória 1)
    // Agora que todas as sobreposições parciais foram particionadas em subsegmentos de mesmos endpoints,
    // fundimos subsegmentos idênticos aplicando a regra determinística de precedência de tipos:
    // CUT (4) > CREASE (3) > PERF (2) > DIMENSION (1)
    const typePrecedence: Record<string, number> = {
      cut: 4,
      crease: 3,
      perfo: 2,
      dimension: 1,
    };

    const canonicalEdgeMap = new Map<string, Segment2D>();
    for (const seg of currentSegments) {
      if (Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) < 0.001) continue;

      let pAx = seg.x0, pAy = seg.y0, pBx = seg.x1, pBy = seg.y1;
      if (pAx > pBx || (Math.abs(pAx - pBx) < 1e-4 && pAy > pBy)) {
        pAx = seg.x1; pAy = seg.y1;
        pBx = seg.x0; pBy = seg.y0;
      }
      const geomKey = `${pAx.toFixed(3)}_${pAy.toFixed(3)}_to_${pBx.toFixed(3)}_${pBy.toFixed(3)}`;

      const existing = canonicalEdgeMap.get(geomKey);
      if (!existing) {
        canonicalEdgeMap.set(geomKey, { ...seg, x0: pAx, y0: pAy, x1: pBx, y1: pBy });
      } else {
        const pSeg = typePrecedence[seg.type] || 0;
        const pExist = typePrecedence[existing.type] || 0;

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
            reason: `Sobreposição colinear pós-particionamento fundida: ${winningType.toUpperCase()} prevaleceu sobre ${absorbedType.toUpperCase()} por precedência normativa`,
            before: { types: [existing.type, seg.type] },
            after: { finalType: winningType },
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
            reason: `Segmento idêntico duplicado removido pós-particionamento`,
          });
        }
      }
    }

    const finalSegmentsList = Array.from(canonicalEdgeMap.values());

    // 6. PASSO 5: Aplicação de IDs Determinísticos Canônicos Finais
    const finalDeterministicSegments: Segment2D[] = finalSegmentsList.map((s) => ({
      ...s,
      id: generateDeterministicSegmentId(s.type, s.x0, s.y0, s.x1, s.y1),
    }));

    const finalDeterministicArcs: Arc2D[] = currentArcs.map((a) => ({
      ...a,
      id: generateDeterministicArcId(a.type, a.cx, a.cy, a.r, a.startAngle, a.endAngle),
    }));

    // Ordenação canônica determinística
    finalDeterministicSegments.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    finalDeterministicArcs.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));

    const finalGeometry: PackagingGeometry = {
      ...inputGeometry,
      segments: finalDeterministicSegments,
      arcs: finalDeterministicArcs,
    };

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
