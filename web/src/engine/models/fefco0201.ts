import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

export const fefco0201: PackagingModel = {
  id: 'fefco_0201',
  code: 'FEFCO 0201',
  name: 'Caixa Maleta Americana Padrão (RSC)',
  category: 'FEFCO',
  description:
    'Modelo clássico internacional FEFCO 0201 / RSC com 4 abas superiores e inferiores que se encontram no centro, com compensações de vinco e ranhuras de corte fiéis ao PLMPackLib C#.',
  defaultParams: {
    L: 300, // Comprimento interior (mm)
    B: 200, // Largura interior (mm)
    H: 150, // Altura interior (mm)
    Ep: 3.0, // Espessura do papelão (mm)
    M: 35,  // Aba de cola (mm)
    Ec: 6.0, // Largura da ranhura/faca (mm)
    Cut: 1,  // 0 = Slotter (cantos vivos), 1 = DieCut (cantos arredondados)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1500, step: 5, unit: 'mm', description: 'Comprimento interno da caixa' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 1000, step: 5, unit: 'mm', description: 'Largura interna da caixa' },
    { key: 'H', label: 'Altura (H)', min: 60, max: 1000, step: 5, unit: 'mm', description: 'Altura interna da caixa' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 12, step: 0.5, unit: 'mm', description: 'Espessura do papelão ondulado' },
    { key: 'M', label: 'Aba de Cola (M)', min: 20, max: 60, step: 1, unit: 'mm', description: 'Largura da aba lateral de colagem' },
    { key: 'Ec', label: 'Ranhura (Ec)', min: 4, max: 12, step: 1, unit: 'mm', description: 'Largura da ranhura entre abas' },
    { key: 'Cut', label: 'Corte (0=Slotter, 1=DieCut)', min: 0, max: 1, step: 1, unit: '', description: '0 para Slotter convencional, 1 para Faca Rotativa com raio' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 150;
    const e = params.Ep || 3;
    const G = params.M || 35;
    const Ec = params.Ec || 6;
    const isDieCut = (params.Cut ?? 1) === 1;

    // Fórmulas originais C# do PLMPackLib (fefco_0201_source.cs & half_0200_source.cs)
    // Majorations por espessura (pp_or_th == 1):
    // L1 = L + e - 1, B1 = B + e, L2 = L + e, B2 = B + e
    const L1 = L + e - 1;
    const B1 = B + e;
    const L2 = L + e;
    const B2 = B + e;
    const H1 = H + 2 * e;

    // Altura das abas: no original C# Math.floor((B + e) / 2)
    const FL = Math.floor((B + e) / 2);
    const FB = Math.floor((B + e) / 2);

    // Ranhuras (Notch control)
    const EcR = isDieCut ? Ec / 2 : 0;
    const EcL = Ec / 2;
    const EcB = Ec / 2;
    const EcH = isDieCut ? 2.0 : 0.0; // Recuo da ranhura sobre o vinco

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    // Coordenadas das divisões horizontais de vinco (Y)
    // Base da aba inferior: y = 0
    // Vinco inferior: y = FB
    // Vinco superior: y = FB + H1
    // Topo da aba superior: y = FB + H1 + FL
    const yBotFlap = 0;
    const yBotCrease = FB;
    const yTopCrease = FB + H1;
    const yTopFlap = FB + H1 + FL;

    // Coordenadas verticais dos painéis (X):
    // Aba de Cola: [0, G]
    // Painel 1 (L1): [G, G + L1]
    // Painel 2 (B1): [G + L1, G + L1 + B1]
    // Painel 3 (L2): [G + L1 + B1, G + L1 + B1 + L2]
    // Painel 4 (B2): [G + L1 + B1 + L2, G + L1 + B1 + L2 + B2]
    const x0 = 0;
    const xG = G;
    const x1 = xG + L1;
    const x2 = x1 + B1;
    const x3 = x2 + L2;
    const x4 = x3 + B2;

    // 1. VINCOS PRINCIPAIS
    // Vincos horizontais de corpo (atravessam os 4 painéis de xG a x4)
    segments.push({ x0: xG, y0: yBotCrease, x1: x4, y1: yBotCrease, type: 'crease' });
    segments.push({ x0: xG, y0: yTopCrease, x1: x4, y1: yTopCrease, type: 'crease' });

    // Vinco vertical da aba de cola
    segments.push({ x0: xG, y0: yBotCrease, x1: xG, y1: yTopCrease, type: 'crease' });

    // Vincos verticais entre os painéis (entre os vincos horizontais)
    segments.push({ x0: x1, y0: yBotCrease, x1: x1, y1: yTopCrease, type: 'crease' });
    segments.push({ x0: x2, y0: yBotCrease, x1: x2, y1: yTopCrease, type: 'crease' });
    segments.push({ x0: x3, y0: yBotCrease, x1: x3, y1: yTopCrease, type: 'crease' });

    // 2. ABA DE COLA (GLUE FLAP) COM CHANFROS DE 15°
    const chamferH = Math.min(15, (H1 * 0.15));
    // Lateral externa da aba de cola
    segments.push({ x0: x0, y0: yBotCrease + chamferH, x1: x0, y1: yTopCrease - chamferH, type: 'cut' });
    // Chanfro superior da aba de cola
    segments.push({ x0: x0, y0: yTopCrease - chamferH, x1: xG, y1: yTopCrease, type: 'cut' });
    // Chanfro inferior da aba de cola
    segments.push({ x0: x0, y0: yBotCrease + chamferH, x1: xG, y1: yBotCrease, type: 'cut' });
    // Recortes nas extremidades da aba de cola
    segments.push({ x0: xG, y0: yTopCrease, x1: xG, y1: yTopFlap, type: 'cut' });
    segments.push({ x0: xG, y0: yBotFlap, x1: xG, y1: yBotCrease, type: 'cut' });

    // 3. LATERAL EXTERNA DIREITA DO PAINEL 4 (B2)
    segments.push({ x0: x4, y0: yBotFlap, x1: x4, y1: yTopFlap, type: 'cut' });

    // 4. BORDAS HORIZONTAIS EXTERNAS DAS ABAS
    // Aba Superior Painel 1
    segments.push({ x0: xG, y0: yTopFlap, x1: x1 - EcL, y1: yTopFlap, type: 'cut' });
    // Aba Superior Painel 2
    segments.push({ x0: x1 + EcB, y0: yTopFlap, x1: x2 - EcL, y1: yTopFlap, type: 'cut' });
    // Aba Superior Painel 3
    segments.push({ x0: x2 + EcB, y0: yTopFlap, x1: x3 - EcL, y1: yTopFlap, type: 'cut' });
    // Aba Superior Painel 4
    segments.push({ x0: x3 + EcB, y0: yTopFlap, x1: x4, y1: yTopFlap, type: 'cut' });

    // Aba Inferior Painel 1
    segments.push({ x0: xG, y0: yBotFlap, x1: x1 - EcL, y1: yBotFlap, type: 'cut' });
    // Aba Inferior Painel 2
    segments.push({ x0: x1 + EcB, y0: yBotFlap, x1: x2 - EcL, y1: yBotFlap, type: 'cut' });
    // Aba Inferior Painel 3
    segments.push({ x0: x2 + EcB, y0: yBotFlap, x1: x3 - EcL, y1: yBotFlap, type: 'cut' });
    // Aba Inferior Painel 4
    segments.push({ x0: x3 + EcB, y0: yBotFlap, x1: x4, y1: yBotFlap, type: 'cut' });

    // 5. RANHURAS (SLOTS / NOTCHES) ENTRE ABAS SUPERIORES E INFERIORES
    const notchPositions = [x1, x2, x3];

    for (const xNotch of notchPositions) {
      const leftX = xNotch - EcL;
      const rightX = xNotch + EcB;

      // --- RANHURAS SUPERIORES ---
      if (EcR > 0) {
        const yBaseNotch = yTopCrease + EcH;
        segments.push({ x0: leftX, y0: yTopFlap, x1: leftX, y1: yBaseNotch + EcR, type: 'cut' });
        segments.push({ x0: rightX, y0: yTopFlap, x1: rightX, y1: yBaseNotch + EcR, type: 'cut' });
        if (rightX - EcR > leftX + EcR) {
          segments.push({ x0: leftX + EcR, y0: yBaseNotch, x1: rightX - EcR, y1: yBaseNotch, type: 'cut' });
        }

        // Arcos de concordância
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
        // Slotter reto convencional
        const yBaseNotch = yTopCrease + EcH;
        segments.push({ x0: leftX, y0: yTopFlap, x1: leftX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: rightX, y0: yTopFlap, x1: rightX, y1: yBaseNotch, type: 'cut' });
        segments.push({ x0: leftX, y0: yBaseNotch, x1: rightX, y1: yBaseNotch, type: 'cut' });
      }

      // --- RANHURAS INFERIORES ---
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

    // 6. COTAS TÉCNICAS
    const dimensions: DimensionLine[] = [
      { x0: xG, y0: yTopFlap, x1: x1, y1: yTopFlap, text: `L1 = ${Math.round(L1)} mm`, offset: 25 },
      { x0: x1, y0: yTopFlap, x1: x2, y1: yTopFlap, text: `B1 = ${Math.round(B1)} mm`, offset: 25 },
      { x0: x2, y0: yTopFlap, x1: x3, y1: yTopFlap, text: `L2 = ${Math.round(L2)} mm`, offset: 25 },
      { x0: x3, y0: yTopFlap, x1: x4, y1: yTopFlap, text: `B2 = ${Math.round(B2)} mm`, offset: 25 },
      { x0: x0, y0: yBotCrease, x1: xG, y1: yBotCrease, text: `Cola = ${G} mm`, offset: -25 },
      { x0: x4, y0: yBotCrease, x1: x4, y1: yTopCrease, text: `H = ${H} mm`, offset: 30, isVertical: true },
      { x0: x4, y0: yTopCrease, x1: x4, y1: yTopFlap, text: `Abas = ${FL} mm`, offset: 30, isVertical: true },
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
