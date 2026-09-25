// Persistência da escolha do usuário (cor → tipo) e construção do Dieline a partir do import.
import type { ClosureKind, Dieline, DielineParams, FinishLayer, Panel, Pt, Segment, SegmentKind } from "./dieline-types";
import type { ImportResult } from "./pdf-dieline-parser";
import { isIgnoredImportedStroke } from "./pdf-dieline-parser";
import { buildPanelsFromSegments, getLastCadIssues } from "./planar-faces";
import { classifyStroke } from "./cad/stroke-classifier";
import { CAD_PRESERVE_GEOMETRY_TOL, type CadIssues } from "./cad/tolerances";
import type { CurveHealingDebug } from "./cad/curve-healing";
import { healExplodedCurves } from "./cad/curve-healing";
import { reclassifyInternalCuts } from "./cad/internal-cut-detector";
import { detectClosure, extractAbsorbedFlapLobes, recoverMissingBodyPanels, recoverMissingFlapPanels, relabelPanels } from "./closure-detector";
import { classifyFinishSpot, type FinishKind } from "./finishes/pantone-finishes";
import { buildEdgeKindIndexFromSegments, classifyPanelEdgeAll, filterStructuralPanels, type StructuralFilterReport } from "./cad/structural-filter";
import { runCadKernel, type KernelResult } from "./cad/kernel";

export type MapKind = SegmentKind | "ignore" | FinishKind;

/** Holes derivados do kernel CAD (loops fechados de cut, classificados por nesting).
 *  Persistidos por sessão de import para `part-scene` / `internal-holes` consumirem
 *  como fonte de verdade absoluta — ignorando heurísticas conflitantes downstream. */
let lastKernelResult: KernelResult | null = null;
export function getLastKernelResult(): KernelResult | null {
  return lastKernelResult;
}
/** Polígonos de holes detectados pelo kernel, sem agrupamento por painel ainda.
 *  `internal-holes` consome esta lista e atribui ao painel-host por containment. */
export function getKernelHolePolygons(): Pt[][] {
  if (!lastKernelResult) return [];
  return lastKernelResult.holeLoops.map((l) => l.points.map((p) => ({ x: p.x, y: p.y })));
}

const STORAGE_KEY = "packaging:spot-mapping:v1";

