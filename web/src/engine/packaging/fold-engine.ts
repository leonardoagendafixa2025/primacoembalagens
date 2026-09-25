// @deprecated — MOTOR LEGADO (Camada 3 antiga).
// A pipeline em `src/lib/packaging/pipeline/` é o caminho oficial. Este módulo
// só permanece como fallback automático quando `buildPartScenePipeline` lança.
// Não estender. Não corrigir aqui — corrigir na pipeline.
// Constrói uma árvore de dobras a partir dos painéis e cortes/vincos do dieline.

import * as THREE from "three";

import type { Dieline, Panel, Pt, Segment } from "./dieline-types";
import { analyzePanelCutouts, findEdgeCutoutPanelIds } from "./panel-cutouts";
import { classifyStructuralPanels, type RejectedFeature } from "./structural-panels";

export interface Hinge { a: Pt; b: Pt; }

export interface FoldNode {
  panel: Panel;
  parent: string | null;
  hinge: Hinge | null;
  sign: 1 | -1;
  target: number;
  children: string[];
}

export type FoldTree = Record<string, FoldNode>;

function polyEdges(poly: Pt[]): Array<[Pt, Pt]> {
  const e: Array<[Pt, Pt]> = [];
  for (let i = 0; i < poly.length; i++) e.push([poly[i], poly[(i + 1) % poly.length]]);
  return e;
}

function polySignedArea(poly: Pt[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return area / 2;
}

export function extendHingeToPanelEdge(poly: Pt[], hinge: Hinge, eps = 0.8): Hinge {
  let best = hinge;
  let bestLen = Math.hypot(hinge.b.x - hinge.a.x, hinge.b.y - hinge.a.y);
  for (const [a, b] of polyEdges(poly)) {
    const overlap = segmentOverlap(hinge.a, hinge.b, a, b, eps);
    if (!overlap) continue;
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (edgeLen <= bestLen + 0.2) continue;
    const sameDir = (b.x - a.x) * (hinge.b.x - hinge.a.x) + (b.y - a.y) * (hinge.b.y - hinge.a.y) >= 0;
    best = sameDir ? { a, b } : { a: b, b: a };
    bestLen = edgeLen;
  }
  return best;
}

function dedupePolyline(points: Pt[], eps = 0.1): Pt[] {
  const cleaned: Pt[] = [];
  for (const p of points) {
    const last = cleaned[cleaned.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > eps) cleaned.push(p);
  }
  if (cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= eps) cleaned.pop();
  }
  return cleaned;
}

export function snapFlapToHinge(poly: Pt[], _hinge: Hinge, _reliefTol = 8): Pt[] {
  return poly;
}

function segmentOverlap(p1: Pt, p2: Pt, p3: Pt, p4: Pt, eps = 0.6): Hinge | null {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  const len = Math.hypot(dx, dy);
  if (len < eps) return null;
  if (Math.abs(dx * dy2 - dy * dx2) > eps * len) return null;
  if (Math.abs((p3.x - p1.x) * dy - (p3.y - p1.y) * dx) > eps * len) return null;
  const ux = dx / len, uy = dy / len;
  const t = (p: Pt) => (p.x - p1.x) * ux + (p.y - p1.y) * uy;
  const t1 = 0, t2 = len, t3 = t(p3), t4 = t(p4);
  const lo = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const hi = Math.min(Math.max(t1, t2), Math.max(t3, t4));
  if (hi - lo < 1.5) return null;
  return {
    a: { x: p1.x + ux * lo, y: p1.y + uy * lo },
    b: { x: p1.x + ux * hi, y: p1.y + uy * hi },
  };
}

function hingeLength(h: Hinge): number {
  return Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y);
}

