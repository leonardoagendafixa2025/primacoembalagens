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
  customTopology?: any;
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

export type ModelStatus = 'PASS' | 'NON_FOLDABLE' | 'FAIL' | 'PENDING_PORTING';
export type OriginalSourceType = 'C#_PARAMETRIC_DLL' | 'DES_VECTOR_DRAWING' | 'NONE';
export type ImplementationType = 'NATIVE_TS' | 'DES_GEOMETRY_PARSER' | 'CSHARP_EVALUATED' | 'NONE';

export interface PackagingModel {
  id: string;
  code: string;
  name: string;
  category: 'FEFCO' | 'ECMA' | 'PERSONALIZADO';
  series?: string;
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
    id: 'cartao_duplex_triplex',
    name: 'Papel Cartão Duplex/Triplex',
    code: 'DUPLEX/TRIPLEX',
    thickness: 0.4,
    description: 'Cartão gráfico para caixas dobráveis, cosméticos, farmacêuticos e displays (0,3mm a 0,6mm)',
    outerColor: '#FFFFFF',
    innerColor: '#FFFFFF',
    roughness: 0.28,
    minThickness: 0.1,
  },
  {
    id: 'micro_onda_e',
    name: 'Micro-Ondulado Onda E (E-Flute)',
    code: 'ONDA-E',
    thickness: 1.5,
    description: 'Micro-ondulado para embalagens de e-commerce leves, bebidas, presentes e caixas premium (1,2mm a 1,6mm)',
    outerColor: '#c8a876',
    innerColor: '#c8a876',
    roughness: 0.45,
    minThickness: 1.0,
  },
  {
    id: 'papelao_onda_b',
    name: 'Papelão Ondulado Onda B (B-Flute)',
    code: 'ONDA-B',
    thickness: 3.0,
    description: 'Onda simples para caixas de sapatos, e-commerce padrão e embalagens de varejo (2,8mm a 3,2mm)',
    outerColor: '#b89662',
    innerColor: '#b89662',
    roughness: 0.5,
    minThickness: 2.0,
  },
  {
    id: 'papelao_onda_c',
    name: 'Papelão Ondulado Onda C (C-Flute)',
    code: 'ONDA-C',
    thickness: 4.0,
    description: 'Onda simples de alta proteção e empilhamento para caixas de despacho FEFCO 0201 (3,6mm a 4,2mm)',
    outerColor: '#a88652',
    innerColor: '#a88652',
    roughness: 0.55,
    minThickness: 3.0,
  },
  {
    id: 'papelao_onda_bc',
    name: 'Papelão Onda Dupla BC (Double Wall)',
    code: 'ONDA-BC',
    thickness: 7.0,
    description: 'Parede dupla para cargas pesadas, hortifrúti, peças industriais e exportação (6,5mm a 7,2mm)',
    outerColor: '#987642',
    innerColor: '#987642',
    roughness: 0.6,
    minThickness: 5.0,
  },
];


