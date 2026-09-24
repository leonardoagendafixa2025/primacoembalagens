import type { Point2D, Segment2D } from '../types';
import type { PackagingGeometry } from '../geometry';
import type { StructuralPanel } from './LoopTopologyEngine';

/**
 * Propriedades cinemáticas da dobradiça (desacopladas da topologia pura da faca)
 */
export interface HingeKinematics {
  targetAngle: number;
  angleSource: 'MODEL' | 'USER' | 'DEFAULT' | 'UNKNOWN';
  topologicalSign: 1 | -1;
  signSource: 'HALF_EDGE_ORIENTATION' | 'CAD_METADATA' | 'MODEL_RULE' | 'DEFAULT' | 'INVALID_MAPPING';
  physicalDirection: 'MOUNTAIN' | 'VALLEY' | 'NOT_DETERMINED';
}

/**
 * Representação de uma dobradiça/junta topológica (Hinge) derivada de uma CREASE real
 */
export interface TopologicalHinge {
  id: string;              // Ex: "H001", "H002"
  creaseId: string;        // ID da entidade CREASE de origem na PackagingGeometry
  parentPanelId: string;   // ID do painel pai (ex: "P001")
  childPanelId: string;    // ID do painel filho (ex: "P002")
  matchedHalfEdgeId?: string; // ID da half-edge do contorno do painel pai associada à CREASE
  axisStart: Point2D;      // Ponto inicial do eixo da dobra (vindo da CREASE real)
  axisEnd: Point2D;        // Ponto final do eixo da dobra (vindo da CREASE real)
  length: number;          // Comprimento exato do eixo em mm
  direction: Point2D;      // Vetor unitário normalizado (dx, dy)
  foldAngle: number;       // Ângulo de dobra padrão em graus (retrocompatível, = kinematics.targetAngle)
  foldSign: 1 | -1;        // Sentido topológico da dobra (retrocompatível, = kinematics.topologicalSign)
  foldOrder: number;       // Ordem/profundidade na árvore de dobragem
  status: 'ACTIVE' | 'CYCLE_EXCLUDED' | 'UNATTACHED';
  kinematics: HingeKinematics;
}

/**
 * Aresta no Grafo Topológico de Painéis
 */
export interface FoldGraphEdge {
  id: string;
  creaseId: string;
  crease: Segment2D;
  panelAId: string;
  panelBId: string;
  axisStart: Point2D;
  axisEnd: Point2D;
  length: number;
  direction: Point2D;
}

/**
 * Diagnóstico de mapeamento inválido entre dobradiça e CREASE no contorno do painel
 */
export interface InvalidHingeCreaseMappingDiagnostic {
  code: 'INVALID_HINGE_CREASE_MAPPING';
  parentPanelId: string;
  childPanelId?: string;
  creaseId: string;
  description: string;
}

/**
 * Diagnóstico de ciclo no grafo de dobragem
 */
export interface FoldGraphCycleDiagnostic {
  code: 'FOLD_GRAPH_CYCLE';
  cycleId: string;
  panelsInvolved: string[];
  hingesInvolved: string[];
  creasesInvolved: string[];
  description: string;
}

/**
 * Diagnóstico de componente desconexo de dobragem
 */
export interface DisconnectedFoldComponentDiagnostic {
  code: 'DISCONNECTED_FOLD_COMPONENT';
  componentId: string;
  panelsCount: number;
  panelIds: string[];
  description: string;
}

/**
 * Nó da árvore hierárquica de dobragem
 */
export interface FoldingTreeNode {
  panelId: string;
  panel: StructuralPanel;
  depth: number;
  incomingHinge?: TopologicalHinge;
  children: FoldingTreeNode[];
}

/**
 * Resultado completo da Fase 2C / 2C.2
 */
export interface FoldingTreeResult {
  rootPanelId: string;
  rootPanel: StructuralPanel;
  rootSource: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC';
  tree: FoldingTreeNode;
  hinges: TopologicalHinge[];
  edges: FoldGraphEdge[];
  components: Array<{
    componentId: string;
    rootPanelId: string;
    rootSource: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC';
    panelIds: string[];
    hinges: TopologicalHinge[];
  }>;
  orphanCreases: Array<{
    creaseId: string;
    crease: Segment2D;
    reason: string;
  }>;
  cycles: FoldGraphCycleDiagnostic[];
  disconnectedComponents: DisconnectedFoldComponentDiagnostic[];
  invalidHingeCreaseMappings: InvalidHingeCreaseMappingDiagnostic[];
  manifest: string;
  stats: {
    totalPanels: number;
    totalHinges: number;
    totalCreases: number;
    connectedPanelsCount: number;
    componentsCount: number;
    cyclesCount: number;
    disconnectedPanelsCount: number;
    orphanCreasesCount: number;
    invalidMappingsCount: number;
  };
}

