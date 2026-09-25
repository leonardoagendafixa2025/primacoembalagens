// ============================================================================
// CAD Spanning Tree — árvore de dobras genérica para qualquer faca.
// ----------------------------------------------------------------------------
// A partir do grafo de adjacência geométrica entre painéis (PanelContact[]),
// constrói:
//
//   1. Componentes conexas — peças realmente separáveis do PDF.
//   2. Para cada componente, escolhe raiz = painel de maior área.
//   3. BFS prioritizando contatos de maior overlap, gerando um spanning tree
//      onde TODO painel alcançável recebe parent + hinge.
//   4. Arestas extras (que fechariam ciclo) viram "back edges" / seams.
//   5. Sintetiza StructuralFoldAxis canônico a partir da aresta compartilhada,
//      mas somente para contatos já autorizados por um eixo crease/perf real.
//
// O hinge gerado já carrega origin/axisDir do span efetivo do contato, ou
// seja: o sign do solver (que usa `hinge.origin/axisDir`, vide adapter)
// fica sempre geometricamente correto, independente de onde o vinco do PDF
// foi desenhado.
// ============================================================================

import type { PipelinePanel, StructuralFoldAxis } from "../pipeline/types";
import type { ValidHinge } from "../pipeline/hinge-sanitizer";
import type { PanelContact } from "./cad-adjacency";

export interface CadSpanningTree {
  /** Raiz do componente principal (maior área). */
  rootPanelId: string;
  /** Painéis alcançáveis a partir da raiz. */
  reachablePanels: PipelinePanel[];
  /** Hinges resultantes — primeiro tree edges em ordem topológica, depois back edges. */
  hinges: ValidHinge[];
  parentOf: Record<string, string>;
  topoOrder: string[];
  treeHingeByChild: Record<string, ValidHinge>;
  /** Painéis genuinamente desconexos (em outros componentes). */
  orphanPanels: string[];
  /** Eixos sintetizados (precisam ser concatenados aos foldAxes do solver). */
  synthesizedAxes: StructuralFoldAxis[];
  /** Componentes conexas (lista de panelIds, ordenadas por tamanho). */
  components: string[][];
}

export interface CadSpanningTreeOptions {
  /** Painel preferencial como raiz (se válido). */
  preferredRootId?: string;
}

function buildAdjacency(
  panelIds: Set<string>,
  contacts: PanelContact[],
): Map<string, PanelContact[]> {
  const adj = new Map<string, PanelContact[]>();
  for (const id of panelIds) adj.set(id, []);
  for (const c of contacts) {
    if (!panelIds.has(c.panelA) || !panelIds.has(c.panelB)) continue;
    adj.get(c.panelA)!.push(c);
    adj.get(c.panelB)!.push(c);
  }
  // Já ordenados globalmente, mas dentro de cada lista mantemos a ordem
  // descendente por score para o BFS preferir arestas mais "fortes".
  for (const list of adj.values()) {
    list.sort(
      (a, b) =>
        b.score - a.score ||
        a.panelA.localeCompare(b.panelA) ||
        a.panelB.localeCompare(b.panelB),
    );
  }
  return adj;
}

function findComponents(
  panels: PipelinePanel[],
  adj: Map<string, PanelContact[]>,
): string[][] {
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const p of panels) {
    if (seen.has(p.id)) continue;
    const stack = [p.id];
    const cc: string[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      cc.push(cur);
      for (const c of adj.get(cur) ?? []) {
        const other = c.panelA === cur ? c.panelB : c.panelA;
        if (!seen.has(other)) stack.push(other);
      }
    }
    comps.push(cc);
  }
  comps.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  return comps;
}

function chooseRoot(
  componentIds: string[],
  panels: PipelinePanel[],
  preferredRootId?: string,
): string {
  const idSet = new Set(componentIds);
  // Painel de maior área no componente; desempate determinístico por id.
  // Em facas importadas de PDF o root vindo do fold-plan/sanitizer pode ser
  // uma aba estreita ou um painel afetado por eixo deslocado. Sistemas CAD de
  // embalagem partem de uma face principal estável; portanto só aceitamos o
  // root preferido se ele tiver porte de painel estrutural (não uma lingueta).
  let best = componentIds[0];
  let bestArea = -Infinity;
  for (const id of componentIds) {
    const panel = panels.find((p) => p.id === id);
    const area = panel?.area ?? 0;
    if (area > bestArea || (area === bestArea && id < best)) {
      bestArea = area;
      best = id;
    }
  }
  if (preferredRootId && idSet.has(preferredRootId)) {
    const preferredArea = panels.find((p) => p.id === preferredRootId)?.area ?? 0;
    if (preferredArea >= bestArea * 0.6) return preferredRootId;
  }
  return best;
}

function hingeFromContact(
  contact: PanelContact,
  parentId: string,
  childId: string,
  axisId: string,
  isTree: boolean,
): ValidHinge {
  const dx = contact.span.b.x - contact.span.a.x;
  const dy = contact.span.b.y - contact.span.a.y;
  const len = Math.hypot(dx, dy);
  return {
    axisId,
    panelA: parentId,
    panelB: childId,
    length: len,
    axisDir: { x: dx / len, y: dy / len },
    origin: { x: contact.span.a.x, y: contact.span.a.y },
    isTree,
  };
}

