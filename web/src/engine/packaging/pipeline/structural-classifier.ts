// ============================================================================
// Stage 3 — Structural Classifier
// ----------------------------------------------------------------------------
// Decide o `kindFinal` de cada Edge da topologia.
//
// Regra dura (resolve o bug histórico do "vinco que some quando atravessado
// por corte"):
//
//   Se EXISTE qualquer segmento crease/perf colinear e sobreposto à edge,
//   a edge É crease/perf. Cortes sobrepostos NÃO removem o vinco.
//
// Ordem de prioridade do kindFinal (do mais forte para o mais fraco):
//   1. crease  — sempre vence se houver evidência crease colinear
//   2. perf    — vence cut, perde para crease
//   3. cut     — só permanece quando não há crease/perf colinear
//   4. hole    — edge pertencente a um loop interno marcado como hole no kernel
//   5. boundary — edge do contorno externo da silhueta (loop CW descartado)
//
// Esta etapa NÃO agrupa fragmentos em eixos (isso é Stage 4) e NÃO sabe
// o que é painel (Stage 5). Apenas etiqueta cada edge individualmente.
// ============================================================================

import type { Segment } from "../dieline-types";
import type {
  ClassifiedEdge,
  ClassifiedTopology,
  NormalizedGeometry,
  PipelineTopology,
  StructuralRole,
  StructuralKind,
} from "./types";
import type { EdgeKind } from "../cad/kernel/types";

interface SegRef {
  kind: EdgeKind;
  ax: number; ay: number;
  bx: number; by: number;
  dx: number; dy: number;
  len: number;
}

function buildSegRefs(segments: Segment[]): SegRef[] {
  const out: SegRef[] = [];
  for (const s of segments) {
    if (s.kind !== "cut" && s.kind !== "crease" && s.kind !== "perf") continue;
    const k = s.kind as EdgeKind;
    const pts = s.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      out.push({ kind: k, ax: a.x, ay: a.y, bx: b.x, by: b.y, dx, dy, len });
    }
    if (s.closed && pts.length > 2) {
      const a = pts[pts.length - 1], b = pts[0];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len >= 1e-4) out.push({ kind: k, ax: a.x, ay: a.y, bx: b.x, by: b.y, dx, dy, len });
    }
  }
  return out;
}

/** Sobreposição colinear (parallel + perpendicular + projection overlap). */
function overlapsAlong(
  edgeAx: number, edgeAy: number, edgeDx: number, edgeDy: number, edgeLen: number,
  s: SegRef,
  parallelTolRad: number, perpTolMm: number, minOverlapMm: number,
): boolean {
  // 1) Paralelismo: |cross(uEdge, uSeg)| < sin(tol)
  const ux = edgeDx / edgeLen, uy = edgeDy / edgeLen;
  const sx = s.dx / s.len, sy = s.dy / s.len;
  const cross = Math.abs(ux * sy - uy * sx);
  if (cross > Math.sin(parallelTolRad)) return false;
  // 2) Distância perpendicular: projeta endpoints do seg na normal da edge.
  const nx = -uy, ny = ux;
  const d1 = (s.ax - edgeAx) * nx + (s.ay - edgeAy) * ny;
  const d2 = (s.bx - edgeAx) * nx + (s.by - edgeAy) * ny;
  if (Math.abs(d1) > perpTolMm || Math.abs(d2) > perpTolMm) return false;
  // 3) Overlap na projeção tangencial.
  const t1 = (s.ax - edgeAx) * ux + (s.ay - edgeAy) * uy;
  const t2 = (s.bx - edgeAx) * ux + (s.by - edgeAy) * uy;
  const lo = Math.max(0, Math.min(t1, t2));
  const hi = Math.min(edgeLen, Math.max(t1, t2));
  return hi - lo >= minOverlapMm;
}

function strongestKind(kinds: EdgeKind[]): EdgeKind {
  if (kinds.includes("crease")) return "crease";
  if (kinds.includes("perf")) return "perf";
  return "cut";
}

export function classifyTopology(
  topology: PipelineTopology,
  geometry: NormalizedGeometry,
): ClassifiedTopology {
  const refs = buildSegRefs(geometry.segments);
  const parallelTolRad = geometry.tolerances.parallelTolRad;
  const perpTolMm = geometry.tolerances.perpendicularTolMm;
  // Overlap mínimo: 25% do tamanho da edge, mas nunca menor que 0.6 mm
  // nem maior que o próprio tamanho útil. Permite que um vinco que cobre
  // apenas parte de uma edge longa ainda seja reconhecido.
  const minOverlapFor = (len: number) =>
    Math.min(Math.max(len * 0.25, 0.6), Math.max(len - 0.2, 0.6));

  // Sets para lookup rápido de holes/boundary.
  const holeSegs = topology.holeOnlySegIdxs;
  const boundarySegs = topology.boundarySegIdxs;

  const edges: ClassifiedEdge[] = topology.edges.map((e) => {
    const candidates: EdgeKind[] = [];
    const edgeDx = e.b.x - e.a.x;
    const edgeDy = e.b.y - e.a.y;
    const edgeLen = e.length;
    const minOv = minOverlapFor(edgeLen);

    if (edgeLen >= 1e-4) {
      for (const s of refs) {
        if (candidates.includes("crease") && candidates.includes("perf") && candidates.includes("cut")) break;
        if (candidates.includes(s.kind)) continue;
        if (overlapsAlong(e.a.x, e.a.y, edgeDx, edgeDy, edgeLen, s, parallelTolRad, perpTolMm, minOv)) {
          candidates.push(s.kind);
        }
      }
    }

    // Fallback: se nada foi encontrado, mantém o kindRaw da edge.
    if (candidates.length === 0) candidates.push(e.kindRaw);

    let kindFinal: StructuralKind = strongestKind(candidates);
    // Holes/boundary só "vencem" o kind estrutural se a edge não tem
    // evidência de crease/perf. Crease em volta de uma janela continua
    // sendo crease (caso raro mas possível em janelas com vinco).
    if (kindFinal !== "crease" && kindFinal !== "perf") {
      if (holeSegs.has(e.sourceSegIdx)) kindFinal = "hole";
      else if (boundarySegs.has(e.sourceSegIdx)) kindFinal = "boundary";
    }

    let roleFinal: StructuralRole = "unknown";
    const roleReasons: string[] = [];
    if (kindFinal === "crease" || kindFinal === "perf") {
      roleFinal = "fold_axis_candidate";
      roleReasons.push("crease/perf remains a fold-axis candidate until region decomposition validates two structural panels");
    } else if (kindFinal === "hole") {
      roleFinal = "internal_cutout";
      roleReasons.push("kernel marked this edge as belonging exclusively to an internal cutout loop");
    } else if (kindFinal === "boundary" || kindFinal === "cut") {
      roleFinal = "panel_boundary_candidate";
      roleReasons.push("cut/boundary can delimit regions but cannot become a hinge");
    }

    return {
      ...e,
      kindFinal,
      roleFinal,
      roleReasons,
      kindCandidates: candidates,
    };
  });

  return {
    ...topology,
    edges,
  };
}
