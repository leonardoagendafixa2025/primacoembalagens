// ============================================================================
// Structural Panel Classifier
// ----------------------------------------------------------------------------
// Implementa a regra dura: o Fold Graph é construído SOMENTE com painéis
// estruturais reais (corpo / laterais / tampa / fundo / abas principais).
// Travas, slots, tongues, notches e fragmentos decorativos são REJEITADOS como
// panels e devolvidos como `RejectedFeature` (com hostId), para que o renderer
// continue exibindo a geometria colada ao painel hospedeiro, sem dobrar.
//
// Regras (todas obrigatórias para aprovar um candidato):
//   R1 — possui ao menos um eixo estrutural (crease/perf) colinear a uma
//        aresta do polígono.
//   R2 — a aresta crease/perf não pode ser microfragmento: hingeLen ≥
//        max(6mm, 18% da menor dimensão do bbox do painel).
//   R3 — não pode estar estritamente contido em outro painel (janela/visor).
//   R4 — não pode ser microface de entalhe (borda fragmentada compartilhada
//        com painel hospedeiro maior, área < 1.5% do root).
//   * Painéis "ponte" (compartilham crease com ≥2 vizinhos distintos) são
//     PRESERVADOS mesmo que falhem em R2 — removê-los desconectaria o grafo.
// ============================================================================

import type { Panel, Pt, Segment } from "./dieline-types";
import { analyzePanelCutouts, findEdgeCutoutPanelIds, sharedBoundaryStats } from "./panel-cutouts";
import {
  buildEdgeKindIndexFromSegments,
  classifyPanelEdgeAll,
  panelEdgeHasCrease,
  type EdgeKindIndex,
} from "./cad/structural-filter";

export type RejectReason =
  | "no_structural_hinge"
  | "hinge_too_small"
  | "internal_cut_feature"
  | "tongue_lock_feature"
  | "slot_feature"
  | "decorative_local_fragment"
  | "merged_back_into_parent_panel";

export type FeatureKind =
  | "internal_cut_feature"
  | "lock_feature"
  | "slot_feature"
  | "decorative_or_local_flap";

export interface PanelCandidateInfo {
  id: string;
  label: string;
  area: number;
  bbox: { w: number; h: number };
  /** Maior comprimento de aresta com suporte crease/perf. */
  maxHingeLen: number;
  /** Comprimento total de arestas crease/perf no contorno. */
  totalCreaseLen: number;
  /** Nº de painéis distintos que compartilham crease com este candidato. */
  creaseNeighbors: number;
}

export interface RejectedFeature {
  panel: Panel;
  reason: RejectReason;
  featureKind: FeatureKind;
  /** Painel estrutural hospedeiro (recebe o feature como filho não-articulado). */
  attachedTo: string | null;
  area: number;
}

export interface StructuralPanelInfo {
  id: string;
  label: string;
  area: number;
  /** Maior eixo estrutural detectado no contorno. */
  maxHingeLen: number;
  absorbedFeatureIds: string[];
}

export interface StructuralReport {
  candidates: PanelCandidateInfo[];
  rejected: RejectedFeature[];
  structural: StructuralPanelInfo[];
  /** Resumo. */
  summary: {
    candidatesCount: number;
    rejectedCount: number;
    structuralCount: number;
    rootArea: number;
  };
}

export interface ClassifyResult {
  structuralPanels: Panel[];
  rejected: RejectedFeature[];
  /** Internal cut/window rings that must be carved from the structural host. */
  holesByPanel: Record<string, Pt[][]>;
  report: StructuralReport;
}

let lastReport: StructuralReport | null = null;
export function getLastStructuralReport(): StructuralReport | null {
  return lastReport;
}
export function setLastStructuralReport(r: StructuralReport | null) {
  lastReport = r;
}

function polyArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(a) / 2;
}

function bboxDims(poly: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { w: maxX - minX, h: maxY - minY, minX, minY, maxX, maxY };
}

function pointInPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / Math.max(1, poly.length), y: y / Math.max(1, poly.length) };
}

function bboxContainsOuter(outer: Pt[], inner: Pt[], margin = 0.35): boolean {
  const o = bboxDims(outer);
  const i = bboxDims(inner);
  return (
    i.minX >= o.minX + margin &&
    i.maxX <= o.maxX - margin &&
    i.minY >= o.minY + margin &&
    i.maxY <= o.maxY - margin
  );
}

function panelStrictlyContainsPanel(outer: Pt[], inner: Pt[]): boolean {
  if (!bboxContainsOuter(outer, inner)) return false;
  const c = centroid(inner);
  if (!pointInPoly(outer, c.x, c.y)) return false;
  for (const p of inner) if (!pointInPoly(outer, p.x, p.y)) return false;
  return true;
}

