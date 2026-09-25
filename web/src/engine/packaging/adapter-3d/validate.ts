// ============================================================================
// validateStructural3DModel — auditoria automática (erros A–H do prompt).
// ============================================================================

import type {
  Hinge3D,
  PackageStructuralModel3D,
  PanelRole3D,
  StructuralPanel3D,
  ValidationIssue,
  ValidationReport,
} from "./types";

const FLAP_ROLES: PanelRole3D[] = [
  "flap",
  "top-flap",
  "bottom-flap",
  "dust-flap",
  "lock-flap",
  "tuck-flap",
];

export function validateStructural3DModel(
  panels: StructuralPanel3D[],
  hinges: Hinge3D[],
  graph: PackageStructuralModel3D["foldGraph3D"],
  source2DPanelCount: number,
  source2DHingeCount: number,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const hingesByPanel = new Map<string, Hinge3D[]>();
  for (const h of hinges) {
    if (!hingesByPanel.has(h.panelA)) hingesByPanel.set(h.panelA, []);
    if (!hingesByPanel.has(h.panelB)) hingesByPanel.set(h.panelB, []);
    hingesByPanel.get(h.panelA)!.push(h);
    hingesByPanel.get(h.panelB)!.push(h);
  }

  // A. Body sem hinge
  for (const p of panels) {
    if ((p.role === "body" || p.role === "body-side") && p.id !== graph.rootPanelId) {
      const n = hingesByPanel.get(p.id)?.length ?? 0;
      if (n === 0) {
        issues.push({
          code: "BODY_PANEL_WITHOUT_HINGE",
          message: `Painel ${p.id} (${p.role}) não tem hinge válida.`,
          panelIds: [p.id],
        });
      }
    }
  }

  // B. Glue/seam desconectado do corpo
  for (const p of panels) {
    if (p.role !== "glue-flap" && p.role !== "seam") continue;
    const adj = hingesByPanel.get(p.id) ?? [];
    const hasBodyLink = adj.some((h) => {
      const otherId = h.panelA === p.id ? h.panelB : h.panelA;
      const other = panels.find((q) => q.id === otherId);
      return other && (other.role === "body" || other.role === "body-side");
    });
    if (!hasBodyLink) {
      issues.push({
        code: "GLUE_FLAP_DISCONNECTED",
        message: `Glue/seam flap ${p.id} sem conexão ao corpo.`,
        panelIds: [p.id],
      });
    }
  }

  // C. Flap sem parent coerente
  for (const p of panels) {
    if (!FLAP_ROLES.includes(p.role)) continue;
    const adj = hingesByPanel.get(p.id) ?? [];
    if (adj.length === 0) {
      issues.push({
        code: "FLAP_WITHOUT_BODY_PARENT",
        message: `Flap ${p.id} sem hinge.`,
        panelIds: [p.id],
      });
    }
  }

  // D. Main body fragmentado
  const bodyComponentCount = graph.connectedComponents.filter((cc) =>
    cc.some((id) => graph.mainBodyNodes.includes(id)),
  ).length;
  if (bodyComponentCount > 1) {
    issues.push({
      code: "MAIN_BODY_FRAGMENTED",
      message: `Corpo principal em ${bodyComponentCount} componentes.`,
    });
  }

  // E. Hinges 3D bem abaixo do esperado
  if (source2DHingeCount > 0 && hinges.length < Math.max(1, source2DHingeCount * 0.3)) {
    issues.push({
      code: "HINGE_COUNT_BELOW_2D",
      message: `Apenas ${hinges.length} hinges 3D para ${source2DHingeCount} eixos 2D.`,
    });
  }

  // F. Closure ausentes em estrutura que deveria fechar (heurística leve:
  // se backbone tem 3+ painéis e nenhuma closureEdge, sinaliza).
  // RSC/tubo com aba de cola fecha por seam adesivo, não por hinge geométrica
  // adicional. Nesses casos não há cycle edge físico na faca e isso não é erro.
  if (graph.mainBodyNodes.length >= 3 && graph.closureEdges.length === 0 && graph.seamNodes.length === 0) {
    issues.push({
      code: "CLOSURE_EDGES_MISSING",
      message: "Corpo com 3+ faces e nenhuma closureEdge detectada.",
    });
  }

  // G. Fragmento como structural (heurística: painel com área < 1% do maior
  // E papel != aux/flap → suspeito).
  const maxArea = Math.max(...panels.map((p) => p.area));
  for (const p of panels) {
    if (p.area < maxArea * 0.01 && (p.role === "body" || p.role === "body-side")) {
      issues.push({
        code: "FRAGMENT_AS_STRUCTURAL",
        message: `Painel ${p.id} muito pequeno (${p.area.toFixed(1)}mm²) marcado como body.`,
        panelIds: [p.id],
      });
    }
  }

  // H. Tree correta, mas grafo real perdido
  if (graph.treeEdges.length > 0 && graph.supportEdges.length + graph.closureEdges.length === 0) {
    const expectedExtras = source2DHingeCount - graph.treeEdges.length;
    if (expectedExtras > 2) {
      issues.push({
        code: "GRAPH_MUTILATED_BY_TREE",
        message: `Tree tem ${graph.treeEdges.length} arestas; ${expectedExtras} extras 2D não viraram support/closure.`,
      });
    }
  }

  void source2DPanelCount;
  return { ok: issues.length === 0, issues };
}
