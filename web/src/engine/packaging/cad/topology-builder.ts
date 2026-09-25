// Constrói o grafo planar (nós + arestas) a partir de segmentos estruturais,
// com gap-bridging entre endpoints livres. Equivalente à fase de "node welding"
// do Prinect Package Designer.
//
// Devolve as arestas finais e um relatório de issues para debug/UI.

import type { Pt } from "../dieline-types";
import { CAD_TOL, resolveCadTolerances, type CadIssues, type CadToleranceOverrides, emptyIssues } from "./tolerances";

export interface InputSeg {
  kind: string;
  points: Pt[];
  closed?: boolean;
}

type StructuralKind = "cut" | "crease" | "perf" | "unknown";

interface RawEdge {
  a: Pt;
  b: Pt;
  kind: StructuralKind;
  sourceIdx: number;
  sourcePairIdx: number;
}

interface WorkingEdge {
  a: Pt;
  b: Pt;
  kind: StructuralKind;
  sourceIdx?: number;
  sourcePairIdx?: number;
}

export interface PlanarGraph {
  /** Cada aresta é um par de nós CANÔNICOS (objetos compartilhados). */
  edges: Array<[Pt, Pt]>;
  /** Mapa key→nó canônico. */
  nodes: Map<string, Pt>;
  issues: CadIssues;
}

const EPS = 1e-7;

const nodeKey = (p: Pt) => `${p.x.toFixed(3)}_${p.y.toFixed(3)}`;
const logPt = (p: Pt) => [Number(p.x.toFixed(3)), Number(p.y.toFixed(3))] as [number, number];

function sharesAnyKind(a: Set<StructuralKind> | undefined, b: Set<StructuralKind> | undefined) {
  if (!a || !b) return false;
  for (const kind of a) if (b.has(kind)) return true;
  return false;
}

function sharedKind(a: Set<StructuralKind> | undefined, b: Set<StructuralKind> | undefined): StructuralKind | null {
  if (!a || !b) return null;
  for (const kind of a) if (b.has(kind)) return kind;
  return null;
}

function bucketKeyFor(p: Pt, tol: number) {
  return `${Math.round(p.x / tol)}_${Math.round(p.y / tol)}`;
}

function neighborBucketKeys(p: Pt, tol: number) {
  const bx = Math.round(p.x / tol);
  const by = Math.round(p.y / tol);
  const out: string[] = [];
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) out.push(`${bx + ox}_${by + oy}`);
  return out;
}

function projectOnSeg(p: Pt, a: Pt, b: Pt, tol: number): { t: number } | null {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < EPS) return null;
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  if (t < EPS || t > 1 - EPS) return null;
  const proj = { x: a.x + abx * t, y: a.y + aby * t };
  if (Math.hypot(proj.x - p.x, proj.y - p.y) > tol) return null;
  return { t };
}