export function loadMappings(): Record<string, MapKind> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveMappings(map: Record<string, MapKind>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function isFinishKind(k: MapKind): k is FinishKind {
  return k === "foil-gold" || k === "foil-silver" || k === "uv-flood" || k === "uv-spot" || k === "emboss" || k === "deboss";
}

/** Heurística inicial: classifica pelo nome do spot ou pela cor. */
export function guessKind(colorKey: string, label: string): MapKind {
  const finish = classifyFinishSpot(colorKey, label);
  if (finish) return finish.kind;
  return classifyStroke(colorKey, label);
}

export function resolveImportedMapping(colorKey: string, label: string, current?: MapKind): MapKind {
  const guessed = guessKind(colorKey, label);
  if (!current) return guessed;
  // Migração: se o usuário tinha "cut" salvo mas hoje o classificador identifica
  // como vinco/perf por dash ou cor, prefere a nova classificação.
  if (current === "cut" && (guessed === "crease" || guessed === "perf")) return guessed;
  // Migração: nova classificação como acabamento sobrescreve mappings antigos
  // de cut/ignore (essas spots não deveriam ter virado faca).
  if (isFinishKind(guessed) && (current === "cut" || current === "ignore")) return guessed;
  return current;
}

/**
 * Detecta convenção INVERTIDA de cor (verde=cut, vermelho=crease) examinando
 * a geometria de todos os paths. Convenção padrão CAD: cut tem o contorno
 * externo da peça (paths fechados, com cantos arredondados/curvas) e
 * crease são linhas retas axiais no interior. Quando o designer inverte isso
 * (PDFs com verde = corte externo, vermelho = vinco interno), classifyStroke
 * acerta a SEMÂNTICA da cor mas erra a FUNÇÃO da camada no dieline.
 *
 * Se entre as cores classificadas como {cut, crease} a "crease" tem paths
 * fechados (com curvas) e a "cut" só tem segmentos axiais retos sem
 * loops fechados, troca os papéis para essas duas cores.
 */
export function resolveImportedMappingsWithContext(
  paths: ImportResult["paths"],
  colors: ImportResult["colors"],
  currentMapping: Record<string, MapKind>,
): Record<string, MapKind> {
  // Camada 1 (Dieline Source of Truth): a classificação base nasce da
  // importação atual, não de ajustes estruturais posteriores nem de mappings
  // persistidos de uma faca anterior. O bug do anexo nasceu justamente aqui:
  // mappings antigos forçavam todas as cores para `crease`, gerando
  // `segmentsByKind: { crease: 97 }` e destruindo a faca antes da pipeline.
  //
  // `currentMapping` continua existindo para edição manual via `setMapping`,
  // mas em novo import o default volta a ser o classificador de stroke +
  // heurística contextual de cores.
  const next: Record<string, MapKind> = {};
  for (const c of colors) {
    next[c.key] = resolveImportedMapping(c.key, c.label, undefined);
  }

  type Stat = {
    closedCurved: number;
    closedTotal: number;
    openTotal: number;
    curvedTotal: number;
    straightAxial: number;
    totalLen: number;
    bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
  };
  const stats = new Map<string, Stat>();
  const ensure = (k: string): Stat => {
    let s = stats.get(k);
    if (!s) {
      s = {
        closedCurved: 0,
        closedTotal: 0,
        openTotal: 0,
        curvedTotal: 0,
        straightAxial: 0,
        totalLen: 0,
        bbox: null,
      };
      stats.set(k, s);
    }
    return s;
  };
  for (const p of paths) {
    const s = ensure(p.colorKey);
    let len = 0;
    for (let i = 1; i < p.points.length; i++) {
      len += Math.hypot(p.points[i].x - p.points[i - 1].x, p.points[i].y - p.points[i - 1].y);
    }
    s.totalLen += len;
    if (p.hasCurves) s.curvedTotal++;
    for (const pt of p.points) {
      if (!s.bbox) s.bbox = { minX: pt.x, minY: pt.y, maxX: pt.x, maxY: pt.y };
      else {
        s.bbox.minX = Math.min(s.bbox.minX, pt.x);
        s.bbox.minY = Math.min(s.bbox.minY, pt.y);
        s.bbox.maxX = Math.max(s.bbox.maxX, pt.x);
        s.bbox.maxY = Math.max(s.bbox.maxY, pt.y);
      }
    }
    if (p.closed) {
      s.closedTotal++;
      if (p.hasCurves) s.closedCurved++;
    } else {
      s.openTotal++;
      const dx = Math.abs(p.points[1].x - p.points[0].x);
      const dy = Math.abs(p.points[1].y - p.points[0].y);
      if (dx < 0.05 || dy < 0.05) s.straightAxial++;
    }
  }

  const dominant = (kind: MapKind): string | null => {
    let best: string | null = null;
    let bestLen = 0;
    for (const [k, m] of Object.entries(next)) {
      if (m !== kind) continue;
      const s = stats.get(k);
      if (!s) continue;
      if (s.totalLen > bestLen) { bestLen = s.totalLen; best = k; }
    }
    return best;
  };

  const cutKey = dominant("cut");
  const creaseKey = dominant("crease");
  if (cutKey && creaseKey && cutKey !== creaseKey) {
    const cs = stats.get(cutKey)!;
    const cr = stats.get(creaseKey)!;
    const creaseBiggerOrEnvelopsCut = (() => {
      if (cr.totalLen >= cs.totalLen * 1.08) return true;
      if (!cr.bbox || !cs.bbox) return false;
      const crW = cr.bbox.maxX - cr.bbox.minX;
      const crH = cr.bbox.maxY - cr.bbox.minY;
      const csW = cs.bbox.maxX - cs.bbox.minX;
      const csH = cs.bbox.maxY - cs.bbox.minY;
      return crW >= csW * 0.95 && crH >= csH * 0.95;
    })();
    const creaseLooksLikeCut =
      cr.closedCurved >= 1 ||
      (cr.closedTotal >= 1 && cs.closedTotal === 0) ||
      (cr.closedTotal === 0 && cr.curvedTotal >= 1 && creaseBiggerOrEnvelopsCut);
    const cutLooksLikeCrease =
      cs.closedTotal === 0 &&
      (
        cs.straightAxial >= 4 ||
        (
          cs.openTotal >= 4 &&
          cs.curvedTotal === 0 &&
          cr.curvedTotal >= 1 &&
          cs.totalLen < cr.totalLen * 0.95 &&
          creaseBiggerOrEnvelopsCut
        )
      );
    if (creaseLooksLikeCut && cutLooksLikeCrease) {
      next[cutKey] = "crease";
      next[creaseKey] = "cut";
    }
  }

  return next;
}

function repairPathologicalImportedMapping(
  paths: ImportResult["paths"],
  colors: ImportResult["colors"],
  mapping: Record<string, MapKind>,
): Record<string, MapKind> {
  const usedColors = new Set(paths.map((p) => p.colorKey));
  const usedKinds = new Set<MapKind>();
  for (const key of usedColors) {
    const k = mapping[key];
    if (k) usedKinds.add(k);
  }

  // Faca estrutural sem nenhum CUT é inválida para cartonagem: normalmente é
  // mapping persistido antigo ou cor invertida. O anexo falhava exatamente com
  // `segmentsByKind: { crease: 97 }`. Nessa condição, recalcula o mapping de
  // importação a partir das cores/geometria atuais, preservando o 2D como fonte
  // de verdade e impedindo que o Fold Graph receba lixo topológico.
  const hasCut = usedKinds.has("cut");
  const structuralCount = [...usedKinds].filter((k) => k === "cut" || k === "crease" || k === "perf").length;
  if (hasCut || structuralCount === 0) return mapping;

  const contextual = resolveImportedMappingsWithContext(paths, colors, {});
  const contextualHasCut = [...usedColors].some((key) => contextual[key] === "cut");
  if (!contextualHasCut) return mapping;

  return contextual;
}

/** Último relatório de issues do CAD pipeline (após buildDielineFromImport). */
let lastIssues: CadIssues | null = null;
let lastCurveDebug: CurveHealingDebug | null = null;
export function getLastImportIssues(): CadIssues | null {
  return lastIssues;
}

export function getLastCurveDebug(): CurveHealingDebug | null {
  return lastCurveDebug;
}

/**
 * Flags arquiteturais (mutáveis em runtime para A/B isolado).
 *  - PIPELINE_RESCUE_ENABLED: liga orphan rescue + recoverMissingBodyPanels +
 *    recoverMissingFlapPanels + extractAbsorbedFlapLobes.
 *  - STRUCTURAL_FILTER_ENABLED: aplica filterStructuralPanels (suporte por CUT).
 * Use os setters abaixo + reimport para isolar regressões sem tocar parser/healing.
 */
// Default restaurado para o comportamento da baseline 6416c35:
// rescue ON compensa as descontinuidades geométricas reais (8 open ends nos
// chanfros) que existem desde sempre no parser. O filtro estrutural por CUT
// permanece ativo para impedir que CREASE crie painéis estruturais.
export let PIPELINE_RESCUE_ENABLED = true;
export let STRUCTURAL_FILTER_ENABLED = true;
export function setPipelineRescueEnabled(v: boolean) { PIPELINE_RESCUE_ENABLED = v; }
export function setStructuralFilterEnabled(v: boolean) { STRUCTURAL_FILTER_ENABLED = v; }
export function getPipelineFlags() {
  return { PIPELINE_RESCUE_ENABLED, STRUCTURAL_FILTER_ENABLED };
}

export interface PipelineReport {
  rescueEnabled: boolean;
  segmentsBefore: number;
  segmentsAfter: number;
  segmentsHashBefore: string;
  segmentsHashAfter: string;
  segmentsChanged: boolean;
  reclassifiedCutToCrease: number;
  reclassifiedCreaseToCut: number;
  panelsPass1: number;
  panelsPass2: number;
  panelsRebuilt: boolean;
  /** Painéis se o face-walking ignorasse creases (só cuts). */
  panelsCutsOnly: number;
  /** Polígonos do primeiro rebuild estrutural após filtrar hole-only do kernel. */
  panelsPass1Polygons: Pt[][];
  /** Polígonos do pass estrutural final antes do fold graph. */
  panelsPass2Polygons: Pt[][];
  /** Painéis cuja área < 200 mm² (candidatos a fragmento espúrio). */
  fragmentsBelow200: number;
  /** Polígonos cuts-only para overlay comparativo. */
  panelsCutsOnlyPolygons: Pt[][];
  /** Polígonos finais (cuts+creases) usados pelo 3D. */
  panelsCutsCreasePolygons: Pt[][];
  /** Diagnóstico do grafo formado apenas por arestas CUT. */
  cutsOnlyDiagnostic: CutGraphDiagnostic;
  /** Relatório do filtro estrutural pós-topologia (cut-support). */
  structuralFilter: StructuralFilterReport;
  /** Auditoria da propagação kernel.faces[].holes → Panel.holes. */
  holesPropagation: {
    kernelHoles: number;
    propagated: number;
    unassigned: number;
    panelsWithHoles: Array<{ id: string; holes: number }>;
  };
}

export interface SourcePathAudit {
  pathIndex: number;
  layer: string;
  start: Pt;
  end: Pt;
  length: number;
  closed: boolean;
  pointsCount: number;
  colorKey: string;
  colorLabel: string;
  cssColor: string;
  hasCurves: boolean;
  dashArray: number[];
  paintOp: "fill" | "stroke";
  originalKind: string | null;
  finalKind: string | null;
  reclassificationReason: string | null;
}

interface CutGraphContext {
  sourcePathLookup?: Map<number, SourcePathAudit & { points: Pt[] }>;
}

export interface CutGraphDiagnostic {
  cutSegments: number;
  cutPoints: number;
  cutEdges: number;
  uniqueNodes: number;
  components: number;
  openEndpoints: number;
  endpoints: Array<{
    nodeId: string;
    x: number;
    y: number;
    degree: number;
    componentId: number;
    sourceSegIdx: number;
    sourceKind: string;
    /** Segmentos que tocam este nó: índice + ponto vizinho (direção de chegada). */
    incidentSegments: Array<{ segIdx: number; segKind: string; neighbor: Pt }>;
    nearestNodeId: string | null;
    nearestDist: number;
    withinGapBridge: boolean;
  }>;
  componentsList: Array<{
    id: number;
    nodeCount: number;
    edgeCount: number;
    openEndpointCount: number;
    closed: boolean;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
  }>;
  closedCycles: Pt[][];
  gapBridgeTolMm: number;
  /** Distribuição de graus dos nós (deg → count). */
  degreeHistogram: Record<number, number>;
  /** Mesma análise mas com snap/weld aplicado a esta tolerância. */
  snappedRuns: Array<{
    snapMm: number;
    uniqueNodes: number;
    components: number;
    openEndpoints: number;
    closedComponents: number;
    degreeHistogram: Record<number, number>;
  }>;
  /** Detalhe por segmento CUT (idx coincide com `segIdx` em incidentSegments). */
  segmentDetails: Array<{
    idx: number;
    kind: string;
    start: Pt;
    end: Pt;
    length: number;
    closed: boolean;
    pointsCount: number;
    source?: {
      pathIndex: number;
      colorKey: string;
      colorLabel: string;
      cssColor: string;
      hasCurves: boolean;
      dashArray: number[];
      paintOp: "fill" | "stroke";
    };
    originalKind: string | null;
    reclassificationReason: string | null;
    prevPath: SourcePathAudit | null;
    nextPath: SourcePathAudit | null;
    /** Outros segIdx que tocam o início deste (compartilham o nó). */
    neighborsAtStart: number[];
    /** Outros segIdx que tocam o fim deste. */
    neighborsAtEnd: number[];
  }>;
  /** Paths PDF originais completos associados aos segmentos com ponta aberta. */
  sourcePathTraces: Array<SourcePathAudit & {
    points: Pt[];
    relatedSegIdxs: number[];
  }>;
}


let lastPipelineReport: PipelineReport | null = null;
export function getLastPipelineReport(): PipelineReport | null {
  return lastPipelineReport;
}

function hashSegments(segs: Segment[]): string {
  // Hash determinístico baseado em (kind + pontos arredondados).
  // Qualquer mudança de classificação ou geometria altera o hash.
  const parts: string[] = [];
  for (const s of segs) {
    const pts = s.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(";");
    parts.push(`${s.kind}|${s.closed ? 1 : 0}|${pts}`);
  }
  parts.sort();
  let h = 2166136261;
  const joined = parts.join("\n");
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

interface ImportBuildOptions {
  preserveOriginalGeometry?: boolean;
}

type ImportOverlay = NonNullable<Dieline["meta"]["importDebug"]>["overlays"][number];


interface PanelBox {
  panel: Panel;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  w: number;
  h: number;
}

function panelBox(panel: Panel): PanelBox {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of panel.polygon) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    panel,
    minX,
    maxX,
    minY,
    maxY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function avg(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function segmentPairs(seg: Segment) {
  const pairs: Array<[Segment["points"][number], Segment["points"][number]]> = [];
  for (let i = 0; i < seg.points.length - 1; i++) pairs.push([seg.points[i], seg.points[i + 1]]);
  if (seg.closed && seg.points.length > 2) pairs.push([seg.points[seg.points.length - 1], seg.points[0]]);
  return pairs;
}

function polylineLength(points: Pt[], closed = false) {
  if (points.length < 2) return 0;
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  if (closed && points.length > 2) {
    const a = points[points.length - 1];
    const b = points[0];
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

function toSourcePathAudit(entry?: (SourcePathAudit & { points: Pt[] }) | null): SourcePathAudit | null {
  if (!entry) return null;
  const { points: _points, ...audit } = entry;
  return audit;
}

function buildSourcePathLookup(
  paths: ImportResult["paths"],
  mapping: Record<string, MapKind>,
  finalKindByPathIndex: Map<number, string>,
  reclassificationReasonsByPathIndex: Map<number, string[]>,
) {
  const lookup = new Map<number, SourcePathAudit & { points: Pt[] }>();
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const p = paths[pathIndex];
    const mapped = mapping[p.colorKey];
    const originalKind = mapped ? String(mapped) : null;
    const finalKind = finalKindByPathIndex.get(pathIndex) ?? null;
    const reclassificationReason = reclassificationReasonsByPathIndex.get(pathIndex)?.join(" · ") ?? null;
    const points = p.points.map((pt) => ({ x: pt.x, y: pt.y }));
    lookup.set(pathIndex, {
      pathIndex,
      layer: p.colorLabel,
      start: points[0] ?? { x: 0, y: 0 },
      end: points[points.length - 1] ?? { x: 0, y: 0 },
      length: polylineLength(points, p.closed),
      closed: !!p.closed,
      pointsCount: points.length,
      colorKey: p.colorKey,
      colorLabel: p.colorLabel,
      cssColor: p.cssColor,
      hasCurves: !!p.hasCurves,
      dashArray: p.dashArray ?? [],
      paintOp: p.paintOp ?? "stroke",
      originalKind,
      finalKind,
      reclassificationReason,
      points,
    });
  }
  return lookup;
}

function samePoint(a: Pt, b: Pt, tol = 0.05) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

function findMatchedSourceEdgeIndex(points: Pt[], segStart: Pt, segEnd: Pt, closed = false) {
  const edgeCount = points.length - 1 + (closed && points.length > 2 ? 1 : 0);
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i]!;
    const b = i === points.length - 1 ? points[0]! : points[i + 1]!;
    if ((samePoint(a, segStart) && samePoint(b, segEnd)) || (samePoint(a, segEnd) && samePoint(b, segStart))) {
      return i;
    }
  }
  return -1;
}

function buildSourceEdgeAudit(source: (SourcePathAudit & { points: Pt[] }) | null | undefined, edgeIndex: number): SourcePathAudit | null {
  if (!source || edgeIndex < 0) return null;
  const edgeCount = source.points.length - 1 + (source.closed && source.points.length > 2 ? 1 : 0);
  if (edgeIndex >= edgeCount) return null;
  const start = source.points[edgeIndex]!;
  const end = edgeIndex === source.points.length - 1 ? source.points[0]! : source.points[edgeIndex + 1]!;
  return {
    pathIndex: source.pathIndex,
    layer: source.layer,
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
    length: Math.hypot(end.x - start.x, end.y - start.y),
    closed: false,
    pointsCount: 2,
    colorKey: source.colorKey,
    colorLabel: source.colorLabel,
    cssColor: source.cssColor,
    hasCurves: source.hasCurves,
    dashArray: [...source.dashArray],
    paintOp: source.paintOp,
    originalKind: source.originalKind,
    finalKind: source.finalKind,
    reclassificationReason: source.reclassificationReason,
  };
}

function isStructuralSegment(seg: Segment) {
  return seg.kind === "cut" || seg.kind === "crease";
}

/**
 * Análise topológica do grafo de cortes com `snapMm` configurável.
 * Usa toFixed(`decimals`) como chave de nó. Pode opcionalmente fazer
 * weld por bucket espacial dentro de `snapMm`.
 */
function analyzeCutGraph(cutSegs: Segment[], snapMm: number) {
  // Resolve cada ponto a um "node id" canônico via bucket espacial.
  // Quando snapMm=0, usa chave exata toFixed(2) (sem weld).
  const useWeld = snapMm > 0;
  const decimals = 2;
  const exactKey = (p: Pt) => `${p.x.toFixed(decimals)}_${p.y.toFixed(decimals)}`;

  const nodePt = new Map<string, Pt>();
  const buckets = new Map<string, string[]>(); // bucketKey → nodeIds
  const bk = (p: Pt) => `${Math.round(p.x / Math.max(snapMm, 1e-6))}_${Math.round(p.y / Math.max(snapMm, 1e-6))}`;
  const nbBk = (p: Pt) => {
    const x = Math.round(p.x / Math.max(snapMm, 1e-6));
    const y = Math.round(p.y / Math.max(snapMm, 1e-6));
    const out: string[] = [];
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) out.push(`${x + ox}_${y + oy}`);
    return out;
  };

  const resolve = (p: Pt): string => {
    if (!useWeld) {
      const k = exactKey(p);
      if (!nodePt.has(k)) nodePt.set(k, { x: p.x, y: p.y });
      return k;
    }
    for (const bucket of nbBk(p)) {
      const arr = buckets.get(bucket);
      if (!arr) continue;
      for (const id of arr) {
        const q = nodePt.get(id)!;
        if (Math.hypot(q.x - p.x, q.y - p.y) <= snapMm) return id;
      }
    }
    const id = exactKey(p);
    nodePt.set(id, { x: p.x, y: p.y });
    const b = bk(p);
    const arr = buckets.get(b);
    if (arr) arr.push(id); else buckets.set(b, [id]);
    return id;
  };

  const adj = new Map<string, Set<string>>();
  const incident = new Map<string, Array<{ segIdx: number; segKind: string; neighbor: Pt }>>();
  const add = (a: string, b: string) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  const pushIncident = (nodeId: string, segIdx: number, segKind: string, neighbor: Pt) => {
    if (!incident.has(nodeId)) incident.set(nodeId, []);
    incident.get(nodeId)!.push({ segIdx, segKind, neighbor: { x: neighbor.x, y: neighbor.y } });
  };

  let cutPoints = 0;
  let cutEdges = 0;
  for (let si = 0; si < cutSegs.length; si++) {
    const s = cutSegs[si];
    cutPoints += s.points.length;
    const ids = s.points.map((p) => resolve(p));
    for (let i = 0; i < ids.length - 1; i++) {
      add(ids[i], ids[i + 1]);
      pushIncident(ids[i], si, s.kind, s.points[i + 1]);
      pushIncident(ids[i + 1], si, s.kind, s.points[i]);
      cutEdges++;
    }
    if (s.closed && ids.length > 2) {
      add(ids[ids.length - 1], ids[0]);
      pushIncident(ids[ids.length - 1], si, s.kind, s.points[0]);
      pushIncident(ids[0], si, s.kind, s.points[s.points.length - 1]);
      cutEdges++;
    }
  }

  // Componentes conexos.
  const compOf = new Map<string, number>();
  const compNodes: string[][] = [];
  for (const node of adj.keys()) {
    if (compOf.has(node)) continue;
    const id = compNodes.length;
    const list: string[] = [];
    const stack = [node];
    while (stack.length) {
      const n = stack.pop()!;
      if (compOf.has(n)) continue;
      compOf.set(n, id);
      list.push(n);
      for (const m of adj.get(n)!) if (!compOf.has(m)) stack.push(m);
    }
    compNodes.push(list);
  }

  const openIds: string[] = [];
  const degreeHistogram: Record<number, number> = {};
  for (const [n, set] of adj.entries()) {
    const d = set.size;
    degreeHistogram[d] = (degreeHistogram[d] ?? 0) + 1;
    if (d === 1) openIds.push(n);
  }

  let closedComponents = 0;
  for (const nodes of compNodes) {
    let allClosed = true;
    for (const n of nodes) if ((adj.get(n)?.size ?? 0) === 1) { allClosed = false; break; }
    if (allClosed && nodes.length >= 3) closedComponents++;
  }

  return {
    adj, nodePt, incident, compOf, compNodes, openIds,
    cutPoints, cutEdges, degreeHistogram, closedComponents,
  };
}

function diagnoseCutGraph(cutSegs: Segment[], context: CutGraphContext = {}): CutGraphDiagnostic {
  const GAP = 1.5; // CAD_TOL.gapBridgeMm
  const raw = analyzeCutGraph(cutSegs, 0);
  const { adj, nodePt, incident, compOf, compNodes, openIds, cutPoints, cutEdges, degreeHistogram } = raw;

  const endpoints = openIds.map((n) => {
    const p = nodePt.get(n)!;
    const inc = incident.get(n) ?? [];
    const first = inc[0];
    let nearestId: string | null = null;
    let nearestDist = Infinity;
    for (const m of openIds) {
      if (m === n) continue;
      const q = nodePt.get(m)!;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < nearestDist) { nearestDist = d; nearestId = m; }
    }
    return {
      nodeId: n,
      x: p.x,
      y: p.y,
      degree: adj.get(n)?.size ?? 0,
      componentId: compOf.get(n) ?? -1,
      sourceSegIdx: first?.segIdx ?? -1,
      sourceKind: first?.segKind ?? "?",
      incidentSegments: inc,
      nearestNodeId: nearestId,
      nearestDist: nearestId ? nearestDist : 0,
      withinGapBridge: nearestId !== null && nearestDist <= GAP,
    };
  });

  const componentsList = compNodes.map((nodes, id) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let edgeCount = 0;
    let openCount = 0;
    for (const n of nodes) {
      const p = nodePt.get(n)!;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      const deg = adj.get(n)!.size;
      edgeCount += deg;
      if (deg === 1) openCount++;
    }
    return {
      id,
      nodeCount: nodes.length,
      edgeCount: edgeCount / 2,
      openEndpointCount: openCount,
      closed: openCount === 0 && nodes.length >= 3,
      bbox: { minX, minY, maxX, maxY },
    };
  });

  const closedCycles: Pt[][] = [];
  for (const c of componentsList) {
    if (!c.closed) continue;
    const nodes = compNodes[c.id];
    const visited = new Set<string>();
    const start = nodes[0];
    const path: Pt[] = [];
    let curr: string | null = start;
    let prev: string | null = null;
    while (curr && !visited.has(curr)) {
      visited.add(curr);
      path.push(nodePt.get(curr)!);
      let next: string | null = null;
      for (const m of adj.get(curr)!) {
        if (m === prev) continue;
        if (visited.has(m)) continue;
        next = m;
        break;
      }
      prev = curr;
      curr = next;
    }
    if (path.length >= 3) closedCycles.push(path);
  }

  // Snap runs comparativos — replica o efeito do weld do topology-builder.
  const snappedRuns = [0.18, 0.5, 1.0].map((snapMm) => {
    const r = analyzeCutGraph(cutSegs, snapMm);
    return {
      snapMm,
      uniqueNodes: r.adj.size,
      components: r.compNodes.length,
      openEndpoints: r.openIds.length,
      closedComponents: r.closedComponents,
      degreeHistogram: r.degreeHistogram,
    };
  });


  // segmentDetails: para cada CUT segment, expõe start/end/length/source +
  // segIdx vizinhos em cada extremidade (mesmo nó topológico, snap=0).
  const exactKey = (p: Pt) => `${p.x.toFixed(2)}_${p.y.toFixed(2)}`;
  const segmentDetails = cutSegs.map((seg, idx) => {
    const pts = seg.points;
    const start = pts[0];
    const end = pts[pts.length - 1];
    let length = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    if (seg.closed && pts.length > 2) {
      length += Math.hypot(pts[0].x - end.x, pts[0].y - end.y);
    }
    const startKey = exactKey(start);
    const endKey = exactKey(end);
    const neighborsAtStart = Array.from(new Set(
      (incident.get(startKey) ?? []).map((i) => i.segIdx).filter((i) => i !== idx),
    ));
    const neighborsAtEnd = Array.from(new Set(
      (incident.get(endKey) ?? []).map((i) => i.segIdx).filter((i) => i !== idx),
    ));
    const sourcePath = seg.source?.pathIndex !== undefined ? context.sourcePathLookup?.get(seg.source.pathIndex) ?? null : null;
    const matchedEdgeIndex = sourcePath ? findMatchedSourceEdgeIndex(sourcePath.points, start, end, sourcePath.closed) : -1;
    return {
      idx,
      kind: seg.kind,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      length,
      closed: !!seg.closed,
      pointsCount: pts.length,
      source: seg.source
        ? {
            pathIndex: seg.source.pathIndex,
            colorKey: seg.source.colorKey,
            colorLabel: seg.source.colorLabel,
            cssColor: seg.source.cssColor,
            hasCurves: seg.source.hasCurves,
            dashArray: seg.source.dashArray,
            paintOp: seg.source.paintOp,
          }
        : undefined,
      originalKind: sourcePath?.originalKind ?? null,
      reclassificationReason: sourcePath?.reclassificationReason ?? null,
      prevPath: sourcePath
        ? buildSourceEdgeAudit(
            sourcePath,
            matchedEdgeIndex > 0 ? matchedEdgeIndex - 1 : sourcePath.closed ? sourcePath.points.length - 2 : -1,
          )
        : null,
      nextPath: sourcePath
        ? buildSourceEdgeAudit(
            sourcePath,
            matchedEdgeIndex >= 0 && matchedEdgeIndex < sourcePath.points.length - 2
              ? matchedEdgeIndex + 1
              : sourcePath.closed && matchedEdgeIndex >= 0
                ? 0
                : -1,
          )
        : null,
      neighborsAtStart,
      neighborsAtEnd,
    };
  });

  const sourcePathTraces = Array.from(new Set(
    segmentDetails
      .map((detail) => detail.source?.pathIndex)
      .filter((value): value is number => value !== undefined),
  ))
    .map((pathIndex) => {
      const source = context.sourcePathLookup?.get(pathIndex);
      if (!source) return null;
      return {
        ...source,
        relatedSegIdxs: segmentDetails.filter((detail) => detail.source?.pathIndex === pathIndex).map((detail) => detail.idx),
      };
    })
    .filter((value): value is CutGraphDiagnostic["sourcePathTraces"][number] => value !== null);

  return {
    cutSegments: cutSegs.length,
    cutPoints,
    cutEdges,
    uniqueNodes: adj.size,
    components: compNodes.length,
    openEndpoints: openIds.length,
    endpoints,
    componentsList,
    closedCycles,
    gapBridgeTolMm: GAP,
    degreeHistogram,
    snappedRuns,
    segmentDetails,
    sourcePathTraces,
  };
}


