// Detecta loops fechados de corte interno ("janelas/vazados") por painel.
// Os segmentos kind="cut" do PDF podem chegar como vários sub-caminhos abertos
// (curvas Bézier separadas). Aqui estitchamos endpoints e atribuímos cada loop
// ao painel que o contém — para gerar furos reais na ExtrudeGeometry.
//
// **Fonte da verdade:** se o CAD kernel já produziu holes definitivos
// (`getKernelHolePolygons`), eles são usados PRIMEIRO. A detecção legacy
// (stitch + heurística) só é aplicada para preencher gaps que o kernel
// não cobriu, garantindo retrocompatibilidade.
import type { Dieline, Panel, Pt } from "./dieline-types";
import { getKernelHolePolygons } from "./spot-mapping";
import { analyzePanelCutouts } from "./panel-cutouts";

const STITCH_TOL = 2.0; // mm — subido para fechar janelas cujos sub-caminhos cut chegam com gap até 2mm (curvas Bézier discretizadas + tolerância de exportação CAD)
const BOUNDARY_TOL = 0.5; // mm


function pointInPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
function polyArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}
function polyBBox(poly: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
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
    const dd = distPtSeg(p, a, b);
    if (dd < d) d = dd;
  }
  return d;
}

function stitchClosedRings(segs: { pts: Pt[] }[]): Pt[][] {
  const rings: Pt[][] = [];
  const chains = segs.map((s) => s.pts.slice());
  const used = new Array(chains.length).fill(false);
  for (let i = 0; i < chains.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let chain = chains[i].slice();
    let extended = true;
    while (extended) {
      extended = false;
      const start = chain[0];
      const end = chain[chain.length - 1];
      if (chain.length >= 4 && Math.hypot(start.x - end.x, start.y - end.y) <= STITCH_TOL) break;
      for (let j = 0; j < chains.length; j++) {
        if (used[j]) continue;
        const cj = chains[j];
        const js = cj[0], je = cj[cj.length - 1];
        if (Math.hypot(end.x - js.x, end.y - js.y) <= STITCH_TOL) {
          chain = chain.concat(cj.slice(1));
          used[j] = true; extended = true; break;
        }
        if (Math.hypot(end.x - je.x, end.y - je.y) <= STITCH_TOL) {
          chain = chain.concat(cj.slice(0, -1).reverse());
          used[j] = true; extended = true; break;
        }
        if (Math.hypot(start.x - je.x, start.y - je.y) <= STITCH_TOL) {
          chain = cj.slice(0, -1).concat(chain);
          used[j] = true; extended = true; break;
        }
        if (Math.hypot(start.x - js.x, start.y - js.y) <= STITCH_TOL) {
          chain = cj.slice(1).reverse().concat(chain);
          used[j] = true; extended = true; break;
        }
      }
    }
    const s = chain[0], e = chain[chain.length - 1];
    if (chain.length >= 4 && Math.hypot(s.x - e.x, s.y - e.y) <= STITCH_TOL) {
      rings.push(chain.slice(0, -1));
    }
  }
  return rings;
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

/** True se `inner` está estritamente dentro de `outer` sem encostar na borda. */
function isStrictlyInside(outer: Pt[], inner: Pt[]): boolean {
  const bbO = bbox(outer);
  const bbI = bbox(inner);
  const MARGIN = 0.5; // mm — folga para descartar painéis que apenas compartilham aresta
  if (
    bbI.minX < bbO.minX + MARGIN ||
    bbI.maxX > bbO.maxX - MARGIN ||
    bbI.minY < bbO.minY + MARGIN ||
    bbI.maxY > bbO.maxY - MARGIN
  ) return false;
  for (const p of inner) {
    if (!pointInPoly(outer, p.x, p.y)) return false;
    if (distPtPoly(p, outer) < BOUNDARY_TOL) return false;
  }
  return true;
}

interface HoleAnalysis {
  /** IDs de painéis que devem ser removidos por serem janelas/flaps internos. */
  panelsToRemove: Set<string>;
  /** Furos por painel-host. Inclui loops puros de corte + polígonos dos flaps removidos. */
  holesByPanel: Record<string, Pt[][]>;
}

function samePt(a: Pt, b: Pt, eps = 0.6) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

function ringsEquivalent(a: Pt[], b: Pt[], eps = 0.6) {
  if (a.length !== b.length || a.length < 3) return false;
  let start = -1;
  for (let i = 0; i < b.length; i++) {
    if (samePt(a[0], b[i], eps)) {
      start = i;
      break;
    }
  }
  if (start < 0) return false;

  let forward = true;
  for (let i = 0; i < a.length; i++) {
    if (!samePt(a[i], b[(start + i) % b.length], eps)) {
      forward = false;
      break;
    }
  }
  if (forward) return true;

  for (let i = 0; i < a.length; i++) {
    const bi = (start - i + b.length * 10) % b.length;
    if (!samePt(a[i], b[bi], eps)) return false;
  }
  return true;
}

/**
 * Detecta TODOS os vazados internos de um painel:
 *  1. Loops fechados formados apenas por segmentos kind="cut" (vazado clássico).
 *  2. Painéis inteiros contidos estritamente em painéis maiores. Acontece quando
 *     o desenho usa mistura de cortes + vincos para delimitar a janela — o
 *     planar-faces gera um painel-filho que, na verdade, é o vazado em si.
 *     Esses painéis são removidos da renderização e seu polígono vira o buraco.
 */
function analyzeHoles(dieline: Dieline): HoleAnalysis {
  const out: HoleAnalysis = { panelsToRemove: new Set(), holesByPanel: {} };

  const appendHole = (panelId: string, ring: Pt[]) => {
    const arr = (out.holesByPanel[panelId] = out.holesByPanel[panelId] || []);
    if (arr.some((existing) => ringsEquivalent(existing, ring))) return;
    arr.push(ring);
  };

  // ---------- (0) Holes já propagados ao Panel pelo kernel ----------
  // Esta é a fonte de verdade mais segura para o 3D. Se um painel já carrega
  // `panel.holes`, não devemos reinterpretar qualquer painel contido como furo
  // apenas por containment geométrico, pois isso pode remover painéis válidos
  // (slivers/ponte) do fold graph.
  let hasExplicitPanelHoles = false;
  for (const panel of dieline.panels) {
    if (!panel.holes?.length) continue;
    hasExplicitPanelHoles = true;
    for (const ring of panel.holes) appendHole(panel.id, ring);
  }

  // ---------- (0) Holes do CAD kernel (fonte da verdade) ----------
  // Cada hole-loop classificado pelo kernel é atribuído ao MENOR painel
  // que o contém estritamente. Não compete com a heurística legacy abaixo
  // — apenas evita que loops já decididos sejam reanalisados.
  const kernelHoles = getKernelHolePolygons();
  const claimedKernel = new Set<Pt[]>();
  if (kernelHoles.length) {
    const panelsByAreaAsc = [...dieline.panels].sort(
      (a, b) => Math.abs(polyArea(a.polygon)) - Math.abs(polyArea(b.polygon)),
    );
    for (const ring of kernelHoles) {
      const ringArea = Math.abs(polyArea(ring));
      if (ringArea < 0.5) continue;
      let host: Panel | null = null;
      for (const p of panelsByAreaAsc) {
        const pArea = Math.abs(polyArea(p.polygon));
        if (pArea <= ringArea * 1.02) continue;
        if (!isStrictlyInside(p.polygon, ring)) continue;
        host = p;
        break;
      }
      if (!host) continue;
      appendHole(host.id, ring);
      claimedKernel.add(ring);
    }
  }


  // ---------- (1) Loops puros de corte ----------
  const cutSegs = dieline.segments
    .filter((s) => s.kind === "cut" && s.points.length >= 2)
    .map((s) => ({ pts: s.points, bb: polyBBox(s.points) }));

  const panelsSorted = [...dieline.panels].sort(
    (a, b) => Math.abs(polyArea(a.polygon)) - Math.abs(polyArea(b.polygon)),
  );

  if (cutSegs.length) {
    const claimed = new Set<typeof cutSegs[number]>();
    for (const panel of panelsSorted) {
      const pBB = polyBBox(panel.polygon);
      const panelArea = Math.abs(polyArea(panel.polygon));
      const candidates = cutSegs.filter((seg) => {
        if (claimed.has(seg)) return false;
        if (
          seg.bb.minX < pBB.minX - 0.1 || seg.bb.maxX > pBB.maxX + 0.1 ||
          seg.bb.minY < pBB.minY - 0.1 || seg.bb.maxY > pBB.maxY + 0.1
        ) return false;
        const a = seg.pts[0], b = seg.pts[seg.pts.length - 1];
        if (distPtPoly(a, panel.polygon) < BOUNDARY_TOL) return false;
        if (distPtPoly(b, panel.polygon) < BOUNDARY_TOL) return false;
        let cx = 0, cy = 0;
        for (const p of seg.pts) { cx += p.x; cy += p.y; }
        cx /= seg.pts.length; cy /= seg.pts.length;
        if (!pointInPoly(panel.polygon, cx, cy)) return false;
        return true;
      });
      if (!candidates.length) continue;
      const rings = stitchClosedRings(candidates);
      for (const ring of rings) {
        const a = Math.abs(polyArea(ring));
        if (a < 0.5 || a >= panelArea * 0.98) continue;
        appendHole(panel.id, ring);
      }
      for (const c of candidates) claimed.add(c);
    }
  }

  // ---------- (1b) Fallback: stitch global de TODOS os cut segments ----------
  // Quando o vazado tem endpoints exatamente sobre a borda do painel (slot/
  // janela cujos cantos coincidem com vértices do contorno), o filtro
  // `distPtPoly < BOUNDARY_TOL` da etapa (1) descarta os candidatos e a
  // janela nunca se forma. Aqui ignoramos esse filtro: stitchamos TODOS
  // os segmentos cut globalmente e atribuímos cada loop fechado ao MENOR
  // painel cujo centróide do loop esteja dentro e cuja área seja >> que a
  // do loop. Faz pareamento por geometria, não por endpoint-containment.
  {
    const allCut = dieline.segments
      .filter((s) => s.kind === "cut" && s.points.length >= 2)
      .map((s) => ({ pts: s.points }));
    if (allCut.length) {
      const rings = stitchClosedRings(allCut);
      for (const ring of rings) {
        const ringArea = Math.abs(polyArea(ring));
        if (ringArea < 0.5) continue;
        let cx = 0, cy = 0;
        for (const p of ring) { cx += p.x; cy += p.y; }
        cx /= ring.length; cy /= ring.length;
        let host: Panel | null = null;
        let hostArea = Infinity;
        for (const panel of dieline.panels) {
          const pArea = Math.abs(polyArea(panel.polygon));
          if (pArea <= ringArea * 1.02) continue;
          if (!pointInPoly(panel.polygon, cx, cy)) continue;
          if (pArea < hostArea) {
            host = panel;
            hostArea = pArea;
          }
        }
        if (host) appendHole(host.id, ring);
      }
    }
  }


  // ---------- (2) Remoção de painéis internos que são vazados reais ----------
  // Se o planar-faces perdeu a propagação de holes, a janela aparece como um
  // painel contido dentro do corpo. Isso nunca deve virar dobra: absorvemos o
  // painel como hole do host antes de montar a árvore/mesh 3D.
  const containedCutouts = analyzePanelCutouts(dieline.panels);
  for (const [hostId, rings] of Object.entries(containedCutouts.holesByPanel)) {
    for (const ring of rings) appendHole(hostId, ring);
  }
  for (const panelId of containedCutouts.panelsToRemove) out.panelsToRemove.add(panelId);

  if (!hasExplicitPanelHoles && kernelHoles.length === 0 && containedCutouts.panelsToRemove.size === 0) return out;

  const knownHoles = Object.entries(out.holesByPanel).flatMap(([hostId, rings]) =>
    rings.map((ring) => ({ hostId, ring })),
  );
  for (const inner of dieline.panels) {
    const match = knownHoles.find(({ hostId, ring }) => hostId !== inner.id && ringsEquivalent(inner.polygon, ring));
    if (!match) continue;
    out.panelsToRemove.add(inner.id);
    appendHole(match.hostId, inner.polygon);
  }

  return out;
}

export function computeInternalHolesByPanel(dieline: Dieline): Record<string, Pt[][]> {
  return analyzeHoles(dieline).holesByPanel;
}

export function stripInternalHolePanels(dieline: Dieline): Panel[] {
  const { panelsToRemove } = analyzeHoles(dieline);
  if (!panelsToRemove.size) return dieline.panels;
  return dieline.panels.filter((p) => !panelsToRemove.has(p.id));
}

