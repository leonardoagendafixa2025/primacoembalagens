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
  finish?: string;
  grammage?: string;
}

export const STANDARD_PROFILES: CardboardProfile[] = [
  {
    id: 'cartao',
    name: 'Papel Cartão',
    code: 'CARTAO',
    thickness: 0.4,
    description: 'Cartão gráfico para caixas dobráveis, cosméticos, farmacêuticos e displays (0,3mm a 0,6mm)',
    outerColor: '#FFFFFF',
    innerColor: '#FFFFFF',
    roughness: 0.28,
    minThickness: 0.1,
    finish: 'Frente Couchê Branca / Verso Branco-Pardo',
    grammage: '250 - 400 g/m²',
  },
  {
    id: 'kraft',
    name: 'Papel Kraft',
    code: 'KRAFT',
    thickness: 0.45,
    description: 'Papel kraft pardo de fibras virgens ou recicladas para embalagens sustentáveis, delivery, e-commerce e cartuchos ecológicos (0,30mm a 0,60mm)',
    outerColor: '#b58855',
    innerColor: '#a87844',
    roughness: 0.72,
    minThickness: 0.1,
    finish: 'Kraft Pardo Natural (Fosco / Sem Revestimento)',
    grammage: '250 - 450 g/m²',
  },
];


