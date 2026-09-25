// Descoberta de faces planares a partir de segmentos de corte/vinco.
//
// A construção do grafo (weld + T-split + gap-bridge) foi extraída para
// cad/topology-builder.ts. Aqui ficamos só com a caminhada always-left-turn
// e a remoção da face externa.

import type { Pt } from "./dieline-types";
import { buildPlanarGraph, type InputSeg } from "./cad/topology-builder";
import { type CadIssues, type CadToleranceOverrides, emptyIssues } from "./cad/tolerances";

const nodeKey = (p: Pt) => `${p.x.toFixed(3)}_${p.y.toFixed(3)}`;

function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}

/** Relatório do último import (gaps fechados, loops abertos, faces encontradas). */
let lastIssues: CadIssues = emptyIssues();
export function getLastCadIssues(): CadIssues {
  return lastIssues;
}

export function buildPanelsFromSegments(segments: InputSeg[], tolOverrides?: CadToleranceOverrides): Pt[][] {
  const graph = buildPlanarGraph(segments, undefined, tolOverrides);
  lastIssues = { ...graph.issues };

  if (!graph.edges.length) return [];

  // Adjacência ordenada CCW por ângulo.
  type NB = { other: Pt; angle: number };
  const adj = new Map<string, NB[]>();
  for (const [a, b] of graph.edges) {
    if (a === b) continue;
    const ka = nodeKey(a), kb = nodeKey(b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka)!.push({ other: b, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    adj.get(kb)!.push({ other: a, angle: Math.atan2(a.y - b.y, a.x - b.x) });
  }
  for (const list of adj.values()) list.sort((x, y) => x.angle - y.angle);

  // === Leaf-pruning global =====================================================
  // Vértices com grau <= 1 são "esporas" (vincos/cortes técnicos terminando
  // no meio de uma face). Removê-los da adjacência usada para enumerar faces
  // evita que o traversal "always-left-turn" gere contornos degenerados
  // (vai-e-volta) que poluem painéis estruturais. A geometria do segmento
  // permanece intacta para renderização.
  {
    const queue: string[] = [];
    for (const [k, list] of adj) if (list.length <= 1) queue.push(k);
    while (queue.length) {
      const k = queue.shift()!;
      const list = adj.get(k);
      if (!list || list.length === 0) continue;
      for (const nb of list) {
        const kOther = nodeKey(nb.other);
        const otherList = adj.get(kOther);
        if (!otherList) continue;
        const filtered = otherList.filter((x) => nodeKey(x.other) !== k);
        adj.set(kOther, filtered);
        if (filtered.length <= 1) queue.push(kOther);
      }
      adj.set(k, []);
    }
  }

  const faces: Pt[][] = [];
  const visitedDir = new Set<string>();
  const dirKey = (u: Pt, v: Pt) => `${nodeKey(u)}>${nodeKey(v)}`;

  for (const [ka, neighbors] of adj.entries()) {
    const startU = graph.nodes.get(ka)!;
    for (const n0 of neighbors) {
      if (visitedDir.has(dirKey(startU, n0.other))) continue;
      const face: Pt[] = [];
      let u = startU, v = n0.other;
      let safety = 0, ok = true;
      while (safety++ < 5000) {
        const dk = dirKey(u, v);
        if (visitedDir.has(dk)) { ok = false; break; }
        visitedDir.add(dk);
        face.push(u);
        const nb = adj.get(nodeKey(v));
        if (!nb || !nb.length) { ok = false; break; }
        const back = Math.atan2(u.y - v.y, u.x - v.x);
        let idx = -1;
        for (let i = 0; i < nb.length; i++) {
          if (nb[i].other === u && Math.abs(nb[i].angle - back) < 1e-4) { idx = i; break; }
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
        const nu = v, nv = next.other;
        if (nodeKey(nu) === nodeKey(startU) && nodeKey(nv) === nodeKey(n0.other)) break;
        u = nu; v = nv;
      }
      if (ok && face.length >= 3) faces.push(face);
    }
  }

  const interior = faces.filter((f) => signedArea(f) > 1);

  if (interior.length >= 2) {
    interior.sort((a, b) => signedArea(b) - signedArea(a));
    const big = signedArea(interior[0]);
    const rest = interior.slice(1).reduce((s, f) => s + signedArea(f), 0);
    if (big > rest * 0.95) interior.shift();
  }

  lastIssues.facesFound = interior.length;
  return interior;
}
