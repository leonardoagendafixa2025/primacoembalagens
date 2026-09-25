// ============================================================================
// Stage 1 — Geometry Normalizer
// ----------------------------------------------------------------------------
// Limpa a geometria bruta importada antes que qualquer etapa estrutural
// olhe para ela. Saídas que esta etapa garante para as próximas:
//
//   - Endpoints welded: dois endpoints dentro de `weldMm` ocupam exatamente
//     a mesma coordenada (sem mais ~0.5 mm de desalinhamento).
//   - Sem micro-segmentos: nada abaixo de `minSegmentMm`.
//   - Sem duplicidades: o mesmo segmento (mesmos endpoints + mesmo kind)
//     aparece uma única vez.
//   - Colineares contíguos do mesmo kind fundidos em um só segmento longo.
//   - Gaps livres ≤ `gapBridgeMm` entre endpoints de grau 1 fechados.
//   - Apenas kinds estruturais (cut/crease/perf) — bleed/safe são descartados.
//
// Esta etapa NÃO classifica nada, NÃO infere vinco a partir de corte, NÃO
// olha para topologia. Pura limpeza de geometria.
// ============================================================================

import type { Pt, Segment } from "../dieline-types";
import { resolveCadTolerances } from "../cad/tolerances";
import type { NormalizedGeometry } from "./types";

const STRUCTURAL_KINDS = new Set<Segment["kind"]>(["cut", "crease", "perf"]);

interface Endpoint {
  x: number;
  y: number;
}

function bucketKey(x: number, y: number, tol: number) {
  return `${Math.round(x / tol)}_${Math.round(y / tol)}`;
}

function neighborBuckets(x: number, y: number, tol: number): string[] {
  const bx = Math.round(x / tol);
  const by = Math.round(y / tol);
  const out: string[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) out.push(`${bx + dx}_${by + dy}`);
  return out;
}