function polyEdges(poly: Pt[]): Array<[Pt, Pt]> {
  const edges: Array<[Pt, Pt]> = [];
  for (let i = 0; i < poly.length; i++) edges.push([poly[i], poly[(i + 1) % poly.length]]);
  return edges;
}

function segmentOverlapLength(a1: Pt, a2: Pt, b1: Pt, b2: Pt, eps = 0.7) {
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;
  const len = Math.hypot(dx, dy);
  if (len < eps) return 0;
  if (Math.abs(dx * dy2 - dy * dx2) > eps * len) return 0;
  if (Math.abs((b1.x - a1.x) * dy - (b1.y - a1.y) * dx) > eps * len) return 0;
  const ux = dx / len;
  const uy = dy / len;
  const project = (p: Pt) => (p.x - a1.x) * ux + (p.y - a1.y) * uy;
  const lo = Math.max(0, Math.min(project(b1), project(b2)));
  const hi = Math.min(len, Math.max(project(b1), project(b2)));
  return hi - lo > 1 ? hi - lo : 0;
}

function reclassifyStructuralSegmentsByTopology(segments: Segment[], panels: Panel[]): Segment[] {
  if (!segments.length || !panels.length) return segments;
  const panelEdges = panels.map((panel) => polyEdges(panel.polygon));

  return segments.map((seg) => {
    if (!isStructuralSegment(seg)) return seg;

    // PROTEÇÃO: segmentos auto-fechados (closed=true) são laços completos
    // desenhados pelo autor — tipicamente JANELAS/VAZADOS (silhueta de frasco,
    // furo de alça, etc). Mesmo que topologicamente fiquem "entre" a face
    // principal e o painel-furo, não devem virar crease — senão a aresta da
    // janela dobra como hinge no 3D em vez de virar buraco.
    if (seg.kind === "cut" && seg.closed) return seg;

    let cutSupport = 0;
    let creaseSupport = 0;

    for (const [a, b] of segmentPairs(seg)) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.8) continue;

      let hits = 0;
      for (const edges of panelEdges) {
        if (edges.some(([p1, p2]) => segmentOverlapLength(a, b, p1, p2) >= Math.min(Math.max(len * 0.45, 8), len - 0.5))) {
          hits++;
          if (hits >= 2) break;
        }
      }

      if (hits >= 2) creaseSupport += len;
      else if (hits === 1) cutSupport += len;
    }

    // PROMOÇÃO permitida: cut → crease quando topologia mostra adjacência dupla.
    // DEMOÇÃO PROIBIDA: nunca rebaixar crease → cut por topologia. O kind do
    // designer (cor/dash do PDF) é fonte da verdade; se um crease aparece com
    // adjacência fraca, geralmente é porque o painel adjacente ainda não foi
    // reconstruído (vincos interrompidos por travas/recortes, faces com
    // boundary parcial). Demover aqui produz micro-fragmentos CUT sobre o
    // eixo do vinco original — bug do imp-8 com aba+trava.
    if (seg.kind !== "crease" && creaseSupport > cutSupport * 1.1 && creaseSupport > 1) {
      return { ...seg, kind: "crease" };
    }
    return seg;
  });
}

