// Filtro estrutural pós-topologia (estilo Heidelberg/ArtiosCAD).
//
// PRINCÍPIO
// ---------
// O grafo planar (cut + crease) pode gerar ciclos fechados onde o crease
// está "tampando" um contorno de cut aberto. Esses ciclos não são painéis
// estruturais — são subdivisões internas. Este módulo recebe os painéis já
// construídos por `buildPanelsFromSegments` e descarta os que falham nos
// critérios de suporte por CUT.
//
// O módulo NÃO insere nenhum segmento novo, NÃO altera segmentos
// existentes, NÃO toca em healing/weld/parser. Apenas reprova faces que
// não passam nos testes parametrizados abaixo.
//
// FEATURE FLAG
// ------------
// `STRUCTURAL_CUT_SUPPORT_FILTER` controla globalmente. Quando false, a
// função `filterStructuralPanels` retorna todos os painéis intactos
// (comportamento legado).
//
// THRESHOLDS
// ----------
// Cada regra é independente e pode ser desligada setando o threshold para
// um valor que nunca dispara (ex.: minMinCreaseEdgeMm = 0).

import type { Panel, Pt, Segment } from "../dieline-types";

export const STRUCTURAL_CUT_SUPPORT_FILTER = true;

export interface StructuralFilterThresholds {
  /** Face precisa ter ≥1 aresta cut no contorno. Reprova faces puramente
   * suportadas por crease (ex.: 4mm-wide strip entre 2 vincos paralelos). */
  requireAtLeastOneCutEdge: boolean;
  /** Menor dimensão do bounding box em mm. Reprova tiras estreitas
   * geradas por par de creases paralelos próximos (ex.: 4mm). */
  minBboxDimMm: number;
  /** Comprimento mínimo (mm) da MENOR aresta crease do contorno. Reprova
   * slivers de canto onde duas creases longas se cruzam e formam um "L"
   * de poucos mm fechando um ciclo com cuts (ex.: hinge de 1.5mm).
   * SÓ é aplicada quando a área do painel é menor que
   * `minCreaseAppliesBelowAreaMm2` — assim não derruba o corpo principal
   * que pode ter uma crease curta vinda de um entalhe. */
  minMinCreaseEdgeMm: number;
  /** Limite de área (mm²) abaixo do qual a regra `minMinCreaseEdgeMm`
   * passa a valer. Painéis grandes (corpo, abas reais) ficam imunes. */
  minCreaseAppliesBelowAreaMm2: number;
  /** Área mínima em mm² (defesa secundária; pode ficar baixa). */
  minAreaMm2: number;
}

export const DEFAULT_STRUCTURAL_THRESHOLDS: StructuralFilterThresholds = {
  requireAtLeastOneCutEdge: true,
  minBboxDimMm: 8,
  minMinCreaseEdgeMm: 5,
  minCreaseAppliesBelowAreaMm2: 1500,
  minAreaMm2: 1,
};

export type EdgeKind = "cut" | "crease" | "perf" | "unknown";

export interface EdgeKindIndex {
  /**
   * Para cada chave de aresta (par de pontos arredondado), o CONJUNTO de tipos
   * que coexistem nessa coordenada. Cut e crease colineares/coincidentes NUNCA
   * são fundidos — ambos ficam armazenados, preservando a distinção topológica
   * usada pelo fold graph (ex.: slot recortado cuja borda direita é cut e
   * coincide com o eixo vertical de um vinco central).
   */
  map: Map<string, Set<EdgeKind>>;
  coarseMap: Map<string, Set<EdgeKind>>;
  sources: Map<string, EdgeSourceRef[]>;
}

export interface EdgeSourceRef {
  segmentIndex: number;
  pairIndex: number;
  kind: EdgeKind;
  pathIndex?: number;
  colorLabel?: string;
  from: [number, number];
  to: [number, number];
  length: number;
}

function ek(a: Pt, b: Pt): string {
  const ax = a.x.toFixed(2), ay = a.y.toFixed(2);
  const bx = b.x.toFixed(2), by = b.y.toFixed(2);
  return ax < bx || (ax === bx && ay <= by)
    ? `${ax},${ay}|${bx},${by}`
    : `${bx},${by}|${ax},${ay}`;
}

