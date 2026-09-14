export type LineType = 'cut' | 'crease' | 'perfo' | 'dimension';

export interface Point2D {
  x: number;
  y: number;
}

export interface Segment2D {
  id?: string | number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  type: LineType;
  penWidth?: number;
}

export interface Arc2D {
  id?: string | number;
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  type: LineType;
}

export interface DimensionLine {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  text: string;
  offset?: number;
  isVertical?: boolean;
}

export interface BoundingBox2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface DielineResult {
  segments: Segment2D[];
  arcs: Arc2D[];
  dimensions: DimensionLine[];
  bounds: BoundingBox2D;
  error?: string;
}

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  description?: string;
}

export type ModelStatus = 'PASS' | 'NON_FOLDABLE' | 'ORIGINAL_NO_GEOMETRY' | 'DOCUMENT_ONLY' | 'FAIL';
export type OriginalSourceType = 'C#_PARAMETRIC_DLL' | 'DES_VECTOR_DRAWING' | 'PDF_DOCUMENT_ONLY' | 'NONE';
export type ImplementationType = 'NATIVE_TS' | 'DES_GEOMETRY_PARSER' | 'CSHARP_EVALUATED' | 'NONE';

export interface PackagingModel {
  id: string;
  code: string;
  name: string;
  category: 'FEFCO' | 'ECMA' | 'DISPLAYS' | 'DISPLAY' | 'PERSONALIZADO';
  description: string;
  defaultParams: Record<string, number>;
  paramDefs: ParamDef[];
  calculate: (params: Record<string, number>) => DielineResult;
  status?: ModelStatus;
  originalSource?: OriginalSourceType;
  implementationType?: ImplementationType;
  generator?: string;
  isFoldable?: boolean;
  error?: string;
}

export interface CardboardProfile {
  id: string;
  name: string;
  code: string;
  thickness: number; // mm
  description: string;
}

export const STANDARD_PROFILES: CardboardProfile[] = [
  { id: 'cartao_300', name: 'Papel Cartão Duplex/Triplex', code: 'CARTAO', thickness: 0.5, description: '300-350g/m² - Caixas leves, remédios e cosméticos' },
  { id: 'onda_f', name: 'Micro-ondulado Onda F', code: 'F', thickness: 0.9, description: 'Micro-ondulado fino para acabamento nobre' },
  { id: 'onda_e', name: 'Micro-ondulado Onda E', code: 'E', thickness: 1.5, description: 'Excelente para caixas de e-commerce e alimentos' },
  { id: 'onda_b', name: 'Papelão Ondulado Onda B', code: 'B', thickness: 3.0, description: 'Padrão industrial rígido para transporte médio' },
  { id: 'onda_c', name: 'Papelão Ondulado Onda C', code: 'C', thickness: 4.0, description: 'Alta resistência ao empilhamento' },
  { id: 'onda_bc', name: 'Onda Dupla (Onda BC)', code: 'BC', thickness: 7.0, description: 'Pesado para cargas industriais e exportação' },
];