function round1(value: number) {
  return Number(value.toFixed(1));
}

function boxContains(outer: PanelBox, inner: PanelBox, tol = 0.5) {
  if (outer === inner) return false;
  return (
    outer.minX <= inner.minX + tol &&
    outer.maxX >= inner.maxX - tol &&
    outer.minY <= inner.minY + tol &&
    outer.maxY >= inner.maxY - tol &&
    (outer.w > inner.w + tol || outer.h > inner.h + tol)
  );
}

/** Remove "wrapper" panels (sangria, bbox externa, contornos de registro)
 *  que englobam outros painéis. Esses não são painéis reais da faca. */
function filterEnclosingPanels(metrics: PanelBox[]): PanelBox[] {
  if (metrics.length < 3) return metrics;
  return metrics.filter((candidate) => {
    let enclosed = 0;
    for (const other of metrics) {
      if (boxContains(candidate, other)) {
        enclosed++;
        if (enclosed >= 2) return false;
      }
    }
    return true;
  });
}

function horizontalBoundarySupport(y: number, xMin: number, xMax: number, bandH: number, segments: Segment[]) {
  if (!segments.length) return 0;
  const yTol = Math.max(1.2, bandH * 0.04);
  let total = 0;

  for (const seg of segments) {
    if (!isStructuralSegment(seg)) continue;
    for (const [a, b] of segmentPairs(seg)) {
      const dy = Math.abs(b.y - a.y);
      const dx = Math.abs(b.x - a.x);
      if (dx < 2 || dy > yTol) continue;

      const minSegY = Math.min(a.y, b.y);
      const maxSegY = Math.max(a.y, b.y);
      if (y < minSegY - yTol || y > maxSegY + yTol) continue;

      total += overlap(Math.min(a.x, b.x), Math.max(a.x, b.x), xMin, xMax);
    }
  }

  return total;
}