function coarseEk(a: Pt, b: Pt): string {
  const ax = a.x.toFixed(1), ay = a.y.toFixed(1);
  const bx = b.x.toFixed(1), by = b.y.toFixed(1);
  return ax < bx || (ax === bx && ay <= by)
    ? `${ax},${ay}|${bx},${by}`
    : `${bx},${by}|${ax},${ay}`;
}

const RANK: Record<EdgeKind, number> = { cut: 3, crease: 2, perf: 1, unknown: 0 };

function addKind(map: Map<string, Set<EdgeKind>>, key: string, kind: EdgeKind) {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  set.add(kind);
}

function addSource(map: Map<string, EdgeSourceRef[]>, key: string, source: EdgeSourceRef) {
  const list = map.get(key);
  if (list) list.push(source); else map.set(key, [source]);
}

export function buildEdgeKindIndexFromSegments(segments: Segment[]): EdgeKindIndex {
  const map = new Map<string, Set<EdgeKind>>();
  const coarseMap = new Map<string, Set<EdgeKind>>();
  const sources = new Map<string, EdgeSourceRef[]>();
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
    const s = segments[segmentIndex];
    let kind: EdgeKind;
    if (s.kind === "cut") kind = "cut";
    else if (s.kind === "crease") kind = "crease";
    else if (s.kind === "perf") kind = "perf";
    else continue;
    const pts = s.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const key = ek(pts[i], pts[i + 1]);
      addKind(map, key, kind);
      addKind(coarseMap, coarseEk(pts[i], pts[i + 1]), kind);
      addSource(sources, key, {
        segmentIndex,
        pairIndex: i,
        kind,
        pathIndex: s.source?.pathIndex,
        colorLabel: s.source?.colorLabel,
        from: [+pts[i].x.toFixed(3), +pts[i].y.toFixed(3)],
        to: [+pts[i + 1].x.toFixed(3), +pts[i + 1].y.toFixed(3)],
        length: +Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y).toFixed(3),
      });
    }
    if (s.closed && pts.length > 2) {
      const key = ek(pts[pts.length - 1], pts[0]);
      addKind(map, key, kind);
      addKind(coarseMap, coarseEk(pts[pts.length - 1], pts[0]), kind);
      addSource(sources, key, {
        segmentIndex,
        pairIndex: pts.length - 1,
        kind,
        pathIndex: s.source?.pathIndex,
        colorLabel: s.source?.colorLabel,
        from: [+pts[pts.length - 1].x.toFixed(3), +pts[pts.length - 1].y.toFixed(3)],
        to: [+pts[0].x.toFixed(3), +pts[0].y.toFixed(3)],
        length: +Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y).toFixed(3),
      });
    }
  }
  return { map, coarseMap, sources };
}

/**
 * Tolerâncias do matcher aresta-de-painel ↔ segmento estrutural.
 *
 * BUG HISTÓRICO: a versão anterior usava `|cross| > 0.05 * len_panel` como
 * teste de colinearidade. `cross` aqui é o produto vetorial entre os vetores
 * direção do segmento e da aresta, ou seja, vale `len_seg · len_panel ·
 * sin(θ)`. O teste não dividia por `len_seg`, então a tolerância efetiva em
 * ângulo virava `0.05 / len_seg` rad — para um segmento de 70mm, ~0.04°.
 * Qualquer micro-rotação introduzida pelo snapping do kernel (ex.: painel
 * fechando com x=90 num ponto e x=90.5 no outro, criando ~0.4° de inclinação
 * sobre 70mm) já bastava para o segmento crease real ser rejeitado, e a
 * aresta voltava UNKNOWN. Agora normalizamos por `sin(θ)` e usamos uma
 * checagem explícita de distância perpendicular.
 */
const PARALLEL_SIN_TOL = 0.035; // ~2°
const PERP_DIST_TOL_MM = 1.0;

