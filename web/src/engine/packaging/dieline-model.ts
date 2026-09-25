// ============================================================================
// CAMADA 1 — DIELINE SOURCE OF TRUTH
// ----------------------------------------------------------------------------
// Representação explícita da faca original. É a única verdade do 2D.
//
// REGRAS DURAS:
//   • `kind` é definido na importação/classificação base e NUNCA é alterado por
//     panelização, fold-graph, hinge-detection ou animação 3D.
//   • O renderer 2D consome SOMENTE `DielineModel.segments` (via Dieline).
//   • Mutações automáticas após a importação são proibidas. A edição manual do
//     usuário (ferramenta "Editar linhas") é permitida — ela vai por store +
//     `setSegmentKind`, e re-emite um novo DielineModel.
//
// Esta camada é independente da Camada 2 (modelo estrutural) e da Camada 3
// (folding plan / preview 3D). O motor estrutural opera sobre uma CÓPIA
// normalizada de `segments`; ele jamais reescreve esta estrutura.
// ============================================================================

import type { Pt, Segment, SegmentKind } from "./dieline-types";

export interface DielineSegment {
  /** Identificador estável dentro do DielineModel. */
  id: string;
  /** Endpoint inicial simplificado, para auditoria e interoperabilidade. */
  a: readonly [number, number];
  /** Endpoint final simplificado, para auditoria e interoperabilidade. */
  b: readonly [number, number];
  /** Endpoints discretos do segmento (pode haver vértices intermediários). */
  points: ReadonlyArray<Pt>;
  closed: boolean;
  /** Verdade da faca: cut / crease / perf / bleed / safe. */
  kind: SegmentKind | "unknown";
  /** Comprimento total (mm) — soma das arestas internas. */
  length: number;
  /** Origem opcional (path index do PDF/SVG/JSON importado). */
  sourceId?: string;
}

export interface DielineModel {
  /** Bounding box informativo (mm). */
  width: number;
  height: number;
  /** Segmentos imutáveis da faca. */
  segments: ReadonlyArray<DielineSegment>;
  /** Timestamp de criação para debug. */
  frozenAt: number;
}

function segLength(points: ReadonlyArray<Pt>, closed: boolean): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  if (closed && points.length > 2) {
    const a = points[points.length - 1], b = points[0];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * Constrói o DielineModel canônico a partir dos `Segment[]` importados.
 * Não altera `kind`; só atribui IDs estáveis e congela a estrutura.
 */
export function buildDielineModel(
  segments: ReadonlyArray<Segment>,
  bbox: { width: number; height: number },
): DielineModel {
  const out: DielineSegment[] = segments.map((s, i) => {
    const id = `dl-${i.toString(36).padStart(4, "0")}`;
    const a = s.points[0] ?? { x: 0, y: 0 };
    const b = s.points[s.points.length - 1] ?? a;
    const ds: DielineSegment = {
      id,
      a: Object.freeze([a.x, a.y] as const),
      b: Object.freeze([b.x, b.y] as const),
      points: Object.freeze(s.points.map((p) => Object.freeze({ x: p.x, y: p.y }))),
      closed: !!s.closed,
      kind: s.kind,
      length: segLength(s.points, !!s.closed),
      sourceId: s.source ? `path-${s.source.pathIndex}` : undefined,
    };
    return Object.freeze(ds);
  });
  const model: DielineModel = {
    width: bbox.width,
    height: bbox.height,
    segments: Object.freeze(out),
    frozenAt: Date.now(),
  };
  return Object.freeze(model);
}

/**
 * Shim: converte um array `Segment[]` (formato Dieline atual) em DielineModel.
 * Mantém compatibilidade com importadores existentes sem forçar refactor
 * imediato em todos os pontos de entrada.
 */
export function segmentsToDielineModel(
  segments: ReadonlyArray<Segment>,
  width: number,
  height: number,
): DielineModel {
  return buildDielineModel(segments, { width, height });
}

/**
 * Sanity-check de imutabilidade. Lança em dev se algum consumidor tentar
 * mutar `kind` de um segmento congelado. Usar em pontos de entrada críticos.
 */
export function assertFrozen(model: DielineModel): void {
  if (!Object.isFrozen(model) || !Object.isFrozen(model.segments)) {
    throw new Error("[DielineModel] modelo não congelado — violação da Camada 1");
  }
}

/** Resumo de uma faca para debug/inspector (Bloco A). */
export interface DielineSegmentSummary {
  id: string;
  kind: SegmentKind | "unknown";
  length: number;
  a: Pt;
  b: Pt;
  vertices: number;
}

export function summarizeDieline(model: DielineModel): DielineSegmentSummary[] {
  return model.segments.map((s) => ({
    id: s.id,
    kind: s.kind,
    length: s.length,
    a: s.points[0] ?? { x: 0, y: 0 },
    b: s.points[s.points.length - 1] ?? { x: 0, y: 0 },
    vertices: s.points.length,
  }));
}
