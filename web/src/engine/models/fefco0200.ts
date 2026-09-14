import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

export const fefco0200: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'fefco0200',
  id: 'fefco_0200',
  code: 'FEFCO 0200',
  name: 'Caixa Meia Maleta (Sem Abas Superiores)',
  category: 'FEFCO',
  description:
    'Caixa aberta no topo sem abas superiores. Utilizada com tampa avulsa telescópica (estilo caixa de calçado) ou como bandeja/display comercial.',
  defaultParams: {
    L: 300,
    B: 200,
    H: 150,
    Ep: 3.0,
    M: 35,
    Ec: 6.0,
    Cut: 1,
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1500, step: 5, unit: 'mm', description: 'Comprimento interno' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 1000, step: 5, unit: 'mm', description: 'Largura interna' },
    { key: 'H', label: 'Altura (H)', min: 50, max: 1000, step: 5, unit: 'mm', description: 'Altura interna' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 12, step: 0.5, unit: 'mm', description: 'Espessura da chapa' },
    { key: 'M', label: 'Aba de Cola (M)', min: 20, max: 60, step: 1, unit: 'mm', description: 'Largura da aba de cola' },
    { key: 'Ec', label: 'Ranhura (Ec)', min: 4, max: 12, step: 1, unit: 'mm', description: 'Largura da faca de ranhura' },
    { key: 'Cut', label: 'Corte (0=Slotter, 1=DieCut)', min: 0, max: 1, step: 1, unit: '', description: '0 para Slotter, 1 para DieCut com raio' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 150;
    const e = params.Ep || 3;
    const G = params.M || 35;
    const Ec = params.Ec || 6;
    const isDieCut = (params.Cut ?? 1) === 1;

    // Fórmulas C# PLMPackLib
    const L1 = L + e - 1;
    const B1 = B + e;
    const L2 = L + e;
    const B2 = B + e;
    const H1 = H + e;
    const FB = Math.floor((B + e) / 2);

    const EcR = isDieCut ? Ec / 2 : 0;
    const EcL = Ec / 2;
    const EcB = Ec / 2;
    const EcH = isDieCut ? 2.0 : 0.0;

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    const yBotFlap = 0;
    const yBotCrease = FB;
    const yTopEdge = FB + H1;

    const x0 = 0;
    const xG = G;
    const x1 = xG + L1;
    const x2 = x1 + B1;
    const x3 = x2 + L2;
    const x4 = x3 + B2;

    // 1. Vincos
    segments.push({ x0: xG, y0: yBotCrease, x1: x4, y1: yBotCrease, type: 'crease' });
    segments.push({ x0: xG, y0: yBotCrease, x1: xG, y1: yTopEdge, type: 'crease' });
    segments.push({ x0: x1, y0: yBotCrease, x1: x1, y1: yTopEdge, type: 'crease' });
    segments.push({ x0: x2, y0: yBotCrease, x1: x2, y1: yTopEdge, type: 'crease' });
    segments.push({ x0: x3, y0: yBotCrease, x1: x3, y1: yTopEdge, type: 'crease' });

    // 2. Borda superior aberta (corte de boca)
    segments.push({ x0: xG, y0: yTopEdge, x1: x4, y1: yTopEdge, type: 'cut' });

    // 3. Aba de cola com chanfros
    const chamferH = Math.min(15, H1 * 0.15);
    segments.push({ x0: x0, y0: yBotCrease + chamferH, x1: x0, y1: yTopEdge - chamferH, type: 'cut' });
    segments.push({ x0: x0, y0: yTopEdge - chamferH, x1: xG, y1: yTopEdge, type: 'cut' });
    segments.push({ x0: x0, y0: yBotCrease + chamferH, x1: xG, y1: yBotCrease, type: 'cut' });
    segments.push({ x0: xG, y0: yBotFlap, x1: xG, y1: yBotCrease, type: 'cut' });

    // 4. Lateral direita
    segments.push({ x0: x4, y0: yBotFlap, x1: x4, y1: yTopEdge, type: 'cut' });

    // 5. Borda inferior das abas
    segments.push({ x0: xG, y0: yBotFlap, x1: x1 - EcL, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x1 + EcB, y0: yBotFlap, x1: x2 - EcL, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x2 + EcB, y0: yBotFlap, x1: x3 - EcL, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x3 + EcB, y0: yBotFlap, x1: x4, y1: yBotFlap, type: 'cut' });

    // 6. Ranhuras inferiores
    for (const xNotch of [x1, x2, x3]) {
      const leftX = xNotch - EcL;
      const rightX = xNotch + EcB;
      const yBaseNotch = yBotCrease - EcH;
      if (EcR > 0) {
        segments.push({ x0: leftX, y0: yBotFlap, x1: leftX, y1: yBaseNotch - EcR, type: 'cut' });
        segments.push({ x0: rightX, y0: yBotFlap, x1: rightX, y1: yBaseNotch - EcR, type: 'cut' });
        if (rightX - EcR > leftX + EcR) {
          segments.push({ x0: leftX + EcR, y0: yBaseNotch, x1: rightX - EcR, y1: yBaseNotch, type: 'cut' });
        }

        arcs.push({
          cx: leftX + EcR,
          cy: yBaseNotch - EcR,
          r: EcR,
          startAngle: 90,
          endAngle: 180,
          type: 'cut',
        });
        arcs.push({
          cx: rightX - EcR,
          cy: yBaseNotch - EcR,
          r: EcR,
          startAngle: 0,
          endAngle: 90,
          type: 'cut',
        });
      } else {
        segments.push({ x0: leftX, y0: yBotFlap, x1: leftX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: rightX, y0: yBotFlap, x1: rightX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: leftX, y0: yBaseNotch, x1: rightX, y1: yBaseNotch, type: 'cut' });
      }
    }

    const dimensions: DimensionLine[] = [
      { x0: xG, y0: yTopEdge, x1: x1, y1: yTopEdge, text: `L1 = ${Math.round(L1)} mm`, offset: 20 },
      { x0: x1, y0: yTopEdge, x1: x2, y1: yTopEdge, text: `B1 = ${Math.round(B1)} mm`, offset: 20 },
      { x0: x2, y0: yTopEdge, x1: x3, y1: yTopEdge, text: `L2 = ${Math.round(L2)} mm`, offset: 20 },
      { x0: x3, y0: yTopEdge, x1: x4, y1: yTopEdge, text: `B2 = ${Math.round(B2)} mm`, offset: 20 },
      { x0: x4, y0: yBotCrease, x1: x4, y1: yTopEdge, text: `H = ${H} mm`, offset: 25, isVertical: true },
    ];

    const bounds = computeBoundingBox({ segments, arcs });

    return {
      segments,
      arcs,
      dimensions,
      bounds,
    };
  },
};
