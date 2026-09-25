// Entry-point do kernel. Recebe Segment[] (formato já usado pelo pipeline)
// e devolve o modelo canônico Vertex/Edge/Loop/Face + decisões de hole.

import type { Segment } from "../../dieline-types";
import { resolveCadTolerances, type CadToleranceOverrides } from "../tolerances";
import { extractLoopsDetailed } from "./loops";
import { classifyLoops } from "./classify";
import type { Edge, EdgeKind, KernelDebugAudit, KernelLoopAuditEntry, KernelResult, Loop, Vertex } from "./types";

const KIND_ACCEPTED: ReadonlySet<EdgeKind> = new Set<EdgeKind>(["cut", "crease", "perf"]);

function nodeKey(x: number, y: number) {
  return `${x.toFixed(3)}_${y.toFixed(3)}`;
}
function bucketKey(x: number, y: number, tol: number) {
  return `${Math.round(x / tol)}_${Math.round(y / tol)}`;
}
function neighborBucketKeys(x: number, y: number, tol: number) {
  // Varredura 5×5 (em vez de 3×3) quando a tolerância de snap é compatível
  // com o tamanho do bucket. Garante que dois endpoints separados por
  // exatamente ~tol não escapem para buckets diagonais não visitados.
  const bx = Math.round(x / tol);
  const by = Math.round(y / tol);
  const out: string[] = [];
  const range = tol >= 0.4 ? 2 : 1;
  for (let ox = -range; ox <= range; ox++)
    for (let oy = -range; oy <= range; oy++) out.push(`${bx + ox}_${by + oy}`);
  return out;
}

function loopOrientation(signedArea: number): "CCW" | "CW" {
  return signedArea >= 0 ? "CCW" : "CW";
}

function loopClassificationReason(loop: Loop): string {
  if (!loop.closed) return "loop não fechado → não entra como loop válido para hole";
  if (loop.parentId === null) return "sem loop pai → permanece outer/top-level";
  if (!loop.cutOnly) return "loop aninhado, mas não é cut-only → regra de hole não aplica";
  return "loop aninhado + cut-only → classificado como hole";
}

function buildKernelDebugAudit(
  classified: Loop[],
  rawLoops: Loop[],
  droppedByOrientation: Loop[],
  faces: Array<{ id: number; outer: Loop; holes: Loop[] }>,
  edgeIdToSegIdx: Map<number, number>,
): KernelDebugAudit {
  const faceIdByLoopId = new Map<number, number>();
  for (const face of faces) {
    faceIdByLoopId.set(face.outer.id, face.id);
    for (const hole of face.holes) faceIdByLoopId.set(hole.id, face.id);
  }

  const droppedIds = new Set(droppedByOrientation.map((loop) => loop.id));
  const interiorIds = new Set(classified.map((loop) => loop.id));

  const toEntry = (loop: Loop): KernelLoopAuditEntry => ({
    loopId: loop.id,
    area: Math.abs(loop.signedArea),
    signedArea: loop.signedArea,
    orientation: loopOrientation(loop.signedArea),
    isHole: loop.isHole,
    parentId: loop.parentId,
    vertices: loop.points.map((p) => [p.x, p.y]),
    closed: loop.closed,
    sourceSegments: [...new Set(loop.edgeIds.map((eid) => edgeIdToSegIdx.get(eid)).filter((v): v is number => v !== undefined))].sort((a, b) => a - b),
    cutOnly: loop.cutOnly,
    depth: loop.depth,
    stage: droppedIds.has(loop.id) ? "extractLoops:droppedByOrientation" : interiorIds.has(loop.id) ? "extractLoops:classified" : "extractLoops:raw",
    classificationReason: loopClassificationReason(loop),
    faceId: faceIdByLoopId.get(loop.id) ?? null,
  });

  const allLoops = rawLoops.map(toEntry).map((entry) => ({
    ...entry,
    classificationReason:
      entry.stage === "extractLoops:droppedByOrientation"
        ? "descartado em extractLoops por signedArea <= 0; não chegou em classifyLoops"
        : entry.classificationReason,
  }));
  const unassignedLoops = allLoops.filter((loop) => loop.faceId === null);
  const suspected = [...allLoops]
    .filter((loop) => loop.cutOnly)
    .sort((a, b) => {
      const aScore = (a.stage === "extractLoops:droppedByOrientation" ? 0 : 1) * 1_000_000 + a.area;
      const bScore = (b.stage === "extractLoops:droppedByOrientation" ? 0 : 1) * 1_000_000 + b.area;
      return aScore - bScore;
    })[0] ?? null;

  return {
    allLoops,
    unassignedLoops,
    suspectedHoleLoopId: suspected?.loopId ?? null,
    suspectedHoleReason: suspected
      ? suspected.classificationReason
      : "nenhum loop candidato a janela foi extraído; se existe no PDF, sumiu antes de virar loop fechado no kernel",
  };
}

