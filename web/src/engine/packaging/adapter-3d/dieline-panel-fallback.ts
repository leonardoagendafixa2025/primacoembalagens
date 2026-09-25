// ============================================================================
// DielinePanels3DAdapter — fallback 3D-only para facas já panelizadas.
// ----------------------------------------------------------------------------
// Diagnóstico do bug persistente: para templates paramétricos como FEFCO 0201,
// o kernel CAD da pipeline estrutural pode enxergar a faca inteira como uma
// única face quando os vincos cruzam cortes/contornos sem subdividir o grafo
// planar. Resultado: `PipelineResult.panels = 1`, `plan.steps = 0`, e o 3D
// fica completamente imóvel.
//
// Esta camada NÃO altera o pipeline 2D. Ela só roda no construtor 3D quando a
// saída estrutural está colapsada, usando os painéis já corretos do `Dieline`
// como fonte geométrica autoritativa para montar um modelo 3D dobrável.
// ============================================================================

import type { Dieline, Pt, Segment } from "../dieline-types";
import { buildFoldGraph } from "../pipeline/fold-graph-builder";
import { planFolding } from "../pipeline/fold-planner";
import { runFoldConstraintEngine } from "../pipeline/fold-constraint-engine";
import { sanitizeHinges } from "../pipeline/hinge-sanitizer";
import type {
  ClassifiedEdge,
  PipelinePanel,
  PipelineResult,
  StructuralFoldAxis,
  StructuralKind,
} from "../pipeline/types";
import { buildStructural2DTo3DModel } from "./adapter";

const AXIS_PERP_TOL_MM = 1.5;
const MIN_AXIS_OVERLAP_MM = 0.35;

function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(a) / 2;
}

