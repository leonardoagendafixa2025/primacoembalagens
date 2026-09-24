import type { Point2D, Segment2D, Arc2D, BoundingBox2D } from '../types';
import type { PackagingGeometry } from '../geometry';
import { computeBoundingBox } from '../geometry';

export interface LoopEntityRef {
  type: 'segment' | 'arc';
  id: string;
  sourceType: string;
  entity: Segment2D | Arc2D;
  p0: Point2D;
  p1: Point2D;
  direction: 'FORWARD' | 'REVERSE';
}

export interface ClosedLoop {
  id: string;
  vertices: Point2D[];
  edges: LoopEntityRef[];
  area: number;
  signedArea: number;
  isExternal: boolean;
  orientation: 'CCW' | 'CW';
  bounds: BoundingBox2D;
  centroid: Point2D;
}

export interface StructuralPanel {
  id: string;
  name: string;
  outerBoundary: ClosedLoop;
  holes: ClosedLoop[];
  area: number; // Área líquida = outer.area - sum(holes.area)
  bounds: BoundingBox2D;
  centroid: Point2D;
  segments: Segment2D[];
  arcs: Arc2D[];
  creases: Segment2D[];
  cuts: Segment2D[];
  manifest: string; // Relatório forense detalhado da face
}

export interface OpenBoundaryDiagnostic {
  id: string;
  startPoint: Point2D;
  endPoint: Point2D;
  gapDistanceMm: number;
  entitiesInvolved: string[];
  location: Point2D;
  reason: string;
}

export interface StructuralTopologyResult {
  panels: StructuralPanel[];
  outerBoundaries: ClosedLoop[];
  holes: ClosedLoop[];
  openBoundaries: OpenBoundaryDiagnostic[];
  stats: {
    totalVertices: number;
    totalEdges: number;
    totalLoops: number;
    outerLoopsCount: number;
    holesCount: number;
    panelsCount: number;
    openBoundariesCount: number;
    totalNetAreaMm2: number;
    perfCount: number;
    arcsCount: number;
  };
}

interface DirectedHalfEdge {
  id: string;
  u: Point2D;
  v: Point2D;
  angle: number;
  type: string;
  ref: LoopEntityRef;
  twin?: DirectedHalfEdge;
  next?: DirectedHalfEdge;
  visited?: boolean;
}

/**
 * Ponto dentro de polígono (Ray Casting)
 */
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

/**
 * Calcula a área assinada analítica exata de um ciclo composto por segmentos e arcos circulares
 */
function computeLoopSignedAreaAndCentroid(
  vertices: Point2D[],
  edges: LoopEntityRef[]
): { signedArea: number; area: number; centroid: Point2D } {
  let shoelace = 0;
  let cx = 0, cy = 0;

  for (let i = 0; i < vertices.length; i++) {
    const p1 = vertices[i];
    const p2 = vertices[(i + 1) % vertices.length];
    const cross = p1.x * p2.y - p2.x * p1.y;
    shoelace += cross;
    cx += (p1.x + p2.x) * cross;
    cy += (p1.y + p2.y) * cross;
  }

  const polyArea = Math.abs(shoelace / 2);
  let totalArea = polyArea;

  // Ajuste analítico exato para arcos circulares (área do segmento circular sem discretização)
  for (const edge of edges) {
    if (edge.type === 'arc') {
      const arc = edge.entity as Arc2D;
      let spanDeg = Math.abs(arc.endAngle - arc.startAngle) % 360;
      if (spanDeg > 180) spanDeg = 360 - spanDeg;
      const spanRad = (spanDeg * Math.PI) / 180;
      const circularSegmentArea = 0.5 * arc.r * arc.r * Math.max(0, spanRad - Math.sin(spanRad));
      totalArea += circularSegmentArea;
    }
  }

  if (Math.abs(shoelace) > 1e-6) {
    cx = cx / (3 * shoelace);
    cy = cy / (3 * shoelace);
  } else if (vertices.length > 0) {
    cx = vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length;
    cy = vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length;
  }

  // O sinal da área DEVE ser estritamente governado pelo sentido do polígono dos vértices (shoelace >= 0 -> CCW, < 0 -> CW)
  const isCCW = shoelace >= 0;
  return {
    signedArea: isCCW ? totalArea : -totalArea,
    area: Math.max(0.01, totalArea),
    centroid: { x: cx, y: cy },
  };
}

/**
 * Motor de Extração de Loops, Boundaries e Painéis Estruturais Reais (Fase 2B)
 */
