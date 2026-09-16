import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine, BoundingBox2D } from '../types';

/**
 * ECMA A0115 - Cartucho Tubular com Aba Superior Display e Orifícios de Travamento
 * Modelo nativo analítico de alta fidelidade com parametrização em tempo real e cotas técnicas completas.
 */
export const ecmaA0115: PackagingModel = {
  id: 'ecma_a0115',
  code: 'ECMA A0115',
  name: 'Cartucho com Display e Furos de Travamento (ECMA A0115)',
  description: 'Cartucho tubular colado com extensão superior de apoio/display dotada de orifícios elásticos duplos de retenção para frascos ou produtos cilíndricos.',
  category: 'ECMA',
  isFoldable: true,
  status: 'PASS',
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  defaultParams: {
    L: 150,
    B: 100,
    H: 200,
    Ep: 0.5,
    M: 20,
    d: 30, // Diâmetro dos furos de retenção
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 60, max: 600, step: 5, unit: 'mm', description: 'Comprimento frontal do cartucho' },
    { key: 'B', label: 'Largura (B)', min: 40, max: 400, step: 5, unit: 'mm', description: 'Largura lateral / profundidade do cartucho' },
    { key: 'H', label: 'Altura (H)', min: 60, max: 800, step: 5, unit: 'mm', description: 'Altura do corpo do cartucho' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.1, max: 2.0, step: 0.05, unit: 'mm', description: 'Espessura do cartão' },
    { key: 'M', label: 'Aba de Cola (M)', min: 12, max: 35, step: 1, unit: 'mm', description: 'Largura da aba de colagem' },
    { key: 'd', label: 'Diâmetro Furos (d)', min: 15, max: 60, step: 2, unit: 'mm', description: 'Diâmetro dos orifícios de retenção' },
  ],
  calculate: (params: Record<string, number>): DielineResult => {
    const L = Math.max(40, params.L || 150);
    const B = Math.max(30, params.B || 100);
    const H = Math.max(40, params.H || 200);
    const M = Math.max(10, params.M || 20);
    const holeD = Math.max(10, Math.min(params.d || 30, L * 0.4));
    const holeR = holeD / 2;

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];
    const dimensions: DimensionLine[] = [];

    // Divisões em X: [0: Aba M] [x1: Painel 1 (L)] [x2: Painel 2 (B)] [x3: Painel 3 (L)] [x4: Painel 4 (B)]
    const x0 = 0;
    const x1 = M;
    const x2 = x1 + L;
    const x3 = x2 + B;
    const x4 = x3 + L;
    const x5 = x4 + B;

    // Alturas em Y:
    // Fundo inferior: y = 0 é a linha de base do corpo
    // Fundo com aba de inserção / fundo semi-automático:
    const flapBotH = Math.min(B * 0.75, 80);
    const yBotFlap = -flapBotH;
    const y0 = 0;         // Linha de vinco base
    const y1 = H;         // Linha de vinco superior do corpo

    // Altura das abas superiores
    const dustFlapH = Math.min(B * 0.5, 60);
    const displayH = Math.max(B + 20, 100);
    const yDisplayTop = y1 + displayH;

    // 1. VINCOS PRINCIPAIS DO CORPO
    // Vincos verticais entre os painéis
    segments.push({ id: 'c-v-glue', type: 'crease', x0: x1, y0: y0, x1: x1, y1: y1 });
    segments.push({ id: 'c-v-p12',  type: 'crease', x0: x2, y0: y0, x1: x2, y1: y1 });
    segments.push({ id: 'c-v-p23',  type: 'crease', x0: x3, y0: y0, x1: x3, y1: y1 });
    segments.push({ id: 'c-v-p34',  type: 'crease', x0: x4, y0: y0, x1: x4, y1: y1 });

    // Vincos horizontais do corpo
    // Base inferior (Y = 0)
    segments.push({ id: 'c-h-bot-1', type: 'crease', x0: x1, y0: y0, x1: x2, y1: y0 });
    segments.push({ id: 'c-h-bot-2', type: 'crease', x0: x2, y0: y0, x1: x3, y1: y0 });
    segments.push({ id: 'c-h-bot-3', type: 'crease', x0: x3, y0: y0, x1: x4, y1: y0 });
    segments.push({ id: 'c-h-bot-4', type: 'crease', x0: x4, y0: y0, x1: x5, y1: y0 });

    // Topo superior (Y = H)
    segments.push({ id: 'c-h-top-1', type: 'crease', x0: x1, y0: y1, x1: x2, y1: y1 });
    segments.push({ id: 'c-h-top-2', type: 'crease', x0: x2, y0: y1, x1: x3, y1: y1 });
    segments.push({ id: 'c-h-top-3', type: 'crease', x0: x3, y0: y1, x1: x4, y1: y1 });
    segments.push({ id: 'c-h-top-4', type: 'crease', x0: x4, y0: y1, x1: x5, y1: y1 });

    // 2. ABA DE COLAGEM LATERAL (M)
    const glueChamfer = Math.min(M * 0.5, 10);
    segments.push({ id: 'cut-glue-bot',  type: 'cut', x0: x1, y0: y0, x1: x0, y1: y0 + glueChamfer });
    segments.push({ id: 'cut-glue-edge', type: 'cut', x0: x0, y0: y0 + glueChamfer, x1: x0, y1: y1 - glueChamfer });
    segments.push({ id: 'cut-glue-top',  type: 'cut', x0: x0, y1: y1, x1: x1, y0: y1 - glueChamfer });

    // 3. EXTREMIDADE DIREITA DO CORPO
    segments.push({ id: 'cut-body-right', type: 'cut', x0: x5, y0: y0, x1: x5, y1: y1 });

    // 4. ABAS INFERIORES DE FECHAMENTO (FUNDO)
    // Aba do Painel 1 (Fundo com chanfros de inserção)
    const tuckH = Math.min(15, flapBotH * 0.3);
    segments.push({ id: 'cut-bot-p1-l', type: 'cut', x0: x1, y0: y0, x1: x1 + 2, y1: yBotFlap + tuckH });
    segments.push({ id: 'cut-bot-p1-c1', type: 'cut', x0: x1 + 2, y0: yBotFlap + tuckH, x1: x1 + 8, y1: yBotFlap });
    segments.push({ id: 'cut-bot-p1-b',  type: 'cut', x0: x1 + 8, y0: yBotFlap, x1: x2 - 8, y1: yBotFlap });
    segments.push({ id: 'cut-bot-p1-c2', type: 'cut', x0: x2 - 8, y0: yBotFlap, x1: x2 - 2, y1: yBotFlap + tuckH });
    segments.push({ id: 'cut-bot-p1-r',  type: 'cut', x0: x2 - 2, y0: yBotFlap + tuckH, x1: x2, y1: y0 });

    // Abas de poeira inferiores dos Painéis 2 e 4
    const dustBotH = Math.min(B * 0.4, flapBotH);
    // Painel 2
    segments.push({ id: 'cut-bot-p2-l', type: 'cut', x0: x2, y0: y0, x1: x2 + 5, y1: -dustBotH });
    segments.push({ id: 'cut-bot-p2-b', type: 'cut', x0: x2 + 5, y0: -dustBotH, x1: x3 - 5, y1: -dustBotH });
    segments.push({ id: 'cut-bot-p2-r', type: 'cut', x0: x3 - 5, y0: -dustBotH, x1: x3, y1: y0 });
    // Painel 3
    segments.push({ id: 'cut-bot-p3-l', type: 'cut', x0: x3, y0: y0, x1: x3 + 2, y1: yBotFlap + tuckH });
    segments.push({ id: 'cut-bot-p3-b', type: 'cut', x0: x3 + 2, y0: yBotFlap + tuckH, x1: x4 - 2, y1: yBotFlap + tuckH });
    segments.push({ id: 'cut-bot-p3-r', type: 'cut', x0: x4 - 2, y0: yBotFlap + tuckH, x1: x4, y1: y0 });
    // Painel 4
    segments.push({ id: 'cut-bot-p4-l', type: 'cut', x0: x4, y0: y0, x1: x4 + 5, y1: -dustBotH });
    segments.push({ id: 'cut-bot-p4-b', type: 'cut', x0: x4 + 5, y0: -dustBotH, x1: x5 - 5, y1: -dustBotH });
    segments.push({ id: 'cut-bot-p4-r', type: 'cut', x0: x5 - 5, y0: -dustBotH, x1: x5, y1: y0 });

    // 5. ABAS SUPERIORES
    // Painel 1: Aba superior de apoio
    const p1TopH = Math.min(dustFlapH * 0.9, 45);
    segments.push({ id: 'cut-top-p1-l', type: 'cut', x0: x1, y0: y1, x1: x1 + 3, y1: y1 + p1TopH });
    segments.push({ id: 'cut-top-p1-t', type: 'cut', x0: x1 + 3, y0: y1 + p1TopH, x1: x2 - 3, y1: y1 + p1TopH });
    segments.push({ id: 'cut-top-p1-r', type: 'cut', x0: x2 - 3, y0: y1 + p1TopH, x1: x2, y1: y1 });

    // Painel 2: Aba de poeira
    segments.push({ id: 'cut-top-p2-l', type: 'cut', x0: x2, y0: y1, x1: x2 + 4, y1: y1 + dustFlapH });
    segments.push({ id: 'cut-top-p2-t', type: 'cut', x0: x2 + 4, y0: y1 + dustFlapH, x1: x3 - 4, y1: y1 + dustFlapH });
    segments.push({ id: 'cut-top-p2-r', type: 'cut', x0: x3 - 4, y0: y1 + dustFlapH, x1: x3, y1: y1 });

    // Painel 4: Aba de poeira
    segments.push({ id: 'cut-top-p4-l', type: 'cut', x0: x4, y0: y1, x1: x4 + 4, y1: y1 + dustFlapH });
    segments.push({ id: 'cut-top-p4-t', type: 'cut', x0: x4 + 4, y0: y1 + dustFlapH, x1: x5 - 4, y1: y1 + dustFlapH });
    segments.push({ id: 'cut-top-p4-r', type: 'cut', x0: x5 - 4, y0: y1 + dustFlapH, x1: x5, y1: y1 });

    // 6. PAINEL 3: DISPLAY SUPERIOR COM CANTOS ARREDONDADOS E DOIS ORIFÍCIOS DE RETENÇÃO
    const cornerR = Math.min(25, L * 0.2, displayH * 0.3);

    // Laterais verticais do display
    segments.push({ id: 'cut-disp-left',  type: 'cut', x0: x3, y0: y1, x1: x3, y1: yDisplayTop - cornerR });
    segments.push({ id: 'cut-disp-right', type: 'cut', x0: x4, y0: y1, x1: x4, y1: yDisplayTop - cornerR });

    // Arcos de concordância dos cantos superiores
    // Canto esquerdo: centro (x3 + cornerR, yDisplayTop - cornerR), de 90 a 180 graus
    arcs.push({
      id: 'arc-disp-top-left',
      type: 'cut',
      cx: x3 + cornerR,
      cy: yDisplayTop - cornerR,
      r: cornerR,
      startAngle: 90,
      endAngle: 180,
    });
    // Linha reta do topo entre os dois arcos
    segments.push({
      id: 'cut-disp-top-straight',
      type: 'cut',
      x0: x3 + cornerR,
      y0: yDisplayTop,
      x1: x4 - cornerR,
      y1: yDisplayTop,
    });
    // Canto direito: centro (x4 - cornerR, yDisplayTop - cornerR), de 0 a 90 graus
    arcs.push({
      id: 'arc-disp-top-right',
      type: 'cut',
      cx: x4 - cornerR,
      cy: yDisplayTop - cornerR,
      r: cornerR,
      startAngle: 0,
      endAngle: 90,
    });

    // Vinco intermediário opcional de dobra da tampa/display (se dobrar para trás a 90 graus)
    const yDispFold = y1 + B;
    if (yDispFold < yDisplayTop - 15) {
      segments.push({ id: 'crease-disp-fold', type: 'crease', x0: x3, y0: yDispFold, x1: x4, y1: yDispFold });
    }

    // 7. DOIS ORIFÍCIOS DE RETENÇÃO DE PRODUTO / GARGALO (DUAL LOCK SLOTS)
    // Posicionados de forma harmoniosa no centro do Painel 3
    const dispMidX = (x3 + x4) / 2;
    const holeSpacingY = Math.min(displayH * 0.35, 45);
    const holeY1 = y1 + (displayH * 0.4);
    const holeY2 = holeY1 + holeSpacingY;

    const holeCenters = [holeY1, holeY2];
    holeCenters.forEach((hy, hIdx) => {
      // Círculo central vazado ou com flaps em cruz elástica
      arcs.push({
        id: `arc-hole-${hIdx}-full`,
        type: 'cut',
        cx: dispMidX,
        cy: hy,
        r: holeR,
        startAngle: 0,
        endAngle: 360,
      });

      // Ranhuras horizontais elásticas de alívio (flaps flexíveis para o gargalo)
      const slotArm = holeR * 1.5;
      segments.push({
        id: `cut-hole-${hIdx}-slot-l`,
        type: 'cut',
        x0: dispMidX - slotArm,
        y0: hy,
        x1: dispMidX - holeR,
        y1: hy,
      });
      segments.push({
        id: `cut-hole-${hIdx}-slot-r`,
        type: 'cut',
        x0: dispMidX + holeR,
        y0: hy,
        x1: dispMidX + slotArm,
        y1: hy,
      });

      // Flaps de abertura em formato de trapézio suave
      const flapAngleH = holeR * 0.6;
      segments.push({
        id: `cut-hole-${hIdx}-fl1`,
        type: 'cut',
        x0: dispMidX - flapAngleH,
        y0: hy + holeR * 0.8,
        x1: dispMidX - flapAngleH * 1.8,
        y1: hy + holeR * 0.8,
      });
      segments.push({
        id: `cut-hole-${hIdx}-fl2`,
        type: 'cut',
        x0: dispMidX + flapAngleH,
        y0: hy + holeR * 0.8,
        x1: dispMidX + flapAngleH * 1.8,
        y1: hy + holeR * 0.8,
      });
    });

    // 8. CÁLCULO DE BOUNDING BOX
    let minX = 0;
    let maxX = x5;
    let minY = yBotFlap;
    let maxY = yDisplayTop;

    const bounds: BoundingBox2D = {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };

    // 9. COTAS TÉCNICAS NAS ABAS E PAINÉIS
    const dimYTop = maxY + 15;
    // Cota Aba Cola M
    dimensions.push({ x0: x0, y0: dimYTop, x1: x1, y1: dimYTop, text: `M: ${Math.round(M)} mm`, offset: 10 });
    // Cota Painel 1 (L)
    dimensions.push({ x0: x1, y0: dimYTop, x1: x2, y1: dimYTop, text: `L = ${Math.round(L)} mm`, offset: 10 });
    // Cota Painel 2 (B)
    dimensions.push({ x0: x2, y0: dimYTop, x1: x3, y1: dimYTop, text: `B = ${Math.round(B)} mm`, offset: 10 });
    // Cota Painel 3 (L)
    dimensions.push({ x0: x3, y0: dimYTop, x1: x4, y1: dimYTop, text: `L = ${Math.round(L)} mm`, offset: 10 });
    // Cota Painel 4 (B)
    dimensions.push({ x0: x4, y0: dimYTop, x1: x5, y1: dimYTop, text: `B = ${Math.round(B)} mm`, offset: 10 });

    // Cotas Verticais
    const dimXLeft = minX - 18;
    // Cota do Fundo
    dimensions.push({ x0: dimXLeft, y0: minY, x1: dimXLeft, y1: y0, text: `Fundo: ${Math.round(flapBotH)} mm`, isVertical: true, offset: 10 });
    // Cota do Corpo Principal (H)
    dimensions.push({ x0: dimXLeft, y0: y0, x1: dimXLeft, y1: y1, text: `H = ${Math.round(H)} mm`, isVertical: true, offset: 10 });
    // Cota do Display Superior
    dimensions.push({ x0: dimXLeft, y0: y1, x1: dimXLeft, y1: maxY, text: `Display: ${Math.round(displayH)} mm`, isVertical: true, offset: 10 });

    // Cotas Globais de Formato Mínimo
    dimensions.push({
      x0: minX,
      y0: minY - 28,
      x1: maxX,
      y1: minY - 28,
      text: `Total: ${Math.round(bounds.width)} mm`,
      offset: 20,
    });
    dimensions.push({
      x0: minX - 38,
      y0: minY,
      x1: minX - 38,
      y1: maxY,
      text: `Total: ${Math.round(bounds.height)} mm`,
      isVertical: true,
      offset: 20,
    });

    return {
      segments,
      arcs,
      dimensions,
      bounds,
    };
  },
};
