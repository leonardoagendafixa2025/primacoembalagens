// ============================================================================
// buildRoleAwareSpanningTree — spanning tree ROLE-AWARE.
// ----------------------------------------------------------------------------
// BFS determinístico a partir do root, priorizando hinges na ordem:
//   body-body > body-seam > body-flap > flap-flap > aux
// e, dentro da mesma categoria, hinges mais longas primeiro (tie-break por
// axisId para determinismo total).
//
// Produz parentOf + topoOrder no formato esperado pelo solver atual, mais a
// classificação tree/support/closure.
// ============================================================================

import type { ValidHinge } from "../pipeline/hinge-sanitizer";
import type { Hinge3DRole } from "./types";

const ROLE_PRIORITY: Record<Hinge3DRole, number> = {
  "body-body": 0,
  "body-seam": 1,
  "body-flap": 2,
  "flap-flap": 3,
  aux: 4,
};

export function roleOfHinge(
  panelA: string,
  panelB: string,
  bodyIds: Set<string>,
  seamIds: Set<string>,
  flapIds: Set<string>,
): Hinge3DRole {
  const aBody = bodyIds.has(panelA);
  const bBody = bodyIds.has(panelB);
  const aSeam = seamIds.has(panelA);
  const bSeam = seamIds.has(panelB);
  const aFlap = flapIds.has(panelA);
  const bFlap = flapIds.has(panelB);
  if (aBody && bBody) return "body-body";
  if ((aBody && bSeam) || (bBody && aSeam)) return "body-seam";
  if ((aBody && bFlap) || (bBody && aFlap)) return "body-flap";
  if (aFlap && bFlap) return "flap-flap";
  return "aux";
}

export interface AnnotatedHinge {
  hinge: ValidHinge;
  role: Hinge3DRole;
  score: number;
  isTreeEdge: boolean;
  isSupportEdge: boolean;
  isClosureEdge: boolean;
}

export interface FoldTreeResult {
  rootPanelId: string;
  parentOf: Record<string, string>;
  children: Record<string, string[]>;
  topoOrder: string[];
  annotated: AnnotatedHinge[];
  visited: Set<string>;
}

function scoreOf(h: ValidHinge, role: Hinge3DRole): number {
  // Maior = mais prioritário. Negativa a prioridade do role.
  return -ROLE_PRIORITY[role] * 1e6 + h.length;
}

export function buildRoleAwareSpanningTree(
  rootPanelId: string,
  hinges: ValidHinge[],
  bodyIds: Set<string>,
  seamIds: Set<string>,
  flapIds: Set<string>,
): FoldTreeResult {
  // Anota cada hinge com role + score (sem decidir tree ainda).
  const annotated: AnnotatedHinge[] = hinges.map((h) => {
    const role = roleOfHinge(h.panelA, h.panelB, bodyIds, seamIds, flapIds);
    return {
      hinge: h,
      role,
      score: scoreOf(h, role),
      isTreeEdge: false,
      isSupportEdge: false,
      isClosureEdge: false,
    };
  });

  const adj = new Map<string, AnnotatedHinge[]>();
  for (const a of annotated) {
    if (!adj.has(a.hinge.panelA)) adj.set(a.hinge.panelA, []);
    if (!adj.has(a.hinge.panelB)) adj.set(a.hinge.panelB, []);
    adj.get(a.hinge.panelA)!.push(a);
    adj.get(a.hinge.panelB)!.push(a);
  }
  // Ordena adjacências por score desc, tie-break axisId.
  for (const list of adj.values()) {
    list.sort((x, y) => {
      const ds = y.score - x.score;
      if (Math.abs(ds) > 1e-9) return ds;
      return x.hinge.axisId.localeCompare(y.hinge.axisId);
    });
  }

  const visited = new Set<string>();
  const parentOf: Record<string, string> = {};
  const children: Record<string, string[]> = {};
  const topoOrder: string[] = [];

  if (rootPanelId) {
    visited.add(rootPanelId);
    topoOrder.push(rootPanelId);
    children[rootPanelId] = [];
    // BFS ordenado por prioridade global. Para garantir que body-body seja
    // sempre escolhido antes de body-flap mesmo entre frentes diferentes,
    // usamos uma "fila de prioridade" simples re-ordenada a cada extração.
    const frontier: { panel: string; depth: number }[] = [{ panel: rootPanelId, depth: 0 }];
    while (frontier.length > 0) {
      frontier.sort((a, b) => a.depth - b.depth);
      const cur = frontier.shift()!;
      const neighbors = adj.get(cur.panel) ?? [];
      for (const ah of neighbors) {
        const other = ah.hinge.panelA === cur.panel ? ah.hinge.panelB : ah.hinge.panelA;
        if (visited.has(other)) continue;
        visited.add(other);
        topoOrder.push(other);
        parentOf[other] = cur.panel;
        if (!children[cur.panel]) children[cur.panel] = [];
        children[cur.panel].push(other);
        children[other] = [];
        ah.isTreeEdge = true;
        frontier.push({ panel: other, depth: cur.depth + 1 });
      }
    }
  }

  // Marca arestas não-tree como support ou closure.
  // - closure: ambos endpoints são body (cycle no backbone) → relevante p/ fechamento.
  // - support: demais cycles entre painéis visitados.
  for (const a of annotated) {
    if (a.isTreeEdge) continue;
    if (!visited.has(a.hinge.panelA) || !visited.has(a.hinge.panelB)) continue;
    const aBody = bodyIds.has(a.hinge.panelA);
    const bBody = bodyIds.has(a.hinge.panelB);
    if (aBody && bBody) {
      a.isClosureEdge = true;
    } else if (a.role === "body-seam" || (aBody !== bBody && a.role === "body-flap")) {
      // Hinges que fecham aba ao corpo são potencialmente de fechamento.
      a.isClosureEdge = true;
    } else {
      a.isSupportEdge = true;
    }
  }

  return { rootPanelId, parentOf, children, topoOrder, annotated, visited };
}