export function buildPlanarGraph(
  segments: InputSeg[],
  kindsAccepted: ReadonlySet<string> = new Set(["cut", "crease", "perf"]),
  tolOverrides?: CadToleranceOverrides,
): PlanarGraph {
  const tol = resolveCadTolerances(tolOverrides);
  const TOL = tol.snapMm;
  const CROSS_KIND_TOL = Math.min(tol.crossKindSnapMm ?? 0.1, TOL);
  const issues = emptyIssues();

  // 1) coleta segmentos retos (par de endpoints).
  const rawEdges: RawEdge[] = [];
  for (let sourceIdx = 0; sourceIdx < segments.length; sourceIdx++) {
    const s = segments[sourceIdx];
    if (!kindsAccepted.has(s.kind)) continue;
    const kind = (s.kind === "cut" || s.kind === "crease" || s.kind === "perf" ? s.kind : "unknown") as StructuralKind;
    const pts = s.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.hypot(a.x - b.x, a.y - b.y) >= tol.minSegmentMm) rawEdges.push({ a, b, kind, sourceIdx, sourcePairIdx: i });
    }
    if (s.closed && pts.length > 2) {
      const a = pts[pts.length - 1], b = pts[0];
      if (Math.hypot(a.x - b.x, a.y - b.y) >= tol.minSegmentMm) rawEdges.push({ a, b, kind, sourceIdx, sourcePairIdx: pts.length - 1 });
    }
  }

  // 2) weld de nós via bucket espacial.
  const nodes = new Map<string, Pt>();
  const buckets = new Map<string, Pt[]>();
  const nodeKinds = new Map<string, Set<StructuralKind>>();
  const weld = (p: Pt, kind: StructuralKind): Pt => {
    for (const k of neighborBucketKeys(p, TOL)) {
      const arr = buckets.get(k);
      if (!arr) continue;
      for (const e of arr) {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist > TOL) continue;
        const existingKinds = nodeKinds.get(nodeKey(e)) ?? new Set<StructuralKind>();
        const sameKind = existingKinds.has(kind);
        if (sameKind || dist <= CROSS_KIND_TOL) {
          existingKinds.add(kind);
          nodeKinds.set(nodeKey(e), existingKinds);
          return e;
        }
      }
    }
    const node: Pt = { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
    nodes.set(nodeKey(node), node);
    nodeKinds.set(nodeKey(node), new Set([kind]));
    const bk = bucketKeyFor(node, TOL);
    const arr = buckets.get(bk);
    if (arr) arr.push(node); else buckets.set(bk, [node]);
    return node;
  };

  let edges: WorkingEdge[] = rawEdges.map(({ a, b, kind, sourceIdx, sourcePairIdx }) => ({
    a: weld(a, kind),
    b: weld(b, kind),
    kind,
    sourceIdx,
    sourcePairIdx,
  }));

  // 3) split em T-junctions (até estabilizar).
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    const next: WorkingEdge[] = [];
    const allNodes = Array.from(nodes.values());
    for (const { a, b, kind, sourceIdx, sourcePairIdx } of edges) {
      const splits: Array<{ t: number; node: Pt }> = [];
      const minX = Math.min(a.x, b.x) - TOL, maxX = Math.max(a.x, b.x) + TOL;
      const minY = Math.min(a.y, b.y) - TOL, maxY = Math.max(a.y, b.y) + TOL;
      for (const n of allNodes) {
        if (n === a || n === b) continue;
        if (n.x < minX || n.x > maxX || n.y < minY || n.y > maxY) continue;
        const distToSeg = (() => {
          const abx = b.x - a.x, aby = b.y - a.y;
          const lenSq = abx * abx + aby * aby;
          if (lenSq < EPS) return Infinity;
          const t = Math.max(0, Math.min(1, ((n.x - a.x) * abx + (n.y - a.y) * aby) / lenSq));
          const px = a.x + abx * t, py = a.y + aby * t;
          return Math.hypot(px - n.x, py - n.y);
        })();
        const nodeKindSet = nodeKinds.get(nodeKey(n));
        const sharesKind = nodeKindSet?.has(kind) ?? false;
        if (!sharesKind && distToSeg > CROSS_KIND_TOL) continue;
        const hit = projectOnSeg(n, a, b, TOL);
        if (hit) splits.push({ t: hit.t, node: n });
      }
      if (!splits.length) { next.push({ a, b, kind, sourceIdx, sourcePairIdx }); continue; }
      splits.sort((x, y) => x.t - y.t);
      const uniq: typeof splits = [];
      for (const s of splits) if (!uniq.length || uniq[uniq.length - 1].node !== s.node) uniq.push(s);
      let prev = a;
      for (const s of uniq) { next.push({ a: prev, b: s.node, kind, sourceIdx, sourcePairIdx }); prev = s.node; }
      next.push({ a: prev, b, kind, sourceIdx, sourcePairIdx });
      changed = true;
    }
    edges = next;
    if (!changed) break;
  }

  try {
    const rawByKey = new Map<string, RawEdge>();
    for (const raw of rawEdges) rawByKey.set(`${raw.sourceIdx}:${raw.sourcePairIdx}`, raw);
    const fragmentsByKey = new Map<string, WorkingEdge[]>();
    for (const edge of edges) {
      if (edge.sourceIdx === undefined || edge.sourcePairIdx === undefined) continue;
      const key = `${edge.sourceIdx}:${edge.sourcePairIdx}`;
      const list = fragmentsByKey.get(key);
      if (list) list.push(edge); else fragmentsByKey.set(key, [edge]);
    }
    const reports = Array.from(fragmentsByKey.entries()).flatMap(([key, fragments]) => {
      if (fragments.length <= 1) return [];
      const raw = rawByKey.get(key);
      if (!raw) return [];
      return [{
        sourceSegmentIndex: raw.sourceIdx,
        sourcePairIndex: raw.sourcePairIdx,
        kind: raw.kind,
        originalEdge: { a: logPt(raw.a), b: logPt(raw.b) },
        fragments: fragments.map((fragment) => ({
          a: logPt(fragment.a),
          b: logPt(fragment.b),
          kind: fragment.kind,
          length: +Math.hypot(fragment.b.x - fragment.a.x, fragment.b.y - fragment.a.y).toFixed(3),
        })),
      }];
    });
    if (reports.length && typeof globalThis !== "undefined" && (globalThis as { __PACKAGING_CAD_DEBUG__?: boolean }).__PACKAGING_CAD_DEBUG__) {
      console.log("[INTERSECTION FRAGMENTS]", reports);
    }
  } catch (err) {
    console.warn("[INTERSECTION FRAGMENTS] failed", err);
  }

  // 4) dedup de arestas.
  const seen = new Set<string>();
  const dedup: WorkingEdge[] = [];
  for (const { a, b, kind, sourceIdx, sourcePairIdx } of edges) {
    if (a === b) continue;
    const ka = nodeKey(a), kb = nodeKey(b);
    const ek = ka < kb ? `${ka}|${kb}|${kind}` : `${kb}|${ka}|${kind}`;
    if (seen.has(ek)) continue;
    seen.add(ek);
      dedup.push({ a, b, kind, sourceIdx, sourcePairIdx });
  }
  edges = dedup;

  // 4.5) Crease-leaf rescue.
  // Em facas reais o desenhista costuma alinhar vincos e cortes "no olho":
  // a borda do painel tem corte em x=90.5 enquanto o vinco interno termina em
  // x=90 (off-set de ~0.5 mm). Esses endpoints ficam fora do cross-kind weld
  // (0.1 mm) e fora do T-split (mesma 0.1 mm para kinds diferentes), então o
  // vinco vira folha (grau 1), o leaf-pruning de planar-faces o descarta e o
  // contorno da face acaba sendo desenhado direto entre os dois cantos do
  // corte — gerando uma aresta diagonal sintética no lugar do vinco vertical.
  //
  // Correção: NÃO mover o endpoint original do vinco. Em vez disso, criamos
  // apenas uma conexão topológica local entre a folha de crease/perf e a aresta
  // de cut mais próxima, dividindo a aresta de cut no ponto projetado. Isso
  // preserva a geometria original do vinco e evita a diagonal longa causada por
  // arrastar um de seus endpoints até o cut.
  {
    const recomputeDegree = () => {
      const d = new Map<string, number>();
      for (const { a, b } of edges) {
        d.set(nodeKey(a), (d.get(nodeKey(a)) ?? 0) + 1);
        d.set(nodeKey(b), (d.get(nodeKey(b)) ?? 0) + 1);
      }
      return d;
    };
    const dedupeEdges = (input: WorkingEdge[]) => {
      const out: WorkingEdge[] = [];
      const seenLocal = new Set<string>();
      for (const { a, b, kind } of input) {
        if (a === b) continue;
        const ka = nodeKey(a), kb = nodeKey(b);
        const ek = ka < kb ? `${ka}|${kb}|${kind}` : `${kb}|${ka}|${kind}`;
        if (seenLocal.has(ek)) continue;
        seenLocal.add(ek);
        out.push({ a, b, kind });
      }
      seen.clear();
      for (const { a, b, kind } of out) {
        const ka = nodeKey(a), kb = nodeKey(b);
        seen.add(ka < kb ? `${ka}|${kb}|${kind}` : `${kb}|${ka}|${kind}`);
      }
      return out;
    };

    const leafKindOf = (n: Pt): StructuralKind | null => {
      const ks = nodeKinds.get(nodeKey(n));
      if (!ks || ks.has("cut")) return null;
      if (ks.has("crease")) return "crease";
      if (ks.has("perf")) return "perf";
      return null;
    };

    const ensureNode = (p: Pt, kinds: StructuralKind[]): Pt => {
      const node: Pt = { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
      const key = nodeKey(node);
      const existing = nodes.get(key);
      const kindSet = existing ? (nodeKinds.get(key) ?? new Set<StructuralKind>()) : new Set<StructuralKind>();
      for (const kind of kinds) kindSet.add(kind);
      nodeKinds.set(key, kindSet);
      if (existing) return existing;
      nodes.set(key, node);
      return node;
    };

    let deg = recomputeDegree();

    const RESCUE_TOL = TOL; // snapMm (~0.5 mm em modo preserve-geometry)

    // Loop com poucas iterações: cada rescue pode introduzir novos splits que
    // criam novas folhas; estabilizamos rápido.
    for (let pass = 0; pass < 3; pass++) {
      let rescued = 0;
      const leaves: Array<{ node: Pt; kind: StructuralKind }> = [];
      for (const [, n] of nodes.entries()) {
        const kind = leafKindOf(n);
        if ((deg.get(nodeKey(n)) ?? 0) === 1 && kind) leaves.push({ node: n, kind });
      }
      if (!leaves.length) break;

      const splitsByEdgeIdx = new Map<number, Array<{ t: number; node: Pt }>>();
      const bridgeEdges: WorkingEdge[] = [];

      for (const leaf of leaves) {
        let best: { edgeIdx: number; t: number; dist: number; point: Pt } | null = null;
        for (let ei = 0; ei < edges.length; ei++) {
          const { a, b, kind } = edges[ei];
          if (kind !== "cut") continue;
          if (leaf.node === a || leaf.node === b) continue;
          const abx = b.x - a.x, aby = b.y - a.y;
          const lenSq = abx * abx + aby * aby;
          if (lenSq < EPS) continue;
          const t = ((leaf.node.x - a.x) * abx + (leaf.node.y - a.y) * aby) / lenSq;
          if (t < 0.001 || t > 0.999) continue;
          const px = a.x + abx * t, py = a.y + aby * t;
          const dist = Math.hypot(px - leaf.node.x, py - leaf.node.y);
          if (dist > RESCUE_TOL) continue;
          if (!best || dist < best.dist) best = { edgeIdx: ei, t, dist, point: { x: px, y: py } };
        }

        if (!best) continue;
        const bridgeNode = ensureNode(best.point, ["cut", leaf.kind]);
        const arr = splitsByEdgeIdx.get(best.edgeIdx) ?? [];
        arr.push({ t: best.t, node: bridgeNode });
        splitsByEdgeIdx.set(best.edgeIdx, arr);
        if (bridgeNode !== leaf.node) {
          bridgeEdges.push({ a: leaf.node, b: bridgeNode, kind: leaf.kind });
        }
        rescued++;
      }

      if (!rescued) break;

      const next: WorkingEdge[] = [];
      for (let ei = 0; ei < edges.length; ei++) {
        const e = edges[ei];
        const splits = splitsByEdgeIdx.get(ei);
        if (!splits || !splits.length) { next.push(e); continue; }
        splits.sort((x, y) => x.t - y.t);
        let prev = e.a;
        for (const s of splits) {
          if (s.node === prev) continue;
          next.push({ a: prev, b: s.node, kind: e.kind, sourceIdx: e.sourceIdx, sourcePairIdx: e.sourcePairIdx });
          prev = s.node;
        }
        if (prev !== e.b) next.push({ a: prev, b: e.b, kind: e.kind, sourceIdx: e.sourceIdx, sourcePairIdx: e.sourcePairIdx });
      }
      edges = dedupeEdges([...next, ...bridgeEdges]);
      deg = recomputeDegree();
    }
  }

  // 5) gap-bridging: nós de grau 1 que estão a até gapBridgeMm entre si viram
  //    aresta sintética (fecha gaps deixados pelo desenhador no Illustrator).
  //    REGRA GLOBAL: nunca conectar um endpoint de cut a um endpoint de crease
  //    só por proximidade; o bridge só vale quando ambos compartilham ao menos
  //    um mesmo kind estrutural.
  const degree = new Map<string, number>();
  for (const { a, b } of edges) {
    degree.set(nodeKey(a), (degree.get(nodeKey(a)) ?? 0) + 1);
    degree.set(nodeKey(b), (degree.get(nodeKey(b)) ?? 0) + 1);
  }
  let openEndpoints: Pt[] = [];
  for (const [k, n] of nodes.entries()) {
    if ((degree.get(k) ?? 0) === 1) openEndpoints.push(n);
  }

  if (openEndpoints.length >= 2) {
    const GAP = tol.gapBridgeMm;
    const used = new Set<string>();
    // ordem: junta sempre o par mais próximo primeiro.
    const pairs: Array<{ a: Pt; b: Pt; d: number }> = [];
    for (let i = 0; i < openEndpoints.length; i++) {
      for (let j = i + 1; j < openEndpoints.length; j++) {
        const a = openEndpoints[i], b = openEndpoints[j];
        if (!sharesAnyKind(nodeKinds.get(nodeKey(a)), nodeKinds.get(nodeKey(b)))) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > EPS && d <= GAP) pairs.push({ a, b, d });
      }
    }
    pairs.sort((x, y) => x.d - y.d);
    for (const { a, b } of pairs) {
      const ka = nodeKey(a), kb = nodeKey(b);
      if (used.has(ka) || used.has(kb)) continue;
      const kind = sharedKind(nodeKinds.get(ka), nodeKinds.get(kb)) ?? "unknown";
      const ek = ka < kb ? `${ka}|${kb}|${kind}` : `${kb}|${ka}|${kind}`;
      if (seen.has(ek)) continue;
      seen.add(ek);
      edges.push({ a, b, kind });
      used.add(ka); used.add(kb);
      issues.bridgedGaps++;
      degree.set(ka, (degree.get(ka) ?? 0) + 1);
      degree.set(kb, (degree.get(kb) ?? 0) + 1);
    }
  }

  // 5.5) Colapsa duplicatas geométricas coincidentes no grafo planar final.
  //
  // Um mesmo trecho pode existir simultaneamente como CUT e CREASE no input
  // (ex.: eixo de dobra interrompido por micro-recortes / travas). Após o
  // T-split, isso gera múltiplas arestas com os MESMOS nós canônicos, uma por
  // kind. Para a reconstrução planar essas duplicatas não são duas geometrias
  // distintas — são a mesma semi-aresta topológica com múltiplos significados.
  //
  // Se devolvemos as duas cópias para o face-walker, a adjacência ganha
  // vizinhos duplicados no mesmo ângulo e o contorno passa a "escolher"
  // fragmentos CUT sobre o eixo do CREASE, produzindo exatamente os micro-
  // cortes vermelhos vistos no meio do vinco. Aqui colapsamos SOMENTE
  // duplicatas exatas (mesmo par de nós após snap/split); a geometria original
  // do dieline permanece intacta em `segments`.
  const geometryEdges: WorkingEdge[] = [];
  {
    const seenGeometry = new Set<string>();
    for (const edge of edges) {
      const ka = nodeKey(edge.a), kb = nodeKey(edge.b);
      const ek = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seenGeometry.has(ek)) continue;
      seenGeometry.add(ek);
      geometryEdges.push(edge);
    }
  }

  // recontagem final de endpoints abertos
  const finalDegree = new Map<string, number>();
  for (const { a, b } of geometryEdges) {
    finalDegree.set(nodeKey(a), (finalDegree.get(nodeKey(a)) ?? 0) + 1);
    finalDegree.set(nodeKey(b), (finalDegree.get(nodeKey(b)) ?? 0) + 1);
  }
  openEndpoints = [];
  for (const [k, n] of nodes.entries()) if ((finalDegree.get(k) ?? 0) === 1) openEndpoints.push(n);
  issues.openEndpoints = openEndpoints.length;

  return { edges: geometryEdges.map(({ a, b }) => [a, b]), nodes, issues };
}