function pickLikelyBodyPanels(panels: Panel[], segments: Segment[]): PanelBox[] {
  const allMetrics = panels.map(panelBox);
  if (!allMetrics.length) return [];

  const metrics = filterEnclosingPanels(allMetrics);
  if (!metrics.length) return [];
  const globalMinY = Math.min(...metrics.map((m) => m.minY));
  const globalMaxY = Math.max(...metrics.map((m) => m.maxY));
  const globalCenterY = (globalMinY + globalMaxY) / 2;

  const labeled = metrics.filter((m) => /^(frente|verso|lateral|corpo)\b/i.test(m.panel.label));
  if (labeled.length >= 2) return labeled.sort((a, b) => a.minX - b.minX);

  let best: PanelBox[] = [];
  let bestScore = -Infinity;
  for (const anchor of metrics) {
    const row = metrics.filter((candidate) => {
      const shared = overlap(anchor.minY, anchor.maxY, candidate.minY, candidate.maxY);
      return shared / Math.max(1, Math.min(anchor.h, candidate.h)) >= 0.55;
    });
    if (row.length < 2) continue;

    const totalWidth = row.reduce((sum, item) => sum + item.w, 0);
    const rowMinX = Math.min(...row.map((item) => item.minX));
    const rowMaxX = Math.max(...row.map((item) => item.maxX));
    const rowMinY = Math.min(...row.map((item) => item.minY));
    const rowMaxY = Math.max(...row.map((item) => item.maxY));
    const heights = row.map((item) => item.h);
    const widths = row.map((item) => item.w).sort((a, b) => a - b);
    const avgHeight = avg(heights);
    const heightSpread = Math.max(...heights) - Math.min(...heights);
    const widthSpread = widths.length > 1 ? widths[widths.length - 1] - widths[0] : 0;
    const medianW = widths[Math.floor(widths.length / 2)] ?? 0;
    const uniformWidth = medianW > 0 ? 1 - Math.min(1, widthSpread / medianW) : 0;
    const rowCenterY = (rowMinY + rowMaxY) / 2;
    const centerPenalty = Math.abs(rowCenterY - globalCenterY);
    const coverage = totalWidth / Math.max(1, rowMaxX - rowMinX);
    const score =
      row.length * 10000 +
      avgHeight * 180 +
      totalWidth * 4 +
      coverage * 300 +
      uniformWidth * 500 -
      heightSpread * 8 -
      centerPenalty * 12;

    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }

  const row = (best.length ? best : metrics).sort((a, b) => a.minX - b.minX);
  if (!segments.length || row.length < 2) return row;

  const bandMinY = Math.min(...row.map((item) => item.minY));
  const bandMaxY = Math.max(...row.map((item) => item.maxY));
  const bandH = Math.max(1, bandMaxY - bandMinY);
  const supported = row.filter((item) => {
    if (/^(frente|verso|lateral|corpo)\b/i.test(item.panel.label)) return true;

    const topSupport = horizontalBoundarySupport(item.minY, item.minX, item.maxX, bandH, segments);
    const bottomSupport = horizontalBoundarySupport(item.maxY, item.minX, item.maxX, bandH, segments);
    const minRatio = Math.min(topSupport, bottomSupport) / Math.max(1, item.w);
    return minRatio >= 0.45;
  });

  return (supported.length >= 2 ? supported : row).sort((a, b) => a.minX - b.minX);
}

function inferBodyWidths(body: PanelBox[], segments: Segment[]) {
  if (!body.length) return [];

  const bandMinY = Math.min(...body.map((item) => item.minY));
  const bandMaxY = Math.max(...body.map((item) => item.maxY));
  const bandMinX = Math.min(...body.map((item) => item.minX));
  const bandMaxX = Math.max(...body.map((item) => item.maxX));
  const bandH = Math.max(1, bandMaxY - bandMinY);
  const xTol = Math.max(1.2, bandH * 0.02);
  const mergeTol = Math.max(1.5, Math.min(4, bandH * 0.05));
  const xPad = Math.max(2, bandH * 0.05);
  const xs = body.flatMap((item) => [item.minX, item.maxX]);

  for (const seg of segments) {
    if (!isStructuralSegment(seg)) continue;
    for (let i = 0; i < seg.points.length - 1; i++) {
      const a = seg.points[i];
      const b = seg.points[i + 1];
      const dx = Math.abs(b.x - a.x);
      const sharedY = overlap(Math.min(a.y, b.y), Math.max(a.y, b.y), bandMinY, bandMaxY);
      if (dx > xTol || sharedY < bandH * 0.82) continue;
      const mx = (a.x + b.x) / 2;
      // ignora linhas fora da extensão horizontal do corpo (sangria, marcas)
      if (mx < bandMinX - xPad || mx > bandMaxX + xPad) continue;
      xs.push(mx);
    }
  }

  const clustered: number[] = [];
  for (const x of xs.sort((a, b) => a - b)) {
    const last = clustered[clustered.length - 1];
    if (last === undefined || Math.abs(x - last) > mergeTol) clustered.push(x);
    else clustered[clustered.length - 1] = (last + x) / 2;
  }

  const widths: number[] = [];
  for (let i = 0; i < clustered.length - 1; i++) {
    const width = clustered[i + 1] - clustered[i];
    if (width >= Math.max(6, bandH * 0.05)) widths.push(width);
  }

  const panelWidths = body.map((item) => item.w).filter((value) => value >= Math.max(6, bandH * 0.05));
  if (!widths.length) return panelWidths;
  if (widths.length > panelWidths.length + 1) return panelWidths;
  return widths;
}

function splitGlueTab(widths: number[]) {
  if (widths.length < 4) return { glueTab: 0, bodyWidths: widths };

  // Considera larguras "trim" (aba de cola, reforço de tuck) qualquer painel
  // de borda significativamente menor que a mediana dos painéis centrais.
  // Caixa de pasta-cola típica tem aba de cola num lado e, às vezes, reforço
  // no outro — removemos AMBAS as pontas se forem pequenas, mantendo só os
  // painéis de corpo (L e P) para inferir as dimensões.
  let l = 0;
  let r = widths.length - 1;
  let glueTab = 0;
  const ratio = 0.7;

  // até 2 trims em cada ponta
  for (let pass = 0; pass < 2 && r - l + 1 >= 3; pass++) {
    const center = widths.slice(l, r + 1);
    const ref = median(center);
    if (!ref) break;
    const leftTrim = widths[l] < ref * ratio;
    const rightTrim = widths[r] < ref * ratio;
    if (!leftTrim && !rightTrim) break;
    if (leftTrim) {
      glueTab = Math.max(glueTab, widths[l]);
      l++;
    }
    if (rightTrim) {
      glueTab = Math.max(glueTab, widths[r]);
      r--;
    }
  }

  return { glueTab, bodyWidths: widths.slice(l, r + 1) };
}


function inferLP(bodyWidths: number[], fallback: DielineParams) {
  if (!bodyWidths.length) return { L: fallback.L, P: fallback.P };
  if (bodyWidths.length === 1) return { L: bodyWidths[0], P: fallback.P };

  const sorted = [...bodyWidths].sort((a, b) => a - b);
  const tol = Math.max(2, avg(sorted) * 0.08);
  const clusters: number[][] = [];
  for (const width of sorted) {
    const cluster = clusters[clusters.length - 1];
    if (!cluster || Math.abs(avg(cluster) - width) > tol) clusters.push([width]);
    else cluster.push(width);
  }

  const clusterMeans = clusters.map((cluster) => avg(cluster));
  if (clusterMeans.length >= 2) {
    return {
      L: Math.max(...clusterMeans),
      P: Math.min(...clusterMeans),
    };
  }

  if (bodyWidths.length >= 4) {
    const even = bodyWidths.filter((_, index) => index % 2 === 0);
    const odd = bodyWidths.filter((_, index) => index % 2 === 1);
    return {
      L: Math.max(avg(even), avg(odd)),
      P: Math.min(avg(even), avg(odd)),
    };
  }

  return {
    L: Math.max(...bodyWidths),
    P: Math.min(...bodyWidths),
  };
}

function inferImportedParams(panels: Panel[], segments: Segment[], fallback: DielineParams): DielineParams {
  const structuralSegments = segments.filter(isStructuralSegment);
  const body = pickLikelyBodyPanels(panels, structuralSegments);
  if (!body.length) return fallback;

  const heights = body.map((item) => item.h).filter((value) => value > 1);
  const widths = inferBodyWidths(body, structuralSegments).filter((value) => value > 1);
  const { glueTab, bodyWidths } = splitGlueTab(widths);
  const inferred = inferLP(bodyWidths, fallback);

  return {
    ...fallback,
    L: round1(Math.max(1, inferred.L || fallback.L)),
    H: round1(Math.max(1, median(heights) || fallback.H)),
    P: round1(Math.max(1, inferred.P || fallback.P)),
    glueTab: round1(glueTab > 0 ? glueTab : 0),
  };
}