function edgeKey(a: Pt, b: Pt): string {
  const ax = a.x.toFixed(2), ay = a.y.toFixed(2);
  const bx = b.x.toFixed(2), by = b.y.toFixed(2);
  return ax < bx || (ax === bx && ay <= by)
    ? `${ax},${ay}|${bx},${by}`
    : `${bx},${by}|${ax},${ay}`;
}

/**
 * Computa estatística de suporte estrutural por painel:
 *   maxHingeLen   — maior aresta com crease/perf colinear
 *   totalCreaseLen — comprimento total de arestas crease/perf
 *   creaseNeighbors — quantos OUTROS painéis compartilham essas creases
 */
function panelStructuralSupport(
  panel: Panel,
  idx: EdgeKindIndex,
  creaseEdgeOwners: Map<string, Set<string>>,
): { maxHingeLen: number; totalCreaseLen: number; creaseNeighbors: number } {
  let maxHingeLen = 0;
  let totalCreaseLen = 0;
  const neighbors = new Set<string>();
  const poly = panel.polygon;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const kinds = classifyPanelEdgeAll(a, b, idx);
    const hasFold = kinds.has("crease") || kinds.has("perf");
    if (!hasFold) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > maxHingeLen) maxHingeLen = len;
    totalCreaseLen += len;
    const owners = creaseEdgeOwners.get(edgeKey(a, b));
    if (owners) for (const id of owners) if (id !== panel.id) neighbors.add(id);
  }
  return { maxHingeLen, totalCreaseLen, creaseNeighbors: neighbors.size };
}

/**
 * Classifica painéis brutos em estruturais vs features rejeitadas.
 * Não muta a entrada.
 */
