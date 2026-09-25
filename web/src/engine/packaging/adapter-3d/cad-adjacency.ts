// ============================================================================
// CAD Adjacency — adjacência geométrica entre painéis 2D.
// ----------------------------------------------------------------------------
// Algoritmo idêntico ao usado por sistemas CAD de embalagem (ArtiosCAD,
// Esko Studio, Pack3D): duas faces da chapa são consideradas adjacentes
// quando compartilham um trecho de aresta no plano 2D, dentro de uma
// tolerância em distância e sobreposição colinear.
//
// Regra universal do sistema: CORTE é corte, VINCO é vinco. A geometria de
// contato entre painéis é apenas candidata; ela só vira dobradiça se casar com
// um eixo crease/perf real vindo do PDF/pipeline. Contato cut-only nunca dobra.
//
// Para cada par de painéis retorna no máximo UM contato (o trecho de
// maior overlap), e tenta casá-lo com um StructuralFoldAxis pré-existente
// para preservar metadata (cor, tipo, id). Quando não há match, o eixo
// será sintetizado depois pelo spanning-tree builder.
// ============================================================================

import type { PipelinePanel, StructuralFoldAxis } from "../pipeline/types";

export interface PanelContact {
  panelA: string;
  panelB: string;
  /** Comprimento da sobreposição colinear (mm). */
  overlap: number;
  /** Distância média perpendicular entre as duas arestas (mm). */
  distance: number;
  /** Trecho 2D efetivo do contato (linha média entre as duas arestas). */
  span: { a: { x: number; y: number }; b: { x: number; y: number } };
  /** Eixo crease/perf real do pipeline 2D que autoriza este contato a dobrar. */
  matchedAxisId: string;
  /** Score interno (overlap penalizado por distância). Maior = melhor. */
  score: number;
}

export interface CadAdjacencyOptions {
  /** Distância máxima entre as duas arestas para considerá-las "a mesma" (mm). */
  closeMm?: number;
  /** Sobreposição colinear mínima exigida (mm). */
  minOverlapMm?: number;
  /** Tolerância para casamento contato↔eixo existente (mm). */
  axisMatchMm?: number;
}

const DEFAULTS: Required<CadAdjacencyOptions> = {
  closeMm: 1.8,
  minOverlapMm: 2.0,
  axisMatchMm: 2.5,
};

function pairContact(
  a: PipelinePanel,
  b: PipelinePanel,
  opts: Required<CadAdjacencyOptions>,
): Omit<PanelContact, "matchedAxisId"> | null {
  const { closeMm, minOverlapMm } = opts;
  let best: Omit<PanelContact, "matchedAxisId"> | null = null;

  for (let ia = 0; ia < a.polygon.length; ia++) {
    const a0 = a.polygon[ia];
    const a1 = a.polygon[(ia + 1) % a.polygon.length];
    const adx = a1.x - a0.x;
    const ady = a1.y - a0.y;
    const alen = Math.hypot(adx, ady);
    if (alen < minOverlapMm) continue;
    const ux = adx / alen;
    const uy = ady / alen;
    const nx = -uy;
    const ny = ux;

    for (let ib = 0; ib < b.polygon.length; ib++) {
      const b0 = b.polygon[ib];
      const b1 = b.polygon[(ib + 1) % b.polygon.length];
      const bdx = b1.x - b0.x;
      const bdy = b1.y - b0.y;
      const blen = Math.hypot(bdx, bdy);
      if (blen < minOverlapMm) continue;

      // 1. Paralelas (cross do unitário ≈ 0).
      const cross = Math.abs(ux * (bdy / blen) - uy * (bdx / blen));
      if (cross > 0.05) continue;

      // 2. Próximas (distância perpendicular dos dois endpoints de B até A).
      const d0 = (b0.x - a0.x) * nx + (b0.y - a0.y) * ny;
      const d1 = (b1.x - a0.x) * nx + (b1.y - a0.y) * ny;
      const distance = (Math.abs(d0) + Math.abs(d1)) / 2;
      if (distance > closeMm) continue;

      // 3. Overlap colinear em coordenada t ao longo de A.
      const bt0 = (b0.x - a0.x) * ux + (b0.y - a0.y) * uy;
      const bt1 = (b1.x - a0.x) * ux + (b1.y - a0.y) * uy;
      const bLo = Math.min(bt0, bt1);
      const bHi = Math.max(bt0, bt1);
      const lo = Math.max(0, bLo);
      const hi = Math.min(alen, bHi);
      const overlap = hi - lo;
      if (overlap < minOverlapMm) continue;

      // 4. Span efetivo: linha média entre as duas arestas (CAD-grade).
      const midOffset = (d0 + d1) / 4;
      const span = {
        a: { x: a0.x + ux * lo + nx * midOffset, y: a0.y + uy * lo + ny * midOffset },
        b: { x: a0.x + ux * hi + nx * midOffset, y: a0.y + uy * hi + ny * midOffset },
      };

      const score = overlap - distance * 4;
      const candidate: Omit<PanelContact, "matchedAxisId"> = {
        panelA: a.id,
        panelB: b.id,
        overlap,
        distance,
        span,
        score,
      };
      if (!best || candidate.score > best.score) best = candidate;
    }
  }

  return best;
}

