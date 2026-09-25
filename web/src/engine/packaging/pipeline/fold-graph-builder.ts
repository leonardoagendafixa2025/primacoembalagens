// ============================================================================
// Stage 6 — Fold Graph Builder
// ----------------------------------------------------------------------------
// Fonte única: FoldGraph nasce SOMENTE de StructuralPanel/PipelinePanel final
// + StructuralFoldAxis. Nunca lê face bruta, candidate cru ou feature absorvida.
// ============================================================================

import type {
  FoldGraph,
  FoldGraphEdge,
  FoldGraphNode,
  PipelinePanel,
  StructuralPanel,
  StructuralFoldAxis,
} from "./types";

interface AxisContact {
  panelId: string;
  side: number;
  intervals: Array<[number, number]>;
}

function centroid(poly: Array<{ x: number; y: number }>) {
  let x = 0;
  let y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / Math.max(1, poly.length), y: y / Math.max(1, poly.length) };
}

function signedPerp(p: { x: number; y: number }, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x;
  const oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x;
  const dy = axis.axisLine.direction.y;
  return (p.x - ox) * -dy + (p.y - oy) * dx;
}

function proj(p: { x: number; y: number }, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x;
  const oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x;
  const dy = axis.axisLine.direction.y;
  return (p.x - ox) * dx + (p.y - oy) * dy;
}

function spanRange(axis: StructuralFoldAxis): [number, number] {
  const a = proj(axis.span.a, axis);
  const b = proj(axis.span.b, axis);
  return a <= b ? [a, b] : [b, a];
}

function panelSide(panel: PipelinePanel, axis: StructuralFoldAxis): number {
  const cSide = signedPerp(centroid(panel.polygon), axis);
  if (Math.abs(cSide) > 0.05) return cSide;
  let sum = 0;
  let count = 0;
  for (const p of panel.polygon) {
    const s = signedPerp(p, axis);
    if (Math.abs(s) <= 0.25) continue;
    sum += s;
    count++;
  }
  return count > 0 ? sum / count : cSide;
}

function panelAxisContact(panel: PipelinePanel, axis: StructuralFoldAxis): AxisContact | null {
  const [sLo, sHi] = spanRange(axis);
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i < panel.polygon.length; i++) {
    const a = panel.polygon[i];
    const b = panel.polygon[(i + 1) % panel.polygon.length];
    if (Math.abs(signedPerp(a, axis)) > 1.5 || Math.abs(signedPerp(b, axis)) > 1.5) continue;
    const ta = proj(a, axis);
    const tb = proj(b, axis);
    const lo = Math.max(Math.min(ta, tb), sLo);
    const hi = Math.min(Math.max(ta, tb), sHi);
    if (hi - lo >= 0.35) intervals.push([lo, hi]);
  }
  if (intervals.length === 0) return null;
  const side = panelSide(panel, axis);
  if (Math.abs(side) <= 0.05) return null;
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { panelId: panel.id, side, intervals };
}

function contactsShareHinge(a: AxisContact, b: AxisContact): boolean {
  if (a.side * b.side >= 0) return false;
  for (const ia of a.intervals) {
    for (const ib of b.intervals) {
      if (Math.min(ia[1], ib[1]) - Math.max(ia[0], ib[0]) >= 0.35) return true;
    }
  }
  return false;
}

function isStructuralFoldAxis(axis: StructuralFoldAxis): boolean {
  return axis.role === "structural_fold_axis" && axis.structuralEligibility !== false;
}

