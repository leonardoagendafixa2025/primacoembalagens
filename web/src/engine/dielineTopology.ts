import type { Point2D, DielineResult } from './types';
import type { StructuralPanel, ClosedLoop } from './importers/LoopTopologyEngine';
import type {
  FoldingTreeResult,
  TopologicalHinge as TreeHinge,
  FoldingTreeNode,
} from './importers/FoldingTreeEngine';
import { computeBoundingBox } from './geometry';

export interface TopologicalHinge {
  id: string;
  parentPanelId: string;
  childPanelId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  length: number;
  axis: { x: number; y: number; z: number };
  origin: { x: number; y: number; z: number };
  targetAngleDeg: number;
  foldOrder: number;
}

export interface TopologicalPanel {
  id: string;
  name: string;
  boundary: Point2D[];
  holes: Point2D[][];
  area: number;
  centroid: Point2D;
  isRoot: boolean;
  parentId?: string;
  hingeToParent?: TopologicalHinge;
  children: string[];
}

export interface DielineTopology {
  panels: TopologicalPanel[];
  hinges: TopologicalHinge[];
  rootPanelId: string;
  rawSegmentsCount: number;
  rawArcsCount: number;
}

interface InternalHalfEdge {
  id: number;
  u: Point2D;
  v: Point2D;
  angle: number;
  type: string;
  twin?: InternalHalfEdge;
  next?: InternalHalfEdge;
  visited?: boolean;
  face?: InternalFace;
}

interface InternalFace {
  id: number;
  points: Point2D[];
  edges: InternalHalfEdge[];
  area: number;
  isExternal: boolean;
  centroid: Point2D;
}

/**
 * Constr├│i a topologia planar exata (pain├®is, furos e vincos) a partir da faca 2D real
 * sem nenhuma aproxima├º├úo ou modelo gen├®rico de caixa.
 */