export class LoopTopologyEngine {
  /**
   * Constrói o grafo planar a partir da PackagingGeometry, rastreia loops fechados,
   * separa contornos externos de furos e compõe os painéis estruturais reais.
   */
  public static extractTopology(geometry: PackagingGeometry): StructuralTopologyResult {
    const openBoundaries: OpenBoundaryDiagnostic[] = [];
    const perfCount = geometry.segments.filter((s) => s.type === 'perfo').length;
    const arcsCount = geometry.arcs.length;

    // 1. Coleta vértices únicos via Spatial Grid para garantir conectividade perfeita
    const snapTolMm = 0.15;
    const vCellSize = Math.max(1.0, snapTolMm * 10);
    const vertexGrid = new Map<string, Point2D[]>();

    function getCanonicalVertex(p: Point2D): Point2D {
      const gx = Math.floor(p.x / vCellSize);
      const gy = Math.floor(p.y / vCellSize);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const list = vertexGrid.get(`${gx + dx}_${gy + dy}`);
          if (list) {
            for (const vp of list) {
              if (Math.hypot(vp.x - p.x, vp.y - p.y) < snapTolMm) {
                return vp;
              }
            }
          }
        }
      }

      const newV: Point2D = { x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) };
      const k = `${gx}_${gy}`;
      let cellList = vertexGrid.get(k);
      if (!cellList) {
        cellList = [];
        vertexGrid.set(k, cellList);
      }
      cellList.push(newV);
      return newV;
    }

    // Apenas CUT e CREASE participam da formação topológica de painéis e boundaries.
    // PERF e DIMENSION são estritamente excluídos da construção de faces.
    const validSegments = geometry.segments.filter(
      (s) => s.type === 'cut' || s.type === 'crease'
    );
    const validArcs = geometry.arcs.filter(
      (a) => a.type === 'cut' || a.type === 'crease'
    );

    const halfEdges: DirectedHalfEdge[] = [];
    const vertexOutgoing = new Map<Point2D, DirectedHalfEdge[]>();

    // Adiciona segmentos lineares
    for (const seg of validSegments) {
      const u = getCanonicalVertex({ x: seg.x0, y: seg.y0 });
      const v = getCanonicalVertex({ x: seg.x1, y: seg.y1 });
      if (u === v) continue;

      const fwdRef: LoopEntityRef = {
        type: 'segment',
        id: String(seg.id),
        sourceType: seg.type,
        entity: seg,
        p0: u,
        p1: v,
        direction: 'FORWARD',
      };
      const revRef: LoopEntityRef = {
        type: 'segment',
        id: String(seg.id),
        sourceType: seg.type,
        entity: seg,
        p0: v,
        p1: u,
        direction: 'REVERSE',
      };

      const heFwd: DirectedHalfEdge = {
        id: `he_fwd_${seg.id}`,
        u,
        v,
        angle: Math.atan2(v.y - u.y, v.x - u.x),
        type: seg.type,
        ref: fwdRef,
      };
      const heRev: DirectedHalfEdge = {
        id: `he_rev_${seg.id}`,
        u: v,
        v: u,
        angle: Math.atan2(u.y - v.y, u.x - v.x),
        type: seg.type,
        ref: revRef,
      };

      heFwd.twin = heRev;
      heRev.twin = heFwd;
      halfEdges.push(heFwd, heRev);

      if (!vertexOutgoing.has(u)) vertexOutgoing.set(u, []);
      if (!vertexOutgoing.has(v)) vertexOutgoing.set(v, []);
      vertexOutgoing.get(u)!.push(heFwd);
      vertexOutgoing.get(v)!.push(heRev);
    }

    // Adiciona arcos circulares analíticos
    for (const arc of validArcs) {
      const aStartRad = (arc.startAngle * Math.PI) / 180;
      const aEndRad = (arc.endAngle * Math.PI) / 180;
      const u = getCanonicalVertex({
        x: arc.cx + arc.r * Math.cos(aStartRad),
        y: arc.cy + arc.r * Math.sin(aStartRad),
      });
      const v = getCanonicalVertex({
        x: arc.cx + arc.r * Math.cos(aEndRad),
        y: arc.cy + arc.r * Math.sin(aEndRad),
      });
      if (u === v) continue;

      const fwdRef: LoopEntityRef = {
        type: 'arc',
        id: String(arc.id),
        sourceType: arc.type,
        entity: arc,
        p0: u,
        p1: v,
        direction: 'FORWARD',
      };
      const revRef: LoopEntityRef = {
        type: 'arc',
        id: String(arc.id),
        sourceType: arc.type,
        entity: arc,
        p0: v,
        p1: u,
        direction: 'REVERSE',
      };

      const heFwd: DirectedHalfEdge = {
        id: `he_fwd_${arc.id}`,
        u,
        v,
        angle: Math.atan2(v.y - u.y, v.x - u.x),
        type: arc.type,
        ref: fwdRef,
      };
      const heRev: DirectedHalfEdge = {
        id: `he_rev_${arc.id}`,
        u: v,
        v: u,
        angle: Math.atan2(u.y - v.y, u.x - v.x),
        type: arc.type,
        ref: revRef,
      };

      heFwd.twin = heRev;
      heRev.twin = heFwd;
      halfEdges.push(heFwd, heRev);

      if (!vertexOutgoing.has(u)) vertexOutgoing.set(u, []);
      if (!vertexOutgoing.has(v)) vertexOutgoing.set(v, []);
      vertexOutgoing.get(u)!.push(heFwd);
      vertexOutgoing.get(v)!.push(heRev);
    }

    // 2. Detecção de nós abertos / pontas soltas (Degree 1) -> OPEN_BOUNDARY
    for (const [, outList] of vertexOutgoing.entries()) {
      if (outList.length === 1) {
        const edge = outList[0];
        openBoundaries.push({
          id: `open_${edge.id}`,
          startPoint: edge.u,
          endPoint: edge.v,
          gapDistanceMm: Math.hypot(edge.v.x - edge.u.x, edge.v.y - edge.u.y),
          entitiesInvolved: [edge.ref.id],
          location: edge.u,
          reason: `Vértice aberto não fechado: extremidade com grau 1 em (${edge.u.x.toFixed(3)}, ${edge.u.y.toFixed(3)})`,
        });
      }
    }

    // 3. Ordena arestas de saída no sentido anti-horário (CCW) ao redor de cada vértice
    for (const [, list] of vertexOutgoing.entries()) {
      list.sort((a, b) => a.angle - b.angle);
    }

    // Liga os ponteiros next de cada half-edge (curva máxima à esquerda = menor face plana)
    for (const he of halfEdges) {
      const v = he.v;
      const outList = vertexOutgoing.get(v) || [];
      if (outList.length === 0) continue;
      const twinIdx = outList.indexOf(he.twin!);
      if (twinIdx !== -1) {
        const nextIdx = (twinIdx - 1 + outList.length) % outList.length;
        he.next = outList[nextIdx];
      }
    }

    // 4. Rastreia todos os ciclos fechados (Loops)
    const allLoops: ClosedLoop[] = [];
    let loopIdCounter = 0;

    for (const he of halfEdges) {
      if (he.visited) continue;

      const cycleVertices: Point2D[] = [];
      const cycleEdges: LoopEntityRef[] = [];
      let curr: DirectedHalfEdge | undefined = he;
      let isClosed = false;

      let stepCount = 0;
      const MAX_CYCLE_STEPS = 1500;
      while (curr && !curr.visited && stepCount < MAX_CYCLE_STEPS) {
        stepCount++;
        curr.visited = true;
        cycleVertices.push(curr.u);
        cycleEdges.push(curr.ref);
        curr = curr.next;
        if (curr === he) {
          isClosed = true;
          break;
        }
      }

      if (!isClosed || cycleVertices.length < 3) continue;

      const { signedArea, area, centroid } = computeLoopSignedAreaAndCentroid(cycleVertices, cycleEdges);
      const isExternal = signedArea < 0; // Por convenção de Shoelace CCW, face externa infinita tem área com sinal negativo

      loopIdCounter++;
      const loopObj: ClosedLoop = {
        id: `loop_${loopIdCounter.toString().padStart(3, '0')}`,
        vertices: cycleVertices,
        edges: cycleEdges,
        area,
        signedArea,
        isExternal,
        orientation: signedArea >= 0 ? 'CCW' : 'CW',
        bounds: computeBoundingBox({
          segments: cycleEdges.filter((e) => e.type === 'segment').map((e) => e.entity as Segment2D),
          arcs: cycleEdges.filter((e) => e.type === 'arc').map((e) => e.entity as Arc2D),
        }),
        centroid,
      };

      allLoops.push(loopObj);
    }

    // 5. Separa Contornos Externos, Painéis e Furos Internos (Holes)
    // Furo: loop interno fechado puramente por CUT contido dentro de um painel maior
    const internalLoops = allLoops.filter((l) => !l.isExternal && l.area > 0.01);

    // Identifica holes: ciclos de corte fechados estritos com área menor ou sem vincos
    const holeLoops: ClosedLoop[] = [];
    const candidatePanelLoops: ClosedLoop[] = [];

    for (const loop of internalLoops) {
      const isPureCut = loop.edges.every((e) => e.sourceType === 'cut');
      // Se for puramente corte e estiver totalmente contido dentro de outro loop interno maior, é um furo
      let isInsideAnother = false;
      for (const other of internalLoops) {
        if (other !== loop && other.area > loop.area) {
          // Descarte rápido por bounding box antes de computar pointInPolygon
          if (
            loop.bounds.minX >= other.bounds.minX - 0.01 &&
            loop.bounds.maxX <= other.bounds.maxX + 0.01 &&
            loop.bounds.minY >= other.bounds.minY - 0.01 &&
            loop.bounds.maxY <= other.bounds.maxY + 0.01
          ) {
            if (pointInPolygon(loop.centroid, other.vertices)) {
              isInsideAnother = true;
              break;
            }
          }
        }
      }

      if (isPureCut && isInsideAnother) {
        holeLoops.push(loop);
      } else {
        candidatePanelLoops.push(loop);
      }
    }

    // Associa furos a seus respectivos painéis hospedeiros
    const panelHolesMap = new Map<string, ClosedLoop[]>();
    for (const pl of candidatePanelLoops) {
      panelHolesMap.set(pl.id, []);
    }
    for (const hl of holeLoops) {
      for (const pl of candidatePanelLoops) {
        if (
          hl.bounds.minX >= pl.bounds.minX - 0.01 &&
          hl.bounds.maxX <= pl.bounds.maxX + 0.01 &&
          hl.bounds.minY >= pl.bounds.minY - 0.01 &&
          hl.bounds.maxY <= pl.bounds.maxY + 0.01
        ) {
          if (pointInPolygon(hl.centroid, pl.vertices)) {
            panelHolesMap.get(pl.id)!.push(hl);
            break;
          }
        }
      }
    }

    // 6. Constrói os Objetos de Painéis Estruturais com Manifesto Topológico Forense
    const structuralPanels: StructuralPanel[] = [];
    let panelIdCounter = 0;

    for (const pl of candidatePanelLoops) {
      panelIdCounter++;
      const pId = `P${panelIdCounter.toString().padStart(3, '0')}`;
      const associatedHoles = panelHolesMap.get(pl.id) || [];
      const holesArea = associatedHoles.reduce((acc, h) => acc + h.area, 0);
      const netArea = Math.max(0, pl.area - holesArea);

      const panelSegments = pl.edges
        .filter((e) => e.type === 'segment')
        .map((e) => e.entity as Segment2D);
      const panelArcs = pl.edges
        .filter((e) => e.type === 'arc')
        .map((e) => e.entity as Arc2D);
      const panelCreases = panelSegments.filter((s) => s.type === 'crease');
      const panelCuts = panelSegments.filter((s) => s.type === 'cut');

      // Gera Manifesto Topológico Forense
      const manifestLines: string[] = [
        `Panel ${pId}`,
        `Outer Boundary (${pl.edges.length} entities):`,
        ...pl.edges.map((e, idx) => `  [${idx + 1}] ${e.sourceType.toUpperCase()} (${e.type}) - ${e.id} [${e.direction}]`),
        `Vertices (${pl.vertices.length}):`,
        ...pl.vertices.map((v, idx) => `  V${(idx + 1).toString().padStart(2, '0')}: (${v.x.toFixed(3)}, ${v.y.toFixed(3)})`),
        `Area Bruta: ${pl.area.toFixed(4)} mm²`,
        `Holes: ${associatedHoles.length} (Área Furos: ${holesArea.toFixed(4)} mm²)`,
        `Area Liquida: ${netArea.toFixed(4)} mm²`,
        `Orientation: ${pl.orientation}`,
        `Centroid: (${pl.centroid.x.toFixed(3)}, ${pl.centroid.y.toFixed(3)})`,
        `BoundingBox: [${pl.bounds.minX.toFixed(3)}, ${pl.bounds.minY.toFixed(3)}] a [${pl.bounds.maxX.toFixed(3)}, ${pl.bounds.maxY.toFixed(3)}]`,
      ];

      structuralPanels.push({
        id: pId,
        name: `Painel ${pId}`,
        outerBoundary: pl,
        holes: associatedHoles,
        area: netArea,
        bounds: pl.bounds,
        centroid: pl.centroid,
        segments: panelSegments,
        arcs: panelArcs,
        creases: panelCreases,
        cuts: panelCuts,
        manifest: manifestLines.join('\n'),
      });
    }

    const totalNetAreaMm2 = structuralPanels.reduce((acc, p) => acc + p.area, 0);

    return {
      panels: structuralPanels,
      outerBoundaries: allLoops.filter((l) => l.isExternal),
      holes: holeLoops,
      openBoundaries,
      stats: {
        totalVertices: vertexGrid.size,
        totalEdges: halfEdges.length / 2,
        totalLoops: allLoops.length,
        outerLoopsCount: allLoops.filter((l) => l.isExternal).length,
        holesCount: holeLoops.length,
        panelsCount: structuralPanels.length,
        openBoundariesCount: openBoundaries.length,
        totalNetAreaMm2: Number(totalNetAreaMm2.toFixed(4)),
        perfCount,
        arcsCount,
      },
    };
  }
}