function axisMatchesContact(
  axis: StructuralFoldAxis,
  contact: Omit<PanelContact, "matchedAxisId">,
  tolMm: number,
): boolean {
  // Direção colinear.
  const dx = contact.span.b.x - contact.span.a.x;
  const dy = contact.span.b.y - contact.span.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const ux = dx / len;
  const uy = dy / len;
  const cross = Math.abs(ux * axis.axisLine.direction.y - uy * axis.axisLine.direction.x);
  if (cross > 0.05) return false;

  // Distância do ponto médio do contato à reta do eixo.
  const mx = (contact.span.a.x + contact.span.b.x) / 2;
  const my = (contact.span.a.y + contact.span.b.y) / 2;
  const nx = -axis.axisLine.direction.y;
  const ny = axis.axisLine.direction.x;
  const dist = Math.abs((mx - axis.axisLine.origin.x) * nx + (my - axis.axisLine.origin.y) * ny);
  if (dist > tolMm) return false;

  // Overlap longitudinal real: o contato precisa compartilhar comprimento
  // suficiente com o eixo crease/perf, não apenas ter o ponto médio perto.
  const ax = axis.axisLine.direction.x;
  const ay = axis.axisLine.direction.y;
  const ca = (contact.span.a.x - axis.axisLine.origin.x) * ax + (contact.span.a.y - axis.axisLine.origin.y) * ay;
  const cb = (contact.span.b.x - axis.axisLine.origin.x) * ax + (contact.span.b.y - axis.axisLine.origin.y) * ay;
  const cLo = Math.min(ca, cb);
  const cHi = Math.max(ca, cb);
  const ta = (axis.span.a.x - axis.axisLine.origin.x) * ax + (axis.span.a.y - axis.axisLine.origin.y) * ay;
  const tb = (axis.span.b.x - axis.axisLine.origin.x) * ax + (axis.span.b.y - axis.axisLine.origin.y) * ay;
  const lo = Math.min(ta, tb) - tolMm;
  const hi = Math.max(ta, tb) + tolMm;
  return Math.min(cHi, hi) - Math.max(cLo, lo) >= Math.min(1.0, contact.overlap * 0.25);
}

function axisContactForPanels(
  axis: StructuralFoldAxis,
  panelsByFaceId: Map<number, PipelinePanel>,
): PanelContact | null {
  if (axis.connectedFaceIds.length !== 2) return null;
  const a = panelsByFaceId.get(axis.connectedFaceIds[0]);
  const b = panelsByFaceId.get(axis.connectedFaceIds[1]);
  if (!a || !b || a.id === b.id) return null;
  const dx = axis.span.b.x - axis.span.a.x;
  const dy = axis.span.b.y - axis.span.a.y;
  const overlap = Math.hypot(dx, dy);
  if (!Number.isFinite(overlap) || overlap < DEFAULTS.minOverlapMm) return null;
  return {
    panelA: a.id < b.id ? a.id : b.id,
    panelB: a.id < b.id ? b.id : a.id,
    overlap,
    distance: 0,
    span: { a: { ...axis.span.a }, b: { ...axis.span.b } },
    matchedAxisId: axis.id,
    score: overlap + 1000,
  };
}

function isStructuralFoldAxis(axis: StructuralFoldAxis): boolean {
  return axis.role === "structural_fold_axis" && axis.structuralEligibility !== false;
}

export function computePanelContacts(
  panels: PipelinePanel[],
  foldAxes: StructuralFoldAxis[],
  options: CadAdjacencyOptions = {},
): PanelContact[] {
  const opts: Required<CadAdjacencyOptions> = { ...DEFAULTS, ...options };
  const eligibleAxes = foldAxes.filter(isStructuralFoldAxis);
  const contactsByPair = new Map<string, PanelContact>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const addContact = (contact: PanelContact) => {
    const key = pairKey(contact.panelA, contact.panelB);
    const prev = contactsByPair.get(key);
    if (!prev || contact.score > prev.score || (!prev.matchedAxisId && contact.matchedAxisId)) {
      contactsByPair.set(key, contact);
    }
  };

  const panelsByFaceId = new Map(panels.map((panel) => [panel.faceId, panel]));
  for (const axis of eligibleAxes) {
    const c = axisContactForPanels(axis, panelsByFaceId);
    if (c) addContact(c);
  }

  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const c = pairContact(panels[i], panels[j], opts);
      if (!c) continue;
      let matchedAxisId: string | null = null;
      for (const axis of eligibleAxes) {
        if (axisMatchesContact(axis, c, opts.axisMatchMm)) {
          matchedAxisId = axis.id;
          break;
        }
      }
      // Sem vinco/perf real correspondente, o contato é corte/encosto — não dobra.
      if (!matchedAxisId) continue;
      addContact({ ...c, matchedAxisId });
    }
  }

  const contacts = [...contactsByPair.values()];

  // Ordem determinística (maior score primeiro).
  contacts.sort(
    (a, b) =>
      b.score - a.score ||
      a.panelA.localeCompare(b.panelA) ||
      a.panelB.localeCompare(b.panelB),
  );
  return contacts;
}