function mergeColinearHingeFragments(fragments: Hinge[], eps = 0.8): Hinge | null {
  if (!fragments.length) return null;
  let best = fragments[0];
  let bestScore = hingeLength(best) * 1000 + hingeLength(best);

  for (const seed of fragments) {
    const dx = seed.b.x - seed.a.x, dy = seed.b.y - seed.a.y;
    const len = Math.hypot(dx, dy);
    if (len < eps) continue;
    const ux = dx / len, uy = dy / len;
    const t = (p: Pt) => (p.x - seed.a.x) * ux + (p.y - seed.a.y) * uy;

    let contactTotal = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of fragments) {
      const hx = h.b.x - h.a.x, hy = h.b.y - h.a.y;
      const hLen = Math.hypot(hx, hy);
      if (hLen < eps) continue;
      if (Math.abs(dx * hy - dy * hx) > eps * len) continue;
      if (Math.abs((h.a.x - seed.a.x) * dy - (h.a.y - seed.a.y) * dx) > eps * len) continue;
      const t0 = t(h.a), t1 = t(h.b);
      lo = Math.min(lo, t0, t1);
      hi = Math.max(hi, t0, t1);
      contactTotal += hLen;
    }
    if (!isFinite(lo) || !isFinite(hi)) continue;
    const span = hi - lo;
    const score = contactTotal * 1000 + span;
    if (score <= bestScore) continue;
    bestScore = score;
    best = {
      a: { x: seed.a.x + ux * lo, y: seed.a.y + uy * lo },
      b: { x: seed.a.x + ux * hi, y: seed.a.y + uy * hi },
    };
  }

  return best;
}

function sharedEdge(a: Panel, b: Panel): Hinge | null {
  const fragments: Hinge[] = [];
  for (const [a1, a2] of polyEdges(a.polygon)) {
    for (const [b1, b2] of polyEdges(b.polygon)) {
      const o = segmentOverlap(a1, a2, b1, b2);
      if (o) fragments.push(o);
    }
  }
  return mergeColinearHingeFragments(fragments);
}

function pointOnSegment(p: Pt, a: Pt, b: Pt, eps = 0.8) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const len = Math.hypot(abx, aby);
  if (len < eps) return false;
  const cross = Math.abs(apx * aby - apy * abx) / len;
  if (cross > eps) return false;
  const dot = apx * abx + apy * aby;
  return dot >= -eps && dot <= abx * abx + aby * aby + eps;
}

function colinearLines(a1: Pt, a2: Pt, b1: Pt, b2: Pt, eps = 0.6): boolean {
  const dx = a2.x - a1.x, dy = a2.y - a1.y;
  const len = Math.hypot(dx, dy);
  if (len < eps) return false;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  if (Math.abs(dx * dy2 - dy * dx2) > eps * len) return false;
  if (Math.abs((b1.x - a1.x) * dy - (b1.y - a1.y) * dx) > eps * len) return false;
  return true;
}

function findFoldHinge(a: Panel, b: Panel, segments: Segment[]): Hinge | null {
  const PARALLEL_TOL = 0.06;
  const PERP_TOL_MM = 2.0;
  const candidates: Hinge[] = [];
  for (const [a1, a2] of polyEdges(a.polygon)) {
    for (const [b1, b2] of polyEdges(b.polygon)) {
      if (!colinearLines(a1, a2, b1, b2)) continue;
      const dx = a2.x - a1.x, dy = a2.y - a1.y;
      const lineLen = Math.hypot(dx, dy);
      if (lineLen < 0.6) continue;
      const ux = dx / lineLen, uy = dy / lineLen;
      const proj = (p: Pt) => (p.x - a1.x) * ux + (p.y - a1.y) * uy;
      const perp = (p: Pt) => (p.x - a1.x) * (-uy) + (p.y - a1.y) * ux;
      const tA = [proj(a1), proj(a2)].sort((x, y) => x - y);
      const tB = [proj(b1), proj(b2)].sort((x, y) => x - y);
      const interLo = Math.max(tA[0], tB[0]);
      const interHi = Math.min(tA[1], tB[1]);
      const contactLen = interHi - interLo;
      if (contactLen < 0.5) continue;
      let hasCrease = false;
      for (const seg of segments) {
        if (seg.kind !== "crease" && seg.kind !== "perf") continue;
        for (let i = 0; i < seg.points.length - 1; i++) {
          const c1 = seg.points[i], c2 = seg.points[i + 1];
          const cdx = c2.x - c1.x, cdy = c2.y - c1.y;
          const cLen = Math.hypot(cdx, cdy);
          if (cLen < 0.3) continue;
          const cross = (cdx * uy - cdy * ux) / cLen;
          if (Math.abs(cross) > PARALLEL_TOL) continue;
          const d1 = perp(c1), d2 = perp(c2);
          if (Math.abs((d1 + d2) / 2) > PERP_TOL_MM) continue;
          const t1 = proj(c1), t2 = proj(c2);
          const lo = Math.max(Math.min(t1, t2), interLo);
          const hi = Math.min(Math.max(t1, t2), interHi);
          if (hi - lo < 0.3) continue;
          hasCrease = true;
          break;
        }
        if (hasCrease) break;
      }
      if (!hasCrease) continue;
      let ha = { x: a1.x + ux * interLo, y: a1.y + uy * interLo };
      let hb = { x: a1.x + ux * interHi, y: a1.y + uy * interHi };
      if (Math.abs(ha.x - hb.x) < 2 && Math.abs(ha.y - hb.y) > 20) {
        const mx = (ha.x + hb.x) / 2;
        ha = { x: mx, y: ha.y }; hb = { x: mx, y: hb.y };
      }
      if (Math.abs(ha.y - hb.y) < 2 && Math.abs(ha.x - hb.x) > 20) {
        const my = (ha.y + hb.y) / 2;
        ha = { x: ha.x, y: my }; hb = { x: hb.x, y: my };
      }
      candidates.push({ a: ha, b: hb });
    }
  }
  return mergeColinearHingeFragments(candidates);
}

