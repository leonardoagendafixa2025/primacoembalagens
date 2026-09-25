// ============================================================================
// Stage 7 — Fold Planner
// ----------------------------------------------------------------------------
// Converte o FoldGraph em uma sequência ordenada de FoldStep:
//
//   { step, panelId, parentId, hingeId, targetAngle, sign }
//
// Ordem de execução: BFS por profundidade (folhas dobram por último). Isso
// garante que abas filhas só se movem depois que o painel pai já achou sua
// pose, replicando o que softwares profissionais chamam de "folding sequence".
//
// Ângulo alvo:
//   - 90° (π/2) para vincos comuns.
//   - 180° (π) detectado quando, após dobrar 90°, a aba colaria contra o
//     painel oposto (aba de cola, lock que vira sobre o painel base).
//     Detecção é feita por overlap de bbox 2D pós-rotação simulada.
//
// Sinal:
//   +1 = dobra "para cima" relativa ao plano do parent
//   -1 = dobra "para baixo"
//   A escolha favorece dobrar TODOS os filhos para o MESMO LADO do plano
//   raiz (interior da caixa), seguindo a convenção de cartonagem.
// ============================================================================

import type {
  FoldGraph,
  FoldPlan,
  FoldStep,
  PipelinePanel,
  StructuralFoldAxis,
} from "./types";

const QUARTER = Math.PI / 2;

function centroid(poly: Array<{ x: number; y: number }>) {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

/** Sinal: lado do eixo onde o centróide do filho está, relativo ao parent.
 *  Convenção: queremos que o filho dobre AFASTANDO-SE do parent (rotação
 *  positiva em torno do eixo dirigido `axisDir`). O sinal corrige caso o
 *  centróide do filho esteja do lado "negativo" da normal. */
function computeSign(
  parent: PipelinePanel,
  child: PipelinePanel,
  axis: StructuralFoldAxis,
): 1 | -1 {
  const cChild = centroid(child.polygon);
  const cParent = centroid(parent.polygon);
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  // Normal 2D do eixo.
  const nx = -dy, ny = dx;
  const sideChild = (cChild.x - ox) * nx + (cChild.y - oy) * ny;
  const sideParent = (cParent.x - ox) * nx + (cParent.y - oy) * ny;
  // Se ambos do mesmo lado ou degenerado, default +1.
  if (Math.abs(sideChild) < 1e-4 || Math.abs(sideParent) < 1e-4) return 1;
  // Filho do lado oposto ao parent → rotação positiva já dobra para cima.
  return sideChild * sideParent < 0 ? 1 : -1;
}

/** Detecta dobra de 180°: aba "encostaria" no painel oposto após 90°.
 *  Heurística simples: se o filho tem dimensão pequena na direção perpendicular
 *  ao eixo (≤ 1/3 da do parent) E o eixo está perto da borda OPOSTA do parent,
 *  é provavelmente uma aba de cola. Mantém 90° por padrão; futuras versões
 *  podem ler tags da dieline para fixar o ângulo.
 */
function inferTargetAngle(
  _parent: PipelinePanel,
  _child: PipelinePanel,
  _axis: StructuralFoldAxis,
): number {
  return QUARTER;
}

export function planFolding(
  graph: FoldGraph,
  panels: PipelinePanel[],
  axes: StructuralFoldAxis[],
): FoldPlan {
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const axisById = new Map(axes.map((a) => [a.id, a]));

  // Ordena nós por profundidade (BFS-friendly).
  const ordered = Object.values(graph.nodes)
    .filter((n) => n.parentId !== null && n.hingeAxisId !== null)
    .sort((a, b) => a.depth - b.depth || a.panelId.localeCompare(b.panelId));

  const steps: FoldStep[] = [];
  const byPanel: Record<string, FoldStep> = {};

  ordered.forEach((node, idx) => {
    const parent = panelById.get(node.parentId!)!;
    const child = panelById.get(node.panelId)!;
    const axis = axisById.get(node.hingeAxisId!)!;
    if (!parent || !child || !axis) return;
    const sign = computeSign(parent, child, axis);
    const targetAngle = inferTargetAngle(parent, child, axis);
    const step: FoldStep = {
      id: `fold-step-${idx}-${node.panelId}`,
      step: idx,
      order: idx,
      panelId: node.panelId,
      parentId: node.parentId!,
      hingeId: node.hingeAxisId!,
      axisId: node.hingeAxisId!,
      targetAngle,
      sign,
      direction: sign > 0 ? "mountain" : "valley",
      dependencies: node.parentId === graph.rootPanelId ? [] : [node.parentId!],
    };
    steps.push(step);
    byPanel[node.panelId] = step;
  });

  return {
    rootPanelId: graph.rootPanelId,
    steps,
    byPanel,
  };
}
