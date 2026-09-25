// Extração de loops fechados a partir de uma lista de Edges.
//
// Estratégia "always-left-turn" idêntica à de planar-faces, mas operando
// sobre o modelo Vertex/Edge canônico do kernel. Sem mexer no grafo —
// apenas enumera todos os ciclos mínimos (faces planares).

import type { Pt } from "../../dieline-types";
import type { Edge, Loop, Vertex } from "./types";

const EPS = 1e-9;

export interface ExtractLoopsResult {
  rawLoops: Loop[];
  interiorLoops: Loop[];
  droppedByOrientation: Loop[];
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

function bboxOf(pts: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function extractLoops(vertices: Vertex[], edges: Edge[]): Loop[] {
  return extractLoopsDetailed(vertices, edges).interiorLoops;
}

export function extractLoopsDetailed(vertices: Vertex[], edges: Edge[]): ExtractLoopsResult {
  if (!edges.length) {
    return { rawLoops: [], interiorLoops: [], droppedByOrientation: [] };
  }

  // Adjacência ordenada por ângulo CCW.
  type NB = { edgeId: number; other: Vertex; angle: number };
  const adj = new Map<number, NB[]>();
  for (const v of vertices) adj.set(v.id, []);
  for (const e of edges) {
    if (e.a.id === e.b.id) continue;
    adj.get(e.a.id)!.push({ edgeId: e.id, other: e.b, angle: Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x) });
    adj.get(e.b.id)!.push({ edgeId: e.id, other: e.a, angle: Math.atan2(e.a.y - e.b.y, e.a.x - e.b.x) });
  }
  for (const list of adj.values()) list.sort((x, y) => x.angle - y.angle);

  // === Leaf-pruning global (estilo ArtiosCAD / Prinect) =======================
  // Remove iterativamente vértices com grau <= 1 do conjunto de adjacências
  // usado pelo traversal. Esses vértices correspondem a "esporas" (marcas
  // técnicas, registros, ticks, vincos terminando no meio de uma face) que
  // não pertencem a nenhum loop fechado. Mantê-los cria contornos degenerados
  // (vai-e-volta) que poluem as faces. A geometria original NÃO é alterada
  // — só a adjacência usada para enumerar ciclos.
  {
    const q: number[] = [];
    for (const [vid, nbs] of adj) if (nbs.length <= 1) q.push(vid);
    while (q.length) {
      const vid = q.shift()!;
      const nbs = adj.get(vid);
      if (!nbs || nbs.length === 0) continue;
      for (const nb of nbs) {
        const other = adj.get(nb.other.id);
        if (!other) continue;
        const filtered = other.filter((x) => x.other.id !== vid);
        adj.set(nb.other.id, filtered);
        if (filtered.length <= 1) q.push(nb.other.id);
      }
      adj.set(vid, []);
    }
  }

  const visited = new Set<string>();
  const dirKey = (u: Vertex, v: Vertex) => `${u.id}>${v.id}`;
  const edgeById = new Map<number, Edge>();
  for (const e of edges) edgeById.set(e.id, e);

  const rawLoops: Loop[] = [];
  let loopId = 0;

  for (const v of vertices) {
    const nbs = adj.get(v.id);
    if (!nbs) continue;
    for (const n0 of nbs) {
      if (visited.has(dirKey(v, n0.other))) continue;
      const pts: Pt[] = [];
      const edgeIds: number[] = [];
      let u = v, w = n0.other;
      let edgeId = n0.edgeId;
      let safety = 0;
      let ok = true;
      let closedFlag = false;
      while (safety++ < 5000) {
        const dk = dirKey(u, w);
        if (visited.has(dk)) { ok = false; break; }
        visited.add(dk);
        pts.push({ x: u.x, y: u.y });
        edgeIds.push(edgeId);
        const nb = adj.get(w.id);
        if (!nb || !nb.length) { ok = false; break; }
        const back = Math.atan2(u.y - w.y, u.x - w.x);
        let idx = -1;
        for (let i = 0; i < nb.length; i++) {
          if (nb[i].other.id === u.id && Math.abs(nb[i].angle - back) < 1e-4) { idx = i; break; }
        }
        if (idx < 0) {
          let bestI = 0, bestD = Infinity;
          for (let i = 0; i < nb.length; i++) {
            const d = Math.abs(((nb[i].angle - back + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (d < bestD) { bestD = d; bestI = i; }
          }
          idx = bestI;
        }
        const nextIdx = (idx - 1 + nb.length) % nb.length;
        const next = nb[nextIdx];
        const nu = w, nv = next.other;
        if (nu.id === v.id && nv.id === n0.other.id) { closedFlag = true; break; }
        u = nu; w = nv; edgeId = next.edgeId;
      }
      if (!ok || pts.length < 3) continue;
      const area = signedArea(pts);
      if (Math.abs(area) < EPS) continue;
      const bb = bboxOf(pts);
      let cut = 0, crease = 0, perf = 0;
      for (const eid of edgeIds) {
        const e = edgeById.get(eid);
        if (!e) continue;
        if (e.kind === "cut") cut++;
        else if (e.kind === "crease") crease++;
        else if (e.kind === "perf") perf++;
      }
      rawLoops.push({
        id: loopId++,
        points: pts,
        edgeIds,
        signedArea: area,
        bbox: bb,
        edgeKindCounts: { cut, crease, perf },
        cutOnly: cut === edgeIds.length && edgeIds.length > 0,
        depth: 0,
        parentId: null,
        isHole: false,
        closed: closedFlag,
      });
    }
  }


  // === Fallback estrutural: ciclos cut-only em componentes isolados ===========
  // Equivalente conceitual ao "loose-loop detector" de ArtiosCAD / Prinect
  // Package Designer. Cobre genericamente — sem regras por arquivo — todos os
  // casos em que o traversal planar global não enxerga o loop interno:
  //
  //   1. Polígono de corte totalmente isolado do painel hospedeiro
  //      (caso típico de janelas/vazados/visor).
  //   2. Ciclo com "esporas" anexadas (marcas técnicas, registros, ticks):
  //      removemos folhas iterativamente (leaf-pruning) e detectamos o
  //      ciclo remanescente.
  //   3. Múltiplos ciclos no mesmo componente conexo (janelas em sequência):
  //      após pruning, percorremos sub-componentes 2-regulares
  //      independentemente.
  //
  // Toda detecção é feita SOMENTE sobre o subgrafo cut-only. Loops já
  // capturados pelo traversal "always-left-turn" são deduplicados por
  // conjunto ordenado de edgeIds, garantindo idempotência.
  let nextLoopId = rawLoops.length;
  const seenEdgeSets = new Set<string>();
  for (const l of rawLoops) {
    seenEdgeSets.add([...l.edgeIds].sort((a, b) => a - b).join(","));
  }

  // Adjacência mutável (vamos podar folhas).
  type CutNb = { edgeId: number; other: Vertex };
  const cutAdj = new Map<number, CutNb[]>();
  for (const v of vertices) cutAdj.set(v.id, []);
  for (const e of edges) {
    if (e.kind !== "cut") continue;
    if (e.a.id === e.b.id) continue;
    cutAdj.get(e.a.id)!.push({ edgeId: e.id, other: e.b });
    cutAdj.get(e.b.id)!.push({ edgeId: e.id, other: e.a });
  }

  const vertexById = new Map<number, Vertex>();
  for (const v of vertices) vertexById.set(v.id, v);

  // Leaf-pruning global: remove iterativamente vértices com grau<=1 no
  // subgrafo cut-only. O que sobra são apenas estruturas com ciclos.
  const queue: number[] = [];
  for (const [vid, nbs] of cutAdj) {
    if (nbs.length <= 1) queue.push(vid);
  }
  while (queue.length) {
    const vid = queue.shift()!;
    const nbs = cutAdj.get(vid);
    if (!nbs || nbs.length === 0) continue;
    // Remove o vértice de cada vizinho e enfileira vizinhos que viraram folhas.
    for (const nb of nbs) {
      const other = cutAdj.get(nb.other.id);
      if (!other) continue;
      const filtered = other.filter((x) => !(x.other.id === vid && x.edgeId === nb.edgeId));
      cutAdj.set(nb.other.id, filtered);
      if (filtered.length <= 1) queue.push(nb.other.id);
    }
    cutAdj.set(vid, []);
  }

  // Agora os vértices remanescentes (grau >= 2 cut-only) formam estruturas
  // com pelo menos um ciclo. Para cada componente, se for um único ciclo
  // simples (todos grau 2), extraímos. Componentes com vértices de grau > 2
  // (faces planares cut-only com sub-faces) são deixados para o traversal
  // global, que naqueles casos consegue enxergá-los.
  const visitedV = new Set<number>();
  for (const v of vertices) {
    if (visitedV.has(v.id)) continue;
    const nbs0 = cutAdj.get(v.id);
    if (!nbs0 || nbs0.length === 0) { visitedV.add(v.id); continue; }

    // BFS para coletar componente cut-only podado.
    const compVerts: Vertex[] = [];
    const compVertIds = new Set<number>();
    const bfs: Vertex[] = [v];
    visitedV.add(v.id);
    compVertIds.add(v.id);
    while (bfs.length) {
      const cur = bfs.shift()!;
      compVerts.push(cur);
      for (const nb of cutAdj.get(cur.id)!) {
        if (compVertIds.has(nb.other.id)) continue;
        compVertIds.add(nb.other.id);
        visitedV.add(nb.other.id);
        bfs.push(nb.other);
      }
    }

    if (compVerts.length < 3) continue;

    // Ciclo simples ⇔ todo vértice tem grau exatamente 2.
    let isSimpleCycle = true;
    for (const cv of compVerts) {
      if (cutAdj.get(cv.id)!.length !== 2) { isSimpleCycle = false; break; }
    }
    if (!isSimpleCycle) continue;

    // Caminha o ciclo a partir de v.
    const ringPts: Pt[] = [];
    const ringEdges: number[] = [];
    let prevId = -1;
    let cur: Vertex = v;
    let safety = 0;
    while (safety++ < compVerts.length + 2) {
      ringPts.push({ x: cur.x, y: cur.y });
      const nbs2 = cutAdj.get(cur.id)!;
      const next = nbs2.find((n) => n.other.id !== prevId);
      if (!next) break;
      ringEdges.push(next.edgeId);
      if (next.other.id === v.id) break;
      prevId = cur.id;
      cur = next.other;
    }
    if (ringPts.length < 3) continue;

    const key = [...ringEdges].sort((a, b) => a - b).join(",");
    if (seenEdgeSets.has(key)) continue;
    seenEdgeSets.add(key);

    let area = signedArea(ringPts);
    let pts = ringPts;
    if (area < 0) {
      pts = [...ringPts].reverse();
      area = -area;
    }
    if (Math.abs(area) < EPS) continue;

    const bb = bboxOf(pts);
    rawLoops.push({
      id: nextLoopId++,
      points: pts,
      edgeIds: ringEdges,
      signedArea: area,
      bbox: bb,
      edgeKindCounts: { cut: ringEdges.length, crease: 0, perf: 0 },
      cutOnly: true,
      depth: 0,
      parentId: null,
      isHole: false,
      closed: true,
    });
  }

  // Filtra a "face externa" (sempre tem winding CW e área >= soma das outras).
  // Em vez de remover, marcamos: positiveArea (CCW) = interior; negativeArea (CW) = externa.
  const interiorLoops = rawLoops.filter((l) => l.signedArea > 0);
  const droppedByOrientation = rawLoops.filter((l) => l.signedArea <= 0);
  return { rawLoops, interiorLoops, droppedByOrientation };
}
