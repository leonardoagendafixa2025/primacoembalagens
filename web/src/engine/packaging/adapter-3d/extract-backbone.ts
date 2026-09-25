// ============================================================================
// extractMainBodyBackbone — identifica o componente conectado do corpo principal.
// ----------------------------------------------------------------------------
// BFS no subgrafo restrito a hinges body↔body, partindo do root. Devolve o
// conjunto de painéis que compõem o backbone — o "tubo" / sequência principal
// de faces da embalagem.
// ============================================================================

import type { ValidHinge } from "../pipeline/hinge-sanitizer";

export interface Backbone {
  panelIds: Set<string>;
  /** Hinges body↔body que conectam o backbone. */
  hingeKeys: Set<string>;
}

function hingeKey(h: ValidHinge): string {
  return `${h.axisId}|${[h.panelA, h.panelB].sort().join("_")}`;
}

export function extractMainBodyBackbone(
  rootPanelId: string,
  bodyIds: Set<string>,
  hinges: ValidHinge[],
): Backbone {
  const adj = new Map<string, ValidHinge[]>();
  for (const h of hinges) {
    if (!bodyIds.has(h.panelA) || !bodyIds.has(h.panelB)) continue;
    if (!adj.has(h.panelA)) adj.set(h.panelA, []);
    if (!adj.has(h.panelB)) adj.set(h.panelB, []);
    adj.get(h.panelA)!.push(h);
    adj.get(h.panelB)!.push(h);
  }

  const visited = new Set<string>();
  const hingeKeys = new Set<string>();
  if (!bodyIds.has(rootPanelId)) {
    return { panelIds: visited, hingeKeys };
  }
  visited.add(rootPanelId);
  const queue: string[] = [rootPanelId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const neighbors = (adj.get(cur) ?? []).slice().sort((a, b) => b.length - a.length);
    for (const h of neighbors) {
      hingeKeys.add(hingeKey(h));
      const other = h.panelA === cur ? h.panelB : h.panelA;
      if (visited.has(other)) continue;
      visited.add(other);
      queue.push(other);
    }
  }

  return { panelIds: visited, hingeKeys };
}