function polygonBBox(poly: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function normalizeDirection(dx: number, dy: number): Pt | null {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  let x = dx / len;
  let y = dy / len;
  if (x < -1e-9 || (Math.abs(x) <= 1e-9 && y < 0)) {
    x = -x;
    y = -y;
  }
  return { x, y };
}

function perpendicularFoot(a: Pt, dir: Pt): Pt {
  const t = -(a.x * dir.x + a.y * dir.y);
  return { x: a.x + dir.x * t, y: a.y + dir.y * t };
}

function axisBucketKey(kind: Segment["kind"], a: Pt, b: Pt): string | null {
  const dir = normalizeDirection(b.x - a.x, b.y - a.y);
  if (!dir) return null;
  const foot = perpendicularFoot(a, dir);
  const angle = Math.atan2(dir.y, dir.x);
  return [
    kind,
    Math.round(angle / 0.01),
    Math.round(foot.x / AXIS_PERP_TOL_MM),
    Math.round(foot.y / AXIS_PERP_TOL_MM),
  ].join("|");
}

function projectOnAxis(p: Pt, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x;
  const oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x;
  const dy = axis.axisLine.direction.y;
  return (p.x - ox) * dx + (p.y - oy) * dy;
}

function signedPerpToAxis(p: Pt, axis: StructuralFoldAxis): number {
  const ox = axis.axisLine.origin.x;
  const oy = axis.axisLine.origin.y;
  const dx = axis.axisLine.direction.x;
  const dy = axis.axisLine.direction.y;
  return (p.x - ox) * -dy + (p.y - oy) * dx;
}

function axisSpanRange(axis: StructuralFoldAxis): [number, number] {
  const ta = projectOnAxis(axis.span.a, axis);
  const tb = projectOnAxis(axis.span.b, axis);
  return ta <= tb ? [ta, tb] : [tb, ta];
}

function edgeTouchesAxis(a: Pt, b: Pt, axis: StructuralFoldAxis): boolean {
  if (Math.abs(signedPerpToAxis(a, axis)) > AXIS_PERP_TOL_MM) return false;
  if (Math.abs(signedPerpToAxis(b, axis)) > AXIS_PERP_TOL_MM) return false;
  const ta = projectOnAxis(a, axis);
  const tb = projectOnAxis(b, axis);
  const lo = Math.min(ta, tb);
  const hi = Math.max(ta, tb);
  const [sLo, sHi] = axisSpanRange(axis);
  return Math.min(hi, sHi) - Math.max(lo, sLo) >= MIN_AXIS_OVERLAP_MM;
}

function toPipelinePanels(dieline: Dieline): PipelinePanel[] {
  const seen = new Set<string>();
  return dieline.panels
    .filter((panel) => panel.polygon.length >= 3)
    .map((panel, index) => {
      const baseId = panel.id || `dieline-panel-${index}`;
      const id = seen.has(baseId) ? `${baseId}-${index}` : baseId;
      seen.add(id);
      return {
        id,
        label: panel.label || `Painel ${index + 1}`,
        faceId: index,
        polygon: panel.polygon,
        holes: panel.holes ?? [],
        foldAxisIds: [],
        bbox: polygonBBox(panel.polygon),
        area: polygonArea(panel.polygon),
      };
    });
}

function buildAxesFromDieline(dieline: Dieline): StructuralFoldAxis[] {
  interface Bucket {
    type: "crease" | "perf";
    dir: Pt;
    origin: Pt;
    fragments: ClassifiedEdge[];
  }

  const buckets = new Map<string, Bucket>();
  let edgeId = 0;
  let vertexId = 0;

  for (let si = 0; si < dieline.segments.length; si++) {
    const segment = dieline.segments[si];
    if (segment.kind !== "crease" && segment.kind !== "perf") continue;
    const points = segment.points;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dir = normalizeDirection(b.x - a.x, b.y - a.y);
      const key = axisBucketKey(segment.kind, a, b);
      if (!dir || !key) continue;
      const origin = perpendicularFoot(a, dir);
      const kindFinal = segment.kind as StructuralKind;
      const edge: ClassifiedEdge = {
        id: edgeId++,
        a: { id: vertexId++, x: a.x, y: a.y },
        b: { id: vertexId++, x: b.x, y: b.y },
        kindRaw: segment.kind,
        kindFinal,
        roleFinal: "fold_axis_candidate",
        roleReasons: ["dieline fallback preserved crease/perf as candidate only"],
        kindCandidates: [segment.kind],
        length: Math.hypot(b.x - a.x, b.y - a.y),
        sourceSegIdx: si,
      };
      const existing = buckets.get(key);
      if (existing) {
        existing.fragments.push(edge);
      } else {
        buckets.set(key, { type: segment.kind, dir, origin, fragments: [edge] });
      }
    }
  }

  const axes: StructuralFoldAxis[] = [];
  let axisCounter = 0;
  for (const bucket of buckets.values()) {
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const f of bucket.fragments) {
      for (const p of [f.a, f.b]) {
        const t = (p.x - bucket.origin.x) * bucket.dir.x + (p.y - bucket.origin.y) * bucket.dir.y;
        tMin = Math.min(tMin, t);
        tMax = Math.max(tMax, t);
      }
    }
    const length = tMax - tMin;
    if (!Number.isFinite(length) || length < MIN_AXIS_OVERLAP_MM) continue;
    axes.push({
      id: `dieline-axis-${axisCounter++}`,
      axisLine: { origin: bucket.origin, direction: bucket.dir },
      span: {
        a: { x: bucket.origin.x + bucket.dir.x * tMin, y: bucket.origin.y + bucket.dir.y * tMin },
        b: { x: bucket.origin.x + bucket.dir.x * tMax, y: bucket.origin.y + bucket.dir.y * tMax },
      },
      fragments: bucket.fragments,
      type: bucket.type,
      length,
      connectedFaceIds: [],
    });
  }
  return axes;
}

