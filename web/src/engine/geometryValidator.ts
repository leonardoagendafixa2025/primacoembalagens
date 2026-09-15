import type { DielineResult } from './types';

export type IssueType =
  | 'OPEN_ENDPOINT'
  | 'GAP'
  | 'OVERLAP'
  | 'BROKEN_TANGENCY'
  | 'ORPHAN_ENTITY'
  | 'INVALID_ARC';

export interface GeometryIssue {
  type: IssueType;
  severity: 'ERROR' | 'WARNING';
  message: string;
  location?: { x: number; y: number };
  entityIds?: string[];
}

export interface GeometryValidationReport {
  valid: boolean;
  totalSegments: number;
  totalArcs: number;
  issues: GeometryIssue[];
  metrics: {
    isolatedVerticesCount: number;
    collinearOverlapsCount: number;
    tangencyErrorsCount: number;
    maxGapFound: number;
  };
}

/**
 * Validador rigoroso de continuidade e integridade geométrica de facas CAD 2D de embalagens.
 * 
 * Regras da indústria de embalagens:
 * 1. Todos os vértices do grafo planar de faca devem coincidir dentro de gapTolerance (0.05mm).
 *    Cortes e vincos conectam-se em junções T e cantos estruturais.
 * 2. Gaps verdadeiros ocorrem quando uma linha termina próxima a outro elemento (entre 0.05mm e 5.0mm)
 *    sem tocá-lo.
 * 3. Entidades degeneradas (comprimento < 0.001mm ou raio < 0.001mm) emitidas por plugins C#
 *    são filtradas antes da verificação topológica.
 */