export function classifyStructuralPanels(
  panels: Panel[],
  segments: Segment[],
): ClassifyResult {
  const empty: StructuralReport = {
    candidates: [], rejected: [], structural: [],
    summary: { candidatesCount: 0, rejectedCount: 0, structuralCount: 0, rootArea: 0 },
  };
  if (!panels.length) {
    setLastStructuralReport(empty);
    return { structuralPanels: [], rejected: [], holesByPanel: {}, report: empty };
  }

  const idx = buildEdgeKindIndexFromSegments(segments);
  const areas = new Map(panels.map((p) => [p.id, polyArea(p.polygon)]));
  const rootArea = Math.max(...panels.map((p) => areas.get(p.id) ?? 0));

  // Mapa edge-crease → painéis donos (para detectar pontes topológicas).
  const creaseEdgeOwners = new Map<string, Set<string>>();
  for (const panel of panels) {
    const poly = panel.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (!panelEdgeHasCrease(a, b, idx)) continue;
      const key = edgeKey(a, b);
      let set = creaseEdgeOwners.get(key);
      if (!set) { set = new Set(); creaseEdgeOwners.set(key, set); }
      set.add(panel.id);
    }
  }

  // R3 — internal_cut_feature: estritamente contido em outro painel.
  const cutouts = analyzePanelCutouts(panels);

  // R4 — decorative_local_fragment: microface de entalhe na borda.
  const allIds = new Set(panels.map((p) => p.id));
  const edgeCutouts = findEdgeCutoutPanelIds(panels, allIds);

  // Candidatos
  const candidates: PanelCandidateInfo[] = [];
  const rejected: RejectedFeature[] = [];
  const structuralPanels: Panel[] = [];
  const structuralInfo: StructuralPanelInfo[] = [];

  const pickContainmentHost = (panel: Panel): string | null => {
    let host: string | null = null;
    let bestArea = Infinity;
    const panelArea = areas.get(panel.id) ?? 0;
    for (const candidate of panels) {
      if (candidate.id === panel.id) continue;
      const candidateArea = areas.get(candidate.id) ?? 0;
      if (candidateArea <= panelArea * 1.02) continue;
      if (!panelStrictlyContainsPanel(candidate.polygon, panel.polygon)) continue;
      if (candidateArea < bestArea) { bestArea = candidateArea; host = candidate.id; }
    }
    return host;
  };

  // Função para escolher hostId para um feature rejeitado.
  const pickHost = (panel: Panel, containmentHost?: string | null): string | null => {
    // 1) Containment direto (janela/furo interno): menor painel maior que contém o feature.
    if (containmentHost) return containmentHost;

    // 2) Painel com maior shared boundary (cobertura curva/fragmentada).
    // Não exige área maior: uma trava pode encostar primeiro em outra trava
    // local que depois será absorvida pelo painel estrutural.
    let host: string | null = null;
    let bestScore = 0;
    for (const candidate of panels) {
      if (candidate.id === panel.id) continue;
      const stats = sharedBoundaryStats(candidate.polygon, panel.polygon);
      if (stats.total <= 0.5) continue;
      if (stats.total > bestScore) { bestScore = stats.total; host = candidate.id; }
    }
    return host;
  };

  const inferFeatureKind = (reason: RejectReason): FeatureKind => {
    switch (reason) {
      case "internal_cut_feature": return "internal_cut_feature";
      case "tongue_lock_feature": return "lock_feature";
      case "slot_feature": return "slot_feature";
      default: return "decorative_or_local_flap";
    }
  };

  for (const panel of panels) {
    const area = areas.get(panel.id) ?? 0;
    const { w, h } = bboxDims(panel.polygon);
    const support = panelStructuralSupport(panel, idx, creaseEdgeOwners);
    const containedBy = pickContainmentHost(panel);
    const info: PanelCandidateInfo = {
      id: panel.id,
      label: panel.label,
      area,
      bbox: { w, h },
      maxHingeLen: support.maxHingeLen,
      totalCreaseLen: support.totalCreaseLen,
      creaseNeighbors: support.creaseNeighbors,
    };
    candidates.push(info);

    const minDim = Math.max(1, Math.min(w, h));
    const isLocalLockLikeFeature = area < rootArea * 0.02 && minDim <= 18;
    // Bridge panels (≥2 vizinhos via crease) só são preservados se não forem
    // micro-features locais. Travas/slots pequenos podem tocar dois loops e
    // ainda assim NÃO são painéis estruturais reais.
    const isBridge = support.creaseNeighbors >= 2 && !isLocalLockLikeFeature;
    // Root (maior área) também imune.
    const isRoot = area >= rootArea * 0.999;

    let reason: RejectReason | null = null;

    if (!isRoot) {
      if (containedBy || cutouts.panelsToRemove.has(panel.id)) {
        reason = "internal_cut_feature";
      } else if (edgeCutouts.has(panel.id)) {
        reason = "decorative_local_fragment";
      } else if (isLocalLockLikeFeature) {
        reason = support.maxHingeLen > 0 ? "tongue_lock_feature" : "slot_feature";
      } else if (isBridge) {
        reason = null;
      } else if (support.maxHingeLen <= 0) {
        reason = "no_structural_hinge";
      } else {
        const minHinge = Math.max(6, minDim * 0.18);
        if (support.maxHingeLen < minHinge) {
          // Pequeno + hinge minúsculo → fragmento local
          if (area < rootArea * 0.015) {
            reason = "hinge_too_small";
          }
        }
      }
    }

    if (reason) {
      const host = pickHost(panel, containedBy);
      rejected.push({
        panel,
        reason,
        featureKind: inferFeatureKind(reason),
        attachedTo: host,
        area,
      });
    } else {
      structuralPanels.push(panel);
      structuralInfo.push({
        id: panel.id,
        label: panel.label,
        area,
        maxHingeLen: support.maxHingeLen,
        absorbedFeatureIds: [],
      });
    }
  }

  // Preenche absorbedFeatureIds nos structural (best-effort).
  const structIdx = new Map(structuralInfo.map((s) => [s.id, s]));
  const holesByPanel: Record<string, Pt[][]> = {};
  const rejectedById = new Map(rejected.map((r) => [r.panel.id, r]));
  const resolveStructuralHost = (hostId: string | null): string | null => {
    const seen = new Set<string>();
    let cur = hostId;
    while (cur && !seen.has(cur)) {
      if (structIdx.has(cur)) return cur;
      seen.add(cur);
      cur = rejectedById.get(cur)?.attachedTo ?? null;
    }
    return null;
  };

  for (const rej of rejected) {
    const structuralHost = resolveStructuralHost(rej.attachedTo);
    if (structuralHost) rej.attachedTo = structuralHost;
  }

  for (const rej of rejected) {
    if (!rej.attachedTo) continue;
    const host = structIdx.get(rej.attachedTo);
    if (!host) continue;
    host.absorbedFeatureIds.push(rej.panel.id);
    if (rej.reason === "internal_cut_feature") {
      const arr = (holesByPanel[rej.attachedTo] = holesByPanel[rej.attachedTo] || []);
      arr.push(rej.panel.polygon);
    }
  }

  const report: StructuralReport = {
    candidates,
    rejected,
    structural: structuralInfo,
    summary: {
      candidatesCount: candidates.length,
      rejectedCount: rejected.length,
      structuralCount: structuralPanels.length,
      rootArea,
    },
  };
  setLastStructuralReport(report);
  return { structuralPanels, rejected, holesByPanel, report };
}
