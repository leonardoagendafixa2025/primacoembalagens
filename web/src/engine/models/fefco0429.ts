import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

/**
 * FEFCO 0429 - Caixa Postal / Envoltório com Paredes Duplas e Travas Mortise/Tenon
 * Código matemático fiel 1:1 ao PicParam C# original da PLMPackLib (F_0429)
 * 
 * Componentes originais integrados:
 * 1. Dbl_Wall_v2 (Paredes duplas laterais com 4 furos mortise e abas tenon a 15°)
 * 2. top_cover_429 (Tampa superior com 2 abas laterais de inserção e aba frontal arredondada R15)
 */
export const fefco0429: PackagingModel = {
  id: 'fefco_0429',
  code: 'FEFCO 0429',
  name: 'Caixa de Envio com Tampa Integrada e Abas Laterais (FEFCO 0429)',
  category: 'FEFCO',
  description:
    'Modelo oficial FEFCO 0429 com paredes laterais duplas de travamento automático (tenon/mortise), tampa articulada com abas laterais de vedação e aba frontal com cantos arredondados.',
  defaultParams: {
    L: 300, // Comprimento interior (mm)
    B: 200, // Largura interior (mm)
    H: 100, // Altura interior (mm)
    Ep: 3.0, // Espessura do papelão (mm)
    H7: 50,  // Altura das abas da tampa (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1200, step: 5, unit: 'mm', description: 'Comprimento interno da caixa' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Largura interna da caixa' },
    { key: 'H', label: 'Altura (H)', min: 30, max: 400, step: 5, unit: 'mm', description: 'Altura interna da caixa' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 8.0, step: 0.5, unit: 'mm', description: 'Espessura do material (mm)' },
    { key: 'H7', label: 'Abas da Tampa (H7)', min: 20, max: 150, step: 5, unit: 'mm', description: 'Largura das abas laterais e frontal da tampa' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 100;
    const ep1 = params.Ep || 3.0;
    let H7 = params.H7 !== undefined ? params.H7 : Math.min(H, 100);
    if (H7 > H) H7 = H;

    // Fórmulas de compensação C# do Fefco_429.cs original
    const PP = (2 * ep1) / 3;
    const GE = ep1 - PP;

    const m1 = 5 * ep1;
    const m2 = 3 * ep1;
    const m3 = 2 * ep1 + GE;
    const m4 = 3 * ep1 + GE;
    const m5 = PP;
    const m6 = ep1 + GE / 2;
    const m7 = 0;
    const m8 = GE;
    const m9 = GE;
    const m11 = m3;
    const m12 = ep1;
    const m13 = 0;
    const m15 = ep1 + GE;
    const m16 = m4;
    const m17 = GE;

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

    // Parâmetros de Tenon / Mortise
    const Pos = 40;
    const mtl = 33;
    const tml = 33;
    const mth = m11; // 6 mm
    const T1 = m12;  // 3 mm (aba do tenon)
    const agT1 = 15; // ângulo do tenon em graus
    const aT1 = T1 * Math.tan((agT1 * Math.PI) / 180);

    const v5 = B2_2 - mtl - Pos;
    const v6 = v5 + mtl / 2 - tml / 2;

    const ChFlap = 10; // chanfro das abas

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    // =========================================================================
    // 1. CORPO PRINCIPAL E PAREDES DUPLAS (Dbl_Wall_v2 simétrico nos 4 quadrantes)
    // =========================================================================

    // Vinco horizontal superior e inferior do fundo
    segments.push({ x0: -L2_2, y0: B1_2, x1: L2_2, y1: B1_2, type: 'crease' });
    segments.push({ x0: -L2_2, y0: -B1_2, x1: L2_2, y1: -B1_2, type: 'crease' });

    // Função para gerar cada um dos 2 lados (Direita e Esquerda)
    const signs = [1, -1];
    for (const sx of signs) {
      const xL2 = sx * L2_2;
      const xL1 = sx * L1_2;
      const xWall1 = sx * (L1_2 + H4);
      const xWallCrease = sx * (L1_2 + H4 + dbw);
      const xWall2 = sx * (L1_2 + H4 + dbw + H3);
      const xTenonTip = sx * (L1_2 + H4 + dbw + H3 + T1);

      // Vincos verticais das paredes duplas
      // Vinco raiz da parede lateral (fundo -> parede 1)
      segments.push({ x0: xL1, y0: B2_2 - ChFlap, x1: xL1, y1: -B2_2 + ChFlap, type: 'crease' });
      // Dobra dupla de retorno (dbw)
      segments.push({ x0: xWall1, y0: B2_2, x1: xWall1, y1: -B2_2, type: 'crease' });
      segments.push({ x0: xWallCrease, y0: B4_2, x1: xWallCrease, y1: -B4_2, type: 'crease' });

      // Lados superior e inferior (Y positivo e negativo)
      for (const sy of signs) {
        const yB1 = sy * B1_2;
        const yB2 = sy * B2_2;
        const yB4 = sy * B4_2;
        const yFlapTop = sy * (B2_2 + H2 + R1);

        // Vinco vertical da aba de canto
        segments.push({ x0: xL2, y0: yB1, x1: xL2, y1: yFlapTop, type: 'crease' });

        // Corte de alívio entre fundo e aba lateral
        segments.push({ x0: xL2, y0: yB1, x1: xL1, y1: yB2, type: 'cut' });

        // Borda superior/inferior da aba lateral
        segments.push({ x0: xL1, y0: yB2, x1: xWall1, y1: yB2, type: 'cut' });
        // Chanfro entre parede 1 e parede 2
        segments.push({ x0: xWall1, y0: yB2, x1: xWallCrease, y1: yB4, type: 'cut' });
        // Borda superior/inferior da parede 2 (roll-over)
        segments.push({ x0: xWallCrease, y0: yB4, x1: xWall2, y1: yB4, type: 'cut' });

        // Abas de canto (flaps articulados no topo/base)
        // Borda horizontal externa da aba de canto
        segments.push({ x0: xL2, y0: yFlapTop, x1: sx * (L2_2 + H2), y1: yFlapTop, type: 'cut' });
        // Chanfro a 45° da aba de canto
        segments.push({ x0: sx * (L2_2 + H2), y0: yFlapTop, x1: sx * (L2_2 + H2), y1: sy * (B2_2 + ChFlap), type: 'cut' });
        segments.push({ x0: sx * (L2_2 + H2), y0: sy * (B2_2 + ChFlap), x1: xL1, y1: yB2, type: 'cut' });

        // Mortise (Furo retangular no fundo próximo ao vinco para travar a orelha)
        const yM0 = sy * v5;
        const yM1 = sy * (v5 + mtl);
        const xM0 = sx * L1_2;
        const xM1 = sx * (L1_2 - mth);
        segments.push({ x0: xM0, y0: yM0, x1: xM1, y1: yM0, type: 'cut' });
        segments.push({ x0: xM1, y0: yM0, x1: xM1, y1: yM1, type: 'cut' });
        segments.push({ x0: xM1, y0: yM1, x1: xM0, y1: yM1, type: 'cut' });
        segments.push({ x0: xM0, y0: yM1, x1: xM0, y1: yM0, type: 'cut' });

        // Tenon (Orelha de travamento na extremidade da parede interna)
        const yT0 = sy * v6;
        const yT1 = sy * (v6 + tml);
        const yTTip0 = sy * (v6 + aT1);
        const yTTip1 = sy * (v6 + tml - aT1);
        // Base do corte até a aba
        segments.push({ x0: xWall2, y0: yB4, x1: xWall2, y1: yT1, type: 'cut' });
        // Rampa angular de 15°
        segments.push({ x0: xWall2, y0: yT1, x1: xTenonTip, y1: yTTip1, type: 'cut' });
        // Ponta reta da aba
        segments.push({ x0: xTenonTip, y0: yTTip1, x1: xTenonTip, y1: yTTip0, type: 'cut' });
        // Rampa de volta
        segments.push({ x0: xTenonTip, y0: yTTip0, x1: xWall2, y1: yT0, type: 'cut' });
      }

      // Trecho reto intermediário entre as duas abas Tenon na borda extrema
      segments.push({ x0: xWall2, y0: v6, x1: xWall2, y1: -v6, type: 'cut' });
    }

    // Fechamento da borda inferior da caixa (Y negativo)
    const yBottomFlapEdge = -(B1_2 + H2);
    segments.push({ x0: -L2_2, y0: yBottomFlapEdge, x1: L2_2, y1: yBottomFlapEdge, type: 'cut' });

    // =========================================================================
    // 2. TAMPA SUPERIOR ARTICULADA E ABAS LATERAIS (top_cover_429)
    // =========================================================================
    const L3 = L2_2 * 2; // L2
    const B2top = B + m15;
    const cw = m16;
    const cs = m17;
    const Rp = 15; // Raio dos cantos da aba frontal

    const yCoverBase = B1_2 + H2; // início da tampa articulada
    // Vinco entre parede traseira e tampa
    segments.push({ x0: -L2_2, y0: yCoverBase, x1: L2_2, y1: yCoverBase, type: 'crease' });

    // Abas laterais da tampa (Lid lateral dust flaps)
    const yLidCreaseBottom = yCoverBase + cs;
    const yLidCreaseTop = yCoverBase + cs + B2top - cs;
    const yLidFrontCrease = yCoverBase + cs + B2top;
    const yLidFrontEdge = yLidFrontCrease + H7;

    const xLidLeft = -(L3 / 2 - cw);
    const xLidRight = L3 / 2 - cw;
    const xLidFlapLeft = xLidLeft - H7;
    const xLidFlapRight = xLidRight + H7;

    // Vincos laterais da tampa (para dobrar as abas laterais para dentro)
    segments.push({ x0: xLidLeft, y0: yLidCreaseBottom + cs, x1: xLidLeft, y1: yLidCreaseTop, type: 'crease' });
    segments.push({ x0: xLidRight, y0: yLidCreaseBottom + cs, x1: xLidRight, y1: yLidCreaseTop, type: 'crease' });

    // Vinco frontal da tampa (para a aba de encaixe)
    segments.push({ x0: xLidLeft, y0: yLidFrontCrease, x1: xLidRight, y1: yLidFrontCrease, type: 'crease' });

    // Cortes da aba lateral DIREITA da tampa
    segments.push({ x0: L2_2, y0: yCoverBase, x1: xLidRight, y1: yLidCreaseBottom, type: 'cut' });
    segments.push({ x0: xLidRight, y0: yLidCreaseBottom, x1: xLidRight, y1: yLidCreaseBottom + cs, type: 'cut' });
    segments.push({ x0: xLidRight, y0: yLidCreaseBottom + cs, x1: xLidFlapRight, y1: yLidCreaseBottom + cs + H7 / 3, type: 'cut' });
    segments.push({ x0: xLidFlapRight, y0: yLidCreaseBottom + cs + H7 / 3, x1: xLidFlapRight, y1: yLidCreaseTop - H7 / 3, type: 'cut' });
    segments.push({ x0: xLidFlapRight, y0: yLidCreaseTop - H7 / 3, x1: xLidRight, y1: yLidCreaseTop, type: 'cut' });
    segments.push({ x0: xLidRight, y0: yLidCreaseTop, x1: xLidRight, y1: yLidFrontCrease, type: 'cut' });

    // Cortes da aba lateral ESQUERDA da tampa
    segments.push({ x0: -L2_2, y0: yCoverBase, x1: xLidLeft, y1: yLidCreaseBottom, type: 'cut' });
    segments.push({ x0: xLidLeft, y0: yLidCreaseBottom, x1: xLidLeft, y1: yLidCreaseBottom + cs, type: 'cut' });
    segments.push({ x0: xLidLeft, y0: yLidCreaseBottom + cs, x1: xLidFlapLeft, y1: yLidCreaseBottom + cs + H7 / 3, type: 'cut' });
    segments.push({ x0: xLidFlapLeft, y0: yLidCreaseBottom + cs + H7 / 3, x1: xLidFlapLeft, y1: yLidCreaseTop - H7 / 3, type: 'cut' });
    segments.push({ x0: xLidFlapLeft, y0: yLidCreaseTop - H7 / 3, x1: xLidLeft, y1: yLidCreaseTop, type: 'cut' });
    segments.push({ x0: xLidLeft, y0: yLidCreaseTop, x1: xLidLeft, y1: yLidFrontCrease, type: 'cut' });

    // Aba de inserção frontal (Tuck flap com cantos arredondados R15)
    segments.push({ x0: xLidLeft, y0: yLidFrontCrease, x1: xLidLeft, y1: yLidFrontEdge - Rp, type: 'cut' });
    segments.push({ x0: xLidRight, y0: yLidFrontCrease, x1: xLidRight, y1: yLidFrontEdge - Rp, type: 'cut' });

    // Cantos arredondados R15
    arcs.push({
      cx: xLidLeft + Rp,
      cy: yLidFrontEdge - Rp,
      r: Rp,
      startAngle: 90,
      endAngle: 180,
      type: 'cut',
    });
    arcs.push({
      cx: xLidRight - Rp,
      cy: yLidFrontEdge - Rp,
      r: Rp,
      startAngle: 0,
      endAngle: 90,
      type: 'cut',
    });
    // Borda horizontal superior da aba frontal
    segments.push({ x0: xLidLeft + Rp, y0: yLidFrontEdge, x1: xLidRight - Rp, y1: yLidFrontEdge, type: 'cut' });

    // =========================================================================
    // 3. COTAS TÉCNICAS (DIMENSION LINES)
    // =========================================================================
    const dimensions: DimensionLine[] = [
      {
        x0: -L2_2,
        y0: -B1_2 - 20,
        x1: L2_2,
        y1: -B1_2 - 20,
        text: `L = ${L} mm`,
        offset: -20,
      },
      {
        x0: L2_2 + 25,
        y0: -B1_2,
        x1: L2_2 + 25,
        y1: B1_2,
        text: `B = ${B} mm`,
        offset: 20,
        isVertical: true,
      },
      {
        x0: L1_2,
        y0: B2_2 + 20,
        x1: L1_2 + H4,
        y1: B2_2 + 20,
        text: `H = ${H} mm`,
        offset: 20,
      },
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