export function runCadKernel(segments: Segment[], tolOverrides?: CadToleranceOverrides): KernelResult {
  const tol = resolveCadTolerances(tolOverrides);
  const TOL = tol.snapMm;
  const CROSS_KIND_TOL = Math.min(tol.crossKindSnapMm ?? 0.1, TOL);

  // 1) Weld de vértices.
  const vertices: Vertex[] = [];
  const byKey = new Map<string, Vertex>();
  const buckets = new Map<string, Vertex[]>();
  const vertexKinds = new Map<number, Set<EdgeKind>>();
  let vId = 0;
  const weld = (x: number, y: number, kind: EdgeKind): Vertex => {
    for (const k of neighborBucketKeys(x, y, TOL)) {
      const arr = buckets.get(k);
      if (!arr) continue;
      for (const v of arr) {
        const dist = Math.hypot(v.x - x, v.y - y);
        if (dist > TOL) continue;
        const kinds = vertexKinds.get(v.id) ?? new Set<EdgeKind>();
        if (kinds.has(kind) || dist <= CROSS_KIND_TOL) {
          kinds.add(kind);
          vertexKinds.set(v.id, kinds);
          return v;
        }
      }
    }
    const v: Vertex = { id: vId++, x: +x.toFixed(3), y: +y.toFixed(3) };
    vertices.push(v);
    byKey.set(nodeKey(v.x, v.y), v);
    vertexKinds.set(v.id, new Set([kind]));
    const bk = bucketKey(v.x, v.y, TOL);
    const arr = buckets.get(bk);
    if (arr) arr.push(v); else buckets.set(bk, [v]);
    return v;
  };

  // 2) Edges a partir dos segments.
  const edges: Edge[] = [];
  let eId = 0;
  const seenEdge = new Set<string>();
  const pushEdge = (a: Vertex, b: Vertex, kind: EdgeKind, sourceSegIdx: number) => {
    if (a.id === b.id) return;
    if (Math.hypot(a.x - b.x, a.y - b.y) < tol.minSegmentMm) return;
    const ek = a.id < b.id ? `${a.id}|${b.id}|${kind}` : `${b.id}|${a.id}|${kind}`;
    if (seenEdge.has(ek)) return;
    seenEdge.add(ek);
    edges.push({ id: eId++, a, b, kind, sourceSegIdx });
  };

  for (let si = 0; si < segments.length; si++) {
    const s = segments[si];
    if (!KIND_ACCEPTED.has(s.kind as EdgeKind)) continue;
    const kind = s.kind as EdgeKind;
    const pts = s.points;
    for (let i = 0; i < pts.length - 1; i++) {
      pushEdge(weld(pts[i].x, pts[i].y, kind), weld(pts[i + 1].x, pts[i + 1].y, kind), kind, si);
    }
    if (s.closed && pts.length > 2) {
      pushEdge(weld(pts[pts.length - 1].x, pts[pts.length - 1].y, kind), weld(pts[0].x, pts[0].y, kind), kind, si);
    }
  }

  // 2b) Planarização — T-junction / X-junction splitting.
  // ----------------------------------------------------------------------
  // O traversal "always-left-turn" exige um grafo planar: edges só podem
  // se tocar em vértices. Em dielines reais (FEFCO 0201, RSC genéricos),
  // um vinco horizontal pode atravessar 3-4 cortes verticais sem que o
  // PDF tenha vértices nesses cruzamentos. Sem split, o vinco vira uma
  // aresta única ligando os dois extremos e nenhum sub-painel interno é
  // enumerado — toda a caixa aparece como UMA face.
  //
  // Estratégia em duas passadas, idempotente:
  //   (i)  T-junctions: para cada edge, qualquer VÉRTICE existente que
  //        caia no interior (distância perp ≤ TOL e parametro estritamente
  //        entre 0 e 1) divide a edge em pedaços. Preserva kind e
  //        sourceSegIdx.
  //   (ii) X-junctions: cruzamentos genuínos entre duas edges em pontos
  //        sem vértice → cria vértice novo e divide ambas.
  //
  // Roda até estabilizar (cada iteração só pode aumentar o # de vértices).
  {
    const onSegment = (e: Edge, v: Vertex): number | null => {
      if (v.id === e.a.id || v.id === e.b.id) return null;
      const dx = e.b.x - e.a.x;
      const dy = e.b.y - e.a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-12) return null;
      const t = ((v.x - e.a.x) * dx + (v.y - e.a.y) * dy) / len2;
      if (t <= 1e-4 || t >= 1 - 1e-4) return null;
      const px = e.a.x + t * dx;
      const py = e.a.y + t * dy;
      const perp = Math.hypot(v.x - px, v.y - py);
      if (perp > TOL) return null;
      return t;
    };

    let changed = true;
    let safety = 0;
    while (changed && safety++ < 6) {
      changed = false;
      const next: Edge[] = [];
      seenEdge.clear();
      for (const e of edges) {
        // Coleta todos os vértices que caem no interior desta edge.
        const cuts: Array<{ t: number; v: Vertex }> = [];
        for (const v of vertices) {
          const t = onSegment(e, v);
          if (t == null) continue;
          cuts.push({ t, v });
        }
        if (cuts.length === 0) {
          const ek = e.a.id < e.b.id ? `${e.a.id}|${e.b.id}|${e.kind}` : `${e.b.id}|${e.a.id}|${e.kind}`;
          if (seenEdge.has(ek)) continue;
          seenEdge.add(ek);
          next.push(e);
          continue;
        }
        cuts.sort((p, q) => p.t - q.t);
        const chain: Vertex[] = [e.a, ...cuts.map((c) => c.v), e.b];
        for (let i = 0; i < chain.length - 1; i++) {
          const a = chain[i];
          const b = chain[i + 1];
          if (a.id === b.id) continue;
          if (Math.hypot(a.x - b.x, a.y - b.y) < tol.minSegmentMm) continue;
          const ek = a.id < b.id ? `${a.id}|${b.id}|${e.kind}` : `${b.id}|${a.id}|${e.kind}`;
          if (seenEdge.has(ek)) continue;
          seenEdge.add(ek);
          next.push({ id: eId++, a, b, kind: e.kind, sourceSegIdx: e.sourceSegIdx });
        }
        changed = true;
      }
      edges.length = 0;
      for (const e of next) edges.push(e);

      // X-junction pass: cruzamentos genuínos sem vértice intermediário.
      // Calculamos novos vértices e marcamos os edges a serem divididos.
      const xCuts = new Map<number, number[]>(); // edgeId → t-values
      const addCut = (eid: number, t: number) => {
        if (t <= 1e-4 || t >= 1 - 1e-4) return;
        const arr = xCuts.get(eid) ?? [];
        arr.push(t);
        xCuts.set(eid, arr);
      };
      for (let i = 0; i < edges.length; i++) {
        const e1 = edges[i];
        const ax = e1.a.x, ay = e1.a.y;
        const dx1 = e1.b.x - ax, dy1 = e1.b.y - ay;
        for (let j = i + 1; j < edges.length; j++) {
          const e2 = edges[j];
          if (e1.a.id === e2.a.id || e1.a.id === e2.b.id || e1.b.id === e2.a.id || e1.b.id === e2.b.id) continue;
          const cx = e2.a.x, cy = e2.a.y;
          const dx2 = e2.b.x - cx, dy2 = e2.b.y - cy;
          const denom = dx1 * dy2 - dy1 * dx2;
          if (Math.abs(denom) < 1e-9) continue;
          const s = ((cx - ax) * dy2 - (cy - ay) * dx2) / denom;
          const t = ((cx - ax) * dy1 - (cy - ay) * dx1) / denom;
          if (s <= 1e-4 || s >= 1 - 1e-4) continue;
          if (t <= 1e-4 || t >= 1 - 1e-4) continue;
          const ix = ax + s * dx1;
          const iy = ay + s * dy1;
          // Cria vértice no cruzamento (welds com existentes via weld()).
          const iv = weld(ix, iy, e1.kind);
          // Reutiliza o vértice como pivô — não adiciona kind ao outro edge
          // para não bagunçar o vertexKinds, mas força associação.
          vertexKinds.get(iv.id)?.add(e2.kind);
          if (iv.id === e1.a.id || iv.id === e1.b.id || iv.id === e2.a.id || iv.id === e2.b.id) continue;
          addCut(e1.id, s);
          addCut(e2.id, t);
          changed = true;
        }
      }
      if (xCuts.size > 0) {
        const next2: Edge[] = [];
        seenEdge.clear();
        for (const e of edges) {
          const ts = xCuts.get(e.id);
          if (!ts || ts.length === 0) {
            const ek = e.a.id < e.b.id ? `${e.a.id}|${e.b.id}|${e.kind}` : `${e.b.id}|${e.a.id}|${e.kind}`;
            if (seenEdge.has(ek)) continue;
            seenEdge.add(ek);
            next2.push(e);
            continue;
          }
          const dx = e.b.x - e.a.x;
          const dy = e.b.y - e.a.y;
          const sortedTs = [...ts].sort((p, q) => p - q);
          const chain: Vertex[] = [e.a];
          for (const t of sortedTs) {
            const v = weld(e.a.x + t * dx, e.a.y + t * dy, e.kind);
            if (v.id !== chain[chain.length - 1].id) chain.push(v);
          }
          if (chain[chain.length - 1].id !== e.b.id) chain.push(e.b);
          for (let i = 0; i < chain.length - 1; i++) {
            const a = chain[i];
            const b = chain[i + 1];
            if (a.id === b.id) continue;
            if (Math.hypot(a.x - b.x, a.y - b.y) < tol.minSegmentMm) continue;
            const ek = a.id < b.id ? `${a.id}|${b.id}|${e.kind}` : `${b.id}|${a.id}|${e.kind}`;
            if (seenEdge.has(ek)) continue;
            seenEdge.add(ek);
            next2.push({ id: eId++, a, b, kind: e.kind, sourceSegIdx: e.sourceSegIdx });
          }
        }
        edges.length = 0;
        for (const e of next2) edges.push(e);
      }
    }
  }

  // 3) Loops + classificação.
  const extracted = extractLoopsDetailed(vertices, edges);
  const classified = classifyLoops(extracted.interiorLoops);
  const holeLoops = classified.filter((l) => l.isHole);

  // 4) Faces: cada loop top-level vira face, holes são seus filhos diretos.
  const childrenOf = new Map<number | null, Loop[]>();
  for (const l of classified) {
    const key = l.parentId;
    const arr = childrenOf.get(key) ?? [];
    arr.push(l);
    childrenOf.set(key, arr);
  }
  const faces = classified
    .filter((l) => l.parentId === null)
    .map((outer, idx) => {
      const children = childrenOf.get(outer.id) ?? [];
      return {
        id: idx,
        outer,
        holes: children.filter((c) => c.isHole),
      };
    });

  // 5) Edge mapping → quais sourceSegIdx pertencem EXCLUSIVAMENTE a holes.
  const edgeIdToSegIdx = new Map<number, number>();
  for (const e of edges) edgeIdToSegIdx.set(e.id, e.sourceSegIdx);
  const segUsedInNonHole = new Set<number>();
  const segUsedInHole = new Set<number>();
  for (const l of classified) {
    for (const eid of l.edgeIds) {
      const si = edgeIdToSegIdx.get(eid);
      if (si === undefined) continue;
      if (l.isHole) segUsedInHole.add(si);
      else segUsedInNonHole.add(si);
    }
  }
  const holeOnlySegIdxs = new Set<number>();
  for (const si of segUsedInHole) if (!segUsedInNonHole.has(si)) holeOnlySegIdxs.add(si);

  // === Boundary edges (Fix Bug 2) ===========================================
  // Loops descartados por orientação são contornos externos (CW). Registramos
  // seus sourceSegIdx como `boundarySegIdxs`: arestas livres da silhueta da
  // faca, que NÃO pertencem a nenhuma face interna e NÃO devem dobrar. Sem
  // este registro, o BFS de faces ficava com referências pendentes a
  // segmentos órfãos do contorno exterior.
  const boundarySegIdxs = new Set<number>();
  for (const l of extracted.droppedByOrientation) {
    for (const eid of l.edgeIds) {
      const si = edgeIdToSegIdx.get(eid);
      if (si !== undefined && !segUsedInNonHole.has(si) && !segUsedInHole.has(si)) {
        boundarySegIdxs.add(si);
      }
    }
  }

  const debug = buildKernelDebugAudit(classified, extracted.rawLoops, extracted.droppedByOrientation, faces, edgeIdToSegIdx);

  return {
    vertices,
    edges,
    loops: classified,
    faces,
    holeLoops,
    holeOnlySegIdxs,
    boundarySegIdxs,
    issues: [],
    debug,
  };
}

export type { KernelResult, Loop, Face, Vertex, Edge, EdgeKind } from "./types";