/** Solda endpoints colocando-os no centro do cluster. */
function buildWeldMap(segments: Segment[], tol: number): (p: Pt) => Pt {
  const reps: Endpoint[] = [];
  const buckets = new Map<string, number[]>();

  const findOrAdd = (x: number, y: number): number => {
    for (const k of neighborBuckets(x, y, tol)) {
      const arr = buckets.get(k);
      if (!arr) continue;
      for (const idx of arr) {
        const r = reps[idx];
        if (Math.hypot(r.x - x, r.y - y) <= tol) return idx;
      }
    }
    const id = reps.length;
    reps.push({ x, y });
    const bk = bucketKey(x, y, tol);
    const arr = buckets.get(bk);
    if (arr) arr.push(id);
    else buckets.set(bk, [id]);
    return id;
  };

  for (const seg of segments) {
    for (const p of seg.points) findOrAdd(p.x, p.y);
  }

  return (p: Pt) => {
    for (const k of neighborBuckets(p.x, p.y, tol)) {
      const arr = buckets.get(k);
      if (!arr) continue;
      for (const idx of arr) {
        const r = reps[idx];
        if (Math.hypot(r.x - p.x, r.y - p.y) <= tol) {
          return { x: +r.x.toFixed(3), y: +r.y.toFixed(3) };
        }
      }
    }
    return { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
  };
}

/** Dois vetores são colineares com mesma direção dentro de `tolRad`. */
function sameDirection(
  ax: number, ay: number, bx: number, by: number, tolRad: number,
): boolean {
  const al = Math.hypot(ax, ay);
  const bl = Math.hypot(bx, by);
  if (al < 1e-6 || bl < 1e-6) return false;
  const cos = (ax * bx + ay * by) / (al * bl);
  return cos > Math.cos(tolRad);
}

/** Quebra cada Segment em sub-segmentos individuais (par de pontos). */
function explode(segments: Segment[]): Array<{
  kind: Segment["kind"];
  a: Pt; b: Pt;
  source: Segment["source"];
}> {
  const out: Array<{ kind: Segment["kind"]; a: Pt; b: Pt; source: Segment["source"] }> = [];
  for (const s of segments) {
    if (!STRUCTURAL_KINDS.has(s.kind)) continue;
    const pts = s.points;
    for (let i = 0; i < pts.length - 1; i++) {
      out.push({ kind: s.kind, a: pts[i], b: pts[i + 1], source: s.source });
    }
    if (s.closed && pts.length > 2) {
      out.push({ kind: s.kind, a: pts[pts.length - 1], b: pts[0], source: s.source });
    }
  }
  return out;
}

/** Funde sub-segmentos colineares contíguos do mesmo kind. */
function mergeColinear(
  subs: Array<{ kind: Segment["kind"]; a: Pt; b: Pt; source: Segment["source"] }>,
  tolRad: number,
  weldMm: number,
): { merged: typeof subs; mergedCount: number } {
  const key = (p: Pt) => `${p.x.toFixed(3)}_${p.y.toFixed(3)}`;
  const adj = new Map<string, number[]>();
  subs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = key(p);
      const arr = adj.get(k);
      if (arr) arr.push(i);
      else adj.set(k, [i]);
    }
  });

  const used = new Array<boolean>(subs.length).fill(false);
  const merged: typeof subs = [];
  let mergedCount = 0;

  for (let i = 0; i < subs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const base = subs[i];
    let a = base.a, b = base.b;
    const kind = base.kind;

    // Estende em ambas as direções.
    for (const dir of ["fwd", "bwd"] as const) {
      let changed = true;
      while (changed) {
        changed = false;
        const tip = dir === "fwd" ? b : a;
        const dx = b.x - a.x, dy = b.y - a.y;
        const candidates = adj.get(key(tip)) ?? [];
        for (const ci of candidates) {
          if (used[ci]) continue;
          const c = subs[ci];
          if (c.kind !== kind) continue;
          // Próximo segmento deve ter ponto coincidente com a "ponta".
          const next = key(c.a) === key(tip) ? c.b : key(c.b) === key(tip) ? c.a : null;
          if (!next) continue;
          const cdx = next.x - tip.x, cdy = next.y - tip.y;
          // Mesma direção que o vetor atual (na direção que estamos crescendo).
          const baseDx = dir === "fwd" ? dx : -dx;
          const baseDy = dir === "fwd" ? dy : -dy;
          if (!sameDirection(baseDx, baseDy, cdx, cdy, tolRad)) continue;
          // Evita engolir junções em T (grau ≥ 3 no tip).
          const tipDegree = (adj.get(key(tip)) ?? []).filter((idx) => !used[idx] || idx === i).length;
          if (tipDegree > 2) continue;
          used[ci] = true;
          mergedCount++;
          if (dir === "fwd") b = next;
          else a = next;
          changed = true;
          break;
        }
      }
    }

    // Descarta degenerados pós-merge.
    if (Math.hypot(b.x - a.x, b.y - a.y) >= weldMm * 0.5) {
      merged.push({ kind, a, b, source: base.source });
    }
  }

  return { merged, mergedCount };
}

/** Tenta fechar gaps livres (endpoints de grau 1) ≤ gapBridgeMm. */
function bridgeGaps(
  subs: Array<{ kind: Segment["kind"]; a: Pt; b: Pt; source: Segment["source"] }>,
  gapMm: number,
): number {
  if (gapMm <= 0) return 0;
  const key = (p: Pt) => `${p.x.toFixed(3)}_${p.y.toFixed(3)}`;
  const degree = new Map<string, number>();
  const endpoints: Array<{ p: Pt; kind: Segment["kind"]; segIdx: number }> = [];
  subs.forEach((s, i) => {
    for (const p of [s.a, s.b]) {
      const k = key(p);
      degree.set(k, (degree.get(k) ?? 0) + 1);
      endpoints.push({ p, kind: s.kind, segIdx: i });
    }
  });

  const open = endpoints.filter((e) => (degree.get(key(e.p)) ?? 0) === 1);
  let bridged = 0;
  const used = new Set<string>();
  for (let i = 0; i < open.length; i++) {
    const oi = open[i];
    const ki = key(oi.p) + "|" + oi.segIdx;
    if (used.has(ki)) continue;
    let bestJ = -1;
    let bestDist = gapMm;
    for (let j = i + 1; j < open.length; j++) {
      const oj = open[j];
      if (oj.kind !== oi.kind) continue;
      if (oj.segIdx === oi.segIdx) continue;
      const kj = key(oj.p) + "|" + oj.segIdx;
      if (used.has(kj)) continue;
      const d = Math.hypot(oj.p.x - oi.p.x, oj.p.y - oi.p.y);
      if (d > 0 && d <= bestDist) {
        bestDist = d;
        bestJ = j;
      }
    }
    if (bestJ >= 0) {
      const oj = open[bestJ];
      subs.push({ kind: oi.kind, a: oi.p, b: oj.p, source: undefined });
      used.add(ki);
      used.add(key(oj.p) + "|" + oj.segIdx);
      bridged++;
    }
  }
  return bridged;
}

