import type { Point2D, BoundingBox2D, LineType } from '../types';

/**
 * Unidades suportadas para importação CAD de facas estruturais
 */
export type CadUnit = 'mm' | 'cm' | 'inch' | 'pt' | 'px' | 'unknown';

/**
 * Fatores de conversão exatos para milímetros (mm)
 */
export const CAD_UNIT_FACTORS: Record<CadUnit, number> = {
  mm: 1.0,
  cm: 10.0,
  inch: 25.4,
  pt: 25.4 / 72.0, // 0.352777778 mm
  px: 25.4 / 96.0, // 0.264583333 mm (CSS 96 DPI padrão)
  unknown: 1.0,
};

/**
 * Tipos de linha estruturais e auxiliares para classificação de facas
 */
export type CadClassificationTarget =
  | 'CUT'               // Corte estrutural -> 'cut'
  | 'CREASE'            // Vinco estrutural -> 'crease'
  | 'PERF'              // Picote industrial -> 'perfo'
  | 'HALF_CUT'          // Meio corte -> 'cut'
  | 'REVERSE_CREASE'    // Vinco reverso -> 'crease'
  | 'SLOT'              // Rasgo / Corte de encaixe -> 'cut'
  | 'CONSTRUCTION'      // Linha de construção / guia -> 'dimension'
  | 'ANNOTATION'        // Anotação / Texto técnico -> 'dimension'
  | 'DIMENSION'         // Linha de cota / dimensão -> 'dimension'
  | 'GRAPHIC'           // Elemento gráfico / Arte -> 'dimension'
  | 'IGNORE'            // Ignorar / Não importar
  | 'UNCLASSIFIED';      // Não classificado (requer ação do usuário)

/**
 * Mapeamento do tipo de classificação para o LineType nativo do PRIMACOR
 */
export function targetToLineType(target: CadClassificationTarget): LineType | null {
  switch (target) {
    case 'CUT':
    case 'HALF_CUT':
    case 'SLOT':
      return 'cut';
    case 'CREASE':
    case 'REVERSE_CREASE':
      return 'crease';
    case 'PERF':
      return 'perfo';
    case 'CONSTRUCTION':
    case 'ANNOTATION':
    case 'DIMENSION':
    case 'GRAPHIC':
      return 'dimension';
    case 'IGNORE':
    case 'UNCLASSIFIED':
    default:
      return null;
  }
}

/**
 * Representação de uma cor extraída do arquivo CAD
 */
export interface CadColor {
  hex: string;            // Ex: "#FF0000"
  raw: string;            // Ex: "rgb(255,0,0)", "ACI:1", "CMYK(0,100,100,0)"
  name?: string;          // Ex: "Red", "Spot DIE_CUT"
  aciIndex?: number;      // Código ACI (AutoCAD Color Index 1-255)
  cmyk?: { c: number; m: number; y: number; k: number };
  rgb?: { r: number; g: number; b: number };
}

/**
 * Entidades geométricas brutas extraídas na importação
 */
export interface ImportedEntityBase {
  id: string;
  sourceType: 'LINE' | 'ARC' | 'CIRCLE' | 'POLYLINE' | 'LWPOLYLINE' | 'SPLINE' | 'BEZIER' | 'ELLIPSE' | 'PATH';
  layer: string;
  color: CadColor;
  lineType?: string;
  lineWidth?: number;
  unresolvedTransform?: boolean;
}

