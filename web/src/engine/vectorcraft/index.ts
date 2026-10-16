/**
 * VectorCraft Engine — Barrel Export
 * Ponto de entrada unificado para todos os módulos do VectorCraft Engine
 */

// Tipos
export type {
  Vec2,
  BezierSegmentType,
  BezierSegment,
  AnchorPoint,
  VectorPath,
  StrokeStyle,
  FillStyle,
  GradientDef,
  VectorShape,
  ShapeTransform,
  VectorLayer,
  VectorDocument,
  VectorToolMode,
  PathfinderOp,
  HitTestResult,
  VectorClipboard,
  UndoEntry,
} from './types';

export { DEFAULT_TRANSFORM, DEFAULT_PACKAGING_LAYERS } from './types';

// Geometria Bézier
export {
  vec2,
  add, sub, scale, lerp, dot, cross2d, len, dist,
  normalize, perpCW, perpCCW, mid, angleBetween,
  evalCubic,
  evalCubicDerivative,
  evalQuadratic,
  cubicNormal,
  splitCubicAt,
  cubicBounds,
  flattenCubic,
  closestPointOnCubic,
  cubicArcLength,
  offsetPath,
  anchorsToSvgPath,
  dielineToVectorPaths,
  vectorPathsToDieline,
} from './bezier';

// Pathops (Pathfinder)
export {
  pathfinderOp,
  pathfinderMulti,
  isPointInPolygon,
  polygonArea,
} from './pathops';

// PDF Export
export {
  buildPdfContent,
  exportToPDF,
} from './pdfExporter';

// SVG Importer
export {
  parseSvgToDieline,
} from './svgImporter';

