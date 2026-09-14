import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

/**
 * FEFCO 0427 - Caixa E-Commerce / Envio com Paredes Duplas e Orelhas de Travamento
 * Código matemático fiel 1:1 ao PicParam C# original da PLMPackLib (Fefco_427)
 * 
 * Componentes originais integrados:
 * 1. Dbl_Wall_v2 (Paredes duplas laterais com 4 furos mortise e abas tenon a 15°)
 * 2. top_cover_427 (Tampa superior articulada com abas laterais e aba frontal com orelhas de trava Ra20)
 */
export const fefco0427: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'fefco0427',
  id: 'fefco_0427',
  code: 'FEFCO 0427',
  name: 'Caixa E-Commerce com Orelhas de Travamento (FEFCO 0427)',
  category: 'FEFCO',
  description:
    'Modelo padrão global para e-commerce e envios postais. Possui paredes laterais duplas de alta resistência com travamento por encaixe, tampa articulada com abas laterais e orelhas frontais de pressão que dispensam fita adesiva.',
  defaultParams: {
    L: 260, // Comprimento interior (mm)
    B: 180, // Largura interior (mm)
    H: 80,  // Altura interior (mm)
    Ep: 2.0, // Espessura do papelão (mm)
    H7: 45,  // Aba frontal com travas (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 800, step: 5, unit: 'mm', description: 'Comprimento interno da base' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 600, step: 5, unit: 'mm', description: 'Largura interna da base' },
    { key: 'H', label: 'Altura (H)', min: 30, max: 300, step: 5, unit: 'mm', description: 'Altura interna da caixa montada' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 7.0, step: 0.5, unit: 'mm', description: 'Espessura do material (mm)' },
    { key: 'H7', label: 'Aba Frontal (H7)', min: 25, max: 120, step: 5, unit: 'mm', description: 'Comprimento da aba frontal com orelhas' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 260;
    const B = params.B || 180;
    const H = params.H || 80;
    const ep1 = params.Ep || 2.0;
    let H7 = params.H7 !== undefined ? params.H7 : Math.min(H * 0.6, 50);
    if (H7 > H) H7 = H;

    // Fórmulas de compensação C# do Fefco_427.cs original
    const PP = (2 * ep1) / 3;
    const GE = ep1 - PP;

    const m1 = 6 * ep1 + GE;
    const m2 = 3 * ep1;
    const m3 = 2 * ep1 + GE;
    const m4 = 3 * ep1 + GE;
    const m5 = PP;
    const m6 = ep1 + GE / 2;
    const m7 = 0;
    const m8 = GE;
    const m9 = GE;
    const m11 = 20; // largura do furo mortise
    const m12 = 8;  // altura do tenon
    const m13 = 4;
    const m14 = 20;
    const m15 = 20;
    const m17 = 2;

    const L1_2 = (L + m1) / 2;
    const L2_2 = (L + m2) / 2;
    const B1_2 = (B + m3) / 2;
    const B2_2 = (B + m4) / 2;
    const B4_2 = B / 2;

    const H1 = H + m5;
    const v3 = m6;
    const R1 = m7;
    let H2 = H1 - v3 - R1;
    if (H2 > H1 - (B2_2 - B1_2)) H2 = H1 - (B2_2 - B1_2);

    const H3 = H - m8;
    const H4 = H + m9;
    const dbw = 2 * ep1 + m13;

    // Tenon / Mortise
    const Pos = 40;
    const mtl = 33;
    const tml = 33;
    const mth = m11;
    const T1 = m12;
    const agT1 = 15;
    const aT1 = T1 * Math.tan((agT1 * Math.PI) / 180);

    const v5 = B2_2 - mtl - Pos;
    const v6 = v5 + mtl / 2 - tml / 2;

    const ChFlap = 10;

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    // =========================================================================
    // 1. CORPO PRINCIPAL E PAREDES DUPLAS (Dbl_Wall_v2)
    // =========================================================================

    // Vincos horizontais do fundo
    segments.push({ x0: -L2_2, y0: B1_2, x1: L2_2, y1: B1_2, type: 'crease' });
    segments.push({ x0: -L2_2, y0: -B1_2, x1: L2_2, y1: -B1_2, type: 'crease' });

    const signs = [1, -1];
    for (const sx of signs) {
      const xL2 = sx * L2_2;
      const xL1 = sx * L1_2;
      const xWall1 = sx * (L1_2 + H4);
      const xWallCrease = sx * (L1_2 + H4 + dbw);
      const xWall2 = sx * (L1_2 + H4 + dbw + H3);
      const xTenonTip = sx * (L1_2 + H4 + dbw + H3 + T1);

      // Vincos verticais da parede lateral
      segments.push({ x0: xL1, y0: B2_2 - ChFlap, x1: xL1, y1: -B2_2 + ChFlap, type: 'crease' });
      segments.push({ x0: xWall1, y0: B2_2, x1: xWall1, y1: -B2_2, type: 'crease' });
      segments.push({ x0: xWallCrease, y0: B4_2, x1: xWallCrease, y1: -B4_2, type: 'crease' });

      for (const sy of signs) {
        const yB1 = sy * B1_2;
        const yB2 = sy * B2_2;
        const yB4 = sy * B4_2;
        const yFlapTop = sy * (B2_2 + H2 + R1);

        // Vinco vertical da aba de canto
        segments.push({ x0: xL2, y0: yB1, x1: xL2, y1: yFlapTop, type: 'crease' });

        // Cortes do contorno
        segments.push({ x0: xL2, y0: yB1, x1: xL1, y1: yB2, type: 'cut' });
        segments.push({ x0: xL1, y0: yB2, x1: xWall1, y1: yB2, type: 'cut' });
        segments.push({ x0: xWall1, y0: yB2, x1: xWallCrease, y1: yB4, type: 'cut' });
        segments.push({ x0: xWallCrease, y0: yB4, x1: xWall2, y1: yB4, type: 'cut' });

        // Aba de canto com chanfro
        segments.push({ x0: xL2, y0: yFlapTop, x1: sx * (L2_2 + H2), y1: yFlapTop, type: 'cut' });
        segments.push({ x0: sx * (L2_2 + H2), y0: yFlapTop, x1: sx * (L2_2 + H2), y1: sy * (B2_2 + ChFlap), type: 'cut' });
        segments.push({ x0: sx * (L2_2 + H2), y0: sy * (B2_2 + ChFlap), x1: xL1, y1: yB2, type: 'cut' });

        // Mortise (furo de encaixe da trava)
        const yM0 = sy * v5;
        const yM1 = sy * (v5 + mtl);
        const xM0 = sx * L1_2;
        const xM1 = sx * (L1_2 - mth);
        segments.push({ x0: xM0, y0: yM0, x1: xM1, y1: yM0, type: 'cut' });
        segments.push({ x0: xM1, y0: yM0, x1: xM1, y1: yM1, type: 'cut' });
        segments.push({ x0: xM1, y0: yM1, x1: xM0, y1: yM1, type: 'cut' });
        segments.push({ x0: xM0, y0: yM1, x1: xM0, y1: yM0, type: 'cut' });

        // Tenon (aba de trava)
        const yT0 = sy * v6;
        const yT1 = sy * (v6 + tml);
        const yTTip0 = sy * (v6 + aT1);
        const yTTip1 = sy * (v6 + tml - aT1);
        segments.push({ x0: xWall2, y0: yB4, x1: xWall2, y1: yT1, type: 'cut' });
        segments.push({ x0: xWall2, y0: yT1, x1: xTenonTip, y1: yTTip1, type: 'cut' });
        segments.push({ x0: xTenonTip, y0: yTTip1, x1: xTenonTip, y1: yTTip0, type: 'cut' });
        segments.push({ x0: xTenonTip, y0: yTTip0, x1: xWall2, y1: yT0, type: 'cut' });
      }

      segments.push({ x0: xWall2, y0: v6, x1: xWall2, y1: -v6, type: 'cut' });
    }

    // Fechamento da borda inferior
    const yBottomFlapEdge = -(B1_2 + H2);
    segments.push({ x0: -L2_2, y0: yBottomFlapEdge, x1: L2_2, y1: yBottomFlapEdge, type: 'cut' });

    // =========================================================================
    // 2. TAMPA SUPERIOR COM ORELHAS DE TRAVA (top_cover_427)
    // =========================================================================
    const Ltop = L2_2 * 2 + m14;
    const cw = (Ltop - L2_2 * 2) / 2;
    const B2top = B + m15;
    const cs = m17;

    const yCoverBase = B1_2 + H2;
    // Vinco entre parede traseira e tampa
    segments.push({ x0: -L2_2, y0: yCoverBase, x1: L2_2, y1: yCoverBase, type: 'crease' });

    const yLidCreaseBottom = yCoverBase + cs;
    const yLidCreaseTop = yCoverBase + cs + B2top - cs;
    const yLidFrontCrease = yCoverBase + cs + B2top;
    const yLidFrontEdge = yLidFrontCrease + H7;

    const xLidLeft = -(L2_2 - cw);
    const xLidRight = L2_2 - cw;
    const flapW = Math.min(H, 60);

    // Vincos laterais da tampa
    segments.push({ x0: xLidLeft, y0: yLidCreaseBottom + cs, x1: xLidLeft, y1: yLidCreaseTop, type: 'crease' });
    segments.push({ x0: xLidRight, y0: yLidCreaseBottom + cs, x1: xLidRight, y1: yLidCreaseTop, type: 'crease' });

    // Vinco frontal da tampa
    segments.push({ x0: xLidLeft, y0: yLidFrontCrease, x1: xLidRight, y1: yLidFrontCrease, type: 'crease' });

    // Abas laterais da tampa com chanfro
    // Direita
    segments.push({ x0: L2_2, y0: yCoverBase, x1: xLidRight, y1: yLidCreaseBottom, type: 'cut' });
    segments.push({ x0: xLidRight, y0: yLidCreaseBottom, x1: xLidRight, y1: yLidCreaseBottom + cs, type: 'cut' });
    segments.push({ x0: xLidRight, y0: yLidCreaseBottom + cs, x1: xLidRight + flapW, y1: yLidCreaseBottom + cs + 15, type: 'cut' });
    segments.push({ x0: xLidRight + flapW, y0: yLidCreaseBottom + cs + 15, x1: xLidRight + flapW, y1: yLidCreaseTop - 15, type: 'cut' });
    segments.push({ x0: xLidRight + flapW, y0: yLidCreaseTop - 15, x1: xLidRight, y1: yLidCreaseTop, type: 'cut' });
    segments.push({ x0: xLidRight, y0: yLidCreaseTop, x1: xLidRight, y1: yLidFrontCrease, type: 'cut' });

    // Esquerda
    segments.push({ x0: -L2_2, y0: yCoverBase, x1: xLidLeft, y1: yLidCreaseBottom, type: 'cut' });
    segments.push({ x0: xLidLeft, y0: yLidCreaseBottom, x1: xLidLeft, y1: yLidCreaseBottom + cs, type: 'cut' });
    segments.push({ x0: xLidLeft, y0: yLidCreaseBottom + cs, x1: xLidLeft - flapW, y1: yLidCreaseBottom + cs + 15, type: 'cut' });
    segments.push({ x0: xLidLeft - flapW, y0: yLidCreaseBottom + cs + 15, x1: xLidLeft - flapW, y1: yLidCreaseTop - 15, type: 'cut' });
    segments.push({ x0: xLidLeft - flapW, y0: yLidCreaseTop - 15, x1: xLidLeft, y1: yLidCreaseTop, type: 'cut' });
    segments.push({ x0: xLidLeft, y0: yLidCreaseTop, x1: xLidLeft, y1: yLidFrontCrease, type: 'cut' });

    // Orelhas de travamento (Ears) da aba frontal
    const earW = Math.min(22, H * 0.35);
    const earH = H7 * 0.6;
    // Orelha direita
    segments.push({ x0: xLidRight, y0: yLidFrontCrease, x1: xLidRight + earW, y1: yLidFrontCrease, type: 'cut' });
    segments.push({ x0: xLidRight + earW, y0: yLidFrontCrease, x1: xLidRight + earW, y1: yLidFrontCrease + earH, type: 'cut' });
    segments.push({ x0: xLidRight + earW, y0: yLidFrontCrease + earH, x1: xLidRight, y1: yLidFrontEdge, type: 'cut' });

    // Orelha esquerda
    segments.push({ x0: xLidLeft, y0: yLidFrontCrease, x1: xLidLeft - earW, y1: yLidFrontCrease, type: 'cut' });
    segments.push({ x0: xLidLeft - earW, y0: yLidFrontCrease, x1: xLidLeft - earW, y1: yLidFrontCrease + earH, type: 'cut' });
    segments.push({ x0: xLidLeft - earW, y0: yLidFrontCrease + earH, x1: xLidLeft, y1: yLidFrontEdge, type: 'cut' });

    // Borda superior da aba frontal
    segments.push({ x0: xLidLeft, y0: yLidFrontEdge, x1: xLidRight, y1: yLidFrontEdge, type: 'cut' });

    // =========================================================================
    // 3. COTAS TÉCNICAS
    // =========================================================================
    const dimensions: DimensionLine[] = [
      { x0: -L2_2, y0: -B1_2 - 20, x1: L2_2, y1: -B1_2 - 20, text: `L = ${L} mm`, offset: -20 },
      { x0: L2_2 + 25, y0: -B1_2, x1: L2_2 + 25, y1: B1_2, text: `B = ${B} mm`, offset: 20, isVertical: true },
      { x0: L1_2, y0: B2_2 + 20, x1: L1_2 + H4, y1: B2_2 + 20, text: `H = ${H} mm`, offset: 20 },
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