export interface ImportedLineEntity extends ImportedEntityBase {
  sourceType: 'LINE';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ImportedArcEntity extends ImportedEntityBase {
  sourceType: 'ARC';
  cx: number;
  cy: number;
  r: number;
  startAngleDeg: number;
  endAngleDeg: number;
  counterClockwise?: boolean;
}

export interface ImportedCircleEntity extends ImportedEntityBase {
  sourceType: 'CIRCLE';
  cx: number;
  cy: number;
  r: number;
}

export interface ImportedBezierEntity extends ImportedEntityBase {
  sourceType: 'BEZIER';
  p0: Point2D;
  cp1: Point2D;
  cp2?: Point2D; // Opcional se for quadrática
  p1: Point2D;
}

export interface ImportedPolylineEntity extends ImportedEntityBase {
  sourceType: 'POLYLINE' | 'LWPOLYLINE';
  vertices: Array<{ x: number; y: number; bulge?: number }>;
  isClosed: boolean;
}

export type ImportedEntity =
  | ImportedLineEntity
  | ImportedArcEntity
  | ImportedCircleEntity
  | ImportedBezierEntity
  | ImportedPolylineEntity;

/**
 * Camada (Layer) extraída do arquivo CAD
 */
export interface ImportedLayer {
  name: string;
  color?: CadColor;
  lineType?: string;
  visible?: boolean;
  entityCount: number;
}

/**
 * Estatística agregada de cores para interface de classificação
 */
export interface ImportedColorStat {
  colorKey: string;
  color: CadColor;
  entityCount: number;
  suggestedTarget: CadClassificationTarget;
}

/**
 * Estatística agregada de layers
 */
export interface ImportedLayerStat {
  layerName: string;
  entityCount: number;
  color?: CadColor;
  suggestedTarget: CadClassificationTarget;
}

/**
 * Estatística agregada de tipos de linha (Linetypes)
 */
export interface ImportedLineTypeStat {
  lineTypeName: string;
  entityCount: number;
  suggestedTarget: CadClassificationTarget;
}

/**
 * Entidade não suportada registrada com rigor
 */
export interface UnsupportedEntityRecord {
  type: string;
  layer: string;
  count: number;
  details?: string;
  location?: Point2D;
}

/**
 * Documento CAD importado — Representação Intermediária Comum
 */
export interface ImportedCadDocument {
  filename: string;
  format: 'PDF' | 'SVG' | 'DXF' | 'DWG';
  detectedUnit: CadUnit;
  unitConfirmed: boolean;
  scaleFactorToMm: number;
  entities: ImportedEntity[];
  layers: Record<string, ImportedLayer>;
  colorStats: ImportedColorStat[];
  layerStats: ImportedLayerStat[];
  lineTypeStats: ImportedLineTypeStat[];
  unsupportedEntities: UnsupportedEntityRecord[];
  bounds: BoundingBox2D;
  hasVectorGeometry: boolean;
  isRasterOnly: boolean;
  warnings: string[];
  errors: string[];
  metadata: Record<string, unknown>;
}

/**
 * Regra individual de classificação
 */
export interface ClassificationRule {
  id: string;
  criteria: 'COLOR' | 'LAYER' | 'LINETYPE' | 'STYLE' | 'MANUAL_ENTITY';
  matchValue: string; // Hex, Nome do layer, Nome do linetype ou ID da entidade
  target: CadClassificationTarget;
  priority: number;   // Maior prioridade executa primeiro
}

/**
 * Perfil de classificação salvo (ex: "Fornecedor ABC", "Padrão ArtiosCAD")
 */
export interface ClassificationProfile {
  id: string;
  name: string;
  format: 'PDF' | 'SVG' | 'DXF' | 'DWG' | 'ALL';
  rules: ClassificationRule[];
  defaultUnit?: CadUnit;
  toleranceMm?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Relatório de auditoria e validação de importação
 */
export interface ImportValidationReport {
  file: string;
  format: 'PDF' | 'SVG' | 'DXF' | 'DWG';
  units: CadUnit;
  scaleFactorApplied: number;
  totalEntitiesFound: number;
  classifiedCounts: {
    cut: number;
    crease: number;
    perf: number;
    dimension: number;
    ignored: number;
    unclassified: number;
  };
  totalCutMm: number;
  totalCreaseMm: number;
  totalPerfMm: number;
  autoRepairs: Array<{
    entityAId?: string;
    entityBId?: string;
    gapMm: number;
    action: string;
    location?: Point2D;
  }>;
  duplicatesRemoved: number;
  bezierConvertedCount: number;
  unsupportedEntities: UnsupportedEntityRecord[];
  warnings: string[];
  errors: string[];
  bounds: BoundingBox2D;
  geometryStatus: 'PASS' | 'WARNING' | 'FAIL';
  maxDeviationMm: number;
}