function attachAxesToPanels(panels: PipelinePanel[], axes: StructuralFoldAxis[]): void {
  for (const axis of axes) {
    const connected = new Set<number>();
    for (const panel of panels) {
      const poly = panel.polygon;
      for (let i = 0; i < poly.length; i++) {
        if (!edgeTouchesAxis(poly[i], poly[(i + 1) % poly.length], axis)) continue;
        connected.add(panel.faceId);
        if (!panel.foldAxisIds.includes(axis.id)) panel.foldAxisIds.push(axis.id);
        break;
      }
    }
    axis.connectedFaceIds = [...connected].sort((a, b) => a - b);
  }
}

export function shouldUseDielinePanelsFor3D(pipeline: PipelineResult, dieline: Dieline): boolean {
  const hasDielinePanels = (dieline.panels?.length ?? 0) > 1;
  const hasFoldLines = dieline.segments.some((s) => s.kind === "crease" || s.kind === "perf");
  const collapsed3D = pipeline.panels.length <= 1 || pipeline.model3D.effectivePlan.steps.length === 0;
  const nativeMainComponent = pipeline.model3D.foldGraph3D.connectedComponents[0]?.length ?? 0;
  const nativeGraphIsFoldable =
    pipeline.panels.length > 1 &&
    nativeMainComponent >= pipeline.panels.length &&
    pipeline.model3D.effectivePlan.steps.length >= pipeline.panels.length - 1;
  const hasMergedPanel = pipeline.panels.some((panel) => {
    const bboxArea = Math.max(1, (panel.bbox.maxX - panel.bbox.minX) * (panel.bbox.maxY - panel.bbox.minY));
    return bboxArea / Math.max(1, panel.area) > 2.2;
  });
  const panelizationLooksMerged = !nativeGraphIsFoldable && pipeline.panels.length < dieline.panels.length && hasMergedPanel;
  // Só troca para os painéis já panelizados quando o 3D principal realmente
  // colapsou OU quando o kernel juntou ilhas num painel auto-intersectado
  // (bbox muito maior que a área real). Um PDF pode ter mais faces 2D do que
  // painéis dobráveis reais (furos/slots/recortes internos); por isso a
  // diferença de contagem sozinha NÃO dispara fallback.
  return hasDielinePanels && hasFoldLines && (collapsed3D || panelizationLooksMerged);
}

export function buildDielinePanels3DPipeline(
  dieline: Dieline,
  base: PipelineResult,
  rootPanelId?: string,
): PipelineResult {
  const panels = toPipelinePanels(dieline);
  const axes = buildAxesFromDieline(dieline);
  attachAxesToPanels(panels, axes);

  const graph = buildFoldGraph(panels, axes, rootPanelId);
  const planned = planFolding(graph, panels, axes);
  const constraints = runFoldConstraintEngine(panels, axes, graph, planned, rootPanelId);
  const sanitized = sanitizeHinges(panels, axes, constraints.graph, constraints.plan, { rootPanelId });
  const model3D = buildStructural2DTo3DModel({
    panels,
    foldAxes: axes,
    plan: constraints.plan,
    sanitized,
  });

  return {
    ...base,
    topology: {
      ...base.topology,
      faces: panels.map((panel) => ({
        id: panel.faceId,
        outer: {
          id: panel.faceId,
          edgeIds: [],
          points: panel.polygon,
          signedArea: polygonArea(panel.polygon),
          bbox: panel.bbox,
          edgeKindCounts: { cut: panel.polygon.length, crease: 0, perf: 0 },
          closed: true,
          isHole: false,
          parentId: null,
          cutOnly: false,
          depth: 0,
        },
        holes: [],
      })),
    },
    foldAxes: axes,
    panels,
    staticFeatures: [],
    graph: constraints.graph,
    plan: constraints.plan,
    hinges: constraints.hinges,
    constraintState: {
      active: model3D.effectivePlan.steps.length > 0,
      hingeCount: model3D.effectivePlan.steps.length,
      rescued: true,
    },
    sanitized,
    model3D,
  };
}