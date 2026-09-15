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

export type ModelStatus = 'PASS' | 'NON_FOLDABLE' | 'ORIGINAL_NO_GEOMETRY' | 'DOCUMENT_ONLY' | 'FAIL' | 'PENDING_PORTING';
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
  outerColor?: string;
  innerColor?: string;
  roughness?: number;
  minThickness?: number;
}

export const STANDARD_PROFILES: CardboardProfile[] = [
  {
    id: 'cartao_triplex_branco',
    name: 'Papel Cartão BRANCO Triplex',
    code: 'TRIPLEX',
    thickness: 0.4,
    description: 'Frente e Verso 100% BRANCOS - Embalagens nobres, cosméticos e farmacêuticos (a partir de 0,1mm)',
    outerColor: '#FFFFFF',
    innerColor: '#FFFFFF',
    roughness: 0.28,
    minThickness: 0.1,
  },
  {
    id: 'cartao_duplex_branco',
    name: 'Papel Cartão BRANCO Duplex',
    code: 'DUPLEX',
    thickness: 0.4,
    description: 'Frente Branca Couchê / Verso Creme Claro - Cartão duplex gráfico (a partir de 0,1mm)',
    outerColor: '#FFFFFF',
    innerColor: '#FAF7F0',
    roughness: 0.32,
    minThickness: 0.1,
  },
  {
    id: 'onda_f',
    name: 'Micro-ondulado Onda F',
    code: 'F',
    thickness: 0.9,
    description: 'Micro-ondulado fino para acabamento nobre',
    outerColor: '#D8B589',
    innerColor: '#E2C49D',
    roughness: 0.8,
    minThickness: 0.8,
  },
  {
    id: 'onda_e',
    name: 'Micro-ondulado Onda E',
    code: 'E',
    thickness: 1.5,
    description: 'Excelente para caixas de e-commerce e alimentos',
    outerColor: '#C29B68',
    innerColor: '#D4B07B',
    roughness: 0.85,
    minThickness: 1.2,
  },
  {
    id: 'onda_b',
    name: 'Papelão Ondulado Onda B',
    code: 'B',
    thickness: 3.0,
    description: 'Padrão industrial rígido para transporte médio',
    outerColor: '#B88B58',
    innerColor: '#C99E6B',
    roughness: 0.9,
    minThickness: 2.5,
  },
  {
    id: 'onda_c',
    name: 'Papelão Ondulado Onda C',
    code: 'C',
    thickness: 4.0,
    description: 'Alta resistência ao empilhamento',
    outerColor: '#A87D4A',
    innerColor: '#BD915D',
    roughness: 0.9,
    minThickness: 3.5,
  },
  {
    id: 'onda_bc',
    name: 'Onda Dupla (Onda BC)',
    code: 'BC',
    thickness: 7.0,
    description: 'Pesado para cargas industriais e exportação',
    outerColor: '#966D3B',
    innerColor: '#A87E4C',
    roughness: 0.95,
    minThickness: 6.0,
  },
];