function synthesizeAxis(
  contact: PanelContact,
  axisId: string,
): StructuralFoldAxis {
  const dx = contact.span.b.x - contact.span.a.x;
  const dy = contact.span.b.y - contact.span.a.y;
  const len = Math.hypot(dx, dy);
  return {
    id: axisId,
    axisLine: {
      origin: { x: contact.span.a.x, y: contact.span.a.y },
      direction: { x: dx / len, y: dy / len },
    },
    span: { a: { ...contact.span.a }, b: { ...contact.span.b } },
    fragments: [],
    type: "crease",
    role: "structural_fold_axis",
    structuralEligibility: true,
    structuralConfidence: 1,
    confidence: 1,
    length: len,
    connectedFaceIds: [],
  };
}

export function buildCadSpanningTree(
  panels: PipelinePanel[],
  foldAxes: StructuralFoldAxis[],
  contacts: PanelContact[],
  options: CadSpanningTreeOptions = {},
): CadSpanningTree {
  const panelIds = new Set(panels.map((p) => p.id));
  const adj = buildAdjacency(panelIds, contacts);
  const components = findComponents(panels, adj);
  const mainComp = components[0] ?? [];
  const rootPanelId = chooseRoot(mainComp, panels, options.preferredRootId);

  const visited = new Set<string>();
  const parentOf: Record<string, string> = {};
  const topoOrder: string[] = [];
  const treeHingeByChild: Record<string, ValidHinge> = {};
  const treeHinges: ValidHinge[] = [];
  const backHinges: ValidHinge[] = [];
  const synthesizedAxes: StructuralFoldAxis[] = [];
  const usedContactKeys = new Set<string>();
  let synthIndex = 0;

  const contactKey = (c: PanelContact) =>
    c.panelA < c.panelB ? `${c.panelA}|${c.panelB}` : `${c.panelB}|${c.panelA}`;

  const resolveAxis = (contact: PanelContact): string => {
    // computePanelContacts só entrega contato quando existe crease/perf real.
    // Ainda assim usamos um eixo canônico derivado do span compartilhado para
    // não herdar direção/span fragmentados do PDF bruto.
    const id = `cad-axis-${synthIndex++}-from-${contact.matchedAxisId}`;
    synthesizedAxes.push(synthesizeAxis(contact, id));
    return id;
  };

  // BFS por componente, começando pelo principal (root).
  const componentRoots: string[] = [rootPanelId];
  for (const comp of components.slice(1)) {
    if (comp.length === 0) continue;
    componentRoots.push(chooseRoot(comp, panels));
  }

  for (const compRoot of componentRoots) {
    if (visited.has(compRoot)) continue;
    visited.add(compRoot);
    topoOrder.push(compRoot);
    const queue: string[] = [compRoot];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const c of adj.get(cur) ?? []) {
        const other = c.panelA === cur ? c.panelB : c.panelA;
        const key = contactKey(c);
        if (visited.has(other)) {
          // Aresta para painel já visitado → back edge (seam/closure).
          if (usedContactKeys.has(key)) continue;
          usedContactKeys.add(key);
          const axisId = resolveAxis(c);
          backHinges.push(hingeFromContact(c, cur, other, axisId, false));
          continue;
        }
        usedContactKeys.add(key);
        const axisId = resolveAxis(c);
        const hinge = hingeFromContact(c, cur, other, axisId, true);
        parentOf[other] = cur;
        treeHingeByChild[other] = hinge;
        treeHinges.push(hinge);
        visited.add(other);
        topoOrder.push(other);
        queue.push(other);
      }
    }
  }

  // O componente principal é o do root; só seus painéis são "reachable".
  const mainSet = new Set(mainComp);
  const reachablePanels = panels.filter((p) => mainSet.has(p.id));
  const orphanPanels = panels.filter((p) => !mainSet.has(p.id)).map((p) => p.id);

  // Hinges retornadas: apenas as do componente principal.
  // Back edges entre painéis do componente principal viram closures.
  // Hinges em outros componentes ficam fora — eles têm sua própria árvore
  // virtual mas o solver atual trabalha só com 1 root.
  const inMain = (h: ValidHinge) => mainSet.has(h.panelA) && mainSet.has(h.panelB);
  const filteredTree = treeHinges.filter(inMain);
  const filteredBack = backHinges.filter(inMain);
  const filteredTreeByChild: Record<string, ValidHinge> = {};
  for (const [k, v] of Object.entries(treeHingeByChild)) {
    if (mainSet.has(k) && mainSet.has(v.panelA) && mainSet.has(v.panelB)) {
      filteredTreeByChild[k] = v;
    }
  }
  const filteredParentOf: Record<string, string> = {};
  for (const [k, v] of Object.entries(parentOf)) {
    if (mainSet.has(k) && mainSet.has(v)) filteredParentOf[k] = v;
  }
  const filteredTopo = topoOrder.filter((id) => mainSet.has(id));

  // Garantia: o solver consome `hinges` na ordem [tree, back].
  const hinges = [...filteredTree, ...filteredBack];

  void foldAxes; // foldAxes não é mutado aqui — o caller anexa synthesizedAxes.

  return {
    rootPanelId,
    reachablePanels,
    hinges,
    parentOf: filteredParentOf,
    topoOrder: filteredTopo,
    treeHingeByChild: filteredTreeByChild,
    orphanPanels,
    synthesizedAxes,
    components,
  };
}
