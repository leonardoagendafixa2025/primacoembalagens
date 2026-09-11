import type { PackagingModel, DielineResult, Segment2D, DimensionLine, BoundingBox2D } from '../types';

export const fefco0203: PackagingModel = {
  id: 'fefco_0203',
  code: 'FEFCO 0203',
  name: 'Caixa Maleta com Abas 100% Sobrepostas (FOS)',
  category: 'FEFCO',
  description: 'Caixa com abas externas que cobrem completamente a largura da caixa (Full Overlap). Oferece máxima proteção e resistência para produtos pesados.',
  defaultParams: {
    L: 350,
    B: 250,
    H: 200,
    Ep: 3.5,
    M: 35,
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1200, step: 5, unit: 'mm', description: 'Comprimento interno' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Largura interna' },
    { key: 'H', label: 'Altura (H)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Altura interna' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 1.0, max: 10, step: 0.5, unit: 'mm', description: 'Espessura do papelão' },
    { key: 'M', label: 'Aba de Cola (M)', min: 25, max: 60, step: 1, unit: 'mm', description: 'Aba de colagem' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 350;
    const B = params.B || 250;
    const H = params.H || 200;
    const Ep = params.Ep || 3.5;
    const M = params.M || 35;

    const L1 = L + Ep;
    const B1 = B + Ep;
    const L2 = L + Ep;
    const B2 = B + Ep;
    const flapH = B; // 100% Sobreposta (Full Overlap)

    const segments: Segment2D[] = [];

    const x0 = 0;
    const x1 = M;
    const x2 = x1 + L1;
    const x3 = x2 + B1;
    const x4 = x3 + L2;
    const x5 = x4 + B2;

    const yBotFlap = 0;
    const yBotCrease = flapH;
    const yTopCrease = flapH + H;
    const yTopFlap = flapH + H + flapH;

    segments.push({ x0: x1, y0: yTopFlap, x1: x5, y1: yTopFlap, type: 'cut' });
    segments.push({ x0: x1, y0: yBotFlap, x1: x5, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x5, y0: yBotFlap, x1: x5, y1: yTopFlap, type: 'cut' });

    const chamfer = 10;
    segments.push({ x0: x1, y0: yTopCrease + chamfer, x1: x0, y1: yTopCrease, type: 'cut' });
    segments.push({ x0: x0, y0: yTopCrease, x1: x0, y1: yBotCrease, type: 'cut' });
    segments.push({ x0: x0, y0: yBotCrease, x1: x1, y1: yBotCrease - chamfer, type: 'cut' });
    segments.push({ x0: x1, y0: yBotCrease - chamfer, x1: x1, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x1, y0: yTopCrease + chamfer, x1: x1, y1: yTopFlap, type: 'cut' });

    [x2, x3, x4].forEach((x) => {
      segments.push({ x0: x, y0: yTopCrease, x1: x, y1: yTopFlap, type: 'cut' });
      segments.push({ x0: x, y0: yBotFlap, x1: x, y1: yBotCrease, type: 'cut' });
    });

    segments.push({ x0: x1, y0: yBotCrease, x1: x5, y1: yBotCrease, type: 'crease' });
    segments.push({ x0: x1, y0: yTopCrease, x1: x5, y1: yTopCrease, type: 'crease' });

    segments.push({ x0: x1, y0: yBotCrease, x1: x1, y1: yTopCrease, type: 'crease' });
    [x2, x3, x4].forEach((x) => {
      segments.push({ x0: x, y0: yBotCrease, x1: x, y1: yTopCrease, type: 'crease' });
    });

    const dimensions: DimensionLine[] = [
      { x0: x1, y0: yTopFlap, x1: x2, y1: yTopFlap, text: `L = ${L} mm`, offset: 20 },
      { x0: x2, y0: yTopFlap, x1: x3, y1: yTopFlap, text: `B = ${B} mm`, offset: 20 },
      { x0: x5, y0: yBotCrease, x1: x5, y1: yTopCrease, text: `H = ${H} mm`, offset: 25, isVertical: true },
      { x0: x5, y0: yTopCrease, x1: x5, y1: yTopFlap, text: `Abas FOS = ${flapH} mm`, offset: 25, isVertical: true },
    ];

    const bounds: BoundingBox2D = {
      minX: 0,
      minY: 0,
      maxX: x5,
      maxY: yTopFlap,
      width: x5,
      height: yTopFlap,
    };

    return {
      segments,
      arcs: [],
      dimensions,
      bounds,
    };
  },
};
