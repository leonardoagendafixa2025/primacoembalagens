// ============================================================================
// Stage 8 — Fold Player (Three.js executor)
// ----------------------------------------------------------------------------
// Consome um `PipelineResult` (especificamente `panels` + `foldAxes` + `plan`)
// e produz uma cadeia de THREE.Group prontos para serem animados.
//
// Este módulo NÃO descobre painéis, NÃO descobre vincos, NÃO faz heurística
// nenhuma. Ele apenas:
//
//   1. Cria um THREE.Group por painel.
//   2. Conecta cada child ao seu parent via um Group "pivot" posicionado no
//      ponto inicial do StructuralFoldAxis, com eixo de rotação igual à
//      direção do eixo.
//   3. Aplica `t ∈ [0..1]` interpolando linearmente entre 0 rad e o
//      `targetAngle * sign` definido no FoldStep.
//
// O resultado é uma "pivot table" que pode ser anexada a qualquer parent
// scene-graph e animada por slider/play/step.
// ============================================================================

import * as THREE from "three";
import type { FoldPlan, PipelinePanel, StructuralFoldAxis } from "./types";

function pointAxisDist(p: { x: number; y: number }, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  const nx = -dy, ny = dx;
  return Math.abs((p.x - ox) * nx + (p.y - oy) * ny);
}

function projOnAxis(p: { x: number; y: number }, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x, oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x, dy = axis.axisLine.direction.y;
  return (p.x - ox) * dx + (p.y - oy) * dy;
}

function axisSpanRange(axis: StructuralFoldAxis): [number, number] {
  const ta = projOnAxis(axis.span.a, axis);
  const tb = projOnAxis(axis.span.b, axis);
  return ta <= tb ? [ta, tb] : [tb, ta];
}

/**
 * Runtime 3D safety check: a hinge is allowed to rotate a panel only when the
 * hinge axis is actually on that panel's boundary. This does NOT alter the 2D
 * graph; it only prevents unsafe 3D constraints from exploding the scene when a
 * rescued/fallback fold step points to a geometric axis that does not touch one
 * side of the pair.
 */
function panelTouchesAxis(panel: PipelinePanel, axis: StructuralFoldAxis): boolean {
  const pointInPolygon = (pt: { x: number; y: number }, poly: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const ex = xj - xi;
      const ey = yj - yi;
      const el = Math.hypot(ex, ey);
      const onEdge = el > 1e-6 && Math.abs((pt.x - xi) * ey - (pt.y - yi) * ex) / el <= 0.5;
      if (onEdge) return true;
      const intersect = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const polygonTouchesAxis = (poly: Array<{ x: number; y: number }>) => {
    if (poly.length < 2) return false;
    const [sLo, sHi] = axisSpanRange(axis);
    const perpTolMm = 1.5;
    const minOverlapMm = 0.35;

    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      if (pointAxisDist(p, axis) > perpTolMm || pointAxisDist(q, axis) > perpTolMm) continue;
      const tp = projOnAxis(p, axis);
      const tq = projOnAxis(q, axis);
      const lo = Math.min(tp, tq);
      const hi = Math.max(tp, tq);
      const ovLo = Math.max(lo, sLo);
      const ovHi = Math.min(hi, sHi);
      if (ovHi - ovLo >= minOverlapMm) return true;
    }
    return false;
  };

  if (polygonTouchesAxis(panel.polygon)) return true;
  for (const hole of panel.holes ?? []) {
    if (polygonTouchesAxis(hole)) return true;
  }
  // Hinges recovered from CAD files can be embedded inside the parent face:
  // the child flap has the crease as boundary, while the parent face remains a
  // continuous polygon. That is still a valid fold line and must not be treated
  // as an unsafe cut just because the parent boundary does not repeat it.
  if (pointInPolygon(axis.span.a, panel.polygon) && pointInPolygon(axis.span.b, panel.polygon)) return true;
  return false;
}

export interface PlayerPivot {
  panelId: string;
  parentId: string;
  hingeId: string;
  /** O Group pivot (filho do parent panel-group, contém o child panel-group). */
  pivot: THREE.Group;
  /** Eixo de rotação normalizado em coordenadas locais 2D (z=0). */
  axis: THREE.Vector3;
  /** Ângulo final (rad) já com sinal aplicado. */
  targetAngle: number;
}

export interface FoldPlayer {
  /** Group raiz contendo o painel root e toda a cadeia. */
  root: THREE.Group;
  /** Mapa panelId → Group do painel (use para anexar meshes externos). */
  panelGroups: Map<string, THREE.Group>;
  pivots: PlayerPivot[];
  /** Aplica progresso t ∈ [0..1] uniforme em todos os pivôs.
   *  Use `stepOverrides` para alterar t de um step específico (panelId → 0..1). */
  apply: (t: number, stepOverrides?: Record<string, number>) => void;
  dispose: () => void;
}

