import type { PackagingModel, DielineResult, Segment2D, DimensionLine, BoundingBox2D } from '../types';

export const fefco0200: PackagingModel = {
  id: 'fefco_0200',
  code: 'FEFCO 0200',
  name: 'Caixa Meia Maleta (Sem Tampa / Gaveta)',
  category: 'FEFCO',
  description: 'Caixa sem abas superiores. Ideal para uso com tampa avulsa (estilo caixa de sapatos), display de chão ou gaveta de armazenamento.',
  defaultParams: {
    L: 300,
    B: 200,
    H: 150,
    Ep: 3.0,
    M: 35,
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1200, step: 5, unit: 'mm', description: 'Comprimento interno' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Largura interna' },
    { key: 'H', label: 'Altura (H)', min: 60, max: 800, step: 5, unit: 'mm', description: 'Altura interna' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 10, step: 0.5, unit: 'mm', description: 'Espessura da chapa' },
    { key: 'M', label: 'Aba de Cola (M)', min: 20, max: 60, step: 1, unit: 'mm', description: 'Largura da aba de cola' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 150;
    const Ep = params.Ep || 3;
    const M = params.M || 35;

    const L1 = L + Ep;
    const B1 = B + Ep;
    const L2 = L + Ep;
    const B2 = B + Ep;
    const flapH = (B / 2) + (Ep / 2);

    const segments: Segment2D[] = [];

    const x0 = 0;
    const x1 = M;
    const x2 = x1 + L1;
    const x3 = x2 + B1;
    const x4 = x3 + L2;
    const x5 = x4 + B2;

    const yBotFlap = 0;
    const yBotCrease = flapH;
    const yTopEdge = flapH + H; // Borda superior aberta (corte)

    // Borda superior aberta de corte
    segments.push({ x0: x1, y0: yTopEdge, x1: x5, y1: yTopEdge, type: 'cut' });
    // Fundo inferior
    segments.push({ x0: x1, y0: yBotFlap, x1: x5, y1: yBotFlap, type: 'cut' });
    // Lateral direita
    segments.push({ x0: x5, y0: yBotFlap, x1: x5, y1: yTopEdge, type: 'cut' });

    // Aba de cola
    const chamfer = 10;
    segments.push({ x0: x1, y0: yTopEdge, x1: x0, y1: yTopEdge - chamfer, type: 'cut' });
    segments.push({ x0: x0, y0: yTopEdge - chamfer, x1: x0, y1: yBotCrease, type: 'cut' });
    segments.push({ x0: x0, y0: yBotCrease, x1: x1, y1: yBotCrease - chamfer, type: 'cut' });
    segments.push({ x0: x1, y0: yBotCrease - chamfer, x1: x1, y1: yBotFlap, type: 'cut' });

    // Slots inferiores
    [x2, x3, x4].forEach((x) => {
      segments.push({ x0: x, y0: yBotFlap, x1: x, y1: yBotCrease, type: 'cut' });
    });

    // Vinco horizontal do fundo
    segments.push({ x0: x1, y0: yBotCrease, x1: x5, y1: yBotCrease, type: 'crease' });

    // Vincos verticais do corpo
    segments.push({ x0: x1, y0: yBotCrease, x1: x1, y1: yTopEdge, type: 'crease' });
    [x2, x3, x4].forEach((x) => {
      segments.push({ x0: x, y0: yBotCrease, x1: x, y1: yTopEdge, type: 'crease' });
    });

    const dimensions: DimensionLine[] = [
      { x0: x1, y0: yTopEdge, x1: x2, y1: yTopEdge, text: `L = ${L} mm`, offset: 20 },
      { x0: x2, y0: yTopEdge, x1: x3, y1: yTopEdge, text: `B = ${B} mm`, offset: 20 },
      { x0: x3, y0: yTopEdge, x1: x4, y1: yTopEdge, text: `L = ${L} mm`, offset: 20 },
      { x0: x4, y0: yTopEdge, x1: x5, y1: yTopEdge, text: `B = ${B} mm`, offset: 20 },
      { x0: x5, y0: yBotCrease, x1: x5, y1: yTopEdge, text: `H = ${H} mm`, offset: 25, isVertical: true },
    ];

    const bounds: BoundingBox2D = {
      minX: 0,
      minY: 0,
      maxX: x5,
      maxY: yTopEdge,
      width: x5,
      height: yTopEdge,
    };

    return {
      segments,
      arcs: [],
      dimensions,
      bounds,
    };
  },
};
