import type { PackagingModel, DielineResult, Segment2D, DimensionLine, BoundingBox2D } from '../types';

export const ecmaA20: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'ecmaA20',
  id: 'ecma_a20',
  code: 'ECMA A20',
  name: 'Luva Deslizante (Sleeve)',
  category: 'ECMA',
  description: 'Cinta ou luva tubular colada lateralmente, ideal para envolver bandejas de alimentos, caixas de doces ou produtos promocionais.',
  defaultParams: {
    L: 180,  // Comprimento (mm)
    B: 120,  // Largura (mm)
    H: 45,   // Altura da luva (mm)
    Ep: 0.5, // Espessura do cartão (mm)
    M: 15,   // Aba de cola (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 50, max: 600, step: 2, unit: 'mm', description: 'Comprimento da embalagem interna' },
    { key: 'B', label: 'Largura da Luva (B)', min: 30, max: 400, step: 2, unit: 'mm', description: 'Largura da cinta externa' },
    { key: 'H', label: 'Altura (H)', min: 15, max: 200, step: 1, unit: 'mm', description: 'Espessura da bandeja' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.2, max: 1.5, step: 0.05, unit: 'mm', description: 'Espessura do cartão' },
    { key: 'M', label: 'Aba de Cola (M)', min: 10, max: 30, step: 1, unit: 'mm', description: 'Aba de colagem' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 180;
    const B = params.B || 120;
    const H = params.H || 45;
    const Ep = params.Ep || 0.5;
    const M = params.M || 15;

    // Folgas para deslizar
    const clearance = Ep * 2 + 1;
    const L1 = L + clearance;
    const H1 = H + clearance;

    const segments: Segment2D[] = [];

    // Coordenadas X: Aba Cola (M), Topo (L1), Lateral Dir (H1), Fundo (L1), Lateral Esq (H1)
    const x0 = 0;
    const x1 = M;
    const x2 = x1 + L1;
    const x3 = x2 + H1;
    const x4 = x3 + L1;
    const x5 = x4 + H1;

    // Y: Apenas a largura da luva (B)
    const y0 = 0;
    const y1 = B;

    // 1. CORTES PERIMETRAIS
    segments.push({ x0: x1, y0: y0, x1: x5, y1: y0, type: 'cut' }); // Borda inferior
    segments.push({ x0: x1, y0: y1, x1: x5, y1: y1, type: 'cut' }); // Borda superior
    segments.push({ x0: x5, y0: y0, x1: x5, y1: y1, type: 'cut' }); // Borda direita

    // Aba de colagem chanfrada
    const chamfer = 6;
    segments.push({ x0: x1, y0: y1, x1: x0, y1: y1 - chamfer, type: 'cut' });
    segments.push({ x0: x0, y0: y1 - chamfer, x1: x0, y1: y0 + chamfer, type: 'cut' });
    segments.push({ x0: x0, y0: y0 + chamfer, x1: x1, y1: y0, type: 'cut' });

    // 2. VINCOS VERTICAIS DE DOBRA DA LUVA
    segments.push({ x0: x1, y0: y0, x1: x1, y1: y1, type: 'crease' });
    segments.push({ x0: x2, y0: y0, x1: x2, y1: y1, type: 'crease' });
    segments.push({ x0: x3, y0: y0, x1: x3, y1: y1, type: 'crease' });
    segments.push({ x0: x4, y0: y0, x1: x4, y1: y1, type: 'crease' });

    const dimensions: DimensionLine[] = [
      { x0: x1, y0: y1, x1: x2, y1: y1, text: `L = ${L} mm`, offset: 20 },
      { x0: x2, y0: y1, x1: x3, y1: y1, text: `H = ${H} mm`, offset: 20 },
      { x0: x5, y0: y0, x1: x5, y1: y1, text: `Largura Cinta = ${B} mm`, offset: 25, isVertical: true },
    ];

    const bounds: BoundingBox2D = {
      minX: 0,
      minY: 0,
      maxX: x5,
      maxY: y1,
      width: x5,
      height: y1,
    };

    return {
      segments,
      arcs: [],
      dimensions,
      bounds,
    };
  },
};
