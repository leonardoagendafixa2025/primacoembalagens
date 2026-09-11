import type { PackagingModel, DielineResult, Segment2D, DimensionLine, BoundingBox2D } from '../types';

export const fefco0201: PackagingModel = {
  id: 'fefco_0201',
  code: 'FEFCO 0201',
  name: 'Caixa Maleta Padrão (RSC)',
  category: 'FEFCO',
  description: 'Caixa de papelão padrão mais utilizada no mundo. Possui abas superiores e inferiores que se encontram no centro.',
  defaultParams: {
    L: 300, // Comprimento interior (mm)
    B: 200, // Largura interior (mm)
    H: 150, // Altura interior (mm)
    Ep: 3.0, // Espessura do papelão (mm)
    M: 35,  // Aba de cola (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1200, step: 5, unit: 'mm', description: 'Comprimento interno da caixa' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Largura interna da caixa' },
    { key: 'H', label: 'Altura (H)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Altura interna da caixa' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 10, step: 0.5, unit: 'mm', description: 'Espessura do papelão (caliper)' },
    { key: 'M', label: 'Aba de Cola (M)', min: 20, max: 60, step: 1, unit: 'mm', description: 'Largura da aba lateral de colagem' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 150;
    const Ep = params.Ep || 3;
    const M = params.M || 35;

    // Compensações de vinco conforme padrão FEFCO
    // Painéis: Cola(M), L1, B1, L2, B2
    const L1 = L + Ep;
    const B1 = B + Ep;
    const L2 = L + Ep;
    const B2 = B + Ep;
    const flapH = (B / 2) + (Ep / 2); // Altura das abas sup/inf

    const segments: Segment2D[] = [];

    // Coordenadas X das dobras verticais
    const x0 = 0;           // Início da aba de cola
    const x1 = M;           // Vinco da aba de cola -> Painel 1 (L1)
    const x2 = x1 + L1;     // Vinco Painel 1 -> Painel 2 (B1)
    const x3 = x2 + B1;     // Vinco Painel 2 -> Painel 3 (L2)
    const x4 = x3 + L2;     // Vinco Painel 3 -> Painel 4 (B2)
    const x5 = x4 + B2;     // Fim do Painel 4 (Corte externo direito)

    // Coordenadas Y
    const yBotFlap = 0;              // Base das abas inferiores
    const yBotCrease = flapH;        // Vinco horizontal inferior
    const yTopCrease = flapH + H;    // Vinco horizontal superior
    const yTopFlap = flapH + H + flapH; // Topo das abas superiores

    // 1. LINHAS DE CORTE EXTERNO (Perímetro)
    // Topo geral
    segments.push({ x0: x1, y0: yTopFlap, x1: x5, y1: yTopFlap, type: 'cut' });
    // Base geral
    segments.push({ x0: x1, y0: yBotFlap, x1: x5, y1: yBotFlap, type: 'cut' });
    // Lateral direita
    segments.push({ x0: x5, y0: yBotFlap, x1: x5, y1: yTopFlap, type: 'cut' });

    // Aba de cola (com chanfros para não colidir nas dobras)
    const chamfer = 10;
    segments.push({ x0: x1, y0: yTopCrease + chamfer, x1: x0, y1: yTopCrease, type: 'cut' });
    segments.push({ x0: x0, y0: yTopCrease, x1: x0, y1: yBotCrease, type: 'cut' });
    segments.push({ x0: x0, y0: yBotCrease, x1: x1, y1: yBotCrease - chamfer, type: 'cut' });
    segments.push({ x0: x1, y0: yBotCrease - chamfer, x1: x1, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x1, y0: yTopCrease + chamfer, x1: x1, y1: yTopFlap, type: 'cut' });

    // 2. RASGOS ENTRE ABAS (Slots de corte verticais nas abas)
    const slotPoints = [x2, x3, x4];
    slotPoints.forEach((x) => {
      // Slot superior
      segments.push({ x0: x, y0: yTopCrease, x1: x, y1: yTopFlap, type: 'cut' });
      // Slot inferior
      segments.push({ x0: x, y0: yBotFlap, x1: x, y1: yBotCrease, type: 'cut' });
    });

    // 3. VINCOS HORIZONTAIS
    // Vinco inferior (atravessa todos os painéis)
    segments.push({ x0: x1, y0: yBotCrease, x1: x5, y1: yBotCrease, type: 'crease' });
    // Vinco superior (atravessa todos os painéis)
    segments.push({ x0: x1, y0: yTopCrease, x1: x5, y1: yTopCrease, type: 'crease' });

    // 4. VINCOS VERTICAIS (Dobras entre painéis e aba de cola)
    // Vinco da aba de cola (apenas no corpo)
    segments.push({ x0: x1, y0: yBotCrease, x1: x1, y1: yTopCrease, type: 'crease' });
    // Vincos entre painéis principais
    slotPoints.forEach((x) => {
      segments.push({ x0: x, y0: yBotCrease, x1: x, y1: yTopCrease, type: 'crease' });
    });

    // 5. COTAS DE MEDIDA (Dimensões Técnicas)
    const dimensions: DimensionLine[] = [
      { x0: x1, y0: yTopFlap, x1: x2, y1: yTopFlap, text: `L = ${L} mm`, offset: 20 },
      { x0: x2, y0: yTopFlap, x1: x3, y1: yTopFlap, text: `B = ${B} mm`, offset: 20 },
      { x0: x3, y0: yTopFlap, x1: x4, y1: yTopFlap, text: `L = ${L} mm`, offset: 20 },
      { x0: x4, y0: yTopFlap, x1: x5, y1: yTopFlap, text: `B = ${B} mm`, offset: 20 },
      { x0: x0, y0: yBotCrease, x1: x1, y1: yBotCrease, text: `Cola = ${M} mm`, offset: -25 },
      { x0: x5, y0: yBotCrease, x1: x5, y1: yTopCrease, text: `H = ${H} mm`, offset: 25, isVertical: true },
      { x0: x5, y0: yTopCrease, x1: x5, y1: yTopFlap, text: `Abas = ${Math.round(flapH)} mm`, offset: 25, isVertical: true },
    ];

    const totalWidth = x5;
    const totalHeight = yTopFlap;

    const bounds: BoundingBox2D = {
      minX: 0,
      minY: 0,
      maxX: totalWidth,
      maxY: totalHeight,
      width: totalWidth,
      height: totalHeight,
    };

    return {
      segments,
      arcs: [],
      dimensions,
      bounds,
    };
  },
};
