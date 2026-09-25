// ============================================================================
// FoldPlanBuilder — gera FoldPlanV2 (operações tipadas, steps sequenciais)
// ----------------------------------------------------------------------------
// Entrada: model3D (autoridade única da topologia de dobra — CAD spanning
// tree role-aware) + sanitizedRefined.treeHingeByChild (hinges 2D válidos).
//
// Saída: FoldPlanV2 = lista de FoldStepV2 (executados em sequência); cada
// step contém operações que rodam em paralelo (mesma profundidade BFS).
//
// V1 emite apenas operações "folding" — uma por painel não-root. Closure
// edges (cycle constraints) ficam preparadas para virar "face_set_parent"
// numa segunda versão, conforme dielines reais exigirem.
// ============================================================================

import type { PackageStructuralModel3D } from "../adapter-3d/types";
import type { FoldPlanV2, FoldStepV2, FoldingOp } from "./types";

const DEFAULT_FOLD_ANGLE_DEG = 90;

export function buildFoldPlanV2(model3D: PackageStructuralModel3D): FoldPlanV2 {
  const tree = model3D.foldTree;
  const plan = model3D.effectivePlan;
  const treeHingeByChild = model3D.sanitizedRefined.treeHingeByChild;

  // Calcula profundidade BFS para agrupar operações por nível.
  const depthOf = new Map<string, number>();
  depthOf.set(tree.rootPanelId, 0);
  for (const id of tree.topoOrder) {
    if (id === tree.rootPanelId) continue;
    const parent = tree.parentOf[id];
    const pd = parent != null ? depthOf.get(parent) ?? 0 : 0;
    depthOf.set(id, pd + 1);
  }

  // Mapa rápido panelId → step do plan original (para extrair targetAngle/sign).
  const planStepByPanel = new Map(plan.steps.map((s) => [s.panelId, s]));

  // Agrupa ops por profundidade.
  const byDepth = new Map<number, FoldingOp[]>();

  for (const childId of Object.keys(tree.parentOf)) {
    const parentId = tree.parentOf[childId];
    const hinge = treeHingeByChild[childId];
    if (!parentId || !hinge) continue;

    const planStep = planStepByPanel.get(childId);
    const angleRad = planStep ? planStep.targetAngle : Math.PI / 2;
    const sign = planStep?.sign ?? 1;
    const angleDeg = (angleRad * 180) / Math.PI * sign;

    const op: FoldingOp = {
      type: "folding",
      faceId: childId,
      parentId,
      hingeAxisId: hinge.axisId,
      // Eixo no espaço local do painel (2D, z=0). O executor mapeia para
      // o eixo cardinal certo via FoldPlayer.pivot.axis já calculado.
      rotateAxis: "z",
      from: 0,
      to: angleDeg,
      x1: hinge.origin.x,
      y1: hinge.origin.y,
    };

    const d = depthOf.get(childId) ?? 1;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(op);
  }

  // Ordena depths e monta steps sequenciais.
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const steps: FoldStepV2[] = depths.map((d, idx) => ({
    index: idx,
    depth: d,
    operations: byDepth.get(d)!.sort((a, b) => a.faceId.localeCompare(b.faceId)),
  }));

  return {
    rootPanelId: tree.rootPanelId,
    steps,
  };
}
