// Tipos compartilhados do módulo de Embalagens (todas as medidas em mm).

export type Pt = { x: number; y: number };

export type SegmentKind = "cut" | "crease" | "perf" | "bleed" | "safe";

export interface SegmentSource {
  /** Índice da ImportedPath original (após detectStitched). */
  pathIndex: number;
  colorKey: string;
  colorLabel: string;
  cssColor: string;
  /** true se a path original continha curveTo/quadraticCurveTo (Bezier tesselada). */
  hasCurves: boolean;
  /** dashArray original ([]=sólido). */
  dashArray: number[];
  /** "fill" se a path veio de fill/eoFill; "stroke" caso contrário. */
  paintOp: "fill" | "stroke";
}

export interface Segment {
  kind: SegmentKind;
  /** Lista de pontos. Se closed=true, fecha do último para o primeiro. */
  points: Pt[];
  closed?: boolean;
  /** Origem PDF (parser). Opcional para não quebrar segments sintéticos. */
  source?: SegmentSource;
}


export interface Panel {
  id: string;
  label: string;
  /** Polígono fechado em mm. */
  polygon: Pt[];
  /** Loops internos (janelas/furos) propagados do kernel CAD.
   *  Cada anel é um polígono fechado em mm contido estritamente em `polygon`.
   *  Opcional para não quebrar painéis sintéticos / pipeline legacy. */
  holes?: Pt[][];
  /** ID estável do painel correspondente na nova pipeline (FNV-1a do polígono
   *  normalizado). Anexado em build-time por `annotatePipelineIds`. Permite
   *  que o resto da UI fale com o pipeline sem re-mapear por centróide. */
  pipelinePanelId?: string;
}

export interface DielineParams {
  L: number; // largura interna
  H: number; // altura interna
  P: number; // profundidade interna
  thickness: number; // espessura do papel (mm)
  glueTab: number; // largura da aba de cola
  bleed: number; // sangria (mm)
  [k: string]: number;
}

/** Tipos de fechamento (topo/fundo) reconhecidos automaticamente. */
export type ClosureKind =
  | "tuck"        // Reverse/Straight Tuck End — aba retangular + dust flaps trapezoidais
  | "crash_lock"  // Auto-bottom (crash-lock) — abas com diagonais entrelaçadas
  | "rsc"         // Americano (FEFCO 0201) — 4 abas iguais retangulares
  | "seal_end"    // Seal end (cola) — abas iguais sem dust flaps
  | "open"        // Bandeja / aberto
  | "unknown";    // Não foi possível classificar

export interface ClosureInfo {
  kind: ClosureKind;
  /** Confiança 0..1 (heurística). */
  confidence: number;
  /** Razão humana ("4 abas iguais sem chanfro"). */
  reason: string;
}

export interface FinishLayer {
  id: string;
  kind: import("./finishes/pantone-finishes").FinishKind;
  /** Nome literal da separação spot original. */
  sourceSpotName: string;
  /** Código Pantone normalizado, se reconhecido. */
  sourcePantone?: string;
  /** Polígonos cobertos pelo acabamento (mm). */
  polygons: Pt[][];
  /** Cobertura medida: "flood" >= 80% do bbox da peça, senão "spot". */
  coverage: "flood" | "spot";
  /** Confiança da classificação 0..1. */
  confidence: number;
  /** Motivo legível ("Pantone metálico ouro (871)"). */
  reason: string;
  /** Usuário pode desligar a camada sem perder a referência. */
  enabled: boolean;
}

export interface Dieline {
  /** Bounding box total em mm (x:0..width, y:0..height). */
  width: number;
  height: number;
  segments: Segment[];
  panels: Panel[];
  meta: {
    fefco: string;
    name: string;
    params: DielineParams;
    closure?: { top: ClosureInfo; bottom: ClosureInfo };
    finishes?: FinishLayer[];
    importDebug?: {
      preserveGeometry: boolean;
      overlays: Array<{
        id: string;
        label: string;
        kind: "original-boundary" | "panel-boundary" | "repaired-boundary" | "removed-vertices" | "collapsed-feature" | "simplified-region" | "source-path-trace";
        closed?: boolean;
        points?: Pt[];
        polygon?: Pt[];
        meta?: {
          pathIndex?: number;
          relatedSegIdxs?: number[];
        };
      }>;
    };
  };
}

export interface ModelDef {
  id: string; // ex: "fefco-0201"
  fefco: string; // "0201"
  name: string; // "Caixa reta cola"
  category: "fefco" | "ecma" | "display" | "especial";
  /** Subgrupo opcional (ex: "A", "B", "C", "D", "E", "F", "X" para ECMA). */
  subcategory?: string;
  /** Parâmetros expostos na UI (além de L/H/P/thickness/glueTab/bleed). */
  extraParams?: Array<{ key: string; label: string; default: number; min?: number; max?: number }>;
  defaults: Partial<DielineParams>;
  build: (p: DielineParams) => Dieline;
}