export function buildFoldPlayer(
  panels: PipelinePanel[],
  axes: StructuralFoldAxis[],
  plan: FoldPlan,
): FoldPlayer {
  const panelById = new Map(panels.map((p) => [p.id, p]));
  const axisById = new Map(axes.map((a) => [a.id, a]));

  const root = new THREE.Group();
  root.name = "fold-player-root";

  const panelGroups = new Map<string, THREE.Group>();
  const pivots: PlayerPivot[] = [];

  const createPanelGroup = (panelId: string) => {
    const g = new THREE.Group();
    g.name = `panel:${panelId}`;
    g.userData.panelId = panelId;
    panelGroups.set(panelId, g);
    return g;
  };

  const rootId = plan.rootPanelId || panels[0]?.id || "";

  // Cria o group do painel root.
  if (rootId) root.add(createPanelGroup(rootId));

  // Etapa profissional de rigging: o scene-graph precisa ser montado a partir
  // do plano EFETIVO que será animado. Depois do Structural2DTo3DAdapter, esse
  // plano pode diferir do FoldPlan 2D original; por isso aceitamos metadata
  // opcional em plan.steps (sem mudar o contrato 2D) para preservar o pipeline
  // 2D e ainda permitir um rig 3D corrigido.
  const effectiveSteps = [...plan.steps].sort((a, b) => a.step - b.step || a.panelId.localeCompare(b.panelId));

  // Pré-avalia validade geométrica de cada step. Se a maioria dos steps
  // falharia (tolerâncias incompatíveis com a unidade do dieline), DESLIGAMOS
  // o filtro para não congelar a animação inteira — o stabilizer cuida do
  // drift residual no 3D.
  const stepValidity = effectiveSteps.map((step) => {
    const parentPanel = panelById.get(step.parentId);
    const panel = panelById.get(step.panelId);
    const axis = axisById.get(step.hingeId);
    if (!parentPanel || !panel || !axis) return false;
    return panelTouchesAxis(parentPanel, axis) && panelTouchesAxis(panel, axis);
  });
  const validCount = stepValidity.filter(Boolean).length;
  const enforceSafety = effectiveSteps.length > 0 && validCount / effectiveSteps.length >= 0.5;

  // Cria pivots na ordem do plan (parent garantidamente já existe).
  for (let i = 0; i < effectiveSteps.length; i++) {
    const step = effectiveSteps[i];
    const parentGroup = panelGroups.get(step.parentId);
    const panel = panelById.get(step.panelId);
    const axis = axisById.get(step.hingeId);
    if (!parentGroup || !panel || !axis) continue;
    if (enforceSafety && !stepValidity[i]) continue;

    const pivot = new THREE.Group();
    pivot.name = `pivot:${step.panelId}`;
    pivot.position.set(axis.span.a.x, axis.span.a.y, 0);
    parentGroup.add(pivot);

    const panelGroup = createPanelGroup(step.panelId);
    panelGroup.position.set(-axis.span.a.x, -axis.span.a.y, 0);
    pivot.add(panelGroup);

    const dirX = axis.span.b.x - axis.span.a.x;
    const dirY = axis.span.b.y - axis.span.a.y;
    const axisVec = new THREE.Vector3(dirX, dirY, 0).normalize();

    pivots.push({
      panelId: step.panelId,
      parentId: step.parentId,
      hingeId: step.hingeId,
      pivot,
      axis: axisVec,
      // Sinal invertido: a face externa da extrusão passou a ser a "de cima"
      // (z=thickness), então as dobras devem acontecer para o lado oposto para
      // que essa face fique voltada para fora da caixa fechada.
      targetAngle: -step.targetAngle * step.sign,

    });
  }

  // Rigid global system: every panel MUST live under player.root. Panels that
  // have no safe hinge (orphans, rejected unsafe rescue steps, islands) are not
  // left as independent meshes outside the folding system; they become rigid
  // children of the root panel group and therefore cannot drift/explode.
  const rigidRoot = rootId ? (panelGroups.get(rootId) ?? root) : root;
  for (const panel of panels) {
    if (panelGroups.has(panel.id)) continue;
    const panelGroup = createPanelGroup(panel.id);
    panelGroup.name = `panel:${panel.id}:rigid-root`;
    panelGroup.userData.panelId = panel.id;
    panelGroup.userData.rigidRootAttached = true;
    rigidRoot.add(panelGroup);
  }

  const apply = (t: number, stepOverrides: Record<string, number> = {}) => {
    const clamped = Math.max(0, Math.min(1, t));
    for (const p of pivots) {
      const raw = stepOverrides[p.panelId];
      // Overrides manuais podem passar de 1 (ângulo maior que o alvo) ou ser
      // negativos (dobra na direção oposta). Só o progresso automático é
      // clampado em [0..1]; overrides manuais passam livres.
      const k = raw !== undefined ? raw : clamped;
      const angle = p.targetAngle * k;
      p.pivot.quaternion.setFromAxisAngle(p.axis, angle);
    }
  };


  const dispose = () => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else if (mat) mat.dispose();
    });
  };

  // Aplica posição inicial (t=0, tudo planificado).
  apply(0);

  return { root, panelGroups, pivots, apply, dispose };
}

/** Helper: dado o índice do step e o número total, devolve `t` global que
 *  deixa exatamente `stepIdx` steps completos (1.0) e o restante em 0.
 *  Útil para botões "Próximo passo" / "Passo anterior". */
export function progressForStep(stepIdx: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.max(0, Math.min(1, (stepIdx + 1) / totalSteps));
}