export interface EdgeMatchCandidate {
  segKey: string;
  segA: [number, number];
  segB: [number, number];
  kinds: EdgeKind[];
  sinTheta: number;
  perpDistMm: number;
  tMin: number;
  tMax: number;
  accepted: boolean;
  reject?: "not-parallel" | "perp-too-far" | "no-overlap" | "zero-length";
}

interface ClassifyOpts {
  collectCandidates?: boolean;
  /** Limite max de distância perpendicular para LISTAR candidatos (não para aceitar). */
  candidateNearMm?: number;
}

/** Retorna TODOS os tipos presentes na aresta (cut+crease coincidentes ⇒ ambos). */
export function classifyPanelEdgeAll(
  a: Pt,
  b: Pt,
  idx: EdgeKindIndex,
  opts?: ClassifyOpts,
): Set<EdgeKind> & { candidates?: EdgeMatchCandidate[] } {
  const out = new Set<EdgeKind>() as Set<EdgeKind> & { candidates?: EdgeMatchCandidate[] };
  const candidates: EdgeMatchCandidate[] | undefined = opts?.collectCandidates ? [] : undefined;
  const direct = idx.map.get(ek(a, b));
  if (direct) {
    for (const k of direct) out.add(k);
    if (candidates) out.candidates = candidates;
    return out;
  }
  const coarse = idx.coarseMap.get(coarseEk(a, b));
  if (coarse) {
    for (const k of coarse) out.add(k);
    if (candidates) out.candidates = candidates;
    return out;
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) {
    if (candidates) out.candidates = candidates;
    return out;
  }
  const nearMm = opts?.candidateNearMm ?? 5;
  for (const [key, kinds] of idx.map.entries()) {
    const [pa, pb] = key.split("|");
    const [ax, ay] = pa.split(",").map(parseFloat);
    const [bx, by] = pb.split(",").map(parseFloat);
    const sx = bx - ax, sy = by - ay;
    const slen = Math.hypot(sx, sy);
    if (slen < 1e-3) {
      if (candidates) candidates.push({
        segKey: key, segA: [ax, ay], segB: [bx, by], kinds: [...kinds],
        sinTheta: NaN, perpDistMm: NaN, tMin: NaN, tMax: NaN,
        accepted: false, reject: "zero-length",
      });
      continue;
    }
    // sin(θ) entre direções: |a×b|/(|a||b|).
    const cross = sx * dy - sy * dx;
    const sinTheta = Math.abs(cross) / (slen * len);
    // Distância perpendicular dos endpoints do painel até a LINHA do segmento.
    const distA = Math.abs((a.x - ax) * sy - (a.y - ay) * sx) / slen;
    const distB = Math.abs((b.x - ax) * sy - (b.y - ay) * sx) / slen;
    const perpDist = Math.max(distA, distB);
    const slen2 = slen * slen;
    const tA = ((a.x - ax) * sx + (a.y - ay) * sy) / slen2;
    const tB = ((b.x - ax) * sx + (b.y - ay) * sy) / slen2;
    const tmin = Math.min(tA, tB), tmax = Math.max(tA, tB);

    let reject: EdgeMatchCandidate["reject"] | undefined;
    if (sinTheta > PARALLEL_SIN_TOL) reject = "not-parallel";
    else if (perpDist > PERP_DIST_TOL_MM) reject = "perp-too-far";
    else if (!(tmin < 1.02 && tmax > -0.02)) reject = "no-overlap";

    const accepted = !reject;
    if (accepted) for (const k of kinds) out.add(k);

    if (candidates && (accepted || perpDist <= nearMm)) {
      candidates.push({
        segKey: key, segA: [ax, ay], segB: [bx, by], kinds: [...kinds],
        sinTheta: +sinTheta.toFixed(4),
        perpDistMm: +perpDist.toFixed(3),
        tMin: +tmin.toFixed(3),
        tMax: +tmax.toFixed(3),
        accepted, reject,
      });
    }
  }
  if (candidates) out.candidates = candidates;
  return out;
}

/**
 * Tipo "dominante" para contagem de arestas de painel (cut > crease > perf).
 * Mantido para compatibilidade com o contador estatístico do filtro estrutural.
 */
