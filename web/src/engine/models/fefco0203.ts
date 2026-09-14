import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

export const fefco0203: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'fefco0203',
  id: 'fefco_0203',
  code: 'FEFCO 0203',
  name: 'Caixa Maleta Abas 100% Sobrepostas (FOL)',
  category: 'FEFCO',
  description:
    'Caixa com abas externas que cobrem completamente a largura da caixa (Full Overlap). Oferece máxima resistência contra perfuração e compressão no empilhamento.',
  defaultParams: {
    L: 350,
    B: 250,
    H: 200,
    Ep: 3.5,
    M: 35,
    Ec: 6.0,
    Cut: 1,
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1500, step: 5, unit: 'mm', description: 'Comprimento interno' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 1000, step: 5, unit: 'mm', description: 'Largura interna' },
    { key: 'H', label: 'Altura (H)', min: 80, max: 1000, step: 5, unit: 'mm', description: 'Altura interna' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 1.0, max: 12, step: 0.5, unit: 'mm', description: 'Espessura do papelão' },
    { key: 'M', label: 'Aba de Cola (M)', min: 25, max: 60, step: 1, unit: 'mm', description: 'Aba de colagem' },
    { key: 'Ec', label: 'Ranhura (Ec)', min: 4, max: 12, step: 1, unit: 'mm', description: 'Largura da ranhura' },
    { key: 'Cut', label: 'Corte (0=Slotter, 1=DieCut)', min: 0, max: 1, step: 1, unit: '', description: '0 para Slotter, 1 para DieCut com raio' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 350;
    const B = params.B || 250;
    const H = params.H || 200;
    const e = params.Ep || 3.5;
    const G = params.M || 35;
    const Ec = params.Ec || 6;
    const isDieCut = (params.Cut ?? 1) === 1;

    const L1 = L + e - 1;
    const B1 = B + e;
    const L2 = L + e;
    const B2 = B + e;
    const H1 = H + 2 * e;
    // No FEFCO 0203 (Full Overlap), a altura das abas cobre toda a largura B
    const FL = B + e;
    const FB = B + e;

    const EcR = isDieCut ? Ec / 2 : 0;
    const EcL = Ec / 2;
    const EcB = Ec / 2;
    const EcH = isDieCut ? 2.0 : 0.0;

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    const yBotFlap = 0;
    const yBotCrease = FB;
    const yTopCrease = FB + H1;
    const yTopFlap = FB + H1 + FL;

    const x0 = 0;
    const xG = G;
    const x1 = xG + L1;
    const x2 = x1 + B1;
    const x3 = x2 + L2;
    const x4 = x3 + B2;

    // 1. Vincos principais
    segments.push({ x0: xG, y0: yBotCrease, x1: x4, y1: yBotCrease, type: 'crease' });
    segments.push({ x0: xG, y0: yTopCrease, x1: x4, y1: yTopCrease, type: 'crease' });
    segments.push({ x0: xG, y0: yBotCrease, x1: xG, y1: yTopCrease, type: 'crease' });
    segments.push({ x0: x1, y0: yBotCrease, x1: x1, y1: yTopCrease, type: 'crease' });
    segments.push({ x0: x2, y0: yBotCrease, x1: x2, y1: yTopCrease, type: 'crease' });
    segments.push({ x0: x3, y0: yBotCrease, x1: x3, y1: yTopCrease, type: 'crease' });

    // 2. Aba de cola com chanfros
    const chamferH = Math.min(15, H1 * 0.15);
    segments.push({ x0: x0, y0: yBotCrease + chamferH, x1: x0, y1: yTopCrease - chamferH, type: 'cut' });
    segments.push({ x0: x0, y0: yTopCrease - chamferH, x1: xG, y1: yTopCrease, type: 'cut' });
    segments.push({ x0: x0, y0: yBotCrease + chamferH, x1: xG, y1: yBotCrease, type: 'cut' });
    segments.push({ x0: xG, y0: yTopCrease, x1: xG, y1: yTopFlap, type: 'cut' });
    segments.push({ x0: xG, y0: yBotFlap, x1: xG, y1: yBotCrease, type: 'cut' });

    // 3. Lateral direita
    segments.push({ x0: x4, y0: yBotFlap, x1: x4, y1: yTopFlap, type: 'cut' });

    // 4. Bordas horizontais externas
    segments.push({ x0: xG, y0: yTopFlap, x1: x1 - EcL, y1: yTopFlap, type: 'cut' });
    segments.push({ x0: x1 + EcB, y0: yTopFlap, x1: x2 - EcL, y1: yTopFlap, type: 'cut' });
    segments.push({ x0: x2 + EcB, y0: yTopFlap, x1: x3 - EcL, y1: yTopFlap, type: 'cut' });
    segments.push({ x0: x3 + EcB, y0: yTopFlap, x1: x4, y1: yTopFlap, type: 'cut' });

    segments.push({ x0: xG, y0: yBotFlap, x1: x1 - EcL, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x1 + EcB, y0: yBotFlap, x1: x2 - EcL, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x2 + EcB, y0: yBotFlap, x1: x3 - EcL, y1: yBotFlap, type: 'cut' });
    segments.push({ x0: x3 + EcB, y0: yBotFlap, x1: x4, y1: yBotFlap, type: 'cut' });

    // 5. Ranhuras entre abas
    for (const xNotch of [x1, x2, x3]) {
      const leftX = xNotch - EcL;
      const rightX = xNotch + EcB;

      // Superiores
      if (EcR > 0) {
        const yBaseNotch = yTopCrease + EcH;
        segments.push({ x0: leftX, y0: yTopFlap, x1: leftX, y1: yBaseNotch + EcR, type: 'cut' });
        segments.push({ x0: rightX, y0: yTopFlap, x1: rightX, y1: yBaseNotch + EcR, type: 'cut' });
        if (rightX - EcR > leftX + EcR) {
          segments.push({ x0: leftX + EcR, y0: yBaseNotch, x1: rightX - EcR, y1: yBaseNotch, type: 'cut' });
        }

        arcs.push({
          cx: leftX + EcR,
          cy: yBaseNotch + EcR,
          r: EcR,
          startAngle: 180,
          endAngle: 270,
          type: 'cut',
        });
        arcs.push({
          cx: rightX - EcR,
          cy: yBaseNotch + EcR,
          r: EcR,
          startAngle: 270,
          endAngle: 360,
          type: 'cut',
        });
      } else {
        const yBaseNotch = yTopCrease + EcH;
        segments.push({ x0: leftX, y0: yTopFlap, x1: leftX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: rightX, y0: yTopFlap, x1: rightX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: leftX, y0: yBaseNotch, x1: rightX, y1: yBaseNotch, type: 'cut' });
      }

      // Inferiores
      if (EcR > 0) {
        const yBaseNotch = yBotCrease - EcH;
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
        const yBaseNotch = yBotCrease - EcH;
        segments.push({ x0: leftX, y0: yBotFlap, x1: leftX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: rightX, y0: yBotFlap, x1: rightX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: leftX, y0: yBaseNotch, x1: rightX, y1: yBaseNotch, type: 'cut' });
      }
    }

    const dimensions: DimensionLine[] = [
      { x0: xG, y0: yTopFlap, x1: x1, y1: yTopFlap, text: `L = ${L} mm`, offset: 25 },
      { x0: x1, y0: yTopFlap, x1: x2, y1: yTopFlap, text: `B = ${B} mm`, offset: 25 },
      { x0: x4, y0: yBotCrease, x1: x4, y1: yTopCrease, text: `H = ${H} mm`, offset: 30, isVertical: true },
      { x0: x4, y0: yTopCrease, x1: x4, y1: yTopFlap, text: `Abas FOL = ${FL} mm`, offset: 30, isVertical: true },
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
