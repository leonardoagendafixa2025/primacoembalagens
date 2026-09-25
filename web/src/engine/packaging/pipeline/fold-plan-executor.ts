// ============================================================================
// FoldPlanExecutor — substitui o UnifiedRigidFoldingSolver
// ----------------------------------------------------------------------------
// Executor SEQUENCIAL de FoldPlanV2. Em vez de resolver constraints globais
// simultâneas a cada frame (relaxação iterativa), apenas avança passo a passo:
//
//   progress ∈ [0,1]  →  (stepIdx, localT)
//     - steps anteriores: peso = 1 (operação totalmente aplicada)
//     - step atual: peso = ease(localT)
//     - steps posteriores: peso = 0
//
// A hierarquia Three.js (montada pelo FoldPlayer com panel→pivot→panel) já
// garante a composição de transformações da árvore — substituindo qualquer
// "global constraint solve" por propagação nativa de matrixWorld.
//
// V1 só executa operações "folding"; outras operações (face_set_parent,
// movement, hiding, follower_align) ficam tipadas na API mas são no-ops até
// que o FoldPlanBuilder as emita conforme dielines reais exigirem.
// ============================================================================

import type { FoldPlayer } from "./fold-player";
import type { FoldPlanV2, FoldOperation } from "./types";

const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export interface FoldPlanExecutorStatus {
  totalSteps: number;
  activeStep: number;
  activeStepProgress: number;
  activeFaceIds: string[];
}

export interface FoldPlanExecutor {
  readonly plan: FoldPlanV2;
  readonly stepCount: number;
  /** Aplica `progress ∈ [0,1]` ao player respeitando a ordem sequencial. */
  apply: (
    player: FoldPlayer,
    progress: number,
    manualOverrides?: Record<string, number>,
  ) => FoldPlanExecutorStatus;
  /** Aplica em sentido reverso (1 → 0) — simétrico por construção. */
  rewind: (
    player: FoldPlayer,
    progress: number,
    manualOverrides?: Record<string, number>,
  ) => FoldPlanExecutorStatus;
  status: (progress: number) => FoldPlanExecutorStatus;
}

function resolveActiveStep(progress: number, stepCount: number): { idx: number; localT: number } {
  if (stepCount <= 0) return { idx: 0, localT: 0 };
  const p = clamp01(progress);
  if (p >= 1) return { idx: stepCount - 1, localT: 1 };
  const g = p * stepCount;
  const idx = Math.min(stepCount - 1, Math.floor(g));
  const localT = clamp01(g - idx);
  return { idx, localT };
}

function buildWeights(plan: FoldPlanV2, progress: number): Record<string, number> {
  const weights: Record<string, number> = {};
  const { idx: activeIdx, localT } = resolveActiveStep(progress, plan.steps.length);
  const eased = easeInOutCubic(localT);

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    let w: number;
    if (i < activeIdx) w = 1;
    else if (i === activeIdx) w = eased;
    else w = 0;

    for (const op of step.operations) {
      if (op.type === "folding") weights[op.faceId] = w;
      // Outras operações (face_set_parent, movement, hiding, follower_align)
      // não controlam pivôs do player — serão tratadas como mutações de cena
      // discretas em versões futuras do executor.
    }
  }
  return weights;
}

function statusFor(plan: FoldPlanV2, progress: number): FoldPlanExecutorStatus {
  const { idx, localT } = resolveActiveStep(progress, plan.steps.length);
  const activeFaceIds = plan.steps[idx]?.operations
    .filter((op): op is Extract<FoldOperation, { type: "folding" }> => op.type === "folding")
    .map((op) => op.faceId) ?? [];
  return {
    totalSteps: plan.steps.length,
    activeStep: idx,
    activeStepProgress: localT,
    activeFaceIds,
  };
}

export function buildFoldPlanExecutor(plan: FoldPlanV2): FoldPlanExecutor {
  const apply = (
    player: FoldPlayer,
    progress: number,
    manualOverrides: Record<string, number> = {},
  ): FoldPlanExecutorStatus => {
    const weights = buildWeights(plan, progress);
    for (const [pid, v] of Object.entries(manualOverrides)) {
      // Overrides manuais podem ultrapassar [0..1] para permitir dobras maiores
      // que o alvo (>90°) ou negativas (direção oposta).
      weights[pid] = v;
    }

    // FoldPlayer.apply(t=0, stepOverrides) → cada pivô usa o override por
    // panelId (peso 0..1) multiplicado pelo targetAngle já definido no rig.
    player.apply(0, weights);
    return statusFor(plan, progress);
  };

  const rewind = (
    player: FoldPlayer,
    progress: number,
    manualOverrides: Record<string, number> = {},
  ): FoldPlanExecutorStatus => apply(player, 1 - clamp01(progress), manualOverrides);

  return {
    plan,
    stepCount: plan.steps.length,
    apply,
    rewind,
    status: (progress: number) => statusFor(plan, progress),
  };
}
