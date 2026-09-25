// ============================================================================
// Stage 5D — Structural Panel Split (post-decomposition)
// ----------------------------------------------------------------------------
// Esta etapa só pode rodar APÓS a StructuralDecomposition. Ela divide um
// `StructuralPanel` quando — e SOMENTE quando — um eixo estrutural VALIDADO
// (`role === "structural_fold_axis"`) atravessa o seu interior.
//
// Regras duras:
//  - Eixos com role `local_crease`, `local_lock_crease`, `absorbed_feature_axis`
//    ou `unknown` NÃO podem dividir painel estrutural. Eles continuam visíveis
//    como vincos locais/feature, mas NÃO produzem hinge global.
//  - Candidates crus NÃO chegam aqui. Só StructuralPanel já classificado.
//  - Cortes continuam cortes; nenhum hinge sintético é criado.
// ============================================================================

import type { Pt } from "../dieline-types";
import type { AbsorbedFeature, StructuralFoldAxis, StructuralPanel } from "./types";

function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(a) / 2;
}

function signedPolygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}

function polygonFromLoop(points: Pt[]): Pt[] {
  return signedPolygonArea(points) >= 0 ? points : points.slice().reverse();
}

function polygonBBox(poly: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function ringCentroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
}

function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const crosses = (a.y > pt.y) !== (b.y > pt.y);
    if (crosses && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y + 1e-12) + a.x) inside = !inside;
  }
  return inside;
}
function distancePointToPoly(pt: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(pt.x - (a.x + dx * t), pt.y - (a.y + dy * t)));
  }
  return best;
}


function cleanPolygon(poly: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of poly) {
    const q = { x: +p.x.toFixed(3), y: +p.y.toFixed(3) };
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev.x - q.x, prev.y - q.y) < 0.05) continue;
    out.push(q);
  }
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < 0.05) out.pop();
  return out;
}

function signedSide(p: Pt, axis: StructuralFoldAxis): number {
  return (p.x - axis.axisLine.origin.x) * -axis.axisLine.direction.y + (p.y - axis.axisLine.origin.y) * axis.axisLine.direction.x;
}

function projOnAxis(p: Pt, axis: StructuralFoldAxis): number {
  return (p.x - axis.axisLine.origin.x) * axis.axisLine.direction.x + (p.y - axis.axisLine.origin.y) * axis.axisLine.direction.y;
}

function axisSpanRange(axis: StructuralFoldAxis): [number, number] {
  const ta = projOnAxis(axis.span.a, axis), tb = projOnAxis(axis.span.b, axis);
  return ta <= tb ? [ta, tb] : [tb, ta];
}

function lineIntersection(a: Pt, b: Pt, axis: StructuralFoldAxis): Pt | null {
  const sa = signedSide(a, axis), sb = signedSide(b, axis);
  const den = sa - sb;
  if (Math.abs(den) < 1e-9) return null;
  const t = sa / den;
  if (t < -1e-6 || t > 1 + 1e-6) return null;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Testa se um eixo estrutural realmente cruza o INTERIOR do polígono do painel
 * (não apenas tangencia a borda). Usado tanto para qualificar o eixo como
 * `structural_fold_axis` quanto para decidir se vale a pena dividir o painel.
 */
export function axisCrossesPanelInterior(poly: Pt[], axis: StructuralFoldAxis, tolMm: number): boolean {
  let pos = false, neg = false;
  const hits: Pt[] = [];
  const [sLo, sHi] = axisSpanRange(axis);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = signedSide(a, axis), sb = signedSide(b, axis);
    if (sa > tolMm) pos = true;
    if (sa < -tolMm) neg = true;
    if (sa * sb > 0) continue;
    const p = Math.abs(sa) <= tolMm ? a : Math.abs(sb) <= tolMm ? b : lineIntersection(a, b, axis);
    if (!p) continue;
    const t = projOnAxis(p, axis);
    if (t < sLo - tolMm || t > sHi + tolMm) continue;
    if (!hits.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 0.2)) hits.push(p);
  }
  if (!pos || !neg || hits.length < 2) return false;
  let maxHitDist = 0;
  for (let i = 0; i < hits.length; i++)
    for (let j = i + 1; j < hits.length; j++)
      maxHitDist = Math.max(maxHitDist, Math.hypot(hits[i].x - hits[j].x, hits[i].y - hits[j].y));
  return maxHitDist >= 2.0;
}

