import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

/**
 * FEFCO 0420 - Envoltório / Five-Panel Folder (FPF)
 * Caixa tipo envoltório com 5 painéis longitudinais:
 * 1. Aba de inserção (tuck flap) com cantos arredondados
 * 2. Tampa superior (Lid)
 * 3. Parede lateral traseira (Rear wall) com abas de pó (dust flaps)
 * 4. Fundo / Base com paredes laterais duplas envolventes (roll-over flaps)
 * 5. Parede lateral frontal (Front wall) com abas de pó (dust flaps) e aba de fechamento
 *
 * Baseado no modelo original PLMPackLib (PicParam F_0420.des)
 */
export const fefco0420: PackagingModel = {
  id: 'fefco_0420',
  code: 'FEFCO 0420',
  name: 'Envoltório com Tampa Articulada (Five-Panel Folder)',
  category: 'FEFCO',
  description:
    'Modelo padrão internacional FEFCO 0420: envoltório de peça única com tampa articulada superior, abas de fechamento lateral e fundo envolvente.',
  defaultParams: {
    L: 300,  // Comprimento interior (mm)
    B: 200,  // Largura interior (mm)
    H: 150,  // Altura interior (mm)
    Ep: 3.0, // Espessura do papelão (mm)
    M: 35,   // Aba de encaixe frontal (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1200, step: 5, unit: 'mm', description: 'Comprimento da base interna' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Largura da base interna' },
    { key: 'H', label: 'Altura (H)', min: 30, max: 500, step: 5, unit: 'mm', description: 'Altura interna da caixa' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.5, max: 7.0, step: 0.5, unit: 'mm', description: 'Espessura do material' },
    { key: 'M', label: 'Aba Encaixe (M)', min: 20, max: 80, step: 5, unit: 'mm', description: 'Comprimento da aba de fechamento' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 150;
    const Ep = params.Ep || 3.0;
    const M = params.M || 35;

    // Folgas e compensações industriais padrão C#
    const c1 = Ep * 0.5; // folga leve
    const c2 = Ep;       // folga padrão 1 espessura
    const c3 = Ep * 2;   // folga dupla para dobra externa

    const tuckW = Math.max(25, Math.min(M, B * 0.4));
    const dustFlapH = Math.max(40, (B / 2) - c2); // abas laterais de pó
    const sideWallH = H + c2;                     // parede lateral externa
    const rollOverW = Math.max(30, Math.min(H - c2, 50)); // aba de retorno/trava interna
    const cornerR = Math.min(15, tuckW * 0.4);

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    // Divisões longitudinais (ao longo de X)
    // 0: extremidade do tuck flap
    // xTuckCrease: dobra do tuck flap para a tampa
    // xLidRearCrease: dobra da tampa para a parede traseira
    // xRearBaseCrease: dobra da parede traseira para o fundo
    // xBaseFrontCrease: dobra do fundo para a parede frontal
    // xFrontEnd: borda final frontal
    const x0 = 0;
    const xTuckCrease = x0 + tuckW;
    const xLidRearCrease = xTuckCrease + B - c1;
    const xRearBaseCrease = xLidRearCrease + H + c1;
    const xBaseFrontCrease = xRearBaseCrease + B + c3;
    const xFrontEnd = xBaseFrontCrease + H;

    // Divisões transversais (ao longo de Y, centrado no corpo principal)
    // Corpo principal tem largura L
    const yCenter = 0;
    const yBodyBottom = yCenter - L / 2;
    const yBodyTop = yCenter + L / 2;

    // Abas de pó da parede traseira e frontal
    const yDustBottom = yBodyBottom - dustFlapH;
    const yDustTop = yBodyTop + dustFlapH;

    // Abas envolventes do fundo (base)
    const ySideWallBottomCrease = yBodyBottom - sideWallH;
    const ySideWallBottomEdge = ySideWallBottomCrease - rollOverW;
    const ySideWallTopCrease = yBodyTop + sideWallH;
    const ySideWallTopEdge = ySideWallTopCrease + rollOverW;

    // Chanfros de alívio nas abas de pó (desbaste a 45° ou 5mm)
    const chamfer = Math.min(8, dustFlapH * 0.2);

    // ==========================================
    // 1. VINCOS (CREASING)
    // ==========================================
    // Vincos longitudinais principais (verticais na chapa)
    // 1. Vinco do Tuck Flap
    segments.push({ x0: xTuckCrease, y0: yBodyBottom, x1: xTuckCrease, y1: yBodyTop, type: 'crease' });
    // 2. Vinco Tampa -> Parede Traseira
    segments.push({ x0: xLidRearCrease, y0: yBodyBottom, x1: xLidRearCrease, y1: yBodyTop, type: 'crease' });
    // 3. Vinco Parede Traseira -> Fundo
    segments.push({ x0: xRearBaseCrease, y0: yBodyBottom, x1: xRearBaseCrease, y1: yBodyTop, type: 'crease' });
    // 4. Vinco Fundo -> Parede Frontal
    segments.push({ x0: xBaseFrontCrease, y0: yBodyBottom, x1: xBaseFrontCrease, y1: yBodyTop, type: 'crease' });

    // Vincos transversais (horizontais na chapa)
    // Abas de pó na parede traseira
    segments.push({ x0: xLidRearCrease, y0: yBodyBottom, x1: xRearBaseCrease, y1: yBodyBottom, type: 'crease' });
    segments.push({ x0: xLidRearCrease, y0: yBodyTop, x1: xRearBaseCrease, y1: yBodyTop, type: 'crease' });

    // Abas envolventes no Fundo (Base) - Vinco raiz
    segments.push({ x0: xRearBaseCrease, y0: yBodyBottom, x1: xBaseFrontCrease, y1: yBodyBottom, type: 'crease' });
    segments.push({ x0: xRearBaseCrease, y0: yBodyTop, x1: xBaseFrontCrease, y1: yBodyTop, type: 'crease' });
    // Abas envolventes no Fundo - Vinco de retorno/roll-over
    segments.push({ x0: xRearBaseCrease + c1, y0: ySideWallBottomCrease, x1: xBaseFrontCrease - c1, y1: ySideWallBottomCrease, type: 'crease' });
    segments.push({ x0: xRearBaseCrease + c1, y0: ySideWallTopCrease, x1: xBaseFrontCrease - c1, y1: ySideWallTopCrease, type: 'crease' });

    // Abas de pó na parede frontal
    segments.push({ x0: xBaseFrontCrease, y0: yBodyBottom, x1: xFrontEnd, y1: yBodyBottom, type: 'crease' });
    segments.push({ x0: xBaseFrontCrease, y0: yBodyTop, x1: xFrontEnd, y1: yBodyTop, type: 'crease' });

    // ==========================================
    // 2. CORTES PERIMETRAIS (CUTTING)
    // ==========================================

    // A) ABA DE ENCAIXE (TUCK FLAP) - extremidade esquerda
    // Cantos arredondados no tuck
    if (cornerR > 0) {
      arcs.push({
        cx: x0 + cornerR,
        cy: yBodyBottom + cornerR,
        r: cornerR,
        startAngle: 180,
        endAngle: 270,
        type: 'cut',
      });
      arcs.push({
        cx: x0 + cornerR,
        cy: yBodyTop - cornerR,
        r: cornerR,
        startAngle: 90,
        endAngle: 180,
        type: 'cut',
      });
      // Linha reta da ponta do tuck flap
      segments.push({ x0: x0, y0: yBodyBottom + cornerR, x1: x0, y1: yBodyTop - cornerR, type: 'cut' });
      // Bordas superior e inferior do tuck flap
      segments.push({ x0: x0 + cornerR, y0: yBodyBottom, x1: xTuckCrease, y1: yBodyBottom, type: 'cut' });
      segments.push({ x0: x0 + cornerR, y0: yBodyTop, x1: xTuckCrease, y1: yBodyTop, type: 'cut' });
    } else {
      segments.push({ x0: x0, y0: yBodyBottom, x1: x0, y1: yBodyTop, type: 'cut' });
      segments.push({ x0: x0, y0: yBodyBottom, x1: xTuckCrease, y1: yBodyBottom, type: 'cut' });
      segments.push({ x0: x0, y0: yBodyTop, x1: xTuckCrease, y1: yBodyTop, type: 'cut' });
    }

    // B) BORDAS DA TAMPA (LID)
    // Entre xTuckCrease e xLidRearCrease a tampa tem corte reto
    segments.push({ x0: xTuckCrease, y0: yBodyBottom, x1: xLidRearCrease, y1: yBodyBottom, type: 'cut' });
    segments.push({ x0: xTuckCrease, y0: yBodyTop, x1: xLidRearCrease, y1: yBodyTop, type: 'cut' });

    // C) ABAS DE PÓ DA PAREDE TRASEIRA
    // Desbastes em ângulo nas bordas da aba de pó
    segments.push({ x0: xLidRearCrease, y0: yBodyBottom, x1: xLidRearCrease + chamfer, y1: yDustBottom, type: 'cut' });
    segments.push({ x0: xLidRearCrease + chamfer, y0: yDustBottom, x1: xRearBaseCrease - chamfer, y1: yDustBottom, type: 'cut' });
    segments.push({ x0: xRearBaseCrease - chamfer, y0: yDustBottom, x1: xRearBaseCrease, y1: yBodyBottom, type: 'cut' });

    segments.push({ x0: xLidRearCrease, y0: yBodyTop, x1: xLidRearCrease + chamfer, y1: yDustTop, type: 'cut' });
    segments.push({ x0: xLidRearCrease + chamfer, y0: yDustTop, x1: xRearBaseCrease - chamfer, y1: yDustTop, type: 'cut' });
    segments.push({ x0: xRearBaseCrease - chamfer, y0: yDustTop, x1: xRearBaseCrease, y1: yBodyTop, type: 'cut' });

    // D) ABAS ENVOLVENTES DA BASE (ROLL-OVER SIDE WALLS)
    // Entalhe de alívio no encontro entre as abas de pó e a parede lateral
    const relief = 3;
    // Borda inferior
    segments.push({ x0: xRearBaseCrease, y0: yBodyBottom, x1: xRearBaseCrease + relief, y1: ySideWallBottomCrease, type: 'cut' });
    segments.push({ x0: xRearBaseCrease + relief, y0: ySideWallBottomCrease, x1: xRearBaseCrease + relief + 5, y1: ySideWallBottomEdge, type: 'cut' });
    segments.push({ x0: xRearBaseCrease + relief + 5, y0: ySideWallBottomEdge, x1: xBaseFrontCrease - relief - 5, y1: ySideWallBottomEdge, type: 'cut' });
    segments.push({ x0: xBaseFrontCrease - relief - 5, y0: ySideWallBottomEdge, x1: xBaseFrontCrease - relief, y1: ySideWallBottomCrease, type: 'cut' });
    segments.push({ x0: xBaseFrontCrease - relief, y0: ySideWallBottomCrease, x1: xBaseFrontCrease, y1: yBodyBottom, type: 'cut' });

    // Borda superior
    segments.push({ x0: xRearBaseCrease, y0: yBodyTop, x1: xRearBaseCrease + relief, y1: ySideWallTopCrease, type: 'cut' });
    segments.push({ x0: xRearBaseCrease + relief, y0: ySideWallTopCrease, x1: xRearBaseCrease + relief + 5, y1: ySideWallTopEdge, type: 'cut' });
    segments.push({ x0: xRearBaseCrease + relief + 5, y0: ySideWallTopEdge, x1: xBaseFrontCrease - relief - 5, y1: ySideWallTopEdge, type: 'cut' });
    segments.push({ x0: xBaseFrontCrease - relief - 5, y0: ySideWallTopEdge, x1: xBaseFrontCrease - relief, y1: ySideWallTopCrease, type: 'cut' });
    segments.push({ x0: xBaseFrontCrease - relief, y0: ySideWallTopCrease, x1: xBaseFrontCrease, y1: yBodyTop, type: 'cut' });

    // E) ABAS DE PÓ DA PAREDE FRONTAL
    segments.push({ x0: xBaseFrontCrease, y0: yBodyBottom, x1: xBaseFrontCrease + chamfer, y1: yDustBottom, type: 'cut' });
    segments.push({ x0: xBaseFrontCrease + chamfer, y0: yDustBottom, x1: xFrontEnd - chamfer, y1: yDustBottom, type: 'cut' });
    segments.push({ x0: xFrontEnd - chamfer, y0: yDustBottom, x1: xFrontEnd, y1: yBodyBottom, type: 'cut' });

    segments.push({ x0: xBaseFrontCrease, y0: yBodyTop, x1: xBaseFrontCrease + chamfer, y1: yDustTop, type: 'cut' });
    segments.push({ x0: xBaseFrontCrease + chamfer, y0: yDustTop, x1: xFrontEnd - chamfer, y1: yDustTop, type: 'cut' });
    segments.push({ x0: xFrontEnd - chamfer, y0: yDustTop, x1: xFrontEnd, y1: yBodyTop, type: 'cut' });

    // F) EXTREMIDADE DA PAREDE FRONTAL (com entalhe para dedo / thumb notch)
    const notchR = 10;
    arcs.push({
      cx: xFrontEnd,
      cy: yCenter,
      r: notchR,
      startAngle: 90,
      endAngle: 270,
      type: 'cut',
    });
    segments.push({ x0: xFrontEnd, y0: yBodyBottom, x1: xFrontEnd, y1: yCenter - notchR, type: 'cut' });
    segments.push({ x0: xFrontEnd, y0: yCenter + notchR, x1: xFrontEnd, y1: yBodyTop, type: 'cut' });

    // ==========================================
    // 3. LINHAS DE COTA (DIMENSION LINES)
    // ==========================================
    const dimensions: DimensionLine[] = [
      {
        x0: xRearBaseCrease,
        y0: yBodyBottom - 30,
        x1: xBaseFrontCrease,
        y1: yBodyBottom - 30,
        text: `B = ${B} mm`,
        offset: -20,
      },
      {
        x0: xBaseFrontCrease + 25,
        y0: yBodyBottom,
        x1: xBaseFrontCrease + 25,
        y1: yBodyTop,
        text: `L = ${L} mm`,
        offset: 20,
        isVertical: true,
      },
      {
        x0: xRearBaseCrease,
        y0: yDustTop + 25,
        x1: xRearBaseCrease + sideWallH,
        y1: yDustTop + 25,
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