/** T-junction snap: endpoints livres (grau 1) que estão a ≤ tolMm do
 *  INTERIOR de outro segmento são puxados para a projeção, e o segmento
 *  alvo é dividido naquele ponto (vira dois sub-segmentos). Resolve o caso
 *  comum em PDF onde um vinco "encosta" num corte sem coincidência exata
 *  de vértice. Roda DEPOIS do bridge (que só une endpoint↔endpoint) e
 *  ANTES do merge colinear (para que o merge enxergue a nova vértice). */
function snapTJunctions(
  subs: Array<{ kind: Segment["kind"]; a: Pt; b: Pt; source: Segment["source"] }>,
  tolMm: number,
): number {
  if (tolMm <= 0) return 0;
  const key = (p: Pt) => `${p.x.toFixed(3)}_${p.y.toFixed(3)}`;

  const degree = new Map<string, number>();
  for (const s of subs) {
    for (const p of [s.a, s.b]) degree.set(key(p), (degree.get(key(p)) ?? 0) + 1);
  }

  type Open = { p: Pt; segIdx: number; which: "a" | "b" };
  const open: Open[] = [];
  subs.forEach((s, i) => {
    if ((degree.get(key(s.a)) ?? 0) === 1) open.push({ p: s.a, segIdx: i, which: "a" });
    if ((degree.get(key(s.b)) ?? 0) === 1) open.push({ p: s.b, segIdx: i, which: "b" });
  });
  if (open.length === 0) return 0;

  let splits = 0;
  const tolSq = tolMm * tolMm;
  const baseCount = subs.length;

  for (const o of open) {
    let best: { tIdx: number; px: number; py: number; d2: number } | null = null;
    for (let j = 0; j < baseCount; j++) {
      if (j === o.segIdx) continue;
      const t = subs[j];
      // Mesmo kind, ou crease/perf encostando em cut (caso clássico em PDF).
      const sameKind = t.kind === subs[o.segIdx].kind;
      const creaseOnCut = t.kind === "cut" && subs[o.segIdx].kind !== "cut";
      if (!sameKind && !creaseOnCut) continue;
      const dx = t.b.x - t.a.x, dy = t.b.y - t.a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-9) continue;
      const u = ((o.p.x - t.a.x) * dx + (o.p.y - t.a.y) * dy) / len2;
      const minU = 0.02, maxU = 0.98;
      if (u <= minU || u >= maxU) continue;
      const px = t.a.x + u * dx, py = t.a.y + u * dy;
      const d2 = (px - o.p.x) ** 2 + (py - o.p.y) ** 2;
      if (d2 > tolSq) continue;
      if (!best || d2 < best.d2) best = { tIdx: j, px, py, d2 };
    }
    if (!best) continue;
    const proj: Pt = { x: +best.px.toFixed(3), y: +best.py.toFixed(3) };

    const owner = subs[o.segIdx];
    if (o.which === "a") owner.a = proj;
    else owner.b = proj;

    const t = subs[best.tIdx];
    const left = { kind: t.kind, a: t.a, b: proj, source: t.source };
    const right = { kind: t.kind, a: proj, b: t.b, source: t.source };
    subs[best.tIdx] = left;
    subs.push(right);
    splits++;
  }
  return splits;
}