/**
 * Opções de configuração para o motor de árvore de dobragem
 */
export interface FoldingTreeOptions {
  preferredRootPanelId?: string;
  defaultFoldAngle?: number;
  toleranceMm?: number;
}

function pointDistance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getCreaseId(c: Segment2D, fallbackIdx: number): string {
  if (c.id !== undefined && c.id !== null) {
    return String(c.id);
  }
  return `crease_${fallbackIdx}`;
}

/**
 * Motor Topológico de Árvore de Dobragem (Fase 2C)
 * 
 * Constrói deterministamente a árvore/grafo de dobragem a partir dos painéis estruturais da Fase 2B
 * e das CREASES reais da PackagingGeometry.
 */
export class FoldingTreeEngine {
  /**
   * Constrói a estrutura topológica completa de dobragem
   */
  public static buildFoldingTree(
    panels: StructuralPanel[],
    geometry: PackagingGeometry,
    options: FoldingTreeOptions = {}
  ): FoldingTreeResult {
    const tolerance = options.toleranceMm ?? 0.05;
    const defaultAngle = options.defaultFoldAngle ?? 90.0;

    // 1. Coleta todas as CREASES reais da geometria
    // Nota: PERF ('perfo') NUNCA deve criar hinge
    const realCreases = geometry.segments.filter((s) => s.type === 'crease');

    // 2. Mapeamento de quais painéis contêm cada CREASE em suas outer boundaries
    // 2. Mapeamento de quais painéis contêm cada CREASE em suas outer boundaries
    const creaseToPanelsMap = new Map<string, string[]>();
    for (let idx = 0; idx < realCreases.length; idx++) {
      const cId = getCreaseId(realCreases[idx], idx + 1);
      creaseToPanelsMap.set(cId, []);
    }

    const matchTol = Math.max(tolerance * 4, 0.25);

    function isEdgeColinearWithCrease(edge: { p0: Point2D; p1: Point2D }, c: Segment2D): boolean {
      const cdx = c.x1 - c.x0;
      const cdy = c.y1 - c.y0;
      const cLenSq = cdx * cdx + cdy * cdy;
      if (cLenSq < 1e-6) return false;

      const t0 = ((edge.p0.x - c.x0) * cdx + (edge.p0.y - c.y0) * cdy) / cLenSq;
      const t1 = ((edge.p1.x - c.x0) * cdx + (edge.p1.y - c.y0) * cdy) / cLenSq;

      if (t0 < -0.08 || t0 > 1.08 || t1 < -0.08 || t1 > 1.08) return false;

      const proj0x = c.x0 + t0 * cdx;
      const proj0y = c.y0 + t0 * cdy;
      const proj1x = c.x0 + t1 * cdx;
      const proj1y = c.y0 + t1 * cdy;

      const d0 = Math.hypot(edge.p0.x - proj0x, edge.p0.y - proj0y);
      const d1 = Math.hypot(edge.p1.x - proj1x, edge.p1.y - proj1y);

      return d0 <= matchTol && d1 <= matchTol;
    }

    for (const panel of panels) {
      for (const edge of panel.outerBoundary.edges) {
        if (edge.sourceType === 'crease' && edge.type === 'segment') {
          for (let idx = 0; idx < realCreases.length; idx++) {
            const c = realCreases[idx];
            const cId = getCreaseId(c, idx + 1);

            const cP0: Point2D = { x: c.x0, y: c.y0 };
            const cP1: Point2D = { x: c.x1, y: c.y1 };
            const dDirect = pointDistance(cP0, edge.p0) + pointDistance(cP1, edge.p1);
            const dOpposite = pointDistance(cP0, edge.p1) + pointDistance(cP1, edge.p0);

            const isMatch =
              cId === String(edge.id) ||
              Math.min(dDirect, dOpposite) <= matchTol * 2 ||
              isEdgeColinearWithCrease(edge, c);

            if (isMatch) {
              const list = creaseToPanelsMap.get(cId) || [];
              if (!list.includes(panel.id)) {
                list.push(panel.id);
              }
              creaseToPanelsMap.set(cId, list);
            }
          }
        }
      }
    }

    // 3. Constrói as Arestas do Grafo de Painéis (Panel Graph)
    const edges: FoldGraphEdge[] = [];
    const orphanCreases: Array<{ creaseId: string; crease: Segment2D; reason: string }> = [];
    let edgeCounter = 0;
    const connectedPairSet = new Set<string>();

    for (let idx = 0; idx < realCreases.length; idx++) {
      const crease = realCreases[idx];
      const cId = getCreaseId(crease, idx + 1);
      const associatedPanels = creaseToPanelsMap.get(cId) || [];

      if (associatedPanels.length >= 2) {
        // Conexão válida entre os dois primeiros painéis associados
        edgeCounter++;
        const p0: Point2D = { x: crease.x0, y: crease.y0 };
        const p1: Point2D = { x: crease.x1, y: crease.y1 };
        const len = pointDistance(p0, p1);
        const dir: Point2D = len > 0.0001
          ? { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len }
          : { x: 1, y: 0 };

        const pairKey = [associatedPanels[0], associatedPanels[1]].sort().join('_');
        connectedPairSet.add(pairKey);

        edges.push({
          id: `EDGE_${edgeCounter.toString().padStart(3, '0')}`,
          creaseId: cId,
          crease,
          panelAId: associatedPanels[0],
          panelBId: associatedPanels[1],
          axisStart: p0,
          axisEnd: p1,
          length: Number(len.toFixed(4)),
          direction: { x: Number(dir.x.toFixed(6)), y: Number(dir.y.toFixed(6)) },
        });
      } else if (associatedPanels.length === 1) {
        orphanCreases.push({
          creaseId: cId,
          crease,
          reason: `CREASE pertence a apenas 1 painel (${associatedPanels[0]}); borda aberta/flutuante.`,
        });
      } else {
        orphanCreases.push({
          creaseId: cId,
          crease,
          reason: `CREASE não intercepta a boundary de nenhum painel estrutural fechado.`,
        });
      }
    }

    // 3.5 Detecção direta de arestas de vinco compartilhadas entre pares de painéis ainda não conectados
    for (let i = 0; i < panels.length; i++) {
      const pA = panels[i];
      for (let j = i + 1; j < panels.length; j++) {
        const pB = panels[j];
        const pairKey = [pA.id, pB.id].sort().join('_');
        if (connectedPairSet.has(pairKey)) continue;

        for (const edgeA of pA.outerBoundary.edges) {
          if (edgeA.sourceType !== 'crease' || edgeA.type !== 'segment') continue;
          for (const edgeB of pB.outerBoundary.edges) {
            if (edgeB.sourceType !== 'crease' || edgeB.type !== 'segment') continue;

            const dMatch = pointDistance(edgeA.p0, edgeB.p1) + pointDistance(edgeA.p1, edgeB.p0);
            const dDirect = pointDistance(edgeA.p0, edgeB.p0) + pointDistance(edgeA.p1, edgeB.p1);

            if (Math.min(dMatch, dDirect) <= matchTol * 2) {
              edgeCounter++;
              const p0 = edgeA.p0;
              const p1 = edgeA.p1;
              const len = pointDistance(p0, p1);
              const dir: Point2D = len > 0.0001
                ? { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len }
                : { x: 1, y: 0 };

              connectedPairSet.add(pairKey);
              edges.push({
                id: `EDGE_${edgeCounter.toString().padStart(3, '0')}`,
                creaseId: String(edgeA.id || `crease_shared_${edgeCounter}`),
                crease: {
                  id: edgeA.id,
                  x0: p0.x,
                  y0: p0.y,
                  x1: p1.x,
                  y1: p1.y,
                  type: 'crease',
                },
                panelAId: pA.id,
                panelBId: pB.id,
                axisStart: p0,
                axisEnd: p1,
                length: Number(len.toFixed(4)),
                direction: { x: Number(dir.x.toFixed(6)), y: Number(dir.y.toFixed(6)) },
              });
              break;
            }
          }
          if (connectedPairSet.has(pairKey)) break;
        }
      }
    }

    // 4. Mapeamento de Adjacência do Grafo
    const panelMap = new Map<string, StructuralPanel>();
    for (const p of panels) {
      panelMap.set(p.id, p);
    }

    const adjacency = new Map<string, Array<{ neighborId: string; edge: FoldGraphEdge }>>();
    for (const p of panels) {
      adjacency.set(p.id, []);
    }

    for (const e of edges) {
      adjacency.get(e.panelAId)?.push({ neighborId: e.panelBId, edge: e });
      adjacency.get(e.panelBId)?.push({ neighborId: e.panelAId, edge: e });
    }

    // 5. Identificação de Componentes Conexos e Detecção de Ciclos
    const visitedPanels = new Set<string>();
    const components: Array<{
      componentId: string;
      rootPanelId: string;
      rootSource: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC';
      panelIds: string[];
      hinges: TopologicalHinge[];
    }> = [];

    const disconnectedComponents: DisconnectedFoldComponentDiagnostic[] = [];
    const cycles: FoldGraphCycleDiagnostic[] = [];

    const globalVisited = new Set<string>();

    function detectCyclesDFS(currId: string, parentId: string | null, pathStack: string[]) {
      globalVisited.add(currId);
      pathStack.push(currId);

      const neighbors = adjacency.get(currId) || [];
      for (const { neighborId } of neighbors) {
        if (neighborId === parentId) continue;
        if (pathStack.includes(neighborId)) {
          // Ciclo detectado!
          const cycleStartIndex = pathStack.indexOf(neighborId);
          const cyclePanels = pathStack.slice(cycleStartIndex);
          const cycleKey = [...cyclePanels].sort().join('-');

          // Evita duplicatas do mesmo ciclo
          if (!cycles.some((c) => c.cycleId === cycleKey)) {
            const involvedHinges: string[] = [];
            const involvedCreases: string[] = [];
            for (let i = 0; i < cyclePanels.length; i++) {
              const pA = cyclePanels[i];
              const pB = cyclePanels[(i + 1) % cyclePanels.length];
              const connectingEdge = edges.find(
                (ed) => (ed.panelAId === pA && ed.panelBId === pB) || (ed.panelAId === pB && ed.panelBId === pA)
              );
              if (connectingEdge) {
                involvedCreases.push(connectingEdge.creaseId);
              }
            }

            cycles.push({
              code: 'FOLD_GRAPH_CYCLE',
              cycleId: cycleKey,
              panelsInvolved: cyclePanels,
              hingesInvolved: involvedHinges,
              creasesInvolved: involvedCreases,
              description: `Ciclo topológico detectado entre os painéis [${cyclePanels.join(' -> ')}]. Estrutura de dobragem contém anel fechado de vincos.`,
            });
          }
        } else if (!globalVisited.has(neighborId)) {
          detectCyclesDFS(neighborId, currId, pathStack);
        }
      }
      pathStack.pop();
    }

    for (const p of panels) {
      if (!globalVisited.has(p.id)) {
        detectCyclesDFS(p.id, null, []);
      }
    }

    /**
     * Calcula o sinal topológico da dobra (+1 ou -1) baseado estritamente na orientação da half-edge
     * do contorno externo (CCW) do painel pai em relação à direção intrínseca da CREASE.
     * 
     * Convenção Formal:
     * - A normal da folha é orientada no sentido +Z: N = (0, 0, 1).
     * - O contorno externo do painel pai é percorrido no sentido anti-horário (CCW).
     * - A aresta de contorno do pai correspondente à CREASE possui vetor tangente direcionado t_parent = (p1 - p0).
     * - A CREASE possui vetor unitário u_crease = (axisEnd - axisStart) / length.
     * - Se t_parent tem componente positiva ao longo de u_crease (dot(t_parent, u_crease) >= 0),
     *   topologicalSign = +1.
     * - Se t_parent tem componente negativa ao longo de u_crease (dot(t_parent, u_crease) < 0),
     *   topologicalSign = -1.
     * - Se o vinco contiver metadado explícito de vinco reverso (camada com 'REVERSE' ou 'VALLEY'),
     *   o sinal é invertido e signSource passa a ser 'CAD_METADATA'.
     */
    const invalidHingeCreaseMappings: InvalidHingeCreaseMappingDiagnostic[] = [];

    function computeTopologicalFoldSign(
      parentPanel: StructuralPanel,
      edge: FoldGraphEdge,
      childPanelId?: string
    ): {
      topologicalSign: 1 | -1;
      signSource: 'HALF_EDGE_ORIENTATION' | 'CAD_METADATA' | 'MODEL_RULE' | 'DEFAULT' | 'INVALID_MAPPING';
      physicalDirection: 'MOUNTAIN' | 'VALLEY' | 'NOT_DETERMINED';
      matchedHalfEdgeId?: string;
    } {
      let parentBoundaryEdge = parentPanel.outerBoundary.edges.find((be) => {
        if (be.sourceType !== 'crease' || be.type !== 'segment') return false;
        return String(be.id) === edge.creaseId;
      });

      if (!parentBoundaryEdge) {
        parentBoundaryEdge = parentPanel.outerBoundary.edges.find((be) => {
          if (be.sourceType !== 'crease' || be.type !== 'segment') return false;
          const dDirect = pointDistance(be.p0, edge.axisStart) + pointDistance(be.p1, edge.axisEnd);
          const dOpposite = pointDistance(be.p0, edge.axisEnd) + pointDistance(be.p1, edge.axisStart);
          return Math.min(dDirect, dOpposite) <= matchTol * 2 || isEdgeColinearWithCrease(be, edge.crease);
        });
      }

      if (!parentBoundaryEdge) {
        // Fallback robusto analítico baseado no vetor do vinco ao centróide do painel filho
        const midX = (edge.axisStart.x + edge.axisEnd.x) / 2;
        const midY = (edge.axisStart.y + edge.axisEnd.y) / 2;
        const childPanel = childPanelId ? panelMap.get(childPanelId) : undefined;
        const toChildX = (childPanel?.centroid.x ?? midX) - midX;
        const toChildY = (childPanel?.centroid.y ?? midY) - midY;
        const cross = edge.direction.x * toChildY - edge.direction.y * toChildX;
        const fallbackSign: 1 | -1 = cross >= 0 ? 1 : -1;

        return {
          topologicalSign: fallbackSign,
          signSource: 'MODEL_RULE',
          physicalDirection: 'MOUNTAIN',
        };
      }

      const tParentX = parentBoundaryEdge.p1.x - parentBoundaryEdge.p0.x;
      const tParentY = parentBoundaryEdge.p1.y - parentBoundaryEdge.p0.y;
      const dot = tParentX * edge.direction.x + tParentY * edge.direction.y;
      let rawSign: 1 | -1 = dot >= 0 ? 1 : -1;
      let signSource: 'HALF_EDGE_ORIENTATION' | 'CAD_METADATA' | 'MODEL_RULE' | 'DEFAULT' | 'INVALID_MAPPING' = 'HALF_EDGE_ORIENTATION';
      let physicalDirection: 'MOUNTAIN' | 'VALLEY' | 'NOT_DETERMINED' = 'NOT_DETERMINED';

      const creaseLayer = String((edge.crease as any).layer || '').toUpperCase();
      if (creaseLayer.includes('REVERSE') || creaseLayer.includes('VALLEY')) {
        rawSign = (rawSign * -1) as 1 | -1;
        signSource = 'CAD_METADATA';
        physicalDirection = 'VALLEY';
      }

      return {
        topologicalSign: rawSign,
        signSource,
        physicalDirection,
        matchedHalfEdgeId: String(parentBoundaryEdge.id),
      };
    }

    // 6. Determinação Determinística de Root Panel por Componente
    // Regra:
    // 1. Grau máximo de conexão (degree) no grafo de vincos (painel central com mais dobras)
    // 2. Maior área estrutural líquida como desempate
    // 3. Proximidade do centróide geral da geometria
    // 4. Ordem alfanumérica determinística de ID
    const geomCenter: Point2D = {
      x: (geometry.bounds.minX + geometry.bounds.maxX) / 2,
      y: (geometry.bounds.minY + geometry.bounds.maxY) / 2,
    };

    function selectRootForComponent(panelIds: string[]): {
      rootId: string;
      source: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC';
    } {
      if (options.preferredRootPanelId && panelIds.includes(options.preferredRootPanelId)) {
        return { rootId: options.preferredRootPanelId, source: 'USER_PREFERRED' };
      }
      if (panelIds.length === 1) return { rootId: panelIds[0], source: 'TOPOLOGICAL_HEURISTIC' };

      const scored = panelIds.map((pId) => {
        const p = panelMap.get(pId)!;
        const degree = adjacency.get(pId)?.length || 0;
        const area = p.area;
        const distToCenter = pointDistance(p.centroid, geomCenter);
        return { pId, degree, area, distToCenter };
      });

      scored.sort((a, b) => {
        if (b.degree !== a.degree) return b.degree - a.degree; // Maior grau primeiro
        if (Math.abs(b.area - a.area) > 0.01) return b.area - a.area; // Maior área
        if (Math.abs(a.distToCenter - b.distToCenter) > 0.01) return a.distToCenter - b.distToCenter; // Mais próximo ao centro
        return a.pId.localeCompare(b.pId); // Determinismo absoluto
      });

      return { rootId: scored[0].pId, source: 'TOPOLOGICAL_HEURISTIC' };
    }

    // 7. Processa Componentes Conexos e Constrói a Árvore (Spanning Tree via BFS)
    const allHinges: TopologicalHinge[] = [];
    let hingeIdCounter = 0;
    let componentCounter = 0;

    let primaryRootId = '';
    let primaryRootSource: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC' = 'TOPOLOGICAL_HEURISTIC';
    let primaryTree: FoldingTreeNode | null = null;

    for (const p of panels) {
      if (visitedPanels.has(p.id)) continue;

      componentCounter++;
      const compId = `COMP_${componentCounter.toString().padStart(2, '0')}`;
      const compPanelIds: string[] = [];
      const queue: string[] = [p.id];
      visitedPanels.add(p.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        compPanelIds.push(currId);
        const neighbors = adjacency.get(currId) || [];
        for (const { neighborId } of neighbors) {
          if (!visitedPanels.has(neighborId)) {
            visitedPanels.add(neighborId);
            queue.push(neighborId);
          }
        }
      }

      // Escolhe root determinístico deste componente
      const { rootId: compRootId, source: compRootSource } = selectRootForComponent(compPanelIds);
      if (componentCounter === 1) {
        primaryRootId = compRootId;
        primaryRootSource = compRootSource;
      }

      // BFS a partir do root para construir a árvore de dobragem sem ciclos
      const compHinges: TopologicalHinge[] = [];
      const treeNodeMap = new Map<string, FoldingTreeNode>();
      const bfsQueue: string[] = [compRootId];
      const treeVisited = new Set<string>([compRootId]);

      const rootNode: FoldingTreeNode = {
        panelId: compRootId,
        panel: panelMap.get(compRootId)!,
        depth: 0,
        children: [],
      };
      treeNodeMap.set(compRootId, rootNode);

      while (bfsQueue.length > 0) {
        const parentId = bfsQueue.shift()!;
        const parentNode = treeNodeMap.get(parentId)!;
        const neighbors = adjacency.get(parentId) || [];

        // Ordena vizinhos determinísticamente por ID
        const sortedNeighbors = [...neighbors].sort((a, b) => a.neighborId.localeCompare(b.neighborId));

        for (const { neighborId, edge } of sortedNeighbors) {
          if (!treeVisited.has(neighborId)) {
            treeVisited.add(neighborId);

            hingeIdCounter++;
            const hId = `H${hingeIdCounter.toString().padStart(3, '0')}`;

            const { topologicalSign, signSource, physicalDirection, matchedHalfEdgeId } = computeTopologicalFoldSign(
              parentNode.panel,
              edge,
              neighborId
            );

            const angleSource: 'MODEL' | 'USER' | 'DEFAULT' | 'UNKNOWN' =
              options.defaultFoldAngle !== undefined ? 'USER' : 'DEFAULT';

            const kinematics: HingeKinematics = {
              targetAngle: defaultAngle,
              angleSource,
              topologicalSign,
              signSource,
              physicalDirection,
            };

            const hinge: TopologicalHinge = {
              id: hId,
              creaseId: edge.creaseId,
              parentPanelId: parentId,
              childPanelId: neighborId,
              matchedHalfEdgeId,
              axisStart: edge.axisStart,
              axisEnd: edge.axisEnd,
              length: edge.length,
              direction: edge.direction,
              foldAngle: defaultAngle,
              foldSign: topologicalSign,
              foldOrder: parentNode.depth + 1,
              status: 'ACTIVE',
              kinematics,
            };

            compHinges.push(hinge);
            allHinges.push(hinge);

            const childNode: FoldingTreeNode = {
              panelId: neighborId,
              panel: panelMap.get(neighborId)!,
              depth: parentNode.depth + 1,
              incomingHinge: hinge,
              children: [],
            };
            treeNodeMap.set(neighborId, childNode);
            parentNode.children.push(childNode);
            bfsQueue.push(neighborId);
          }
        }
      }

      components.push({
        componentId: compId,
        rootPanelId: compRootId,
        rootSource: compRootSource,
        panelIds: compPanelIds,
        hinges: compHinges,
      });

      if (componentCounter === 1) {
        primaryTree = rootNode;
      }
    }

    // Se houver mais de 1 componente desconexo, emite diagnósticos
    if (components.length > 1) {
      for (const comp of components) {
        disconnectedComponents.push({
          code: 'DISCONNECTED_FOLD_COMPONENT',
          componentId: comp.componentId,
          panelsCount: comp.panelIds.length,
          panelIds: comp.panelIds,
          description: `Componente estrutural independente ${comp.componentId} com ${comp.panelIds.length} painéis [${comp.panelIds.join(', ')}] sem conexão de vinco com o restante da faca.`,
        });
      }
    }

    // Se não houver painéis (caso limite)
    if (!primaryTree) {
      const dummyPanel: StructuralPanel = panels[0] || {
        id: 'P000',
        name: 'Empty',
        outerBoundary: {
          id: 'L000',
          vertices: [],
          edges: [],
          area: 0,
          signedArea: 0,
          isExternal: false,
          orientation: 'CCW',
          bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
          centroid: { x: 0, y: 0 },
        },
        holes: [],
        area: 0,
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
        centroid: { x: 0, y: 0 },
        segments: [],
        arcs: [],
        creases: [],
        cuts: [],
        manifest: '',
      };
      primaryRootId = dummyPanel.id;
      primaryTree = {
        panelId: primaryRootId,
        panel: dummyPanel,
        depth: 0,
        children: [],
      };
    }

    // 8. Geração do Manifesto Forense Topológico
    const manifest = FoldingTreeEngine.generateForensicManifest(
      panels,
      primaryRootId,
      primaryRootSource,
      allHinges,
      edges,
      components,
      cycles,
      disconnectedComponents,
      orphanCreases,
      invalidHingeCreaseMappings
    );

    const connectedPanels = new Set<string>();
    for (const h of allHinges) {
      connectedPanels.add(h.parentPanelId);
      connectedPanels.add(h.childPanelId);
    }
    if (primaryRootId && panels.length > 0) {
      connectedPanels.add(primaryRootId);
    }

    return {
      rootPanelId: primaryRootId,
      rootPanel: panelMap.get(primaryRootId) || primaryTree.panel,
      rootSource: primaryRootSource,
      tree: primaryTree,
      hinges: allHinges,
      edges,
      components,
      orphanCreases,
      cycles,
      disconnectedComponents,
      invalidHingeCreaseMappings,
      manifest,
      stats: {
        totalPanels: panels.length,
        totalHinges: allHinges.length,
        totalCreases: realCreases.length,
        connectedPanelsCount: connectedPanels.size,
        componentsCount: components.length,
        cyclesCount: cycles.length,
        disconnectedPanelsCount: panels.length - connectedPanels.size,
        orphanCreasesCount: orphanCreases.length,
        invalidMappingsCount: invalidHingeCreaseMappings.length,
      },
    };
  }