function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of poly) { x += p.x; y += p.y; }
  return { x: x / poly.length, y: y / poly.length };
}

function panelCenter3(panel: Panel): THREE.Vector3 {
  const c = centroid(panel.polygon);
  return new THREE.Vector3(c.x, c.y, 0);
}

function computeTaperFoldTarget(panel: Panel, hinge: Hinge): number {
  const QUARTER = Math.PI / 2;
  if (/aba|corpo/i.test(panel.label)) return QUARTER;
  const poly = panel.polygon;
  if (poly.length < 4) return QUARTER;
  const ux = hinge.b.x - hinge.a.x, uy = hinge.b.y - hinge.a.y;
  const B = Math.hypot(ux, uy);
  if (B < 0.5) return QUARTER;
  const u = { x: ux / B, y: uy / B };
  const cen = centroid(poly);
  const mid = { x: (hinge.a.x + hinge.b.x) / 2, y: (hinge.a.y + hinge.b.y) / 2 };
  let nx = -u.y, ny = u.x;
  if ((cen.x - mid.x) * nx + (cen.y - mid.y) * ny < 0) { nx = -nx; ny = -ny; }
  let bestH = 0, bestT = 0, found = false;
  const PARALLEL_TOL = 0.18, MIN_HEIGHT = 1.5;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
    const ex = p2.x - p1.x, ey = p2.y - p1.y;
    const elen = Math.hypot(ex, ey);
    if (elen < 0.5) continue;
    const dot = (ex * u.x + ey * u.y) / elen;
    if (Math.abs(dot) < 1 - PARALLEL_TOL) continue;
    const midE = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const h = (midE.x - mid.x) * nx + (midE.y - mid.y) * ny;
    if (h <= MIN_HEIGHT) continue;
    if (h > bestH) { bestH = h; bestT = elen; found = true; }
  }
  if (!found) return QUARTER;
  const offset = (bestT - B) / 2;
  if (Math.abs(offset) > bestH * 0.95) return QUARTER;
  const ratio = Math.max(-1, Math.min(1, offset / bestH));
  if (Math.abs(offset) < 0.6) return QUARTER;
  return Math.min(QUARTER, Math.acos(ratio));
}

function childFoldMatrix(parentMatrix: THREE.Matrix4, hinge: Hinge, angle: number): THREE.Matrix4 {
  const axis = new THREE.Vector3(hinge.b.x - hinge.a.x, hinge.b.y - hinge.a.y, 0).normalize();
  const toHinge = new THREE.Matrix4().makeTranslation(hinge.a.x, hinge.a.y, 0);
  const fromHinge = new THREE.Matrix4().makeTranslation(-hinge.a.x, -hinge.a.y, 0);
  const rot = new THREE.Matrix4().makeRotationAxis(axis, angle);
  return parentMatrix.clone().multiply(toHinge).multiply(rot).multiply(fromHinge);
}