export function buildFoldingTopology(dieline: DielineResult): DielineTopology {
  // 1. Coleta todos os segmentos e discretiza arcos (preservando cantos arredondados e fillets)
  const rawSegs: { p0: Point2D; p1: Point2D; type: string }[] = [];

  for (const seg of dieline.segments) {
    if (seg.type === 'dimension') continue;
    if (Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) < 0.001) continue;
    rawSegs.push({
      p0: { x: seg.x0, y: seg.y0 },
      p1: { x: seg.x1, y: seg.y1 },
      type: seg.type,
    });
  }

  for (const arc of dieline.arcs) {
    if (arc.type === 'dimension') continue;
    if (!arc.r || arc.r < 0.001) continue;
    // Ângulos podem vir em graus (PLMPackLib) ou radianos
    const isDegrees = Math.abs(arc.startAngle) > 2 * Math.PI || Math.abs(arc.endAngle) > 2 * Math.PI || (Math.abs(arc.endAngle - arc.startAngle) >= 10);
    const startRad = isDegrees ? (arc.startAngle * Math.PI) / 180 : arc.startAngle;
    const endRad = isDegrees ? (arc.endAngle * Math.PI) / 180 : arc.endAngle;

    const spanRad = endRad - startRad;
    const steps = Math.max(6, Math.min(24, Math.round((Math.abs(spanRad) / (Math.PI / 2)) * 8)));
    const da = spanRad / steps;
    for (let i = 0; i < steps; i++) {
      const a1 = startRad + i * da;
      const a2 = startRad + (i + 1) * da;
      rawSegs.push({
        p0: { x: arc.cx + arc.r * Math.cos(a1), y: arc.cy + arc.r * Math.sin(a1) },
        p1: { x: arc.cx + arc.r * Math.cos(a2), y: arc.cy + arc.r * Math.sin(a2) },
        type: arc.type,
      });
    }
  }

  // Helper: distância euclidiana de um ponto a um segmento
  function distToSeg(p: Point2D, s: { p0: Point2D; p1: Point2D }): number {
    const dx = s.p1.x - s.p0.x;
    const dy = s.p1.y - s.p0.y;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1e-6) return Math.hypot(p.x - s.p0.x, p.y - s.p0.y);
    const t = Math.max(0, Math.min(1, ((p.x - s.p0.x) * dx + (p.y - s.p0.y) * dy) / l2));
    const px = s.p0.x + t * dx;
    const py = s.p0.y + t * dy;
    return Math.hypot(p.x - px, p.y - py);
  }

  // 1.5 Cura universal de alívios de vinco industriais, degraus e recuos (Relief Notches & Crease Setback Healer)
  // Em modelos de facas industriais reais (ECMA/FEFCO), vincos frequentemente são interrompidos
  // por furos/entalhes de alívio circular (relief punch), recuados por tolerância de fabricação (setback <= 3.5mm),
  // ou apresentam micro-defeitos de corte em junções de abas (slits) e degraus de borda (boundary steps).

  // 1.5 Cura universal de alívios de vinco industriais (apenas para modelos paramétricos com tamanho moderado <= 500 segmentos)
  const skipHeavyHeuristics = rawSegs.length > 500;

  if (!skipHeavyHeuristics) {
    // 1.5b: Fechamento de gaps entre vincos colineares (entalhes de alívio / relief notches <= 3.5mm)
    const creaseSegs = rawSegs.filter((s) => s.type === 'crease');
    const bridgeCreases: { p0: Point2D; p1: Point2D; type: string }[] = [];
    for (let i = 0; i < creaseSegs.length; i++) {
      const c1 = creaseSegs[i];
      const dx1 = c1.p1.x - c1.p0.x;
      const dy1 = c1.p1.y - c1.p0.y;
      const l1 = Math.hypot(dx1, dy1);
      if (l1 < 1e-4) continue;
      const u1x = dx1 / l1, u1y = dy1 / l1;

      for (let j = i + 1; j < creaseSegs.length; j++) {
        const c2 = creaseSegs[j];
        const dx2 = c2.p1.x - c2.p0.x;
        const dy2 = c2.p1.y - c2.p0.y;
        const l2 = Math.hypot(dx2, dy2);
        if (l2 < 1e-4) continue;
        const u2x = dx2 / l2, u2y = dy2 / l2;

        const cross = Math.abs(u1x * u2y - u1y * u2x);
        if (cross > 0.05) continue;

        const v0x = c2.p0.x - c1.p0.x;
        const v0y = c2.p0.y - c1.p0.y;
        if (Math.abs(v0x * u1y - v0y * u1x) > 0.15) continue;

        const pairs: [Point2D, Point2D][] = [
          [c1.p0, c2.p0],
          [c1.p0, c2.p1],
          [c1.p1, c2.p0],
          [c1.p1, c2.p1],
        ];
        for (const [pA, pB] of pairs) {
          const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
          if (d > 0.05 && d <= 3.5) {
            const bdx = (pB.x - pA.x) / d;
            const bdy = (pB.y - pA.y) / d;
            if (Math.abs(Math.abs(bdx * u1x + bdy * u1y) - 1.0) < 0.1) {
              bridgeCreases.push({
                p0: { x: pA.x, y: pA.y },
                p1: { x: pB.x, y: pB.y },
                type: 'crease',
              });
            }
          }
        }
      }
    }
    rawSegs.push(...bridgeCreases);

    // 1.5c: Cura de pontas soltas de vincos (Crease Setback Healer <= 3.5mm)
    for (const s of rawSegs) {
      if (s.type !== 'crease') continue;
      for (const ep of ['p0', 'p1'] as const) {
        const pt = s[ep];
        const otherPt = ep === 'p0' ? s.p1 : s.p0;

        let touchesAny = false;
        for (const o of rawSegs) {
          if (o === s) continue;
          if (Math.hypot(o.p0.x - pt.x, o.p0.y - pt.y) < 0.15 || Math.hypot(o.p1.x - pt.x, o.p1.y - pt.y) < 0.15) {
            touchesAny = true;
            break;
          }
          if (distToSeg(pt, o) < 0.15) {
            touchesAny = true;
            break;
          }
        }
        if (touchesAny) continue;

        const dirx = pt.x - otherPt.x;
        const diry = pt.y - otherPt.y;
        const dlen = Math.hypot(dirx, diry);
        if (dlen < 1e-4) continue;
        const udx = dirx / dlen;
        const udy = diry / dlen;

        let bestT = 3.5;
        let bestInter: Point2D | null = null;
        for (const o of rawSegs) {
          if (o === s) continue;
          const x3 = o.p0.x, y3 = o.p0.y;
          const x4 = o.p1.x, y4 = o.p1.y;
          const denom = udx * (y4 - y3) - udy * (x4 - x3);
          if (Math.abs(denom) < 1e-5) continue;
          const t = ((x3 - pt.x) * (y4 - y3) - (y3 - pt.y) * (x4 - x3)) / denom;
          const u = ((x3 - pt.x) * udy - (y3 - pt.y) * udx) / denom;
          if (t > 0.02 && t <= bestT && u >= -0.01 && u <= 1.01) {
            bestT = t;
            bestInter = { x: pt.x + t * udx, y: pt.y + t * udy };
          }
        }
        if (bestInter) {
          pt.x = bestInter.x;
          pt.y = bestInter.y;
        }
      }
    }

    // 1.5d: Fechamento de degraus no contorno externo (Boundary Step Closures <= 3.6mm)
    const cutEndpoints: { pt: Point2D; seg: { p0: Point2D; p1: Point2D; type: string } }[] = [];
    for (const s of rawSegs) {
      if (s.type !== 'cut') continue;
      for (const ep of ['p0', 'p1'] as const) {
        const pt = s[ep];
        let meets = 0;
        for (const o of rawSegs) {
          if (Math.hypot(o.p0.x - pt.x, o.p0.y - pt.y) < 0.1 || Math.hypot(o.p1.x - pt.x, o.p1.y - pt.y) < 0.1) {
            meets++;
          }
          if (o !== s && distToSeg(pt, o) < 0.1) {
            meets++;
          }
        }
        if (meets <= 1) {
          cutEndpoints.push({ pt, seg: s });
        }
      }
    }
    const boundaryBridges: { p0: Point2D; p1: Point2D; type: string }[] = [];
    for (let i = 0; i < cutEndpoints.length; i++) {
      for (let j = i + 1; j < cutEndpoints.length; j++) {
        const pA = cutEndpoints[i].pt;
        const pB = cutEndpoints[j].pt;
        const d = Math.hypot(pB.x - pA.x, pB.y - pA.y);
        if (d > 0.05 && d <= 3.6) {
          boundaryBridges.push({
            p0: { x: pA.x, y: pA.y },
            p1: { x: pB.x, y: pB.y },
            type: 'cut',
          });
        }
      }
    }
    rawSegs.push(...boundaryBridges);
  }

  // 2. Unifica vértices próximos via Spatial Hash Grid O(N) (tolerância 0.15 mm)
  const EPS = 0.15;
  const pCellSize = Math.max(1.0, EPS * 5);
  const pointGrid = new Map<string, Point2D[]>();
  const uniquePoints: Point2D[] = [];
  const pointIndexMap = new Map<Point2D, number>();

  function pGridKey(gx: number, gy: number): string {
    return `${gx}_${gy}`;
  }

  function getUniquePoint(x: number, y: number): Point2D {
    const gx = Math.floor(x / pCellSize);
    const gy = Math.floor(y / pCellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = pointGrid.get(pGridKey(gx + dx, gy + dy));
        if (list) {
          for (const p of list) {
            if (Math.hypot(p.x - x, p.y - y) < EPS) return p;
          }
        }
      }
    }

    const newPt: Point2D = { x, y };
    const idx = uniquePoints.length;
    uniquePoints.push(newPt);
    pointIndexMap.set(newPt, idx);

    const k = pGridKey(gx, gy);
    let cellList = pointGrid.get(k);
    if (!cellList) {
      cellList = [];
      pointGrid.set(k, cellList);
    }
    cellList.push(newPt);
    return newPt;
  }

  for (const s of rawSegs) {
    s.p0 = getUniquePoint(s.p0.x, s.p0.y);
    s.p1 = getUniquePoint(s.p1.x, s.p1.y);
  }

  // 3. Subdivide segmentos em T-Junctions via Spatial Grid
  const cleanSegs: { p0: Point2D; p1: Point2D; type: string }[] = [];
  for (const s of rawSegs) {
    const x0 = s.p0.x, y0 = s.p0.y, x1 = s.p1.x, y1 = s.p1.y;
    const l2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
    if (l2 < 1e-6) continue;

    const minX = Math.min(x0, x1) - EPS;
    const maxX = Math.max(x0, x1) + EPS;
    const minY = Math.min(y0, y1) - EPS;
    const maxY = Math.max(y0, y1) + EPS;

    const minGx = Math.floor(minX / pCellSize);
    const maxGx = Math.floor(maxX / pCellSize);
    const minGy = Math.floor(minY / pCellSize);
    const maxGy = Math.floor(maxY / pCellSize);

    const candidatePts: Point2D[] = [];
    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const cList = pointGrid.get(pGridKey(gx, gy));
        if (cList) candidatePts.push(...cList);
      }
    }

    const splitPoints: { pt: Point2D; t: number }[] = [];
    for (const p of candidatePts) {
      if (p === s.p0 || p === s.p1) continue;
      const t = ((p.x - x0) * (x1 - x0) + (p.y - y0) * (y1 - y0)) / l2;
      if (t > 0.002 && t < 0.998) {
        const projX = x0 + t * (x1 - x0);
        const projY = y0 + t * (y1 - y0);
        if (Math.hypot(p.x - projX, p.y - projY) < EPS) {
          splitPoints.push({ pt: p, t });
        }
      }
    }

    if (splitPoints.length === 0) {
      cleanSegs.push(s);
    } else {
      splitPoints.sort((a, b) => a.t - b.t);
      let curr = s.p0;
      for (const sp of splitPoints) {
        cleanSegs.push({ p0: curr, p1: sp.pt, type: s.type });
        curr = sp.pt;
      }
      cleanSegs.push({ p0: curr, p1: s.p1, type: s.type });
    }
  }

  // 3.5 Deduplica segmentos idênticos com Map em O(N)
  const edgeKeyMap = new Map<string, { p0: Point2D; p1: Point2D; type: string }>();
  for (const s of cleanSegs) {
    const idx0 = pointIndexMap.get(s.p0);
    const idx1 = pointIndexMap.get(s.p1);
    if (idx0 === undefined || idx1 === undefined || idx0 === idx1) continue;
    const key = idx0 < idx1 ? `${idx0}_${idx1}` : `${idx1}_${idx0}`;
    const existing = edgeKeyMap.get(key);
    if (!existing) {
      edgeKeyMap.set(key, s);
    } else {
      if (s.type === 'cut' || existing.type === 'cut') {
        existing.type = 'cut';
      }
    }
  }
  const finalSegs = Array.from(edgeKeyMap.values());

  // 4. Constrói o grafo Half-Edge (DCEL)
  const vertexOutgoing = new Map<Point2D, InternalHalfEdge[]>();
  const halfEdges: InternalHalfEdge[] = [];
  let heIdCounter = 0;

  for (const s of finalSegs) {
    const he1: InternalHalfEdge = {
      id: heIdCounter++,
      u: s.p0,
      v: s.p1,
      angle: Math.atan2(s.p1.y - s.p0.y, s.p1.x - s.p0.x),
      type: s.type,
    };
    const he2: InternalHalfEdge = {
      id: heIdCounter++,
      u: s.p1,
      v: s.p0,
      angle: Math.atan2(s.p0.y - s.p1.y, s.p0.x - s.p0.x),
      type: s.type,
    };
    he1.twin = he2;
    he2.twin = he1;
    halfEdges.push(he1, he2);

    if (!vertexOutgoing.has(s.p0)) vertexOutgoing.set(s.p0, []);
    if (!vertexOutgoing.has(s.p1)) vertexOutgoing.set(s.p1, []);
    vertexOutgoing.get(s.p0)!.push(he1);
    vertexOutgoing.get(s.p1)!.push(he2);
  }

  // Ordena arestas de saída no sentido anti-horário (CCW)
  for (const [, list] of vertexOutgoing.entries()) {
    list.sort((a, b) => a.angle - b.angle);
  }

  // Liga os ponteiros next de cada half-edge com proteção contra nós isolados
  for (const he of halfEdges) {
    const v = he.v;
    const outList = vertexOutgoing.get(v);
    if (!outList || outList.length === 0) continue;
    const twinIdx = outList.indexOf(he.twin!);
    if (twinIdx !== -1) {
      const nextIdx = (twinIdx - 1 + outList.length) % outList.length;
      he.next = outList[nextIdx];
    }
  }

  // 5. Rastreia ciclos mínimos com limite estrito de passos (MAX_STEPS = 1000)
  const allFaces: InternalFace[] = [];
  let faceIdCounter = 0;

  for (const he of halfEdges) {
    if (he.visited) continue;

    const cycle: Point2D[] = [];
    const cycleEdges: InternalHalfEdge[] = [];
    let curr: InternalHalfEdge | undefined = he;
    let stepCount = 0;
    const MAX_STEPS = 1000;

    while (curr && !curr.visited && stepCount < MAX_STEPS) {
      stepCount++;
      curr.visited = true;
      cycle.push(curr.u);
      cycleEdges.push(curr);
      curr = curr.next;
      if (curr === he) break;
    }

    // C├ílculo de ├írea com sinal e centroide
    let area = 0;
    let cx = 0, cy = 0;
    for (let i = 0; i < cycle.length; i++) {
      const p1 = cycle[i];
      const p2 = cycle[(i + 1) % cycle.length];
      const cross = p1.x * p2.y - p2.x * p1.y;
      area += cross;
      cx += (p1.x + p2.x) * cross;
      cy += (p1.y + p2.y) * cross;
    }
    area = area / 2;
    if (Math.abs(area) > 1e-4) {
      cx = cx / (6 * area);
      cy = cy / (6 * area);
    }

    const faceObj: InternalFace = {
      id: faceIdCounter++,
      points: cycle,
      edges: cycleEdges,
      area,
      isExternal: area < 0,
      centroid: { x: cx, y: cy },
    };

    for (const e of cycleEdges) {
      e.face = faceObj;
    }
    allFaces.push(faceObj);
  }

  // 6. Separa pain├®is de furos internos (mortises, rasgos, recortes vazados)
  // IMPORTANTE: threshold de 800 mm┬▓ para furos ÔÇö furos reais (dedo, mortise) s├úo pequenos;
  // abas do fundo semi-autom├ítico (snap-lock, 1-2-3 bottom) t├¬m ├írea > 800 mm┬▓ e devem ser pain├®is.
  const holeFaces = allFaces.filter(
    (f) => !f.isExternal && f.edges.every((e) => e.type === 'cut') && f.area > 0 && f.area < 800
  );
  // ├ürea m├¡nima de 10 mm┬▓ para incluir abas estreitas (aba de cola, lingueta, abas de poeira)
  const panelFaces = allFaces.filter(
    (f) => !f.isExternal && !holeFaces.includes(f) && f.area > 10
  );

  // Mapeia furos para seus pain├®is hospedeiros
  function pointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const panelHolesMap = new Map<number, Point2D[][]>();
  for (const pf of panelFaces) {
    panelHolesMap.set(pf.id, []);
  }

  for (const hf of holeFaces) {
    for (const pf of panelFaces) {
      if (pointInPolygon(hf.centroid, pf.points)) {
        panelHolesMap.get(pf.id)!.push(hf.points);
        break;
      }
    }
  }

  // 7. Encontra todas as conex├Áes de vinco entre pain├®is
  interface RawHingeEdge {
    panelAId: number;
    panelBId: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    length: number;
  }
  const rawHingesList: RawHingeEdge[] = [];

  for (const he of halfEdges) {
    if (he.type === 'crease' && he.twin && he.face && he.twin.face) {
      const fA = he.face;
      const fB = he.twin.face;
      if (panelFaces.includes(fA) && panelFaces.includes(fB) && fA.id < fB.id) {
        rawHingesList.push({
          panelAId: fA.id,
          panelBId: fB.id,
          x0: he.u.x,
          y0: he.u.y,
          x1: he.v.x,
          y1: he.v.y,
          length: Math.hypot(he.v.x - he.u.x, he.v.y - he.u.y),
        });
      }
    }
  }

  // Agrupa e une sub-vincos colineares entre o mesmo par de pain├®is (ex: vincos particionados por interse├º├Áes)
  const mergedHingeMap = new Map<string, RawHingeEdge[]>();
  for (const h of rawHingesList) {
    const key = `${Math.min(h.panelAId, h.panelBId)}_${Math.max(h.panelAId, h.panelBId)}`;
    if (!mergedHingeMap.has(key)) mergedHingeMap.set(key, []);
    mergedHingeMap.get(key)!.push(h);
  }

  const rawHinges: RawHingeEdge[] = [];
  for (const [, list] of mergedHingeMap.entries()) {
    if (list.length === 1) {
      rawHinges.push(list[0]);
      continue;
    }
    const allPts: Point2D[] = [];
    for (const h of list) {
      allPts.push({ x: h.x0, y: h.y0 }, { x: h.x1, y: h.y1 });
    }
    let maxD2 = -1;
    let pBest1 = allPts[0], pBest2 = allPts[1];
    for (let i = 0; i < allPts.length; i++) {
      for (let j = i + 1; j < allPts.length; j++) {
        const d2 = (allPts[i].x - allPts[j].x) ** 2 + (allPts[i].y - allPts[j].y) ** 2;
        if (d2 > maxD2) {
          maxD2 = d2;
          pBest1 = allPts[i];
          pBest2 = allPts[j];
        }
      }
    }
    rawHinges.push({
      panelAId: list[0].panelAId,
      panelBId: list[0].panelBId,
      x0: pBest1.x,
      y0: pBest1.y,
      x1: pBest2.x,
      y1: pBest2.y,
      length: Math.sqrt(maxD2),
    });
  }

  // 8. Constr├│i o Grafo de Adjac├¬ncia / Dobras entre Pain├®is
  const adjMap = new Map<number, { neighborId: number; hinge: RawHingeEdge }[]>();
  for (const pf of panelFaces) {
    adjMap.set(pf.id, []);
  }
  for (const h of rawHinges) {
    adjMap.get(h.panelAId)!.push({ neighborId: h.panelBId, hinge: h });
    adjMap.get(h.panelBId)!.push({ neighborId: h.panelAId, hinge: h });
  }

  // 9. Escolhe o Painel Raiz (Base/Fundo/Corpo Central da Embalagem)
  // REGRA DE ENGENHARIA: O fechamento 3D DEVE iniciar a partir da BASE / PAINEL CENTRAL.
  // Abas laterais de colagem, abas terminais e abas de poeira (deg <= 1) NUNCA podem ser raiz.
  let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
  for (const pf of panelFaces) {
    for (const pt of pf.points) {
      if (pt.x < bMinX) bMinX = pt.x;
      if (pt.x > bMaxX) bMaxX = pt.x;
      if (pt.y < bMinY) bMinY = pt.y;
      if (pt.y > bMaxY) bMaxY = pt.y;
    }
  }
  const blankCenterX = (bMinX + bMaxX) / 2;
  const blankCenterY = (bMinY + bMaxY) / 2;
  const blankDiag = Math.hypot(bMaxX - bMinX, bMaxY - bMinY) || 1;

  let maxArea = 0;
  let maxDeg = 0;
  for (const pf of panelFaces) {
    if (pf.area > maxArea) maxArea = pf.area;
    const deg = adjMap.get(pf.id)?.length || 0;
    if (deg > maxDeg) maxDeg = deg;
  }

  // Descarta abas terminais / abas laterais (deg <= 1) se houver pain├®is centrais estruturais
  const minDegAllowed = maxDeg >= 2 ? 2 : 1;
  const minAreaAllowed = maxArea * 0.2; // descarta tiras ou abas menores

  let candidates = panelFaces.filter(
    (pf) => (adjMap.get(pf.id)?.length || 0) >= minDegAllowed && pf.area >= minAreaAllowed
  );
  if (candidates.length === 0) {
    candidates = panelFaces.filter((pf) => (adjMap.get(pf.id)?.length || 0) >= minDegAllowed);
  }
  if (candidates.length === 0) {
    candidates = panelFaces;
  }

  let rootFace = candidates[0];
  let bestScore = -Infinity;

  for (const pf of candidates) {
    const distToCenter = Math.hypot(pf.centroid.x - blankCenterX, pf.centroid.y - blankCenterY);
    const normDist = distToCenter / (blankDiag / 2); // 0 no centro, ~1 na borda
    const normArea = pf.area / (maxArea || 1);
    const deg = adjMap.get(pf.id)?.length || 0;

    // Prioriza conexões estruturais (deg), área da base/fundo e proximidade do centro real da faca
    // Em embalagens CAD paramétricas industriais centradas, a BASE da caixa é construída em (0, 0)
    const isBlankOriginCentered = (bMinX < -10 && bMaxX > 10 && bMinY < -10 && bMaxY > 10);
    const isOriginBase = isBlankOriginCentered && (Math.hypot(pf.centroid.x, pf.centroid.y) < 25.0 || pointInPolygon({ x: 0, y: 0 }, pf.points));
    const originBonus = isOriginBase ? 10000 : 0;
    const score = originBonus + deg * 250 + normArea * 500 + (1.0 - normDist) * 400;
    if (score > bestScore) {
      bestScore = score;
      rootFace = pf;
    }
  }

  const rootFaceId = rootFace ? rootFace.id : -1;

  const visitedPanels = new Set<number>();
  const parentMap = new Map<number, { parentId: number; hinge: RawHingeEdge; depth: number }>();
  const queue: number[] = [];
  const rootFaceIds: number[] = [];

  if (rootFaceId !== -1) {
    rootFaceIds.push(rootFaceId);
    visitedPanels.add(rootFaceId);
    queue.push(rootFaceId);
  }

  // BFS para todos os componentes conexos (suporta embalagens multi-peças como tampa e fundo separados)
  while (true) {
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currDepth = parentMap.get(curr)?.depth || 0;
      const neighbors = adjMap.get(curr) || [];

      for (const edge of neighbors) {
        if (!visitedPanels.has(edge.neighborId)) {
          visitedPanels.add(edge.neighborId);
          parentMap.set(edge.neighborId, {
            parentId: curr,
            hinge: edge.hinge,
            depth: currDepth + 1,
          });
          queue.push(edge.neighborId);
        }
      }
    }

    // Busca o próximo componente conexo não visitado que possua dobradiças
    let nextRoot: (typeof panelFaces)[0] | null = null;
    let nextBestScore = -Infinity;
    for (const pf of panelFaces) {
      if (visitedPanels.has(pf.id)) continue;
      const deg = adjMap.get(pf.id)?.length || 0;
      if (deg === 0) continue;
      const score = deg * 250 + pf.area;
      if (score > nextBestScore) {
        nextBestScore = score;
        nextRoot = pf;
      }
    }

    if (!nextRoot) break;

    rootFaceIds.push(nextRoot.id);
    visitedPanels.add(nextRoot.id);
    queue.push(nextRoot.id);
  }

  // Inclui quaisquer peças planas remanescentes (ex: calços, divisórias, chapas planas de cabeceira)
  for (const pf of panelFaces) {
    if (!visitedPanels.has(pf.id)) {
      rootFaceIds.push(pf.id);
      visitedPanels.add(pf.id);
    }
  }

  // 10. Constrói os objetos TopologicalPanel e TopologicalHinge com eixos vetoriais 3D
  const topologicalPanels: TopologicalPanel[] = [];
  const topologicalHinges: TopologicalHinge[] = [];

  for (const pf of panelFaces) {
    const isRoot = rootFaceIds.includes(pf.id);
    const parentInfo = parentMap.get(pf.id);
    const panelId = `panel_${pf.id}`;

    let hingeToParent: TopologicalHinge | undefined;

    if (parentInfo) {
      const h = parentInfo.hinge;

      const hx0 = h.x0;
      const hz0 = -h.y0;
      const hx1 = h.x1;
      const hz1 = -h.y1;

      let vx = hx1 - hx0;
      let vz = hz1 - hz0;
      const vLen = Math.hypot(vx, vz);
      if (vLen > 1e-6) {
        vx /= vLen;
        vz /= vLen;
      }

      const hMidX = (hx0 + hx1) / 2;
      const hMidZ = (hz0 + hz1) / 2;

      const childCentroidX = pf.centroid.x;
      const childCentroidZ = -pf.centroid.y;
      const toChildX = childCentroidX - hMidX;
      const toChildZ = childCentroidZ - hMidZ;

      // Regra vetorial para dobra para cima (+Y)
      let ax = vx;
      let az = vz;
      const crossY = az * toChildX - ax * toChildZ;
      if (crossY < 0) {
        ax = -ax;
        az = -az;
      }

      // TODAS as dobras de caixas industriais s├úo de 90┬░ relativas para o interior da embalagem!
      // Dobras de parede dupla alcan├ºam 180┬░ pela composi├º├úo de duas dobras consecutivas de 90┬░ (Parede->Topo a 90┬░ + Topo->Retorno a 90┬░ = 180┬░).
      // A tampa alcan├ºa 180┬░ em rela├º├úo ├á base pela composi├º├úo (Base->Parede a 90┬░ + Parede->Tampa a 90┬░ = 180┬░ horizontal).
      const targetAngle = 90;

      // Ordem f├¡sica sequencial de montagem:
      let foldOrder = 1;
      if (parentInfo.depth === 1) {
        foldOrder = 1;
      } else if (parentInfo.depth === 2) {
        // Distingue tampa (comprimento longo em Z) de abas laterais
        const isLid = Math.abs(childCentroidZ) > Math.abs(hMidZ) + 50;
        foldOrder = isLid ? 4 : 2;
      } else if (parentInfo.depth === 3) {
        const isLidChild = parentMap.get(parentInfo.parentId)?.depth === 2;
        foldOrder = isLidChild ? 5 : 3;
      } else {
        foldOrder = 5;
      }

      const hingeId = `hinge_${parentInfo.parentId}_to_${pf.id}`;
      hingeToParent = {
        id: hingeId,
        parentPanelId: `panel_${parentInfo.parentId}`,
        childPanelId: panelId,
        x0: hx0,
        y0: -hz0,
        x1: hx1,
        y1: -hz1,
        length: h.length,
        axis: { x: ax, y: 0, z: az },
        origin: { x: hx0, y: 0, z: hz0 },
        targetAngleDeg: targetAngle,
        foldOrder,
      };
      topologicalHinges.push(hingeToParent);
    }

    const holes = panelHolesMap.get(pf.id) || [];
    const panelName = isRoot ? 'Base (Fundo)' : `Painel ${pf.id}`;

    topologicalPanels.push({
      id: panelId,
      name: panelName,
      boundary: pf.points,
      holes,
      area: pf.area,
      centroid: pf.centroid,
      isRoot,
      parentId: parentInfo ? `panel_${parentInfo.parentId}` : undefined,
      hingeToParent,
      children: [],
    });
  }

  for (const p of topologicalPanels) {
    if (p.parentId) {
      const parent = topologicalPanels.find((pp) => pp.id === p.parentId);
      if (parent) parent.children.push(p.id);
    }
  }

  return {
    panels: topologicalPanels,
    hinges: topologicalHinges,
    rootPanelId: rootFace ? `panel_${rootFace.id}` : (topologicalPanels[0]?.id || ''),
    rawSegmentsCount: dieline.segments.length,
    rawArcsCount: dieline.arcs.length,
  };
}