export interface NormalizerOptions {
  weldMm?: number;
  minSegmentMm?: number;
  gapBridgeMm?: number;
  parallelTolRad?: number;
  perpendicularTolMm?: number;
}

export function normalizeGeometry(
  rawSegments: Segment[],
  opts: NormalizerOptions = {},
): NormalizedGeometry {
  const tol = resolveCadTolerances();
  const weldMm = opts.weldMm ?? tol.snapMm;
  const minSegmentMm = opts.minSegmentMm ?? tol.minSegmentMm;
  const gapBridgeMm = opts.gapBridgeMm ?? tol.gapBridgeMm;
  const parallelTolRad = opts.parallelTolRad ?? tol.angleRad;
  const perpendicularTolMm = opts.perpendicularTolMm ?? 0.5;

  const inputCount = rawSegments.length;

  // 1) Weld de endpoints.
  const weld = buildWeldMap(rawSegments, weldMm);
  let snappedPoints = 0;

  // 2) Explode em pares (a,b) já com endpoints welded.
  const exploded = explode(rawSegments).map((s) => {
    const a = weld(s.a);
    const b = weld(s.b);
    if (Math.hypot(a.x - s.a.x, a.y - s.a.y) > 1e-6) snappedPoints++;
    if (Math.hypot(b.x - s.b.x, b.y - s.b.y) > 1e-6) snappedPoints++;
    return { ...s, a, b };
  });

  // 3) Drop micro + drop degenerados + dedupe.
  let droppedMicro = 0;
  const seen = new Set<string>();
  const filtered: typeof exploded = [];
  for (const s of exploded) {
    const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (len < minSegmentMm) {
      droppedMicro++;
      continue;
    }
    const ka = `${s.a.x.toFixed(3)}_${s.a.y.toFixed(3)}`;
    const kb = `${s.b.x.toFixed(3)}_${s.b.y.toFixed(3)}`;
    const k = ka < kb ? `${ka}|${kb}|${s.kind}` : `${kb}|${ka}|${s.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    filtered.push(s);
  }

  // 4) Bridge gaps livres (endpoint↔endpoint).
  const bridgedGaps = bridgeGaps(filtered, gapBridgeMm);

  // 4b) T-junctions: endpoint solto que cai no interior de outro segmento.
  const tJunctions = snapTJunctions(filtered, perpendicularTolMm);

  // 5) Mescla colineares contíguos do mesmo kind.
  const { merged, mergedCount } = mergeColinear(filtered, parallelTolRad, weldMm);

  // 6) Reconstrói Segment[] (cada um virou um par de pontos).
  const outSegments: Segment[] = merged.map((s) => ({
    kind: s.kind,
    points: [s.a, s.b],
    source: s.source,
  }));

  return {
    segments: outSegments,
    tolerances: { weldMm, minSegmentMm, gapBridgeMm, parallelTolRad, perpendicularTolMm },
    stats: {
      inputSegments: inputCount,
      outputSegments: outSegments.length,
      snappedPoints,
      mergedColinear: mergedCount,
      droppedMicro,
      bridgedGaps: bridgedGaps + tJunctions,
      splitIntersections: tJunctions,
      healedOvershoots: 0,
      unresolvedTopologyWarnings: 0,
    },
    logs: ([
      { stage: "snap", message: "endpoints welded to canonical coordinates", count: snappedPoints },
      { stage: "drop-micro", message: "degenerate or micro segments removed", count: droppedMicro },
      { stage: "bridge-gap", message: "free endpoint gaps bridged", count: bridgedGaps },
      { stage: "t-junction", message: "crease/perf endpoints snapped onto cut interiors", count: tJunctions },
      { stage: "merge-colinear", message: "compatible colinear fragments merged", count: mergedCount },
    ] as NormalizedGeometry["logs"]).filter((log) => log.count > 0),
  };
}