export function classifyPanelEdge(a: Pt, b: Pt, idx: EdgeKindIndex): EdgeKind {
  const all = classifyPanelEdgeAll(a, b, idx);
  if (!all.size) return "unknown";
  let best: EdgeKind = "unknown";
  for (const k of all) if (RANK[k] > RANK[best]) best = k;
  return best;
}

/** Há vinco coincidente nessa aresta (mesmo que também haja cut sobreposto)? */
export function panelEdgeHasCrease(a: Pt, b: Pt, idx: EdgeKindIndex): boolean {
  return classifyPanelEdgeAll(a, b, idx).has("crease");
}

function polygonAreaAbs(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(a) / 2;
}

function bboxMinDim(poly: Pt[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.min(maxX - minX, maxY - minY);
}

export interface DroppedPanel {
  id: string;
  label: string;
  area: number;
  bboxMinDim: number;
  edgeCounts: { cut: number; crease: number; perf: number; unknown: number };
  edgeLens: { cut: number; crease: number };
  minCreaseEdge: number;
  /** Lista de regras violadas, em ordem. */
  reasons: string[];
}

export interface StructuralFilterReport {
  enabled: boolean;
  thresholds: StructuralFilterThresholds;
  panelsBefore: number;
  panelsAfter: number;
  droppedCount: number;
  droppedAreaTotal: number;
  dropped: DroppedPanel[];
}

export interface FilterResult {
  kept: Panel[];
  report: StructuralFilterReport;
}

/**
 * Aplica as regras de suporte estrutural por CUT a um conjunto de painéis.
 * Não muta os painéis nem os segmentos. Retorna o subconjunto que passa
 * em TODAS as regras ativas, mais um relatório detalhado dos descartes.
 */
export function filterStructuralPanels(
  panels: Panel[],
  segments: Segment[],
  thresholds: StructuralFilterThresholds = DEFAULT_STRUCTURAL_THRESHOLDS,
  enabled: boolean = STRUCTURAL_CUT_SUPPORT_FILTER,
): FilterResult {
  if (!enabled || !panels.length) {
    return {
      kept: panels,
      report: {
        enabled,
        thresholds,
        panelsBefore: panels.length,
        panelsAfter: panels.length,
        droppedCount: 0,
        droppedAreaTotal: 0,
        dropped: [],
      },
    };
  }

  const idx = buildEdgeKindIndexFromSegments(segments);
  const kept: Panel[] = [];
  const dropped: DroppedPanel[] = [];

  // === Mapa de pontes de crease entre painéis =================================
  // Para cada aresta de crease, registra os painéis que a compartilham. Um
  // painel é "ponte topológica" se ao menos uma de suas creases é dividida
  // com >=2 outros painéis distintos (ou seja, conecta vizinhos que não se
  // conectam diretamente entre si). Esses painéis NUNCA podem ser descartados
  // pelo filtro estrutural — removê-los desconectaria o fold graph.
  const creaseEdgeToPanels = new Map<string, Set<string>>();
  for (const panel of panels) {
    const poly = panel.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      // Considera vinco mesmo quando cut e crease coexistem na mesma coordenada
      // (ex.: borda direita de slot recortado colinear com vinco central).
      if (!panelEdgeHasCrease(a, b, idx)) continue;
      const key = ek(a, b);
      let set = creaseEdgeToPanels.get(key);
      if (!set) { set = new Set(); creaseEdgeToPanels.set(key, set); }
      set.add(panel.id);
    }
  }
  const isBridgePanel = (panel: Panel): boolean => {
    const neighbors = new Set<string>();
    const poly = panel.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (!panelEdgeHasCrease(a, b, idx)) continue;
      const set = creaseEdgeToPanels.get(ek(a, b));
      if (!set) continue;
      for (const id of set) if (id !== panel.id) neighbors.add(id);
    }
    return neighbors.size >= 2;
  };


  for (const panel of panels) {
    const poly = panel.polygon;
    let cut = 0, crease = 0, perf = 0, unknown = 0;
    let lenCut = 0, lenCrease = 0;
    let minCreaseEdge = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const k = classifyPanelEdge(a, b, idx);
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (k === "cut") { cut++; lenCut += l; }
      else if (k === "crease") {
        crease++; lenCrease += l;
        if (l < minCreaseEdge) minCreaseEdge = l;
      }
      else if (k === "perf") perf++;
      else unknown++;
    }
    if (minCreaseEdge === Infinity) minCreaseEdge = 0;

    const area = polygonAreaAbs(poly);
    const minDim = bboxMinDim(poly);
    const reasons: string[] = [];

    if (area < thresholds.minAreaMm2) {
      reasons.push(`area ${area.toFixed(1)}mm² < ${thresholds.minAreaMm2}mm²`);
    }
    // Regra "sem aresta cut": só se aplica a painéis PEQUENOS. A face
    // principal de uma caixa multi-painel tem TODAS as bordas vincadas
    // (creases de dobra para os painéis vizinhos) e é estrutural mesmo
    // sem nenhum cut no contorno. O alvo desta regra são slivers de
    // poucos mm entre vincos paralelos próximos.
    if (
      thresholds.requireAtLeastOneCutEdge &&
      cut === 0 &&
      area < thresholds.minCreaseAppliesBelowAreaMm2
    ) {
      reasons.push(`sem aresta cut (suportado 100% por crease)`);
    }
    if (minDim < thresholds.minBboxDimMm) {
      reasons.push(`bbox min ${minDim.toFixed(1)}mm < ${thresholds.minBboxDimMm}mm`);
    }
    if (
      crease > 0 &&
      minCreaseEdge < thresholds.minMinCreaseEdgeMm &&
      area < thresholds.minCreaseAppliesBelowAreaMm2
    ) {
      reasons.push(
        `menor crease ${minCreaseEdge.toFixed(1)}mm < ${thresholds.minMinCreaseEdgeMm}mm (área ${area.toFixed(0)}mm² < ${thresholds.minCreaseAppliesBelowAreaMm2}mm²)`,
      );
    }

    if (reasons.length === 0) {
      kept.push(panel);
    } else if (isBridgePanel(panel)) {
      // Painel reprovado pelas regras geométricas mas é PONTE topológica:
      // tem ≥2 arestas crease compartilhadas com ≥2 painéis distintos.
      // Mantemos INDEPENDENTE de largura — slivers de 4mm que conectam
      // painéis laterais ao corpo (via crease em AMBOS os lados longos)
      // são a única ligação entre eles. Removê-los orfaniza os laterais.
      //
      // O caso oposto (slivers de 4mm entre CUTS paralelas, artefato do
      // ArtiosCAD que dobra a aba 2× a 90°) NÃO cai aqui porque
      // isBridgePanel exige crease compartilhada com ≥2 painéis — slivers
      // entre cuts não têm crease nos lados longos, então retornam false
      // e são descartados pelas regras geométricas normais.
      kept.push(panel);
    } else if (area >= 500 && crease >= 1 && minDim >= thresholds.minBboxDimMm) {
      // Painel substancial (>=500mm²) + crease + NÃO é tira estreita.
      // Aba real conectada por dobradiça. (Fix para abas arredondadas com
      // muitos vértices cujo menor segmento de crease cai abaixo do
      // threshold por discretização.)
      // IMPORTANTE: exigir bboxMinDim >= 8mm exclui os "canais de vinco"
      // de 4mm que o ArtiosCAD gera entre duas cuts paralelas — esses
      // slivers NÃO são painéis, são o próprio vinco, e se mantidos
      // criam uma dobradiça-fantasma que dobra a aba vizinha 2× a 90°.
      kept.push(panel);
    } else {
      dropped.push({
        id: panel.id,
        label: panel.label,
        area,
        bboxMinDim: minDim,
        edgeCounts: { cut, crease, perf, unknown },
        edgeLens: { cut: lenCut, crease: lenCrease },
        minCreaseEdge,
        reasons,
      });
    }
  }


  return {
    kept,
    report: {
      enabled,
      thresholds,
      panelsBefore: panels.length,
      panelsAfter: kept.length,
      droppedCount: dropped.length,
      droppedAreaTotal: dropped.reduce((s, d) => s + d.area, 0),
      dropped,
    },
  };
}