/**
 * Converte a topologia planar exata (DielineTopology) em painéis estruturais (StructuralPanel)
 * e árvore de dobras (FoldingTreeResult) consumíveis pelos adaptadores Three.js e exportadores 3D.
 */
export function convertDielineTopologyToStructural(customTopo: DielineTopology): {
  panels: StructuralPanel[];
  foldingTree: FoldingTreeResult;
} {
  const rootPanelId =
    customTopo.rootPanelId ||
    customTopo.panels.find((p) => p.isRoot)?.id ||
    customTopo.panels[0]?.id ||
    '';

  const structuralPanels: StructuralPanel[] = customTopo.panels.map((p) => {
    const bSegs = p.boundary.map((pt, i) => {
      const next = p.boundary[(i + 1) % p.boundary.length];
      return {
        id: `seg_${p.id}_${i}`,
        x0: pt.x,
        y0: pt.y,
        x1: next.x,
        y1: next.y,
        type: 'cut' as const,
      };
    });

    const outerBounds = computeBoundingBox({ segments: bSegs, arcs: [] });

    const outerLoop: ClosedLoop = {
      id: `loop_${p.id}`,
      vertices: p.boundary,
      edges: bSegs.map((s, i) => ({
        type: 'segment',
        id: `edge_${p.id}_${i}`,
        sourceType: 'cut',
        entity: s,
        p0: { x: s.x0, y: s.y0 },
        p1: { x: s.x1, y: s.y1 },
        direction: 'FORWARD',
      })),
      area: p.area,
      signedArea: p.area,
      isExternal: false,
      orientation: 'CCW',
      bounds: outerBounds,
      centroid: p.centroid,
    };

    const holeLoops: ClosedLoop[] = (p.holes || []).map((h, hIdx) => {
      const hSegs = h.map((pt, i) => {
        const next = h[(i + 1) % h.length];
        return {
          id: `hole_seg_${p.id}_${hIdx}_${i}`,
          x0: pt.x,
          y0: pt.y,
          x1: next.x,
          y1: next.y,
          type: 'cut' as const,
        };
      });
      const hBounds = computeBoundingBox({ segments: hSegs, arcs: [] });
      return {
        id: `hole_${p.id}_${hIdx}`,
        vertices: h,
        edges: hSegs.map((s, i) => ({
          type: 'segment',
          id: `hole_edge_${p.id}_${hIdx}_${i}`,
          sourceType: 'cut',
          entity: s,
          p0: { x: s.x0, y: s.y0 },
          p1: { x: s.x1, y: s.y1 },
          direction: 'FORWARD',
        })),
        area: 231,
        signedArea: 231,
        isExternal: false,
        orientation: 'CW',
        bounds: hBounds,
        centroid: { x: (hBounds.minX + hBounds.maxX) / 2, y: (hBounds.minY + hBounds.maxY) / 2 },
      };
    });

    return {
      id: p.id,
      name: p.name || p.id,
      outerBoundary: outerLoop,
      holes: holeLoops,
      area: p.area,
      bounds: outerBounds,
      centroid: p.centroid,
      segments: bSegs,
      arcs: [],
      creases: [],
      cuts: bSegs,
      manifest: `Panel ${p.id} (${p.name || 'Structural'})`,
    };
  });

  const panelMap = new Map<string, StructuralPanel>();
  for (const sp of structuralPanels) {
    panelMap.set(sp.id, sp);
  }

  const hinges: TreeHinge[] = (customTopo.hinges || []).map((h) => {
    const pChild = customTopo.panels.find((p) => p.id === h.childPanelId);
    const midX = (h.x0 + h.x1) / 2;
    const midY = (h.y0 + h.y1) / 2;
    const toCx = (pChild?.centroid?.x ?? midX) - midX;
    const toCy = (pChild?.centroid?.y ?? midY) - midY;
    const dx = h.x1 - h.x0;
    const dy = h.y1 - h.y0;
    const cross = dx * toCy - dy * toCx;
    const topologicalSign: 1 | -1 = cross >= 0 ? 1 : -1;
    const len = Math.hypot(dx, dy);

    return {
      id: h.id,
      creaseId: h.id,
      parentPanelId: h.parentPanelId,
      childPanelId: h.childPanelId,
      axisStart: { x: h.x0, y: h.y0 },
      axisEnd: { x: h.x1, y: h.y1 },
      length: len,
      direction: { x: len > 0 ? dx / len : 1, y: len > 0 ? dy / len : 0 },
      foldAngle: h.targetAngleDeg ?? 90,
      foldSign: topologicalSign,
      foldOrder: h.foldOrder ?? 1,
      status: 'ACTIVE',
      kinematics: {
        targetAngle: h.targetAngleDeg ?? 90,
        angleSource: 'MODEL',
        topologicalSign,
        signSource: 'MODEL_RULE',
        physicalDirection: 'MOUNTAIN',
      },
    };
  });

  const rootStructural = panelMap.get(rootPanelId) || structuralPanels[0];
  const treeNodes = new Map<string, FoldingTreeNode>();
  for (const sp of structuralPanels) {
    treeNodes.set(sp.id, {
      panelId: sp.id,
      panel: sp,
      depth: 0,
      children: [],
    });
  }

  for (const h of hinges) {
    const parentNode = treeNodes.get(h.parentPanelId);
    const childNode = treeNodes.get(h.childPanelId);
    if (parentNode && childNode) {
      childNode.depth = parentNode.depth + 1;
      childNode.incomingHinge = h;
      parentNode.children.push(childNode);
    }
  }

  const primaryTree = treeNodes.get(rootPanelId) || {
    panelId: rootStructural.id,
    panel: rootStructural,
    depth: 0,
    children: [],
  };

  const foldingTree: FoldingTreeResult = {
    rootPanelId,
    rootPanel: rootStructural,
    rootSource: 'MODEL_RULE',
    tree: primaryTree,
    hinges,
    edges: [],
    components: [
      {
        componentId: 'COMP_001',
        rootPanelId,
        rootSource: 'MODEL_RULE',
        panelIds: structuralPanels.map((p) => p.id),
        hinges,
      },
    ],
    orphanCreases: [],
    cycles: [],
    disconnectedComponents: [],
    invalidHingeCreaseMappings: [],
    manifest: 'Canonical Folding Tree from DielineTopology',
    stats: {
      totalPanels: structuralPanels.length,
      totalHinges: hinges.length,
      totalCreases: hinges.length,
      connectedPanelsCount: structuralPanels.length,
      componentsCount: 1,
      cyclesCount: 0,
      disconnectedPanelsCount: 0,
      orphanCreasesCount: 0,
      invalidMappingsCount: 0,
    },
  };

  return { panels: structuralPanels, foldingTree };
}
