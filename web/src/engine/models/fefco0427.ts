import type { PackagingModel, DielineResult, Segment2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

export const fefco0427: PackagingModel = {
  id: 'fefco_0427',
  code: 'FEFCO 0427',
  name: 'Caixa E-Commerce / Envio com Abas Travantes',
  category: 'FEFCO',
  description:
    'Modelo predileto do e-commerce global. Não requer fita adesiva para montagem: possui tampa articulada, paredes duplas laterais reforçadas e orelhas de travamento com compensação de espessura.',
  defaultParams: {
    L: 260, // Comprimento interior (mm)
    B: 180, // Largura interior (mm)
    H: 80,  // Altura interior (mm)
    Ep: 2.0, // Espessura do papelão (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 800, step: 5, unit: 'mm', description: 'Comprimento da base interna' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 600, step: 5, unit: 'mm', description: 'Largura da base interna' },
    { key: 'H', label: 'Altura (H)', min: 30, max: 300, step: 5, unit: 'mm', description: 'Altura interna da caixa montada' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 7.0, step: 0.5, unit: 'mm', description: 'Espessura do material (onda E, B ou micro)' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 260;
    const B = params.B || 180;
    const H = params.H || 80;
    const Ep = params.Ep || 2.0;

    // Compensações C# f421.cs
    const PP = (2 * Ep) / 3;
    const GE = Ep - PP;

    const tuck = Math.max(30, Math.min(H * 0.75, 60)); // Aba de encaixe frontal
    const earW = Math.max(18, H * 0.35); // Orelha de trava da tampa
    const rollOverH = H - GE; // Parede lateral que vira para dentro

    const segments: Segment2D[] = [];

    // Divisões Y
    const yTuckEdge = 0;
    const yLidCrease = yTuckEdge + tuck;
    const yBackCrease = yLidCrease + B + PP;
    const yBaseBackCrease = yBackCrease + H + GE;
    const yBaseFrontCrease = yBaseBackCrease + B + PP;
    const yFrontWallTop = yBaseFrontCrease + H;
    const yFrontRollOverEdge = yFrontWallTop + rollOverH;

    // Divisões X
    const xRollLeftEdge = 0;
    const xLeftInnerCrease = rollOverH;
    const xBaseLeftCrease = xLeftInnerCrease + H + GE;
    const xBaseRightCrease = xBaseLeftCrease + L + PP;
    const xRightInnerCrease = xBaseRightCrease + H + GE;
    const xRollRightEdge = xRightInnerCrease + rollOverH;

    // 1. CORPO CENTRAL E VINCOS PRINCIPAIS
    segments.push({ x0: xBaseLeftCrease, y0: yBaseBackCrease, x1: xBaseRightCrease, y1: yBaseBackCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yBaseFrontCrease, x1: xBaseRightCrease, y1: yBaseFrontCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yBaseBackCrease, x1: xBaseLeftCrease, y1: yBaseFrontCrease, type: 'crease' });
    segments.push({ x0: xBaseRightCrease, y0: yBaseBackCrease, x1: xBaseRightCrease, y1: yBaseFrontCrease, type: 'crease' });

    segments.push({ x0: xBaseLeftCrease, y0: yBackCrease, x1: xBaseRightCrease, y1: yBackCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yLidCrease, x1: xBaseRightCrease, y1: yLidCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease + 2, y0: yFrontWallTop, x1: xBaseRightCrease - 2, y1: yFrontWallTop, type: 'crease' });

    // 2. PAREDES LATERAIS DA BASE (DUPLAS)
    segments.push({ x0: xLeftInnerCrease, y0: yBaseBackCrease + 2, x1: xLeftInnerCrease, y1: yBaseFrontCrease - 2, type: 'crease' });
    segments.push({ x0: xRollLeftEdge, y0: yBaseBackCrease + 5, x1: xRollLeftEdge, y1: yBaseFrontCrease - 5, type: 'cut' });
    segments.push({ x0: xRollLeftEdge, y0: yBaseBackCrease + 5, x1: xLeftInnerCrease, y1: yBaseBackCrease, type: 'cut' });
    segments.push({ x0: xRollLeftEdge, y0: yBaseFrontCrease - 5, x1: xLeftInnerCrease, y1: yBaseFrontCrease, type: 'cut' });

    segments.push({ x0: xRightInnerCrease, y0: yBaseBackCrease + 2, x1: xRightInnerCrease, y1: yBaseFrontCrease - 2, type: 'crease' });
    segments.push({ x0: xRollRightEdge, y0: yBaseBackCrease + 5, x1: xRollRightEdge, y1: yBaseFrontCrease - 5, type: 'cut' });
    segments.push({ x0: xRollRightEdge, y0: yBaseBackCrease + 5, x1: xRightInnerCrease, y1: yBaseBackCrease, type: 'cut' });
    segments.push({ x0: xRollRightEdge, y0: yBaseFrontCrease - 5, x1: xRightInnerCrease, y1: yBaseFrontCrease, type: 'cut' });

    // 3. ABAS DE TRAVA DA PAREDE TRASEIRA
    const flapW = H - 5;
    segments.push({ x0: xBaseLeftCrease, y0: yBackCrease, x1: xBaseLeftCrease, y1: yBaseBackCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yBackCrease, x1: xBaseLeftCrease - flapW, y1: yBackCrease + 5, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease - flapW, y0: yBackCrease + 5, x1: xBaseLeftCrease - flapW, y1: yBaseBackCrease - 5, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease - flapW, y0: yBaseBackCrease - 5, x1: xBaseLeftCrease, y1: yBaseBackCrease, type: 'cut' });

    segments.push({ x0: xBaseRightCrease, y0: yBackCrease, x1: xBaseRightCrease, y1: yBaseBackCrease, type: 'crease' });
    segments.push({ x0: xBaseRightCrease, y0: yBackCrease, x1: xBaseRightCrease + flapW, y1: yBackCrease + 5, type: 'cut' });
    segments.push({ x0: xBaseRightCrease + flapW, y0: yBackCrease + 5, x1: xBaseRightCrease + flapW, y1: yBaseBackCrease - 5, type: 'cut' });
    segments.push({ x0: xBaseRightCrease + flapW, y0: yBaseBackCrease - 5, x1: xBaseRightCrease, y1: yBaseBackCrease, type: 'cut' });

    // 4. ABAS LATERAIS DA TAMPA COM ORELHAS DE TRAVA
    const lidFlapW = H - Ep;
    segments.push({ x0: xBaseLeftCrease, y0: yLidCrease, x1: xBaseLeftCrease, y1: yBackCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yBackCrease, x1: xBaseLeftCrease - lidFlapW, y1: yBackCrease - 5, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease - lidFlapW, y0: yBackCrease - 5, x1: xBaseLeftCrease - lidFlapW, y1: yLidCrease + earW, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease - lidFlapW, y0: yLidCrease + earW, x1: xBaseLeftCrease - lidFlapW + earW, y1: yLidCrease, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease - lidFlapW + earW, y0: yLidCrease, x1: xBaseLeftCrease, y1: yLidCrease, type: 'cut' });

    segments.push({ x0: xBaseRightCrease, y0: yLidCrease, x1: xBaseRightCrease, y1: yBackCrease, type: 'crease' });
    segments.push({ x0: xBaseRightCrease, y0: yBackCrease, x1: xBaseRightCrease + lidFlapW, y1: yBackCrease - 5, type: 'cut' });
    segments.push({ x0: xBaseRightCrease + lidFlapW, y0: yBackCrease - 5, x1: xBaseRightCrease + lidFlapW, y1: yLidCrease + earW, type: 'cut' });
    segments.push({ x0: xBaseRightCrease + lidFlapW, y0: yLidCrease + earW, x1: xBaseRightCrease + lidFlapW - earW, y1: yLidCrease, type: 'cut' });
    segments.push({ x0: xBaseRightCrease + lidFlapW - earW, y0: yLidCrease, x1: xBaseRightCrease, y1: yLidCrease, type: 'cut' });

    // 5. ABA DE ENCAIXE FRONTAL
    const tuckChamfer = 12;
    segments.push({ x0: xBaseLeftCrease, y0: yLidCrease, x1: xBaseLeftCrease + tuckChamfer, y1: yTuckEdge, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease + tuckChamfer, y0: yTuckEdge, x1: xBaseRightCrease - tuckChamfer, y1: yTuckEdge, type: 'cut' });
    segments.push({ x0: xBaseRightCrease - tuckChamfer, y0: yTuckEdge, x1: xBaseRightCrease, y1: yLidCrease, type: 'cut' });

    // 6. PAREDE FRONTAL DOBRÁVEL
    segments.push({ x0: xBaseLeftCrease, y0: yBaseFrontCrease, x1: xBaseLeftCrease + 5, y1: yFrontWallTop, type: 'cut' });
    segments.push({ x0: xBaseRightCrease, y0: yBaseFrontCrease, x1: xBaseRightCrease - 5, y1: yFrontWallTop, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease + 5, y0: yFrontWallTop, x1: xBaseLeftCrease + 10, y1: yFrontRollOverEdge, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease + 10, y0: yFrontRollOverEdge, x1: xBaseRightCrease - 10, y1: yFrontRollOverEdge, type: 'cut' });
    segments.push({ x0: xBaseRightCrease - 10, y0: yFrontRollOverEdge, x1: xBaseRightCrease - 5, y1: yFrontWallTop, type: 'cut' });

    // 7. RASGOS DE TRAVAMENTO NO FUNDO
    const slotL = 15;
    const slotW = Ep + 0.5;
    // Fresta esquerda
    segments.push({ x0: xBaseLeftCrease, y0: yBaseBackCrease + 10, x1: xBaseLeftCrease + slotW, y1: yBaseBackCrease + 10, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease + slotW, y0: yBaseBackCrease + 10, x1: xBaseLeftCrease + slotW, y1: yBaseBackCrease + 10 + slotL, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease + slotW, y0: yBaseBackCrease + 10 + slotL, x1: xBaseLeftCrease, y1: yBaseBackCrease + 10 + slotL, type: 'cut' });
    // Fresta direita
    segments.push({ x0: xBaseRightCrease, y0: yBaseBackCrease + 10, x1: xBaseRightCrease - slotW, y1: yBaseBackCrease + 10, type: 'cut' });
    segments.push({ x0: xBaseRightCrease - slotW, y0: yBaseBackCrease + 10, x1: xBaseRightCrease - slotW, y1: yBaseBackCrease + 10 + slotL, type: 'cut' });
    segments.push({ x0: xBaseRightCrease - slotW, y0: yBaseBackCrease + 10 + slotL, x1: xBaseRightCrease, y1: yBaseBackCrease + 10 + slotL, type: 'cut' });

    const dimensions: DimensionLine[] = [
      { x0: xBaseLeftCrease, y0: yBaseBackCrease, x1: xBaseRightCrease, y1: yBaseBackCrease, text: `L = ${L} mm`, offset: 20 },
      { x0: xBaseLeftCrease, y0: yBaseBackCrease, x1: xBaseLeftCrease, y1: yBaseFrontCrease, text: `B = ${B} mm`, offset: -25, isVertical: true },
      { x0: xRightInnerCrease, y0: yBaseBackCrease, x1: xRightInnerCrease, y1: yBaseBackCrease + H, text: `H = ${H} mm`, offset: 20, isVertical: true },
    ];

    const bounds = computeBoundingBox({ segments });

    return {
      segments,
      arcs: [],
      dimensions,
      bounds,
    };
  },
};
