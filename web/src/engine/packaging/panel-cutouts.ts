import type { Panel, Pt } from "./dieline-types";

type PanelLike = Pick<Panel, "id" | "polygon">;

export interface PanelCutoutAnalysis {
  panelsToRemove: Set<string>;
  holesByPanel: Record<string, Pt[][]>;
}

function polyArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}

function bbox(poly: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function pointInPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distPtSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distPtPoly(p: Pt, poly: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    d = Math.min(d, distPtSeg(p, a, b));
  }
  return d;
}

function isStrictlyInside(outer: Pt[], inner: Pt[]): boolean {
  const bbO = bbox(outer);
  const bbI = bbox(inner);
  const margin = 0.5;
  if (
    bbI.minX < bbO.minX + margin ||
    bbI.maxX > bbO.maxX - margin ||
    bbI.minY < bbO.minY + margin ||
    bbI.maxY > bbO.maxY - margin
  ) return false;

  for (const p of inner) {
    if (!pointInPoly(outer, p.x, p.y)) return false;
    if (distPtPoly(p, outer) < margin) return false;
  }
  return true;
}

function overlapLen(a1: Pt, a2: Pt, b1: Pt, b2: Pt, eps = 0.8): number {
  const dx = a2.x - a1.x, dy = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const len = Math.hypot(dx, dy);
  if (len < eps) return 0;
  if (Math.abs(dx * dy2 - dy * dx2) > eps * len) return 0;
  if (Math.abs((b1.x - a1.x) * dy - (b1.y - a1.y) * dx) > eps * len) return 0;
  const ux = dx / len, uy = dy / len;
  const t = (p: Pt) => (p.x - a1.x) * ux + (p.y - a1.y) * uy;
  const lo = Math.max(0, Math.min(t(b1), t(b2)));
  const hi = Math.min(len, Math.max(t(b1), t(b2)));
  return Math.max(0, hi - lo);
}

export function sharedBoundaryStats(a: Pt[], b: Pt[]): { total: number; max: number } {
  let total = 0;
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j], b2 = b[(j + 1) % b.length];
      const len = overlapLen(a1, a2, b1, b2);
      if (len <= 0.05) continue;
      total += len;
      max = Math.max(max, len);
    }
  }
  return { total, max };
}

function ringsEquivalent(a: Pt[], b: Pt[], eps = 0.6): boolean {
  if (a.length !== b.length || a.length < 3) return false;
  const same = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) <= eps;
  for (let start = 0; start < b.length; start++) {
    if (!same(a[0], b[start])) continue;
    let ok = true;
    for (let i = 0; i < a.length; i++) {
      if (!same(a[i], b[(start + i) % b.length])) { ok = false; break; }
    }
    if (ok) return true;
    ok = true;
    for (let i = 0; i < a.length; i++) {
      if (!same(a[i], b[(start - i + b.length * 10) % b.length])) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Absorve faces internas que o importador pode ter transformado em painéis:
 * - painel estritamente contido em outro painel vira furo real no host;
 * - microface de recorte de borda/entalhe é descartada sem virar dobra.
 */
export function analyzePanelCutouts(panels: PanelLike[]): PanelCutoutAnalysis {
  const out: PanelCutoutAnalysis = { panelsToRemove: new Set(), holesByPanel: {} };
  if (panels.length < 2) return out;

  const area = new Map(panels.map((p) => [p.id, Math.abs(polyArea(p.polygon))]));
  const maxArea = Math.max(...panels.map((p) => area.get(p.id) ?? 0));
  const byAreaAsc = [...panels].sort((a, b) => (area.get(a.id) ?? 0) - (area.get(b.id) ?? 0));

  const appendHole = (hostId: string, ring: Pt[]) => {
    const arr = (out.holesByPanel[hostId] = out.holesByPanel[hostId] || []);
    if (!arr.some((existing) => ringsEquivalent(existing, ring))) arr.push(ring);
  };

  // Janelas/visores: uma face completamente dentro de outra nunca deve dobrar.
  for (const inner of byAreaAsc) {
    const innerArea = area.get(inner.id) ?? 0;
    if (innerArea < 0.5) continue;
    let host: PanelLike | null = null;
    let hostArea = Infinity;
    for (const candidate of panels) {
      if (candidate.id === inner.id || out.panelsToRemove.has(candidate.id)) continue;
      const candidateArea = area.get(candidate.id) ?? 0;
      if (candidateArea <= innerArea * 1.02) continue;
      if (!isStrictlyInside(candidate.polygon, inner.polygon)) continue;
      if (candidateArea < hostArea) { host = candidate; hostArea = candidateArea; }
    }
    if (!host) continue;
    out.panelsToRemove.add(inner.id);
    appendHole(host.id, inner.polygon);
  }

  return out;
}

/**
 * Detecta microfaces de entalhe/recorte curvo que sobraram como folhas no fold
 * graph. Não gera hole: o contorno do painel vizinho já contém a abertura.
 */
export function findEdgeCutoutPanelIds(panels: PanelLike[], leafPanelIds?: Set<string>): Set<string> {
  const out = new Set<string>();
  if (panels.length < 2) return out;
  const area = new Map(panels.map((p) => [p.id, Math.abs(polyArea(p.polygon))]));
  const maxArea = Math.max(...panels.map((p) => area.get(p.id) ?? 0));
  const byAreaAsc = [...panels].sort((a, b) => (area.get(a.id) ?? 0) - (area.get(b.id) ?? 0));

  for (const panel of byAreaAsc) {
    if (leafPanelIds && !leafPanelIds.has(panel.id)) continue;
    const panelArea = area.get(panel.id) ?? 0;
    if (panelArea <= 0 || panelArea > maxArea * 0.012) continue;

    for (const host of panels) {
      if (host.id === panel.id) continue;
      const hostArea = area.get(host.id) ?? 0;
      if (hostArea <= panelArea * 2.0) continue;
      const stats = sharedBoundaryStats(host.polygon, panel.polygon);
      if (stats.total < Math.max(6, Math.sqrt(panelArea) * 0.55)) continue;
      if (stats.max > Math.max(2.5, stats.total * 0.55)) continue;
      out.add(panel.id);
      break;
    }
  }

  return out;
}