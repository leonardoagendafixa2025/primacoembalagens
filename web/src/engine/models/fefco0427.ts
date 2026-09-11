import type { PackagingModel, DielineResult, Segment2D, DimensionLine, BoundingBox2D } from '../types';

export const fefco0427: PackagingModel = {
  id: 'fefco_0427',
  code: 'FEFCO 0427',
  name: 'Caixa E-Commerce / Envio com Abas Travantes',
  category: 'FEFCO',
  description: 'O modelo mais utilizado no e-commerce moderno. Não precisa de fita para fechar: possui tampa articulada, abas laterais e orelhas de travamento anti-violação.',
  defaultParams: {
    L: 260, // Comprimento interior (mm)
    B: 180, // Largura interior (mm)
    H: 80,  // Altura interior (mm)
    Ep: 2.0, // Espessura do papelão (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 600, step: 5, unit: 'mm', description: 'Comprimento da base interna' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 500, step: 5, unit: 'mm', description: 'Largura da base interna' },
    { key: 'H', label: 'Altura (H)', min: 40, max: 250, step: 5, unit: 'mm', description: 'Altura interna da caixa montada' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 6.0, step: 0.5, unit: 'mm', description: 'Espessura do material (onda E, B ou Cartão)' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 260;
    const B = params.B || 180;
    const H = params.H || 80;
    const Ep = params.Ep || 2.0;

    // Compensações
    const tuck = Math.max(30, Math.min(H * 0.7, 50)); // Aba de encaixe frontal
    const earW = Math.max(18, H * 0.35); // Orelha de trava da tampa
    const rollOverH = H - Ep; // Parede lateral interna que dobra para dentro

    const segments: Segment2D[] = [];

    const yTuckEdge = 0;
    const yLidCrease = yTuckEdge + tuck;
    const yBackCrease = yLidCrease + B;
    const yBaseBackCrease = yBackCrease + H;
    const yBaseFrontCrease = yBaseBackCrease + B;
    const yFrontWallTop = yBaseFrontCrease + H;
    const yFrontRollOverEdge = yFrontWallTop + rollOverH;

    const xRollLeftEdge = 0;
    const xLeftInnerCrease = rollOverH;
    const xBaseLeftCrease = xLeftInnerCrease + H;
    const xBaseRightCrease = xBaseLeftCrease + L;
    const xRightInnerCrease = xBaseRightCrease + H;
    const xRollRightEdge = xRightInnerCrease + rollOverH;

    // 1. CORPO CENTRAL
    segments.push({ x0: xBaseLeftCrease, y0: yBaseBackCrease, x1: xBaseRightCrease, y1: yBaseBackCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yBaseFrontCrease, x1: xBaseRightCrease, y1: yBaseFrontCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yBaseBackCrease, x1: xBaseLeftCrease, y1: yBaseFrontCrease, type: 'crease' });
    segments.push({ x0: xBaseRightCrease, y0: yBaseBackCrease, x1: xBaseRightCrease, y1: yBaseFrontCrease, type: 'crease' });

    segments.push({ x0: xBaseLeftCrease, y0: yBackCrease, x1: xBaseRightCrease, y1: yBackCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease, y0: yLidCrease, x1: xBaseRightCrease, y1: yLidCrease, type: 'crease' });
    segments.push({ x0: xBaseLeftCrease + 2, y0: yFrontWallTop, x1: xBaseRightCrease - 2, y1: yFrontWallTop, type: 'crease' });

    // 2. PAREDES LATERAIS DA BASE
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

    // 4. ABAS LATERAIS DA TAMPA
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

    // 6. PAREDE FRONTAL DUPLA
    const frontChamfer = 8;
    segments.push({ x0: xBaseLeftCrease, y0: yBaseFrontCrease, x1: xBaseLeftCrease + frontChamfer, y1: yFrontRollOverEdge, type: 'cut' });
    segments.push({ x0: xBaseLeftCrease + frontChamfer, y0: yFrontRollOverEdge, x1: xBaseRightCrease - frontChamfer, y1: yFrontRollOverEdge, type: 'cut' });
    segments.push({ x0: xBaseRightCrease - frontChamfer, y0: yFrontRollOverEdge, x1: xBaseRightCrease, y1: yBaseFrontCrease, type: 'cut' });

    // Rasgos de trava no fundo
    const slotY = yBaseFrontCrease - 10;
    const slotL = 15;
    segments.push({ x0: xBaseLeftCrease + 2, y0: slotY, x1: xBaseLeftCrease + 2 + slotL, y1: slotY, type: 'cut' });
    segments.push({ x0: xBaseRightCrease - 2, y0: slotY, x1: xBaseRightCrease - 2 - slotL, y1: slotY, type: 'cut' });

    // 7. COTAS DE MEDIDA
    const dimensions: DimensionLine[] = [
      { x0: xBaseLeftCrease, y0: yBaseBackCrease, x1: xBaseRightCrease, y1: yBaseBackCrease, text: `L = ${L} mm`, offset: 25 },
      { x0: xBaseRightCrease, y0: yBaseBackCrease, x1: xBaseRightCrease, y1: yBaseFrontCrease, text: `B = ${B} mm`, offset: 25, isVertical: true },
      { x0: xBaseRightCrease, y0: yBaseFrontCrease, x1: xBaseRightCrease, y1: yFrontWallTop, text: `H = ${H} mm`, offset: 25, isVertical: true },
      { x0: xBaseLeftCrease, y0: yLidCrease, x1: xBaseRightCrease, y1: yLidCrease, text: `Tampa = ${L} x ${B} mm`, offset: -25 },
    ];

    const bounds: BoundingBox2D = {
      minX: 0,
      minY: 0,
      maxX: xRollRightEdge,
      maxY: yFrontRollOverEdge,
      width: xRollRightEdge,
      height: yFrontRollOverEdge,
    };

    return {
      segments,
      arcs: [],
      dimensions,
      bounds,
    };
  },
};