export function validateGeometryContinuity(
  dieline: DielineResult,
  gapTolerance: number = 0.05,
  tangencyAngleToleranceDeg: number = 1.0
): GeometryValidationReport {
  const issues: GeometryIssue[] = [];

  // Filtra entidades não-degeneradas (comprimento real > 0.001mm e arcos com raio > 0.001mm)
  const segments = (dieline.segments || []).filter(s => Math.hypot(s.x1 - s.x0, s.y1 - s.y0) > 0.001);
  const arcs = (dieline.arcs || []).filter(a => a.r > 0.001 && Math.abs(a.endAngle - a.startAngle) > 0.001);

  let isolatedVerticesCount = 0;
  let collinearOverlapsCount = 0;
  let tangencyErrorsCount = 0;
  let maxGapFound = 0;

  interface Endpoint {
    x: number;
    y: number;
    entityId: string;
    entityType: 'segment' | 'arc';
    lineType: 'cut' | 'crease' | 'perfo';
    isStart: boolean;
    tangentAngleDeg?: number;
  }

  const allEndpoints: Endpoint[] = [];

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const angleRad = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    const angleDeg = (angleRad * 180) / Math.PI;
    const lType: 'cut' | 'crease' | 'perfo' = (s.type === 'crease' || s.type === 'perfo') ? s.type : 'cut';

    allEndpoints.push({
      x: s.x0,
      y: s.y0,
      entityId: String(s.id || `seg-${i}`),
      entityType: 'segment',
      lineType: lType,
      isStart: true,
      tangentAngleDeg: angleDeg,
    });
    allEndpoints.push({
      x: s.x1,
      y: s.y1,
      entityId: String(s.id || `seg-${i}`),
      entityType: 'segment',
      lineType: lType,
      isStart: false,
      tangentAngleDeg: angleDeg,
    });
  }

  for (let i = 0; i < arcs.length; i++) {
    const a = arcs[i];
    const a0Rad = (a.startAngle * Math.PI) / 180;
    const a1Rad = (a.endAngle * Math.PI) / 180;
    const p0x = a.cx + a.r * Math.cos(a0Rad);
    const p0y = a.cy + a.r * Math.sin(a0Rad);
    const p1x = a.cx + a.r * Math.cos(a1Rad);
    const p1y = a.cy + a.r * Math.sin(a1Rad);

    const tan0Deg = a.startAngle + 90;
    const tan1Deg = a.endAngle + 90;
    const arcLType: 'cut' | 'crease' | 'perfo' = (a.type === 'crease' || a.type === 'perfo') ? a.type : 'cut';

    allEndpoints.push({
      x: p0x,
      y: p0y,
      entityId: String(a.id || `arc-${i}`),
      entityType: 'arc',
      lineType: arcLType,
      isStart: true,
      tangentAngleDeg: tan0Deg,
    });
    allEndpoints.push({
      x: p1x,
      y: p1y,
      entityId: String(a.id || `arc-${i}`),
      entityType: 'arc',
      lineType: arcLType,
      isStart: false,
      tangentAngleDeg: tan1Deg,
    });
  }

  // 1. Agrupamento de Vértices Coincidentes (Graph Node Clustering)
  const clusters: Endpoint[][] = [];
  const visited = new Set<number>();

  for (let i = 0; i < allEndpoints.length; i++) {
    if (visited.has(i)) continue;
    const cluster: Endpoint[] = [allEndpoints[i]];
    visited.add(i);

    for (let j = i + 1; j < allEndpoints.length; j++) {
      if (visited.has(j)) continue;
      const d = Math.hypot(allEndpoints[i].x - allEndpoints[j].x, allEndpoints[i].y - allEndpoints[j].y);
      if (d <= gapTolerance) {
        cluster.push(allEndpoints[j]);
        visited.add(j);
        if (d > maxGapFound) maxGapFound = d;
      }
    }
    clusters.push(cluster);
  }

  // 2. Detecção de Gaps e Endpoints Isolados
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const ep = cluster[0];

      // Busca a distância mínima até qualquer outro endpoint de outra entidade
      let nearestDist = Infinity;
      let nearestEntity = '';
      for (const other of allEndpoints) {
        if (other.entityId === ep.entityId) continue;
        const d = Math.hypot(ep.x - other.x, ep.y - other.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEntity = other.entityId;
        }
      }

      // Também verifica se o endpoint toca o interior de algum segmento (junção em T)
      let touchesInterior = false;
      for (const s of segments) {
        if (s.id === ep.entityId) continue;
        const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
        if (len < 0.001) continue;
        const u = ((ep.x - s.x0) * (s.x1 - s.x0) + (ep.y - s.y0) * (s.y1 - s.y0)) / (len * len);
        if (u >= 0 && u <= 1) {
          const projX = s.x0 + u * (s.x1 - s.x0);
          const projY = s.y0 + u * (s.y1 - s.y0);
          const distToLine = Math.hypot(ep.x - projX, ep.y - projY);
          if (distToLine <= gapTolerance) {
            touchesInterior = true;
            break;
          }
        }
      }

      if (!touchesInterior) {
        isolatedVerticesCount++;
        if (nearestDist < 5.0 && nearestDist > gapTolerance) {
          issues.push({
            type: 'GAP',
            severity: 'ERROR',
            message: `Gap detectado em (${ep.x.toFixed(2)}, ${ep.y.toFixed(2)}): entidade ${ep.entityId} está a ${nearestDist.toFixed(3)}mm da entidade ${nearestEntity}`,
            location: { x: ep.x, y: ep.y },
            entityIds: [ep.entityId, nearestEntity],
          });
          if (nearestDist > maxGapFound) maxGapFound = nearestDist;
        }
      }
    }
  }

  // 3. Detecção de Sobreposições Colineares
  for (let i = 0; i < segments.length; i++) {
    const s1 = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const s2 = segments[j];
      const d00 = Math.hypot(s1.x0 - s2.x0, s1.y0 - s2.y0);
      const d11 = Math.hypot(s1.x1 - s2.x1, s1.y1 - s2.y1);
      const d01 = Math.hypot(s1.x0 - s2.x1, s1.y0 - s2.y1);
      const d10 = Math.hypot(s1.x1 - s2.x0, s1.y1 - s2.y0);

      const isExactDuplicate = (d00 < 0.01 && d11 < 0.01) || (d01 < 0.01 && d10 < 0.01);
      if (isExactDuplicate) {
        collinearOverlapsCount++;
        issues.push({
          type: 'OVERLAP',
          severity: 'ERROR',
          message: `Segmentos duplicados sobrepostos: ${s1.id || i} e ${s2.id || j}`,
          location: { x: (s1.x0 + s1.x1) / 2, y: (s1.y0 + s1.y1) / 2 },
          entityIds: [String(s1.id || `seg-${i}`), String(s2.id || `seg-${j}`)],
        });
      }
    }
  }

  // 4. Detecção de Tangências Quebradas (Broken Tangency)
  for (const cluster of clusters) {
    const segEps = cluster.filter((e) => e.entityType === 'segment');
    const arcEps = cluster.filter((e) => e.entityType === 'arc');

    if (segEps.length > 0 && arcEps.length > 0) {
      for (const arcEp of arcEps) {
        for (const segEp of segEps) {
          if (arcEp.tangentAngleDeg !== undefined && segEp.tangentAngleDeg !== undefined) {
            let angleDiff = Math.abs((arcEp.tangentAngleDeg - segEp.tangentAngleDeg) % 180);
            if (angleDiff > 90) angleDiff = 180 - angleDiff;

            const isTangent = angleDiff < tangencyAngleToleranceDeg;
            const isPerpendicular = Math.abs(angleDiff - 90) < tangencyAngleToleranceDeg;

            if (!isTangent && !isPerpendicular && angleDiff < 45) {
              tangencyErrorsCount++;
              issues.push({
                type: 'BROKEN_TANGENCY',
                severity: 'WARNING',
                message: `Tangência imperfeita em (${arcEp.x.toFixed(2)}, ${arcEp.y.toFixed(2)}) entre arco ${arcEp.entityId} e reta ${segEp.entityId}: desvio de ${angleDiff.toFixed(2)}°`,
                location: { x: arcEp.x, y: arcEp.y },
                entityIds: [arcEp.entityId, segEp.entityId],
              });
            }
          }
        }
      }
    }
  }

  const hasCriticalErrors = issues.some((iss) => iss.severity === 'ERROR');

  return {
    valid: !hasCriticalErrors,
    totalSegments: segments.length,
    totalArcs: arcs.length,
    issues,
    metrics: {
      isolatedVerticesCount,
      collinearOverlapsCount,
      tangencyErrorsCount,
      maxGapFound,
    },
  };
}