  /**
   * Gera o Manifesto Forense Estruturado da Árvore de Dobragem
   */
  private static generateForensicManifest(
    panels: StructuralPanel[],
    rootPanelId: string,
    rootSource: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC',
    hinges: TopologicalHinge[],
    edges: FoldGraphEdge[],
    components: Array<{ componentId: string; rootPanelId: string; rootSource: 'USER_PREFERRED' | 'MODEL_RULE' | 'TOPOLOGICAL_HEURISTIC'; panelIds: string[]; hinges: TopologicalHinge[] }>,
    cycles: FoldGraphCycleDiagnostic[],
    disconnectedComponents: DisconnectedFoldComponentDiagnostic[],
    orphanCreases: Array<{ creaseId: string; crease: Segment2D; reason: string }>,
    invalidHingeCreaseMappings: InvalidHingeCreaseMappingDiagnostic[] = []
  ): string {
    const lines: string[] = [];

    lines.push('============================================================');
    lines.push('PRIMACOR EMBALAGENS — MANIFESTO FORENSE DE DOBRAGEM (FASE 2C.2)');
    lines.push('============================================================\n');

    lines.push(`Root Panel: ${rootPanelId} [${rootSource}]`);
    lines.push(`Total de Painéis Estruturais: ${panels.length}`);
    lines.push(`Total de Dobradiças (Hinges): ${hinges.length}`);
    lines.push(`Total de Arestas no Grafo: ${edges.length}`);
    lines.push(`Componentes Topológicos: ${components.length}`);
    lines.push(`Ciclos Detectados: ${cycles.length}`);
    lines.push(`Vincos Órfãos: ${orphanCreases.length}\n`);

    lines.push('------------------------------------------------------------');
    lines.push('1. HINGES TOPOLÓGICAS (CREASE -> HINGE)');
    lines.push('------------------------------------------------------------');
    if (hinges.length === 0) {
      lines.push('Nenhuma hinge detectada (painel único ou sem vincos conectando faces).');
    } else {
      for (const h of hinges) {
        lines.push(`Hinge ${h.id}`);
        lines.push(`  Source CREASE   : ${h.creaseId}`);
        lines.push(`  Parent          : ${h.parentPanelId}`);
        lines.push(`  Child           : ${h.childPanelId}`);
        lines.push(`  Axis            : (${h.axisStart.x.toFixed(3)}, ${h.axisStart.y.toFixed(3)}) -> (${h.axisEnd.x.toFixed(3)}, ${h.axisEnd.y.toFixed(3)})`);
        lines.push(`  Length          : ${h.length.toFixed(4)} mm`);
        lines.push(`  Direction       : (${h.direction.x.toFixed(4)}, ${h.direction.y.toFixed(4)})`);
        lines.push(`  Topological Sign: ${h.kinematics.topologicalSign > 0 ? '+1' : '-1'}`);
        lines.push(`  Sign Source     : ${h.kinematics.signSource}`);
        lines.push(`  Physical Direct : ${h.kinematics.physicalDirection}`);
        lines.push(`  Target Angle    : ${h.kinematics.targetAngle}°`);
        lines.push(`  Angle Source    : ${h.kinematics.angleSource}`);
        lines.push(`  Fold Order      : Depth ${h.foldOrder}`);
        lines.push(`  Root Source     : ${rootSource}`);
        lines.push(`  Status          : ${h.status}`);
        lines.push('');
      }
    }

    lines.push('------------------------------------------------------------');
    lines.push('2. MANIFESTO DOS PAINÉIS ESTRUTURAIS');
    lines.push('------------------------------------------------------------');
    for (const p of panels) {
      const adjacentHinges = hinges.filter((h) => h.parentPanelId === p.id || h.childPanelId === p.id);
      const adjacentPanels = adjacentHinges.map((h) => (h.parentPanelId === p.id ? h.childPanelId : h.parentPanelId));

      lines.push(`Panel ${p.id} ${p.id === rootPanelId ? '[ROOT]' : ''}`);
      lines.push(`  Outer Boundary : ${p.outerBoundary.edges.length} entidades, Área: ${p.outerBoundary.area.toFixed(2)} mm²`);
      lines.push(`  Inner Holes    : ${p.holes.length}`);
      lines.push(`  Area Liquida   : ${p.area.toFixed(2)} mm²`);
      lines.push(`  Adjacent Panels: [${adjacentPanels.join(', ') || 'NENHUM'}]`);
      lines.push(`  Hinges         : [${adjacentHinges.map((h) => h.id).join(', ') || 'NENHUMA'}]`);
      lines.push(`  Source Cuts    : ${p.cuts.length}`);
      lines.push(`  Source Creases : ${p.creases.length}`);
      lines.push(`  Source Arcs    : ${p.arcs.length}`);
      lines.push('');
    }

    if (cycles.length > 0) {
      lines.push('------------------------------------------------------------');
      lines.push('3. DIAGNÓSTICO DE CICLOS NO GRAFO (FOLD_GRAPH_CYCLE)');
      lines.push('------------------------------------------------------------');
      for (const cyc of cycles) {
        lines.push(`[${cyc.code}] ${cyc.cycleId}`);
        lines.push(`  Painéis Envolvidos: [${cyc.panelsInvolved.join(', ')}]`);
        lines.push(`  Vincos Envolvidos : [${cyc.creasesInvolved.join(', ')}]`);
        lines.push(`  Descrição         : ${cyc.description}`);
        lines.push('');
      }
    }

    if (disconnectedComponents.length > 0) {
      lines.push('------------------------------------------------------------');
      lines.push('4. DIAGNÓSTICO DE COMPONENTES DESCONEXOS (DISCONNECTED_FOLD_COMPONENT)');
      lines.push('------------------------------------------------------------');
      for (const dc of disconnectedComponents) {
        lines.push(`[${dc.code}] ${dc.componentId}`);
        lines.push(`  Painéis: [${dc.panelIds.join(', ')}]`);
        lines.push(`  Descrição: ${dc.description}`);
        lines.push('');
      }
    }

    if (orphanCreases.length > 0) {
      lines.push('------------------------------------------------------------');
      lines.push('5. VINCOS ÓRFÃOS / NÃO CONECTADOS');
      lines.push('------------------------------------------------------------');
      for (const oc of orphanCreases) {
        lines.push(`  Crease ${oc.creaseId}: (${oc.crease.x0.toFixed(2)}, ${oc.crease.y0.toFixed(2)}) -> (${oc.crease.x1.toFixed(2)}, ${oc.crease.y1.toFixed(2)}) — ${oc.reason}`);
      }
      lines.push('');
    }

    if (invalidHingeCreaseMappings.length > 0) {
      lines.push('------------------------------------------------------------');
      lines.push('6. DIAGNÓSTICO DE MAPEAMENTO INVÁLIDO DE CREASES (INVALID_HINGE_CREASE_MAPPING)');
      lines.push('------------------------------------------------------------');
      for (const im of invalidHingeCreaseMappings) {
        lines.push(`[${im.code}] Crease ${im.creaseId} (Painel Pai: ${im.parentPanelId}, Filho: ${im.childPanelId || 'N/A'})`);
        lines.push(`  Descrição: ${im.description}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