export function buildFoldGraph(
  panels: StructuralPanel[] | PipelinePanel[],
  axes: StructuralFoldAxis[],
  rootHint?: string,
): FoldGraph {
  if (panels.length === 0) return { rootPanelId: "", nodes: {}, edges: [] };

  const panelById = new Map<string, PipelinePanel>(panels.map((p) => [p.id, p]));
  const panelByFaceId = new Map<number, PipelinePanel>();
  for (const p of panels) panelByFaceId.set(p.faceId, p);

  const edges: FoldGraphEdge[] = [];
  const adjacency = new Map<string, Array<{ neighborId: string; axisId: string }>>();
  const seen = new Set<string>();

  const addAdj = (a: string, b: string, axisId: string) => {
    const arr = adjacency.get(a) ?? [];
    arr.push({ neighborId: b, axisId });
    adjacency.set(a, arr);
  };

  const addEdge = (axis: StructuralFoldAxis, a: PipelinePanel, b: PipelinePanel) => {
    if (a.id === b.id) return;
    const key = `${axis.id}|${[a.id, b.id].sort().join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({
      id: `edge-${axis.id}-${a.id}-${b.id}`,
      axisId: axis.id,
      hingeAxisId: axis.id,
      panelA: a.id,
      panelB: b.id,
      parentPanelId: a.id,
      childPanelId: b.id,
      defaultAngle: Math.PI / 2,
    });
    addAdj(a.id, b.id, axis.id);
    addAdj(b.id, a.id, axis.id);
  };

  for (const axis of axes) {
    if (!isStructuralFoldAxis(axis)) continue;
    const explicitCandidateIds = new Set(axis.connectedPanelCandidateIds ?? []);
    const contactPanels = [...panels]
      .filter((panel) =>
        (panel.foldAxisIds ?? []).includes(axis.id) ||
        explicitCandidateIds.has(panel.id) ||
        axis.connectedFaceIds.includes(panel.faceId),
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    const contacts = contactPanels
      .map((panel) => panelAxisContact(panel, axis))
      .filter((contact): contact is AxisContact => Boolean(contact));
    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        if (!contactsShareHinge(contacts[i], contacts[j])) continue;
        const a = panelById.get(contacts[i].panelId);
        const b = panelById.get(contacts[j].panelId);
        if (a && b) addEdge(axis, a, b);
      }
    }

    if (contacts.length >= 2) continue;
    const connectedPanels = Array.from(
      new Map(
        axis.connectedFaceIds
          .map((faceId) => panelByFaceId.get(faceId))
          .filter((panel): panel is PipelinePanel => Boolean(panel))
          .map((panel) => [panel.id, panel]),
      ).values(),
    );
    if (connectedPanels.length === 2) addEdge(axis, connectedPanels[0], connectedPanels[1]);
  }

  let rootPanelId = rootHint && panelById.has(rootHint) ? rootHint : "";
  if (!rootPanelId) {
    let best = panels[0];
    for (const p of panels) if (p.area > best.area) best = p;
    rootPanelId = best.id;
  }

  const nodes: Record<string, FoldGraphNode> = {};
  for (const p of panels) {
    nodes[p.id] = { panelId: p.id, parentId: null, hingeAxisId: null, depth: 0, childrenIds: [] };
  }

  const visited = new Set<string>([rootPanelId]);
  const queue: string[] = [rootPanelId];
  const treeEdgeKeys = new Set<string>();
  const edgeKey = (axisId: string, parent: string, child: string) => `${axisId}|${parent}->${child}`;
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = nodes[currentId];
    const neighbors = (adjacency.get(currentId) ?? []).sort((a, b) => a.axisId.localeCompare(b.axisId) || a.neighborId.localeCompare(b.neighborId));
    for (const { neighborId, axisId } of neighbors) {
      if (visited.has(neighborId)) {
        const child = nodes[neighborId];
        // Guard de invariante: tentativa de atribuir um segundo pai diferente
        // ao mesmo painel via outro hinge. Em árvore de dobras válida, cada
        // painel não-raiz tem exatamente UM pai. Multi-pai é causa raiz
        // documentada de modelos 3D que "quase fecham". Logamos E descartamos
        // a aresta — ela NÃO entra no foldGraph final. Critério determinístico:
        // mantemos o primeiro pai atribuído pela BFS (ordem estável via sort
        // por axisId/neighborId).
        if (
          child.parentId &&
          child.parentId !== currentId &&
          child.hingeAxisId !== axisId
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[fold-graph-builder] Painel ${neighborId} já tem pai ${child.parentId} ` +
            `(via ${child.hingeAxisId}); DESCARTANDO segundo pai ${currentId} via ${axisId}. ` +
            `Provável causa: split incorreto em panelCandidates → structuralPanels.`,
          );
        }
        continue;
      }
      visited.add(neighborId);
      const child = nodes[neighborId];
      child.parentId = currentId;
      child.hingeAxisId = axisId;
      child.depth = current.depth + 1;
      current.childrenIds.push(neighborId);
      treeEdgeKeys.add(edgeKey(axisId, currentId, neighborId));
      for (const edge of edges) {
        if (edge.axisId !== axisId) continue;
        const matches = (edge.panelA === currentId && edge.panelB === neighborId) || (edge.panelA === neighborId && edge.panelB === currentId);
        if (!matches) continue;
        edge.parentPanelId = currentId;
        edge.childPanelId = neighborId;
      }
      queue.push(neighborId);
    }
  }

  // Filtra arestas: apenas as que viraram aresta-de-árvore na BFS sobrevivem.
  // Arestas de fechamento de ciclo (que criariam multi-pai) são DESCARTADAS
  // do grafo final — não chegam ao solver 3D.
  const treeEdges = edges.filter((edge) =>
    edge.parentPanelId && edge.childPanelId
      ? treeEdgeKeys.has(edgeKey(edge.axisId, edge.parentPanelId, edge.childPanelId))
      : false,
  );

  // Invariante fail-fast: nenhum painel pode ter mais de um pai no grafo final.
  const parentOf = new Map<string, string>();
  for (const edge of treeEdges) {
    const childId = edge.childPanelId;
    const parentId = edge.parentPanelId;
    if (!childId || !parentId) continue;
    const existing = parentOf.get(childId);
    if (existing && existing !== parentId) {
      throw new Error(
        `[fold-graph-builder] Invariante violada: painel ${childId} tem 2 pais ` +
        `no grafo final (${existing} e ${parentId}). ` +
        `Causa raiz: split incorreto em panelCandidates → structuralPanels.`,
      );
    }
    parentOf.set(childId, parentId);
  }

  return { rootPanelId, nodes, edges: treeEdges };
}