function assignFoldSigns(tree: FoldTree, root: string) {
  if (!root || !tree[root]) return;
  const rootCenter = panelCenter3(tree[root].panel);
  const worldMatrices = new Map<string, THREE.Matrix4>([[root, new THREE.Matrix4().identity()]]);
  const visit = (id: string) => {
    const parentMatrix = worldMatrices.get(id) ?? new THREE.Matrix4().identity();
    const parentCenter = panelCenter3(tree[id].panel).applyMatrix4(parentMatrix);
    const parentNormal = new THREE.Vector3(0, 0, 1).transformDirection(parentMatrix).normalize();
    const parentIsRoot = tree[id].parent === null;
    const interiorDot = rootCenter.clone().sub(parentCenter).dot(parentNormal);
    const interiorSign = Math.abs(interiorDot) > 1e-4 ? Math.sign(interiorDot) : 0;
    for (const childId of tree[id].children) {
      const child = tree[childId];
      const hinge = child.hinge;
      if (!hinge) continue;
      const candidates: Array<1 | -1> = parentIsRoot ? [1] : [1, -1];
      let bestSign: 1 | -1 = 1;
      let bestMatrix = childFoldMatrix(parentMatrix, hinge, child.target);
      let bestScore = -Infinity;
      for (const sign of candidates) {
        const matrix = childFoldMatrix(parentMatrix, hinge, child.target * sign);
        const childCenter = panelCenter3(child.panel).applyMatrix4(matrix);
        const sideDot = childCenter.clone().sub(parentCenter).dot(parentNormal);
        const sideSign = Math.abs(sideDot) > 1e-4 ? Math.sign(sideDot) : 0;
        const onInteriorSide = interiorSign !== 0 && sideSign === interiorSign ? 1 : 0;
        const closerToRoot = -childCenter.distanceTo(rootCenter);
        const score = onInteriorSide * 1000 + closerToRoot;
        if (score > bestScore) { bestScore = score; bestSign = sign; bestMatrix = matrix; }
      }
      child.sign = bestSign;
      worldMatrices.set(childId, bestMatrix);
      visit(childId);
    }
  };
  visit(root);
}

function pickRoot(d: Dieline): string | null {
  if (!d.panels || d.panels.length === 0) return null;
  const front = d.panels.find((p) => /front|frente|base|center|centro|cara/i.test(p.label));
  if (front) return front.id;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of d.panels) {
    for (const pt of p.polygon) {
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    }
  }
  const bbCx = (minX + maxX) / 2, bbCy = (minY + maxY) / 2;
  const bbDiag = Math.hypot(maxX - minX, maxY - minY) || 1;
  const hingeCount = new Map<string, number>();
  for (const p of d.panels) hingeCount.set(p.id, 0);
  for (let i = 0; i < d.panels.length; i++) {
    for (let j = i + 1; j < d.panels.length; j++) {
      const a = d.panels[i], b = d.panels[j];
      const edge = findFoldHinge(a, b, d.segments);
      if (!edge) continue;
      hingeCount.set(a.id, (hingeCount.get(a.id) ?? 0) + 1);
      hingeCount.set(b.id, (hingeCount.get(b.id) ?? 0) + 1);
    }
  }
  let best = d.panels[0], bestScore = -Infinity;
  for (const p of d.panels) {
    const c = centroid(p.polygon);
    const dist = Math.hypot(c.x - bbCx, c.y - bbCy);
    const hinges = hingeCount.get(p.id) ?? 0;
    const score = hinges * 1000 - (dist / bbDiag) * 100;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best.id;
}