function clonePoints(points: Segment["points"] | Panel["polygon"]) {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

function polygonAreaAbs(points: Panel["polygon"]) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function tracePoint(point: Pt): [number, number] {
  return [+point.x.toFixed(3), +point.y.toFixed(3)];
}

function traceEdgeKey(a: Pt, b: Pt): string {
  const ax = a.x.toFixed(2), ay = a.y.toFixed(2);
  const bx = b.x.toFixed(2), by = b.y.toFixed(2);
  return ax < bx || (ax === bx && ay <= by)
    ? `${ax},${ay}|${bx},${by}`
    : `${bx},${by}|${ax},${ay}`;
}

function edgeMatchTrace(panelId: string, edgeIndex: number, a: Pt, b: Pt, idx: ReturnType<typeof buildEdgeKindIndexFromSegments>) {
  const directKey = traceEdgeKey(a, b);
  const directSources = idx.sources.get(directKey) ?? [];
  const result = classifyPanelEdgeAll(a, b, idx, { collectCandidates: true, candidateNearMm: 5 });
  const candidateSegments = (result.candidates ?? []).map((candidate) => ({
    ...candidate,
    sourceSegments: idx.sources.get(candidate.segKey) ?? [],
  }));
  const acceptedCandidate = candidateSegments.find((candidate) => candidate.accepted);
  const chosenSegment = directSources[0] ?? acceptedCandidate?.sourceSegments[0] ?? null;
  const rejectionReason = chosenSegment
    ? directSources.length ? "direct-exact-edge-match" : "accepted-near-match"
    : candidateSegments.length
      ? Array.from(new Set(candidateSegments.map((candidate) => candidate.reject ?? "unknown-rejection"))).join("+")
      : "no-candidate-segment-within-5mm";
  return {
    panelId,
    edgeIndex,
    edge: { a: tracePoint(a), b: tracePoint(b), length: +Math.hypot(b.x - a.x, b.y - a.y).toFixed(3) },
    edgeKinds: result.size ? [...result] : ["UNKNOWN"],
    directSources,
    candidateSegments,
    chosenSegment,
    rejectionReason,
  };
}

function logPanelBuild(stage: string, panels: Panel[], segments: Segment[]) {
  if (typeof globalThis === "undefined" || !(globalThis as { __PACKAGING_CAD_DEBUG__?: boolean }).__PACKAGING_CAD_DEBUG__) return;
  try {
    const idx = buildEdgeKindIndexFromSegments(segments);
    for (const panel of panels) {
      const edgeMatches = panel.polygon.map((a, edgeIndex) => edgeMatchTrace(panel.id, edgeIndex, a, panel.polygon[(edgeIndex + 1) % panel.polygon.length], idx));
      const sourceSegments = Array.from(new Map(edgeMatches
        .flatMap((match) => match.directSources.length ? match.directSources : match.chosenSegment ? [match.chosenSegment] : [])
        .map((source) => [`${source.segmentIndex}:${source.pairIndex}:${source.kind}`, source])).values());
      console.log("[PANEL BUILD]", {
        stage,
        panelId: panel.id,
        polygonVertices: panel.polygon.map(tracePoint),
        sourceSegments,
        edgeKinds: edgeMatches.map((match) => ({
          edgeIndex: match.edgeIndex,
          edge: match.edge,
          kinds: match.edgeKinds,
          chosenSegment: match.chosenSegment,
          rejectionReason: match.rejectionReason,
        })),
      });
      for (const match of edgeMatches) {
        console.log("[EDGE MATCH]", match);
      }
    }
  } catch (err) {
    console.warn("[PANEL BUILD] failed", { stage, err });
  }
}

function collectImportOverlays(
  rawSegments: Segment[],
  healedSegments: Segment[],
  structuralPanels: Panel[],
  analysisPanels: Panel[],
  sourcePathTraces: CutGraphDiagnostic["sourcePathTraces"] = [],
): ImportOverlay[] {
  const overlays: ImportOverlay[] = [];

  rawSegments
    .filter((seg) => seg.kind === "cut")
    .forEach((seg, index) => {
      overlays.push({
        id: `orig-cut-${index}`,
        label: "Boundary original",
        kind: "original-boundary",
        closed: !!seg.closed,
        points: clonePoints(seg.points),
      });
    });

  healedSegments
    .filter((seg) => seg.kind === "cut")
    .forEach((seg, index) => {
      overlays.push({
        id: `repaired-cut-${index}`,
        label: "Boundary reparado",
        kind: "repaired-boundary",
        closed: !!seg.closed,
        points: clonePoints(seg.points),
      });
    });

  structuralPanels.forEach((panel) => {
    overlays.push({
      id: `panel-${panel.id}`,
      label: panel.label,
      kind: "panel-boundary",
      closed: true,
      polygon: clonePoints(panel.polygon),
    });
  });

  const structuralIds = new Set(structuralPanels.map((panel) => panel.id));
  analysisPanels
    .filter((panel) => !structuralIds.has(panel.id))
    .forEach((panel) => {
      const synthetic = /^syn-/.test(panel.id);
      overlays.push({
        id: `analysis-${panel.id}`,
        label: panel.label,
        kind: synthetic ? "simplified-region" : "collapsed-feature",
        closed: true,
        polygon: clonePoints(panel.polygon),
      });
    });

  const repairedVertices = new Map<string, { x: number; y: number }>();
  for (const seg of healedSegments) {
    for (const point of seg.points) repairedVertices.set(`${point.x.toFixed(3)}_${point.y.toFixed(3)}`, point);
  }

  for (const seg of rawSegments.filter((segment) => segment.kind === "cut")) {
    const removed = seg.points.filter((point) => !repairedVertices.has(`${point.x.toFixed(3)}_${point.y.toFixed(3)}`));
    if (removed.length) {
      overlays.push({
        id: `removed-${overlays.length}`,
        label: "Vértices removidos",
        kind: "removed-vertices",
        points: clonePoints(removed),
      });
    }
  }

  const simplifiedThreshold = 4;
  const structuralByArea = [...structuralPanels].sort((a, b) => polygonAreaAbs(b.polygon) - polygonAreaAbs(a.polygon));
  analysisPanels.forEach((panel) => {
    if (structuralIds.has(panel.id)) return;
    const area = polygonAreaAbs(panel.polygon);
    const nearStructural = structuralByArea.find((candidate) => {
      const candidateArea = polygonAreaAbs(candidate.polygon);
      return candidateArea > area && candidateArea / Math.max(area, 0.001) < 120;
    });
    if (!nearStructural || panel.polygon.length > simplifiedThreshold) return;
    overlays.push({
      id: `collapsed-${panel.id}`,
      label: panel.label,
      kind: /^syn-/.test(panel.id) ? "simplified-region" : "collapsed-feature",
      closed: true,
      polygon: clonePoints(panel.polygon),
    });
  });

  sourcePathTraces.forEach((trace) => {
    overlays.push({
      id: `source-path-${trace.pathIndex}`,
      label: `Path #${trace.pathIndex}`,
      kind: "source-path-trace",
      closed: trace.closed,
      points: clonePoints(trace.points),
      meta: {
        pathIndex: trace.pathIndex,
        relatedSegIdxs: [...trace.relatedSegIdxs],
      },
    });
  });

  return overlays;
}

export function buildDielineFromImport(
  r: ImportResult,
  mapping: Record<string, MapKind>,
  params: DielineParams,
  closureOverride?: { top?: ClosureKind; bottom?: ClosureKind },
  options?: ImportBuildOptions,
): Dieline {
  mapping = repairPathologicalImportedMapping(r.paths, r.colors, mapping);
  const preserveOriginalGeometry = options?.preserveOriginalGeometry ?? true;
  const originalKindByPathIndex = new Map<number, string>();
  const rawSegments: Segment[] = [];
  const finishPaths: Array<{ kind: FinishKind; colorKey: string; colorLabel: string; points: Pt[]; closed: boolean }> = [];
  let ignoredStrokes = 0;

  // Muitos PDFs CAD vêm em uma única spot/cor: o contorno externo e os vincos
  // internos estão no mesmo stroke. Mapping por cor não consegue separar isso;
  // sistemas CAD separam por geometria. Regra segura: se a mesma camada
  // estrutural tem paths fechados E abertos, paths fechados OU curvos são corte
  // e paths abertos retos permanecem vinco/perf. A 71245 é exatamente assim:
  // a faca externa vem em azul como curvas abertas/fechadas, e os vincos são
  // segmentos retos. CORTE continua corte, VINCO continua vinco.
  const structuralPathKeys = new Set<string>();
  let structuralClosedPaths = 0;
  let structuralOpenPaths = 0;
  for (const p of r.paths) {
    if (isIgnoredImportedStroke(p.colorKey, p.colorLabel)) continue;
    const k = mapping[p.colorKey];
    if (!k || k === "ignore" || isFinishKind(k)) continue;
    structuralPathKeys.add(p.colorKey);
    if (p.closed) structuralClosedPaths++;
    else structuralOpenPaths++;
  }
  const splitSingleLayerByGeometry =
    structuralPathKeys.size === 1 && structuralClosedPaths > 0 && structuralOpenPaths > 0;

  for (let pi = 0; pi < r.paths.length; pi++) {
    const p = r.paths[pi];
    if (isIgnoredImportedStroke(p.colorKey, p.colorLabel)) { ignoredStrokes++; continue; }
    const k: MapKind | undefined = mapping[p.colorKey];
    if (!k || k === "ignore") { ignoredStrokes++; continue; }
    if (isFinishKind(k)) {
      finishPaths.push({ kind: k, colorKey: p.colorKey, colorLabel: p.colorLabel, points: p.points, closed: p.closed });
      continue;
    }
    const sk: SegmentKind = splitSingleLayerByGeometry && (p.closed || p.hasCurves) ? "cut" : k;
    originalKindByPathIndex.set(pi, sk);
    rawSegments.push({
      kind: sk,
      points: p.points,
      closed: p.closed,
      source: {
        pathIndex: pi,
        colorKey: p.colorKey,
        colorLabel: p.colorLabel,
        cssColor: p.cssColor,
        hasCurves: !!p.hasCurves,
        dashArray: p.dashArray ?? [],
        paintOp: p.paintOp ?? "stroke",
      },
    });
  }

  const healing = healExplodedCurves(rawSegments);
  lastCurveDebug = healing.debug;
  const segments: Segment[] = [...healing.segments];
  const reclassificationReasonsByPathIndex = new Map<number, string[]>();

  // === CAD KERNEL — fonte da verdade para loops/holes ===
  // Roda antes de qualquer reclassificação para identificar loops fechados
  // de cut que SÃO holes (regra dura: cut-only + nested = hole). O `Set`
  // resultante protege esses segments de:
  //  (1) virarem painéis estruturais (são filtrados de `buildPanelsFromSegments`);
  //  (2) serem reclassificados como crease pelo passo topológico (causa raiz do
  //      "vinco no frasco"/janela virando parede no 3D).
  const kernelResult = runCadKernel(segments, CAD_PRESERVE_GEOMETRY_TOL);
  lastKernelResult = kernelResult;
  const kernelHoleSegIdxs = kernelResult.holeOnlySegIdxs;
  const isKernelHoleSeg = (idx: number) => kernelHoleSegIdxs.has(idx);

  const filterKernelHoles = (segs: Segment[]) =>
    segs.filter((_s, i) => !isKernelHoleSeg(i));

  // === PIPELINE EM 3 ETAPAS COM REBUILD FORÇADO ===
  // Etapa 1: Pass-1 dos painéis a partir dos segments INICIAIS,
  // EXCLUINDO os segmentos que o kernel já classificou como hole-only.
  const initialStructural = filterKernelHoles(segments.filter(isStructuralSegment));
  const hashBefore = hashSegments(initialStructural);
  const panelTol = preserveOriginalGeometry ? CAD_PRESERVE_GEOMETRY_TOL : undefined;
  const polys1 = buildPanelsFromSegments(initialStructural, panelTol);
  const cadIssues = getLastCadIssues();
  let panels1: Panel[] = polys1.map((poly, i) => ({
    id: `imp-${i}`,
    label: `Painel ${i + 1}`,
    polygon: poly,
  }));
  logPanelBuild("pass1-from-initial-structural", panels1, initialStructural);
  if (PIPELINE_RESCUE_ENABLED) {
    panels1 = recoverMissingBodyPanels(panels1, initialStructural);
    logPanelBuild("pass1-after-body-rescue", panels1, initialStructural);
  }

  // Etapa 2 — RECLASSIFICAÇÃO DESATIVADA.
  // Camada 1 é fonte de verdade: cut/crease/perf importado não pode mais ser
  // alterado por topologia, kernel, holes, panelização ou fold graph. O motor
  // estrutural pode criar metadados próprios na pipeline, mas NUNCA reescreve
  // `segments`. Isso corrige o caso anexado onde o JSON terminava com
  // `segmentsByKind: { crease: 97 }` e o 2D/3D recebiam uma faca corrompida.
  const reclassCutToCrease = 0;
  const reclassCreaseToCut = 0;
  const reclassified = { segments, internalCuts: 0 };

  // Etapa 3: hash final → se segments mudaram, REBUILD obrigatório dos painéis.
  // Sempre filtra kernel-hole-only segs para que NÃO sejam contornos de painel.
  const finalStructural = filterKernelHoles(segments.filter(isStructuralSegment));
  const hashAfter = hashSegments(finalStructural);
  const segmentsChanged = hashBefore !== hashAfter;

  let panels: Panel[];
  let panelsRebuilt = false;
  if (segmentsChanged) {
    const polys2 = buildPanelsFromSegments(finalStructural, panelTol);
    panels = polys2.map((poly, i) => ({
      id: `imp-${i}`,
      label: `Painel ${i + 1}`,
      polygon: poly,
    }));
    logPanelBuild("pass2-from-final-structural", panels, finalStructural);
    if (PIPELINE_RESCUE_ENABLED) {
      panels = recoverMissingBodyPanels(panels, finalStructural);
      logPanelBuild("pass2-after-body-rescue", panels, finalStructural);
    }
    panelsRebuilt = true;
  } else {
    panels = panels1;
  }

  // === FILTRO ESTRUTURAL POR SUPORTE DE CUT (estilo Heidelberg) ===
  // Reprova faces que só existem porque um crease "tampa" o contorno.
  // Não toca em segments, não insere cortes. Só descarta painéis.
  // Pode ser desligado via STRUCTURAL_FILTER_ENABLED para isolar regressão.
  const structuralResult = filterStructuralPanels(panels, finalStructural, undefined, STRUCTURAL_FILTER_ENABLED);
  const panelsAfterFilter = structuralResult.kept.map((p, i) => ({ ...p, id: `imp-${i}` }));
  logPanelBuild("final-after-structural-filter", panelsAfterFilter, finalStructural);

  // === DIAGNÓSTICO: trace de kind por aresta de cada painel ====================
  // Mostra, por painel final (imp-N), cada aresta do contorno classificada
  // contra TRÊS índices: segmentos iniciais (pré-reclass), segmentos finais
  // (pós-topology + pós-internal-cut), e contagem agregada. O alvo é identificar
  // em qual etapa as arestas que deveriam ser CREASE viram UNKNOWN.
  try {
    const idxInitial = buildEdgeKindIndexFromSegments(initialStructural);
    const idxFinal = buildEdgeKindIndexFromSegments(finalStructural);
    const edgeTrace = panelsAfterFilter.map((panel) => {
      const poly = panel.polygon;
      const edges = poly.map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const kindsInitial = [...classifyPanelEdgeAll(a, b, idxInitial)];
        const kindsFinal = [...classifyPanelEdgeAll(a, b, idxFinal)];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const lost = kindsInitial.includes("crease") && !kindsFinal.includes("crease");
        const unknown = kindsFinal.length === 0;
        return {
          edgeId: `${panel.id}#${i}`,
          panelId: panel.id,
          a: [+a.x.toFixed(2), +a.y.toFixed(2)],
          b: [+b.x.toFixed(2), +b.y.toFixed(2)],
          len: +len.toFixed(2),
          kindInitial: kindsInitial.length ? kindsInitial.join("+") : "UNKNOWN",
          kindFinal: kindsFinal.length ? kindsFinal.join("+") : "UNKNOWN",
          lostCrease: lost,
          unknown,
        };
      });
      const counts = edges.reduce(
        (acc, e) => {
          if (e.kindFinal.includes("crease")) acc.crease++;
          else if (e.kindFinal.includes("cut")) acc.cut++;
          else if (e.kindFinal.includes("perf")) acc.perf++;
          else acc.unknown++;
          return acc;
        },
        { cut: 0, crease: 0, perf: 0, unknown: 0 },
      );
      return { panelId: panel.id, counts, edges };
    });
    if (typeof globalThis !== "undefined" && (globalThis as { __PACKAGING_CAD_DEBUG__?: boolean }).__PACKAGING_CAD_DEBUG__) {
      // eslint-disable-next-line no-console
      console.info("[edge-kind-trace] per-panel edges (initial vs final)", edgeTrace);
    }
    const suspects = edgeTrace.flatMap((p) =>
      p.edges.filter((e) => e.lostCrease || e.unknown).map((e) => ({ ...e, panelCounts: p.counts })),
    );
    if (suspects.length) {
      if (typeof globalThis !== "undefined" && (globalThis as { __PACKAGING_CAD_DEBUG__?: boolean }).__PACKAGING_CAD_DEBUG__) {
        // eslint-disable-next-line no-console
        console.warn("[edge-kind-trace] SUSPECT edges (lostCrease or unknown)", suspects);
      }
      // Para cada suspect, refaz a classificação coletando candidatos próximos
      // com motivo de rejeição. Mostra exatamente por que o matcher
      // não associou um segmento estrutural à aresta do painel.
      const candidateReports = suspects.map((s) => {
        const a = { x: s.a[0], y: s.a[1] };
        const b = { x: s.b[0], y: s.b[1] };
        const resInitial = classifyPanelEdgeAll(a, b, idxInitial, { collectCandidates: true, candidateNearMm: 5 });
        const resFinal = classifyPanelEdgeAll(a, b, idxFinal, { collectCandidates: true, candidateNearMm: 5 });
        return {
          edgeId: s.edgeId,
          a: s.a, b: s.b, len: s.len,
          candidatesInitial: resInitial.candidates ?? [],
          candidatesFinal: resFinal.candidates ?? [],
        };
      });
      if (typeof globalThis !== "undefined" && (globalThis as { __PACKAGING_CAD_DEBUG__?: boolean }).__PACKAGING_CAD_DEBUG__) {
        // eslint-disable-next-line no-console
        console.warn("[edge-kind-trace] candidate match attempts", candidateReports);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[edge-kind-trace] failed", err);
  }


  // Diagnóstico de fragmentação: quantos painéis existiriam SEM creases
  // (apenas cuts) — se este número for << panelsPass2, creases internos estão
  // subdividindo abas/corpo em sub-faces espúrias.
  const cutsOnlyStructural = finalStructural.filter((s) => s.kind === "cut");
  const polysCutsOnly = buildPanelsFromSegments(cutsOnlyStructural, panelTol);
  const fragmentsBelow200 = panelsAfterFilter.filter((p) => polygonAreaAbs(p.polygon) < 200).length;
  const finalKindByPathIndex = new Map<number, string>();
  for (const seg of finalStructural) {
    if (seg.source?.pathIndex !== undefined && !finalKindByPathIndex.has(seg.source.pathIndex)) {
      finalKindByPathIndex.set(seg.source.pathIndex, seg.kind);
    }
  }
  const sourcePathLookup = buildSourcePathLookup(r.paths, mapping, finalKindByPathIndex, reclassificationReasonsByPathIndex);
  const cutsOnlyDiagnostic = diagnoseCutGraph(cutsOnlyStructural, { sourcePathLookup });

  lastPipelineReport = {
    rescueEnabled: PIPELINE_RESCUE_ENABLED,
    segmentsBefore: initialStructural.length,
    segmentsAfter: finalStructural.length,
    segmentsHashBefore: hashBefore,
    segmentsHashAfter: hashAfter,
    segmentsChanged,
    reclassifiedCutToCrease: reclassCutToCrease,
    reclassifiedCreaseToCut: reclassCreaseToCut,
    panelsPass1: panels1.length,
    panelsPass2: panelsAfterFilter.length,
    panelsRebuilt,
    panelsCutsOnly: polysCutsOnly.length,
    panelsPass1Polygons: panels1.map((p) => p.polygon),
    panelsPass2Polygons: panels.map((p) => p.polygon),
    fragmentsBelow200,
    panelsCutsOnlyPolygons: polysCutsOnly,
    panelsCutsCreasePolygons: panelsAfterFilter.map((p) => p.polygon),
    cutsOnlyDiagnostic,
    structuralFilter: structuralResult.report,
    holesPropagation: { kernelHoles: 0, propagated: 0, unassigned: 0, panelsWithHoles: [] },
  };
  if (typeof globalThis !== "undefined" && (globalThis as { __PACKAGING_CAD_DEBUG__?: boolean }).__PACKAGING_CAD_DEBUG__) {
    // eslint-disable-next-line no-console
    console.info("[pipeline]", lastPipelineReport);
    if (structuralResult.report.droppedCount > 0) {
      // eslint-disable-next-line no-console
      console.info("[structural-filter] dropped", structuralResult.report.dropped);
    }
  }

  panels = panelsAfterFilter;

  // === Propagação kernel.faces[].holes → Panel.holes ============================
  // O Panel até aqui não carrega holes. O kernel já identificou e classificou os
  // loops internos (`kernelResult.holeLoops`). Aqui atribuímos cada hole ao
  // MENOR painel que o contém estritamente — sem alterar geometria de painel
  // ou de hole. Apenas anexamos a referência.
  const _polyArea = (poly: Pt[]) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    return Math.abs(a / 2);
  };
  const _pointInPoly = (poly: Pt[], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };
  const kernelHoleRings: Pt[][] = kernelResult.holeLoops.map((l) =>
    l.points.map((p) => ({ x: p.x, y: p.y })),
  );
  const panelsAscByArea = [...panels].sort((a, b) => _polyArea(a.polygon) - _polyArea(b.polygon));
  let propagatedHoles = 0;
  let unassignedHoles = 0;
  for (const ring of kernelHoleRings) {
    const ringArea = _polyArea(ring);
    if (ringArea < 0.5) { unassignedHoles++; continue; }
    let cx = 0, cy = 0;
    for (const p of ring) { cx += p.x; cy += p.y; }
    cx /= ring.length; cy /= ring.length;
    let host: Panel | null = null;
    for (const p of panelsAscByArea) {
      const pArea = _polyArea(p.polygon);
      if (pArea <= ringArea * 1.02) continue;
      if (!_pointInPoly(p.polygon, cx, cy)) continue;
      host = p;
      break;
    }
    if (!host) { unassignedHoles++; continue; }
    (host.holes = host.holes || []).push(ring);
    propagatedHoles++;
  }
  const holesPropagation = {
    kernelHoles: kernelHoleRings.length,
    propagated: propagatedHoles,
    unassigned: unassignedHoles,
    panelsWithHoles: panels
      .filter((p) => p.holes && p.holes.length > 0)
      .map((p) => ({ id: p.id, holes: p.holes!.length })),
  };
  if (lastPipelineReport) lastPipelineReport.holesPropagation = holesPropagation;
  if (typeof globalThis !== "undefined" && (globalThis as { __PACKAGING_CAD_DEBUG__?: boolean }).__PACKAGING_CAD_DEBUG__) {
    // eslint-disable-next-line no-console
    console.info("[kernel→panel holes]", holesPropagation);
  }


  const structuralSegments = finalStructural;
  const inferredParams = inferImportedParams(panels, segments, params);
  const structuralPanels = panels;

  // Compensações DESLIGADAS quando PIPELINE_RESCUE_ENABLED=false.
  const analysisPanels: Panel[] = PIPELINE_RESCUE_ENABLED
    ? recoverMissingFlapPanels(
        extractAbsorbedFlapLobes(structuralPanels, structuralSegments),
        structuralSegments,
      )
    : structuralPanels;

  const importOverlays = collectImportOverlays(rawSegments, segments, structuralPanels, analysisPanels, cutsOnlyDiagnostic.sourcePathTraces);

  lastIssues = {
    ...cadIssues,
    ignoredStrokes,
    internalCuts: reclassified.internalCuts,
    healedCurves: healing.healedCurves,
    healedLoops: healing.healedLoops,
    failedClosures: healing.failedClosures,
    openCurveChains: healing.openCurveChains,
    inferredOvals: healing.inferredOvals,
    inferredCircles: healing.inferredCircles,
  };

  // Reconhecimento automático tipo Heidelberg/ArtiosCAD.
  panels = relabelPanels(structuralPanels, segments);
  const detected = detectClosure(analysisPanels, segments);
  const closure = {
    top: closureOverride?.top
      ? { kind: closureOverride.top, confidence: 1, reason: "Definido manualmente" }
      : detected.top,
    bottom: closureOverride?.bottom
      ? { kind: closureOverride.bottom, confidence: 1, reason: "Definido manualmente" }
      : detected.bottom,
  };

  // Agrega finish paths em camadas por tipo + cor de origem.
  const finishMap = new Map<string, FinishLayer>();
  const bboxArea = Math.max(1, r.widthMm * r.heightMm);
  for (const fp of finishPaths) {
    const id = `${fp.kind}:${fp.colorKey}`;
    const cls = classifyFinishSpot(fp.colorKey, fp.colorLabel);
    let layer = finishMap.get(id);
    if (!layer) {
      layer = {
        id,
        kind: fp.kind,
        sourceSpotName: fp.colorLabel,
        sourcePantone: cls?.pantone,
        polygons: [],
        coverage: "spot",
        confidence: cls?.confidence ?? 0.6,
        reason: cls?.reason ?? `Mapeado manualmente como ${fp.kind}`,
        enabled: true,
      };
      finishMap.set(id, layer);
    }
    if (fp.points.length >= 3) layer.polygons.push(fp.points);
  }
  for (const layer of finishMap.values()) {
    let total = 0;
    for (const poly of layer.polygons) total += polygonAreaAbs(poly);
    layer.coverage = total / bboxArea >= 0.8 ? "flood" : "spot";
  }
  const finishes = Array.from(finishMap.values());

  return {
    width: r.widthMm,
    height: r.heightMm,
    segments,
    panels,
    meta: {
      fefco: "PDF",
      name: "Faca importada",
      params: inferredParams,
      closure,
      finishes: finishes.length ? finishes : undefined,
      importDebug: {
        preserveGeometry: preserveOriginalGeometry,
        overlays: importOverlays,
      },
    },
  };
}
