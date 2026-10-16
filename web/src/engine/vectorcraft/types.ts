/**
 * VectorCraft Engine — Tipos fundamentais
 * Inspirado no vectorcraft-geom / vectorcraft-doc do storytold/vectorcraft
 * Adaptado para integração com o PLMPackLib (TypeScript puro, sem WASM)
 */

// ─── Pontos e Vetores ───────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Curvas Bézier ──────────────────────────────────────────────────

export type BezierSegmentType = 'line' | 'quadratic' | 'cubic';

/** Segmento de curva Bézier (line, quadrática ou cúbica) */
export interface BezierSegment {
  type: BezierSegmentType;
  /** Ponto de controle 1 (para quadrática e cúbica) */
  cp1?: Vec2;
  /** Ponto de controle 2 (apenas para cúbica) */
  cp2?: Vec2;
  /** Ponto final do segmento */
  to: Vec2;
}

/** Ponto de ancoragem com handles (ao estilo Illustrator/VectorCraft) */
export interface AnchorPoint {
  position: Vec2;
  /** Handle de entrada (antes do ponto) */
  handleIn?: Vec2;
  /** Handle de saída (depois do ponto) */
  handleOut?: Vec2;
  /** Tipo do ponto de ancoragem */
  type: 'corner' | 'smooth' | 'symmetric';
}

// ─── Paths Vetoriais ────────────────────────────────────────────────

export interface VectorPath {
  id: string;
  anchors: AnchorPoint[];
  closed: boolean;
  /** Estilo visual */
  stroke: StrokeStyle;
  fill: FillStyle;
  /** Tipo semântico no contexto de embalagens */
  semanticType?: 'cut' | 'crease' | 'perfo' | 'bleed' | 'artwork' | 'annotation';
  /** Visível? */
  visible: boolean;
  /** Bloqueado para edição? */
  locked: boolean;
  /** Nome do path */
  name?: string;
}

export interface StrokeStyle {
  color: string;
  width: number;
  dashArray?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  opacity?: number;
}

export interface FillStyle {
  color: string;
  opacity: number;
  type: 'solid' | 'none' | 'gradient';
  gradient?: GradientDef;
}

export interface GradientDef {
  type: 'linear' | 'radial';
  stops: { offset: number; color: string; opacity: number }[];
  angle?: number;
}

// ─── Shapes (formas compostas) ──────────────────────────────────────

export interface VectorShape {
  id: string;
  name: string;
  paths: VectorPath[];
  /** Transformação local */
  transform: ShapeTransform;
  /** Camada */
  layerId: string;
  /** Agrupamento */
  groupId?: string;
  visible: boolean;
  locked: boolean;
  /** Opacidade global do shape */
  opacity: number;
}

export interface ShapeTransform {
  x: number;
  y: number;
  rotation: number;     // graus
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
}

export const DEFAULT_TRANSFORM: ShapeTransform = {
  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0,
};

// ─── Camadas (Layers) ───────────────────────────────────────────────

export interface VectorLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  order: number;
}

/** Camadas padrão para embalagens (padrão industrial brasileiro) */
export const DEFAULT_PACKAGING_LAYERS: VectorLayer[] = [
  { id: 'cut',    name: 'Corte',       color: '#ef4444', visible: true, locked: false, opacity: 1, order: 0 },
  { id: 'crease', name: 'Vinco',       color: '#3b82f6', visible: true, locked: false, opacity: 1, order: 1 },
  { id: 'perfo',  name: 'Picote',      color: '#10b981', visible: true, locked: false, opacity: 1, order: 2 },
  { id: 'bleed',  name: 'Sangria',     color: '#22c55e', visible: true, locked: false, opacity: 1, order: 3 },
  { id: 'artwork', name: 'Arte',       color: '#a855f7', visible: true, locked: false, opacity: 1, order: 4 },
  { id: 'dims',   name: 'Cotas',       color: '#06b6d4', visible: true, locked: false, opacity: 1, order: 5 },
  { id: 'marks',  name: 'Marcas',      color: '#f59e0b', visible: true, locked: false, opacity: 1, order: 6 },
];

// ─── Documento Vetorial ─────────────────────────────────────────────

export interface VectorDocument {
  id: string;
  name: string;
  /** Unidade (mm para embalagens) */
  unit: 'mm' | 'pt' | 'px';
  /** Dimensões do artboard */
  artboard: { width: number; height: number };
  layers: VectorLayer[];
  shapes: VectorShape[];
  /** Metadata do documento */
  metadata?: Record<string, unknown>;
}

// ─── Ferramentas do Editor ──────────────────────────────────────────

export type VectorToolMode =
  | 'select'          // Seleção (V) — como Selection Tool do Illustrator
  | 'direct-select'   // Seleção Direta (A) — editar pontos e handles
  | 'pen'             // Caneta (P) — criar paths Bézier
  | 'line'            // Linha (\\) — linhas retas
  | 'rectangle'       // Retângulo (M) — caixas
  | 'ellipse'         // Elipse (L) — círculos/elipses
  | 'polygon'         // Polígono — polígonos regulares
  | 'hand'            // Mão (H) — pan/arrastar viewport
  | 'zoom'            // Zoom (Z) — zoom in/out
  | 'knife'           // Faca — cortar paths
  | 'eraser'          // Borracha — apagar segmentos
  | 'dimension';      // Cotagem — cotas automáticas

// ─── Operações Booleanas (Pathfinder) ───────────────────────────────

export type PathfinderOp = 'unite' | 'subtract' | 'intersect' | 'exclude' | 'divide';

// ─── Resultado de Hit-Test ──────────────────────────────────────────

export interface HitTestResult {
  type: 'none' | 'shape' | 'anchor' | 'handle-in' | 'handle-out' | 'segment' | 'fill';
  shapeId?: string;
  pathId?: string;
  anchorIndex?: number;
  /** Distância em pixels do clique ao item detectado */
  distance: number;
  /** Posição do hit no espaço do documento */
  point: Vec2;
}

// ─── Clipboard ──────────────────────────────────────────────────────

export interface VectorClipboard {
  shapes: VectorShape[];
  sourceDocId?: string;
}

// ─── Undo/Redo ──────────────────────────────────────────────────────

export interface UndoEntry {
  label: string;
  timestamp: number;
  /** Snapshot das shapes, paths e layers */
  shapes: VectorShape[];
  layers: VectorLayer[];
  paths?: VectorPath[];
}