export function buildFoldTree(d: Dieline, rootId?: string): { tree: FoldTree; root: string } {
  const tree: FoldTree = {};

  // === FILTRO ESTRUTURAL (ANTES DO FOLD GRAPH) ===
  // Apenas painéis estruturais reais entram no grafo. Travas, slots, tongues
  // e fragmentos decorativos viram filhos não-articulados do hospedeiro.
  const classified = classifyStructuralPanels(d.panels, d.segments);
  const rejectedById = new Map<string, RejectedFeature>(
    classified.rejected.map((r) => [r.panel.id, r]),
  );
  const internalCutouts = analyzePanelCutouts(classified.structuralPanels);
  const panels = classified.structuralPanels
    .filter((panel) => !internalCutouts.panelsToRemove.has(panel.id))
    .map((panel) => ({
      ...panel,
      holes: [
        ...(panel.holes ?? []),
        ...(classified.holesByPanel[panel.id] ?? []),
        ...(internalCutouts.holesByPanel[panel.id] ?? []),
      ],
    }));
  const workingDieline = { ...d, panels };
  for (const p of panels) {
    tree[p.id] = { panel: p, parent: null, hinge: null, sign: 1, target: Math.PI / 2, children: [] };
  }
  const root = rootId && tree[rootId] ? rootId : pickRoot(workingDieline);
  if (!root) return { tree, root: "" };
  const visited = new Set<string>([root]);
  while (visited.size < panels.length) {
    let bestChild: Panel | null = null;
    let bestParentId: string | null = null;
    let bestEdge: Hinge | null = null;
    let bestLen = 0;
    for (const candidate of panels) {
      if (visited.has(candidate.id)) continue;
      for (const parentId of visited) {
        const parentPanel = tree[parentId].panel;
        const edge = findFoldHinge(parentPanel, candidate, d.segments);
        if (!edge) continue;
        const len = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
        if (len > bestLen) { bestLen = len; bestChild = candidate; bestParentId = parentId; bestEdge = edge; }
      }
    }
    if (!bestChild || !bestParentId || !bestEdge) break;
    let { a, b } = bestEdge;
    const cChild = centroid(bestChild.polygon);
    const ax = b.x - a.x, ay = b.y - a.y;
    const len = Math.hypot(ax, ay) || 1;
    const px = -ay / len, py = ax / len;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dot = (cChild.x - mx) * px + (cChild.y - my) * py;
    const hinge: Hinge = dot >= 0 ? { a, b } : { a: b, b: a };
    const taperTarget = computeTaperFoldTarget(bestChild, hinge);
    tree[bestChild.id] = { panel: bestChild, parent: bestParentId, hinge, sign: 1, target: taperTarget, children: [] };
    tree[bestParentId].children.push(bestChild.id);
    visited.add(bestChild.id);
  }

  // Resgate de órfãos via aresta geométrica (sem exigir crease).
  let rescued = true;
  while (rescued) {
    rescued = false;
    for (const other of panels) {
      if (visited.has(other.id)) continue;
      let bestParent: string | null = null;
      let bestEdge: Hinge | null = null;
      let bestLen = 0;
      for (const parentId of visited) {
        const edge = sharedEdge(tree[parentId].panel, other);
        if (!edge) continue;
        const len = Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y);
        if (len > bestLen) { bestLen = len; bestParent = parentId; bestEdge = edge; }
      }
      if (!bestParent || !bestEdge) continue;
      let { a, b } = bestEdge;
      const cChild = centroid(other.polygon);
      const ax = b.x - a.x, ay = b.y - a.y;
      const len = Math.hypot(ax, ay) || 1;
      const px = -ay / len, py = ax / len;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dot = (cChild.x - mx) * px + (cChild.y - my) * py;
      const hinge: Hinge = dot >= 0 ? { a, b } : { a: b, b: a };
      const taperTarget = computeTaperFoldTarget(other, hinge);
      tree[other.id] = { panel: other, parent: bestParent, hinge, sign: 1, target: taperTarget, children: [] };
      tree[bestParent].children.push(other.id);
      visited.add(other.id);
      rescued = true;
    }
  }

  // Resgate por CONTENÇÃO — painéis que ficaram órfãos mesmo após shared-edge
  // são quase sempre furos/janelas que escaparam da propagação de holes do
  // kernel CAD. Em vez de deixá-los flutuando (causa a faca "explodida" no
  // 3D), reparenteia como filho não-articulado (sem hinge, target=0) do
  // painel que os CONTÉM geometricamente. O 3D vai renderizá-los colados ao
  // painel pai sem dobrar.
  for (const other of panels) {
    if (visited.has(other.id)) continue;
    const c = centroid(other.polygon);
    let owner: string | null = null;
    let ownerArea = Infinity;
    for (const parentId of visited) {
      const parent = tree[parentId].panel;
      if (!pointInPolygon(c, parent.polygon)) continue;
      const area = Math.abs(polySignedArea(parent.polygon));
      if (area < ownerArea) { owner = parentId; ownerArea = area; }
    }
    if (!owner) continue;
    tree[other.id] = { panel: other, parent: owner, hinge: null, sign: 1, target: 0, children: [] };
    tree[owner].children.push(other.id);
    visited.add(other.id);
  }

  demoteInternalCutouts(tree, root);

  // Adiciona features REJEITADAS (travas / slots / cutouts / fragmentos)
  // como filhos NÃO-ARTICULADOS do hospedeiro estrutural. Continuam visíveis
  // no 3D coladas ao painel pai, mas NUNCA entram no fold plan como dobra.
  for (const rej of rejectedById.values()) {
    if (rej.reason === "internal_cut_feature" && rej.attachedTo && tree[rej.attachedTo]) continue;
    if (tree[rej.panel.id]) continue; // já no grafo por algum motivo
    let hostId = rej.attachedTo && tree[rej.attachedTo] ? rej.attachedTo : null;
    if (!hostId) {
      // fallback: pai por containment do centróide
      const c = centroid(rej.panel.polygon);
      let bestArea = Infinity;
      for (const node of Object.values(tree)) {
        if (!pointInPolygon(c, node.panel.polygon)) continue;
        const a = panelAbsArea(node.panel);
        if (a < bestArea) { bestArea = a; hostId = node.panel.id; }
      }
    }
    if (!hostId || !tree[hostId]) continue;
    tree[rej.panel.id] = {
      panel: rej.panel,
      parent: hostId,
      hinge: null,
      sign: 1,
      target: 0,
      children: [],
    };
    tree[hostId].children.push(rej.panel.id);
  }

  assignFoldSigns(tree, root);
  return { tree, root };
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function panelAbsArea(panel: Panel): number {
  return Math.abs(polySignedArea(panel.polygon));
}