function clipByAxis(poly: Pt[], axis: StructuralFoldAxis, keepPositive: boolean, tolMm: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = signedSide(a, axis), sb = signedSide(b, axis);
    const ina = keepPositive ? sa >= -tolMm : sa <= tolMm;
    const inb = keepPositive ? sb >= -tolMm : sb <= tolMm;
    if (ina && inb) out.push(b);
    else if (ina && !inb) { const p = lineIntersection(a, b, axis); if (p) out.push(p); }
    else if (!ina && inb) { const p = lineIntersection(a, b, axis); if (p) out.push(p); out.push(b); }
  }
  return cleanPolygon(out);
}

function panelIdFromPolygon(poly: Pt[]): string {
  let startIdx = 0;
  for (let i = 1; i < poly.length; i++)
    if (poly[i].x < poly[startIdx].x || (poly[i].x === poly[startIdx].x && poly[i].y < poly[startIdx].y)) startIdx = i;
  const parts: string[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[(startIdx + i) % poly.length];
    parts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return `panel-${h.toString(16).padStart(8, "0")}`;
}

function axisTouchesFragment(axis: StructuralFoldAxis, frag: Pt[], boundaryTol: number): boolean {
  // Contato aqui é CONTORNO, não interior. Um eixo original pode aparecer nos
  // dois fragmentos mesmo quando apenas UM endpoint coincide com o vértice de
  // corte/split (caso clássico: duas dobras convergindo no mesmo vértice). O
  // teste anterior exigia os DOIS endpoints em cada fragmento e dava falso
  // negativo exatamente nesse padrão.
  const endpointOnBoundary =
    distancePointToPoly(axis.span.a, frag) <= boundaryTol ||
    distancePointToPoly(axis.span.b, frag) <= boundaryTol;
  if (endpointOnBoundary) return true;

  // Mesmo quando nenhum endpoint cai dentro da tolerância por ruído numérico,
  // um trecho do boundary do fragmento pode estar colinear/sobreposto ao eixo.
  // Espelhamos o critério usado depois pelo panel-builder para preencher
  // foldAxisIds/hingeAxisIds, evitando aceitar um split que a etapa final
  // reconhecerá como hinge em ambos os fragmentos.
  const [sLo, sHi] = axisSpanRange(axis);
  for (let i = 0; i < frag.length; i++) {
    const p = frag[i];
    const q = frag[(i + 1) % frag.length];
    if (Math.abs(signedSide(p, axis)) > boundaryTol || Math.abs(signedSide(q, axis)) > boundaryTol) continue;
    const tp = projOnAxis(p, axis);
    const tq = projOnAxis(q, axis);
    const lo = Math.max(Math.min(tp, tq), sLo);
    const hi = Math.min(Math.max(tp, tq), sHi);
    if (hi - lo >= 0.1) return true;
  }
  return false;
}

function splitStructuralPanelByAxis(
  panel: StructuralPanel,
  axis: StructuralFoldAxis,
  axesById: Map<string, StructuralFoldAxis>,
  tolMm: number,
): StructuralPanel[] | null {
  if (!axisCrossesPanelInterior(panel.polygon, axis, tolMm)) return null;

  // REGRA ARQUITETURAL: o eixo só pode dividir um painel estrutural se AMBOS
  // os endpoints do SPAN do eixo estiverem efetivamente sobre o boundary do
  // painel. Se um endpoint termina dentro do interior, este é um vinco PARCIAL
  // (lock crease / trava local) e NÃO produz hinge global — mesmo que a reta
  // estendida atravesse o polígono.
  const boundaryTol = Math.max(tolMm * 4, 0.6);
  const aOnBoundary = distancePointToPoly(axis.span.a, panel.polygon) <= boundaryTol;
  const bOnBoundary = distancePointToPoly(axis.span.b, panel.polygon) <= boundaryTol;
  if (!aOnBoundary || !bOnBoundary) return null;

  const originalAxisIds = Array.from(new Set([...(panel.foldAxisIds ?? []), ...(panel.hingeAxisIds ?? [])]));
  if (originalAxisIds.includes(axis.id)) {
    // Um eixo que já é hinge/borda do painel NÃO pode ser usado para dividir o
    // próprio painel. No caso real panel-4afee8a8, axis-16/axis-17 são dobras
    // adjacentes convergindo no vértice (115,50); a reta delas cruza a área por
    // degenerescência geométrica, mas semanticamente são boundary hinges.
    // eslint-disable-next-line no-console
    console.warn(
      `[structural-panel-split] Rejeitando split de ${panel.id} por ${axis.id}: ` +
      `axis já pertence ao boundary/hinge do painel.`,
    );
    return null;
  }


  const plus = clipByAxis(panel.polygon, axis, true, tolMm);
  const minus = clipByAxis(panel.polygon, axis, false, tolMm);
  if (plus.length < 3 || minus.length < 3) return null;
  const plusArea = polygonArea(plus), minusArea = polygonArea(minus);
  if (plusArea < 1 || minusArea < 1) return null;
  const orig = Math.max(1, panel.area);
  // Invariante 1: conservação estrita de área (tolerância 0.5% + 0.01mm²).
  const areaDelta = Math.abs(plusArea + minusArea - orig);
  if (areaDelta > Math.max(0.01, orig * 0.005)) return null;
  // Anti-sliver: nenhum fragmento pode representar menos que 5% da área.
  const minFrac = Math.min(plusArea, minusArea) / orig;
  if (minFrac < 0.05) return null;

  // Invariante CRÍTICO: nenhum dos demais fold axes do painel pode tocar AMBOS
  // os fragmentos resultantes. Se isso ocorresse, o mesmo hinge produziria
  // duas arestas parent→child no FoldGraph, criando um nó com múltiplos pais
  // (causa raiz documentada de modelos 3D que "quase fecham"). Também
  // garantimos que cada axis do painel original aparece em pelo menos um
  // fragmento (cobertura).
  const coveredByPlus = new Set<string>();
  const coveredByMinus = new Set<string>();
  for (const axId of originalAxisIds) {
    if (axId === axis.id) continue;
    const ax = axesById.get(axId);
    if (!ax) continue;
    const touchesPlus = axisTouchesFragment(ax, plus, boundaryTol);
    const touchesMinus = axisTouchesFragment(ax, minus, boundaryTol);
    if (touchesPlus && touchesMinus) {
      // Split rejeitado: axis compartilhado entre fragmentos => multi-parent.
      // eslint-disable-next-line no-console
      console.warn(
        `[structural-panel-split] Rejeitando split de ${panel.id} por ${axis.id}: ` +
        `axis ${axId} tocaria ambos os fragmentos (gera nó com múltiplos pais).`,
      );
      return null;
    }
    if (touchesPlus) coveredByPlus.add(axId);
    if (touchesMinus) coveredByMinus.add(axId);
    if (!touchesPlus && !touchesMinus) {
      // Axis do painel original ficaria órfão: split não é geometricamente válido.
      // eslint-disable-next-line no-console
      console.warn(
        `[structural-panel-split] Rejeitando split de ${panel.id} por ${axis.id}: ` +
        `axis ${axId} perderia contato com qualquer fragmento.`,
      );
      return null;
    }
  }

  const make = (poly: Pt[], side: "a" | "b"): StructuralPanel => {
    const oriented = polygonFromLoop(poly);
    const newPolygonId = panelIdFromPolygon(oriented);
    const id = `${newPolygonId}-${side}`;
    const holes = panel.holes.filter((hole) => pointInPolygon(ringCentroid(hole), oriented));
    return {
      ...panel,
      id,
      polygon: oriented,
      holes,
      bbox: polygonBBox(oriented),
      area: polygonArea(oriented),
      // foldAxisIds/hingeAxisIds são recalculados em panel-builder.
      foldAxisIds: [],
      hingeAxisIds: [],
    };
  };
  return [make(plus, "a"), make(minus, "b")];
}

export interface SplitResult {
  structuralPanels: StructuralPanel[];
  /** Mapa antigo→novos: para reatribuir absorbedFeatures.ownerPanelId. */
  panelIdRemap: Map<string, string[]>;
}

/**
 * Divide painéis estruturais APENAS por eixos validados como
 * `structural_fold_axis`. Eixos de outros tipos são ignorados.
 */
export function splitStructuralPanelsByValidatedAxes(
  panels: StructuralPanel[],
  axes: StructuralFoldAxis[],
  absorbedFeatures: AbsorbedFeature[],
  tolMm: number,
): SplitResult {
  const eligibleAxes = [...axes]
    .filter((axis) => axis.role === "structural_fold_axis" && axis.structuralEligibility !== false)
    .sort((a, b) => b.length - a.length || a.id.localeCompare(b.id));
  const axesById = new Map<string, StructuralFoldAxis>(axes.map((a) => [a.id, a]));

  let current: StructuralPanel[] = panels.map((p) => ({ ...p }));
  const remap = new Map<string, string[]>();
  for (const p of panels) remap.set(p.id, [p.id]);

  for (const axis of eligibleAxes) {
    const next: StructuralPanel[] = [];
    for (const panel of current) {
      const split = splitStructuralPanelByAxis(panel, axis, axesById, tolMm);
      if (!split) { next.push(panel); continue; }
      next.push(...split);
      // Atualiza remap (ID original → IDs finais)
      for (const [origId, ids] of remap) {
        const idx = ids.indexOf(panel.id);
        if (idx >= 0) {
          ids.splice(idx, 1, ...split.map((s) => s.id));
          remap.set(origId, ids);
        }
      }
    }
    current = next;
  }

  // Reatribui ownerPanelId de features absorvidas, escolhendo o pedaço que
  // contém o centroide da feature (fallback: primeiro pedaço do remap).
  for (const feature of absorbedFeatures) {
    const heirs = remap.get(feature.ownerPanelId);
    if (!heirs || heirs.length === 0) continue;
    if (heirs.length === 1 && heirs[0] === feature.ownerPanelId) continue;
    const centroid = ringCentroid(feature.polygon);
    // Escolhe o herdeiro mais próximo geometricamente. NÃO usa pointInPolygon
    // porque o herdeiro correto frequentemente contém a feature como hole
    // (recorte do polígono), e o teste retornaria false — caindo no fallback
    // "primeiro herdeiro" e atribuindo sempre ao lado -a. Bug observado: as 4
    // travinhas (esquerda+direita) iam todas para o fragmento -a esquerdo,
    // deixando o fragmento -b direito sem features e quebrando o hinge.
    let winner: StructuralPanel | undefined;
    let bestDist = Infinity;
    for (const p of current) {
      if (!heirs.includes(p.id)) continue;
      const bb = p.bbox;
      const cx = (bb.minX + bb.maxX) / 2;
      const cy = (bb.minY + bb.maxY) / 2;
      const d = Math.hypot(centroid.x - cx, centroid.y - cy);
      if (d < bestDist) { bestDist = d; winner = p; }
    }
    if (winner) {
      feature.ownerPanelId = winner.id;
      feature.hostPanelId = winner.id;
    }
  }

  // Reindexa faceId estável e atualiza absorbedFeatureIds por painel.
  const featuresByOwner = new Map<string, string[]>();
  for (const f of absorbedFeatures) {
    const arr = featuresByOwner.get(f.ownerPanelId) ?? [];
    arr.push(f.id);
    featuresByOwner.set(f.ownerPanelId, arr);
  }
  current = current.map((panel, index) => ({
    ...panel,
    faceId: index,
    absorbedFeatureIds: featuresByOwner.get(panel.id) ?? [],
  }));

  return { structuralPanels: current, panelIdRemap: remap };
}
