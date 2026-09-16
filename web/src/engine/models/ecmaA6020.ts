import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine, BoundingBox2D } from '../types';

/**
 * ECMA A6020 - Caixa com Fundo Semi-Automático (Snap-Lock 1-2-3 / Auto-Bottom) e Tampa Superior de Inserção
 * Implementação paramétrica analítica nativa TypeScript 1:1.
 * 
 * Elimina qualquer descontinuidade ou degrau geométrico no 2D e permite alteração de todas as medidas em tempo real.
 */
export const ecmaA6020: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'ecmaA6020',
  id: 'ecma_a6020',
  code: 'ECMA A6020',
  name: 'Caixa Fundo Semi-Automático (Snap-Lock / 1-2-3)',
  category: 'ECMA',
  description:
    'Caixa de papelcartão dobrável (tubo) com fundo semi-automático de 4 abas intertraváveis e tampa superior tuck-in com abas de poeira laterais.',
  defaultParams: {
    L: 100,
    B: 50,
    H: 120,
    Ep: 0.5,
    M: 15,
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 40, max: 800, step: 1, unit: 'mm', description: 'Comprimento do painel frontal/traseiro' },
    { key: 'B', label: 'Largura (B)', min: 30, max: 500, step: 1, unit: 'mm', description: 'Largura dos painéis laterais' },
    { key: 'H', label: 'Altura (H)', min: 40, max: 800, step: 1, unit: 'mm', description: 'Altura útil do corpo da caixa' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.1, max: 2.5, step: 0.05, unit: 'mm', description: 'Espessura do papelcartão' },
    { key: 'M', label: 'Aba de Cola (M)', min: 10, max: 35, step: 1, unit: 'mm', description: 'Largura da aba de colagem lateral' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = Math.max(40, params.L || 100);
    const B = Math.max(30, params.B || 50);
    const H = Math.max(40, params.H || 120);
    const Ep = Math.max(0.1, params.Ep || 0.5);
    const M = Math.max(10, params.M || 15);

    // Fatores de escala proporcionais
    const scaleB = B / 50.0;
    const scaleL = L / 100.0;

    // Coordenadas horizontais X dos painéis
    const x0 = 0.0;
    const x1 = M;
    const x2 = x1 + L;
    const x3 = x2 + B;
    const x4 = x3 + L;
    const glueClearance = Math.min(0.5, Ep);
    const x5 = x4 + B - glueClearance;

    // Altura do corpo centrada em Y = 0
    const yTop = H / 2.0;
    const yBot = -H / 2.0;

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    // =========================================================================
    // 1. CORPO DA CAIXA & ABA DE COLA
    // =========================================================================
    // Vincos verticais entre paredes do tubo
    segments.push({ id: 'cr-v1', type: 'crease', x0: x1, y0: yBot, x1: x1, y1: yTop });
    segments.push({ id: 'cr-v2', type: 'crease', x0: x2, y0: yBot, x1: x2, y1: yTop });
    segments.push({ id: 'cr-v3', type: 'crease', x0: x3, y0: yBot, x1: x3, y1: yTop });
    segments.push({ id: 'cr-v4', type: 'crease', x0: x4, y0: yBot, x1: x4, y1: yTop });

    // Aba de colagem chanfrada (extrema esquerda)
    const cGlue = Math.min(15.0, H * 0.1);
    segments.push({ id: 'cut-g1', type: 'cut', x0: x1, y0: yTop, x1: x0, y1: yTop - cGlue });
    segments.push({ id: 'cut-g2', type: 'cut', x0: x0, y0: yTop - cGlue, x1: x0, y1: yBot + cGlue });
    segments.push({ id: 'cut-g3', type: 'cut', x0: x0, y0: yBot + cGlue, x1: x1, y1: yBot });

    // Borda extrema direita (Parede 4) - LINHA VERTICAL CONTÍNUA SEM NENHUM DEGRAU!
    segments.push({ id: 'cut-p4-right', type: 'cut', x0: x5, y0: yBot, x1: x5, y1: yTop });

    // Borda superior da Parede 1 (Frente)
    segments.push({ id: 'cut-p1-top', type: 'cut', x0: x1, y0: yTop, x1: x2, y1: yTop });

    // =========================================================================
    // 2. METADE SUPERIOR (TAMPA SUPERIOR E ABAS DE POEIRA)
    // =========================================================================
    const hDust = Math.min(B * 0.72, 50.0);
    const yDustTop = yTop + hDust;

    // --- Aba de Poeira Esquerda (Parede 2, entre x2 e x3) ---
    const dustInset = 3.0;
    segments.push({ id: 'cut-dust-l-inset', type: 'cut', x0: x2, y0: yTop, x1: x2 + dustInset, y1: yTop });
    segments.push({ id: 'cr-dust-l', type: 'crease', x0: x2 + dustInset, y0: yTop, x1: x3, y1: yTop });

    segments.push({ id: 'cut-dl1', type: 'cut', x0: x2 + dustInset, y0: yTop, x1: x2 + dustInset, y1: yTop + 5.0 });
    segments.push({ id: 'cut-dl2', type: 'cut', x0: x2 + dustInset, y0: yTop + 5.0, x1: x2 + dustInset + 1.0, y1: yTop + 6.0 });
    segments.push({ id: 'cut-dl3', type: 'cut', x0: x2 + dustInset + 1.0, y0: yTop + 6.0, x1: x2 + dustInset + 9.0 * scaleB, y1: yDustTop });
    segments.push({ id: 'cut-dl4', type: 'cut', x0: x2 + dustInset + 9.0 * scaleB, y0: yDustTop, x1: x3 - 6.5 * scaleB, y1: yDustTop });
    segments.push({ id: 'cut-dl5', type: 'cut', x0: x3 - 6.5 * scaleB, y0: yDustTop, x1: x3 - 3.0, y1: yTop + 3.0 });
    segments.push({ id: 'cut-dl6', type: 'cut', x0: x3 - 3.0, y0: yTop + 3.0, x1: x3, y1: yTop });

    // --- Tampa Superior (Parede 3, entre x3 e x4) ---
    const yLidCrease = yTop + 3.0; // Folga para espessura do cartão
    segments.push({ id: 'cr-lid', type: 'crease', x0: x3, y0: yLidCrease, x1: x4, y1: yLidCrease });
    segments.push({ id: 'cut-slit-l', type: 'cut', x0: x3, y0: yTop, x1: x3, y1: yLidCrease });
    segments.push({ id: 'cut-slit-r', type: 'cut', x0: x4, y0: yTop, x1: x4, y1: yLidCrease });

    const yLidTop = yLidCrease + B;
    segments.push({ id: 'cut-lid-l', type: 'cut', x0: x3, y0: yLidCrease, x1: x3, y1: yLidTop });
    segments.push({ id: 'cut-lid-r', type: 'cut', x0: x4, y0: yLidCrease, x1: x4, y1: yLidTop });

    // Aba de inserção da tampa (Tuck Flap)
    const insetTuck = Math.min(7.0, L * 0.07);
    const hTuck = Math.min(22.0, Math.max(15.0, B * 0.35));
    const yTuckCrease = yLidTop - 1.0;
    const yTuckTop = yLidTop + hTuck;

    segments.push({ id: 'cr-tuck', type: 'crease', x0: x3 + insetTuck, y0: yTuckCrease, x1: x4 - insetTuck, y1: yTuckCrease });

    // Locks e entalhes laterais da lingueta
    segments.push({ id: 'cut-tl1', type: 'cut', x0: x3, y0: yLidTop, x1: x3 + insetTuck, y1: yLidTop });
    segments.push({ id: 'cut-tl2', type: 'cut', x0: x3 + insetTuck, y0: yLidTop, x1: x3 + insetTuck, y1: yTuckCrease - 1.0 });
    segments.push({ id: 'cut-tl3', type: 'cut', x0: x4, y0: yLidTop, x1: x4 - insetTuck, y1: yLidTop });
    segments.push({ id: 'cut-tl4', type: 'cut', x0: x4 - insetTuck, y0: yLidTop, x1: x4 - insetTuck, y1: yTuckCrease - 1.0 });

    // Cantos arredondados tangentes da aba de inserção
    const rTuck = Math.min(22.0, Math.max(12.0, (L - 2 * insetTuck) / 3.0));
    arcs.push({
      id: 'arc-tuck-l',
      type: 'cut',
      cx: x3 + 25.0 * scaleL,
      cy: yLidTop + 0.5,
      r: rTuck,
      startAngle: 122.8,
      endAngle: 180.0,
    });
    arcs.push({
      id: 'arc-tuck-r',
      type: 'cut',
      cx: x4 - 25.0 * scaleL,
      cy: yLidTop + 0.5,
      r: rTuck,
      startAngle: 0.0,
      endAngle: 57.2,
    });
    segments.push({ id: 'cut-tuck-edge-l', type: 'cut', x0: x3 + 3.0, y0: yLidTop + 0.5, x1: x3 + 3.0, y1: yLidTop });
    segments.push({ id: 'cut-tuck-edge-r', type: 'cut', x0: x4 - 3.0, y0: yLidTop + 0.5, x1: x4 - 3.0, y1: yLidTop });
    segments.push({ id: 'cut-tuck-top', type: 'cut', x0: x3 + 13.0 + (L - 100) * 0.5, y0: yTuckTop, x1: x4 - 13.0 - (L - 100) * 0.5, y1: yTuckTop });

    // --- Aba de Poeira Direita (Parede 4, entre x4 e x5) ---
    const dustInsetR = 2.5;
    const xDustREnd = x5 - dustInsetR;
    segments.push({ id: 'cr-dust-r', type: 'crease', x0: x4, y0: yTop, x1: xDustREnd, y1: yTop });
    // CORTE HORIZONTAL DE RECUO: Une perfeitamente a aba à borda vertical x5!
    segments.push({ id: 'cut-dust-r-step', type: 'cut', x0: xDustREnd, y0: yTop, x1: x5, y1: yTop });

    segments.push({ id: 'cut-dr1', type: 'cut', x0: x4, y0: yTop, x1: x4 + 3.0, y1: yTop + 3.0 });
    segments.push({ id: 'cut-dr2', type: 'cut', x0: x4 + 3.0, y0: yTop + 3.0, x1: x4 + 6.5 * scaleB, y1: yDustTop });
    segments.push({ id: 'cut-dr3', type: 'cut', x0: x4 + 6.5 * scaleB, y0: yDustTop, x1: xDustREnd - 9.0 * scaleB, y1: yDustTop });
    segments.push({ id: 'cut-dr4', type: 'cut', x0: xDustREnd - 9.0 * scaleB, y0: yDustTop, x1: xDustREnd - 1.0, y1: yTop + 6.0 });
    segments.push({ id: 'cut-dr5', type: 'cut', x0: xDustREnd - 1.0, y0: yTop + 6.0, x1: xDustREnd, y1: yTop + 5.0 });
    segments.push({ id: 'cut-dr6', type: 'cut', x0: xDustREnd, y0: yTop + 5.0, x1: xDustREnd, y1: yTop });

    // =========================================================================
    // 3. METADE INFERIOR (FUNDO SEMI-AUTOMÁTICO SNAP-LOCK / 1-2-3 BOTTOM)
    // =========================================================================
    const hBot = Math.min(B * 0.72, 50.0);
    const yBotDeep = yBot - hBot;

    // Vincos horizontais na base das paredes
    segments.push({ id: 'cr-b1', type: 'crease', x0: x1, y0: yBot, x1: x2 - 1.0, y1: yBot });
    segments.push({ id: 'cr-b2', type: 'crease', x0: x2 + 1.0, y0: yBot, x1: x3, y1: yBot });
    segments.push({ id: 'cr-b3', type: 'crease', x0: x3, y0: yBot, x1: x4 - 1.0, y1: yBot });
    segments.push({ id: 'cr-b4', type: 'crease', x0: x4 + 1.0, y0: yBot, x1: x5, y1: yBot });

    // Alívios circulares nos cruzamentos x2 e x4
    arcs.push({ id: 'arc-punch-l', type: 'cut', cx: x2 + 0.07, cy: yBot - 0.4, r: 1.0, startAngle: 130.5, endAngle: 390.4 });
    arcs.push({ id: 'arc-punch-r', type: 'cut', cx: x4 + 0.07, cy: yBot - 0.4, r: 1.0, startAngle: 130.5, endAngle: 390.4 });

    // Aba de Fundo 1 (Parede 1, Frente): Gancho com vinco diagonal a 45°
    const diagW = Math.min(25.0 * scaleB, L * 0.4);
    segments.push({ id: 'cr-diag-1', type: 'crease', x0: x2 - 4.04, y0: yBot - 4.04, x1: x2 - diagW, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f1-1', type: 'cut', x0: x1, y0: yBot, x1: x1 + 6.35 * scaleL, y1: yBotDeep });
    segments.push({ id: 'cut-f1-2', type: 'cut', x0: x1 + 6.35 * scaleL, y0: yBotDeep, x1: x1 + 42.0 * scaleL, y1: yBotDeep });
    segments.push({ id: 'cut-f1-3', type: 'cut', x0: x1 + 42.0 * scaleL, y0: yBotDeep, x1: x1 + 50.0 * scaleL, y1: yBot - 28.0 * scaleB });
    segments.push({ id: 'cut-f1-4', type: 'cut', x0: x1 + 50.0 * scaleL, y0: yBot - 28.0 * scaleB, x1: x1 + 50.0 * scaleL, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f1-5', type: 'cut', x0: x1 + 50.0 * scaleL, y0: yBot - 25.0 * scaleB, x1: x2 - diagW, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f1-6', type: 'cut', x0: x2 - diagW, y0: yBot - 25.0 * scaleB, x1: x2 - 14.0 * scaleB, y1: yBotDeep });
    segments.push({ id: 'cut-f1-7', type: 'cut', x0: x2 - 14.0 * scaleB, y0: yBotDeep, x1: x2 - 1.5, y1: yBotDeep });
    segments.push({ id: 'cut-f1-8', type: 'cut', x0: x2 - 1.5, y0: yBotDeep, x1: x2 - 1.5, y1: yBot - 6.57 });
    segments.push({ id: 'cut-f1-9', type: 'cut', x0: x2 - 1.5, y0: yBot - 6.57, x1: x2 - 4.54, y1: yBot - 3.54 });
    segments.push({ id: 'cut-f1-10', type: 'cut', x0: x2 - 4.54, y0: yBot - 3.54, x1: x2 - 1.0, y1: yBot });

    // Aba de Fundo 2 (Parede 2, Lateral Esquerda): Aba trapezoidal
    segments.push({ id: 'cut-f2-1', type: 'cut', x0: x2 + 1.0, y0: yBot, x1: x2 + 10.1 * scaleB, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f2-2', type: 'cut', x0: x2 + 10.1 * scaleB, y0: yBot - 25.0 * scaleB, x1: x3 - 25.0 * scaleB, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f2-3', type: 'cut', x0: x3 - 25.0 * scaleB, y0: yBot - 25.0 * scaleB, x1: x3, y1: yBot });

    // Aba de Fundo 3 (Parede 3, Traseira): Gancho complementar com vinco diagonal
    segments.push({ id: 'cr-diag-3', type: 'crease', x0: x4 - 4.04, y0: yBot - 4.04, x1: x4 - diagW, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f3-1', type: 'cut', x0: x3, y0: yBot, x1: x3 + 6.35 * scaleL, y1: yBotDeep });
    segments.push({ id: 'cut-f3-2', type: 'cut', x0: x3 + 6.35 * scaleL, y0: yBotDeep, x1: x3 + 42.0 * scaleL, y1: yBotDeep });
    segments.push({ id: 'cut-f3-3', type: 'cut', x0: x3 + 42.0 * scaleL, y0: yBotDeep, x1: x3 + 50.0 * scaleL, y1: yBot - 28.0 * scaleB });
    segments.push({ id: 'cut-f3-4', type: 'cut', x0: x3 + 50.0 * scaleL, y0: yBot - 28.0 * scaleB, x1: x3 + 50.0 * scaleL, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f3-5', type: 'cut', x0: x3 + 50.0 * scaleL, y0: yBot - 25.0 * scaleB, x1: x4 - diagW, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f3-6', type: 'cut', x0: x4 - diagW, y0: yBot - 25.0 * scaleB, x1: x4 - 14.0 * scaleB, y1: yBotDeep });
    segments.push({ id: 'cut-f3-7', type: 'cut', x0: x4 - 14.0 * scaleB, y0: yBotDeep, x1: x4 - 1.5, y1: yBotDeep });
    segments.push({ id: 'cut-f3-8', type: 'cut', x0: x4 - 1.5, y0: yBotDeep, x1: x4 - 1.5, y1: yBot - 6.57 });
    segments.push({ id: 'cut-f3-9', type: 'cut', x0: x4 - 1.5, y0: yBot - 6.57, x1: x4 - 4.54, y1: yBot - 3.54 });
    segments.push({ id: 'cut-f3-10', type: 'cut', x0: x4 - 4.54, y0: yBot - 3.54, x1: x4 - 1.0, y1: yBot });

    // Aba de Fundo 4 (Parede 4, Lateral Direita): Aba trapezoidal lateral
    segments.push({ id: 'cut-f4-1', type: 'cut', x0: x4 + 1.0, y0: yBot, x1: x4 + 10.1 * scaleB, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f4-2', type: 'cut', x0: x4 + 10.1 * scaleB, y0: yBot - 25.0 * scaleB, x1: x5 - 25.0 * scaleB, y1: yBot - 25.0 * scaleB });
    segments.push({ id: 'cut-f4-3', type: 'cut', x0: x5 - 25.0 * scaleB, y0: yBot - 25.0 * scaleB, x1: x5, y1: yBot });

    // =========================================================================
    // BOUNDING BOX & COTAS TÉCNICAS DINÂMICAS
    // =========================================================================
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of segments) {
      if (s.x0 < minX) minX = s.x0;
      if (s.x1 < minX) minX = s.x1;
      if (s.x0 > maxX) maxX = s.x0;
      if (s.x1 > maxX) maxX = s.x1;
      if (s.y0 < minY) minY = s.y0;
      if (s.y1 < minY) minY = s.y1;
      if (s.y0 > maxY) maxY = s.y0;
      if (s.y1 > maxY) maxY = s.y1;
    }

    const bounds: BoundingBox2D = {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };

    const dimensions: DimensionLine[] = [
      { x0: x1, y0: yTop, x1: x2, y1: yTop, text: `L = ${L} mm`, offset: 15 },
      { x0: x2, y0: yTop, x1: x3, y1: yTop, text: `B = ${B} mm`, offset: 15 },
      { x0: x1, y0: yBot, x1: x1, y1: yTop, text: `H = ${H} mm`, offset: -25, isVertical: true },
      { x0: minX, y0: minY - 20, x1: maxX, y1: minY - 20, text: `Total: ${Math.round(bounds.width)} mm` },
      { x0: minX - 35, y0: minY, x1: minX - 35, y1: maxY, text: `Total: ${Math.round(bounds.height)} mm`, isVertical: true },
    ];

    return {
      segments,
      arcs,
      dimensions,
      bounds,
    };
  },
};