function segmentOverlapLen(p1: Pt, p2: Pt, p3: Pt, p4: Pt, eps = 0.8): number {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
  const len = Math.hypot(dx, dy);
  if (len < eps) return 0;
  if (Math.abs(dx * dy2 - dy * dx2) > eps * len) return 0;
  if (Math.abs((p3.x - p1.x) * dy - (p3.y - p1.y) * dx) > eps * len) return 0;
  const ux = dx / len, uy = dy / len;
  const t = (p: Pt) => (p.x - p1.x) * ux + (p.y - p1.y) * uy;
  const lo = Math.max(0, Math.min(t(p3), t(p4)));
  const hi = Math.min(len, Math.max(t(p3), t(p4)));
  return Math.max(0, hi - lo);
}

function sharedBoundaryStats(a: Panel, b: Panel): { total: number; max: number } {
  let total = 0;
  let max = 0;
  for (const [a1, a2] of polyEdges(a.polygon)) {
    for (const [b1, b2] of polyEdges(b.polygon)) {
      const len = segmentOverlapLen(a1, a2, b1, b2);
      if (len <= 0.05) continue;
      total += len;
      if (len > max) max = len;
    }
  }
  return { total, max };
}

/**
 * Alguns PDFs convertem um recorte curvo de fechamento (ex: meia-lua / thumb
 * notch) em um painel minúsculo com uma "dobradiça" reta falsa. Isso faz o
 * fechamento da faca criar uma aba extra. Se um painel folha é muito pequeno e
 * compartilha mais borda fragmentada/curva com outro painel do que com seu eixo
 * de dobra, ele é um recorte interno: mantém na árvore como filho estático do
 * painel hospedeiro, sem hinge nem ângulo.
 */
function demoteInternalCutouts(tree: FoldTree, root: string): void {
  const rootArea = tree[root] ? panelAbsArea(tree[root].panel) : 0;
  if (rootArea <= 0) return;

  for (const node of Object.values(tree)) {
    if (!node.parent || !node.hinge || node.children.length > 0) continue;
    const area = panelAbsArea(node.panel);
    if (area > rootArea * 0.012) continue;
    const hingeLen = hingeLength(node.hinge);
    if (hingeLen < 4) continue;

    let hostId: string | null = null;
    let hostScore = 0;
    for (const candidateHost of Object.values(tree)) {
      if (candidateHost.panel.id === node.panel.id || candidateHost.panel.id === node.parent) continue;
      if (panelAbsArea(candidateHost.panel) <= area * 1.4) continue;
      const stats = sharedBoundaryStats(candidateHost.panel, node.panel);
      // total alto + max baixo = contato curvo fragmentado, típico de recorte.
      if (stats.total < Math.max(8, hingeLen * 1.2)) continue;
      if (stats.max > hingeLen * 0.45) continue;
      const score = stats.total - stats.max;
      if (score > hostScore) { hostScore = score; hostId = candidateHost.panel.id; }
    }
    if (!hostId) continue;

    const oldParent = tree[node.parent];
    oldParent.children = oldParent.children.filter((id) => id !== node.panel.id);
    node.parent = hostId;
    node.hinge = null;
    node.target = 0;
    node.sign = 1;
    if (!tree[hostId].children.includes(node.panel.id)) tree[hostId].children.push(node.panel.id);
  }

  const leafIds = new Set(
    Object.values(tree)
      .filter((node) => node.panel.id !== root && node.children.length === 0)
      .map((node) => node.panel.id),
  );
  const cutoutIds = findEdgeCutoutPanelIds(
    Object.values(tree).map((node) => node.panel),
    leafIds,
  );
  for (const id of cutoutIds) {
    const node = tree[id];
    if (!node || !node.parent || node.children.length > 0) continue;
    const parent = tree[node.parent];
    if (parent) parent.children = parent.children.filter((childId) => childId !== id);
    delete tree[id];
  }
}

