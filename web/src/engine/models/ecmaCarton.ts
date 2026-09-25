import type { PackagingModel, DielineResult, Segment2D, DimensionLine, BoundingBox2D } from '../types';

export const ecmaB10: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'ecmaB10',
  id: 'ecma_b10',
  code: 'ECMA B10',
  name: 'Cartucho com Abas Opostas (Tuck-in Reverso)',
  category: 'ECMA',
  description: 'Padrão mundial para caixas de remédios, cosméticos e alimentos em papel-cartão. As abas de fechamento entram em lados opostos.',
  defaultParams: {
    L: 80,   // Frente (mm)
    B: 50,   // Lateral (mm)
    H: 140,  // Altura (mm)
    Ep: 0.5, // Espessura do cartão (mm)
    M: 15,   // Aba de colagem (mm)
    T: 18,   // Aba de encaixe / Tuck-in (mm)
    P: 28,   // Abas de poeira laterais (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento / Frente (L)', min: 30, max: 400, step: 1, unit: 'mm', description: 'Comprimento frontal' },
    { key: 'B', label: 'Largura / Lateral (B)', min: 20, max: 300, step: 1, unit: 'mm', description: 'Profundidade da lateral' },
    { key: 'H', label: 'Altura (H)', min: 40, max: 500, step: 1, unit: 'mm', description: 'Altura total da embalagem' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.1, max: 2.0, step: 0.05, unit: 'mm', description: 'Caliper do cartão (a partir de 0,1mm)' },
    { key: 'M', label: 'Aba de Cola (M)', min: 10, max: 40, step: 1, unit: 'mm', description: 'Aba lateral colada' },
    { key: 'T', label: 'Aba de Encaixe / Tuck (T)', min: 8, max: 60, step: 1, unit: 'mm', description: 'Aba de fechamento superior/inferior' },
    { key: 'P', label: 'Abas de Poeira / Laterais (P)', min: 10, max: 80, step: 1, unit: 'mm', description: 'Abas laterais (Dust Flaps)' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 80;
    const B = params.B || 50;
    const H = params.H || 140;
    const M = params.M || 15;

    // Aba tuck-in (encaixe da tampa) e abas de poeira laterais
    const tuck = params.T ?? Math.max(15, Math.min(B * 0.4, 25));
    const dustFlapH = params.P ?? (B * 0.55);

    const segments: Segment2D[] = [];

    // Coordenadas X: Aba Cola (M), Painel 1 (B), Painel 2 (L), Painel 3 (B), Painel 4 (L)
    const x0 = 0;
    const x1 = M;
    const x2 = x1 + B;
    const x3 = x2 + L;
    const x4 = x3 + B;
    const x5 = x4 + L;

    // Coordenadas Y:
    // Base tuck flap inferior
    const yBotTuck = 0;
    const yBotLidCrease = yBotTuck + tuck;
    const yBotBodyCrease = yBotLidCrease + B;
    const yTopBodyCrease = yBotBodyCrease + H;
    const yTopLidCrease = yTopBodyCrease + B;
    const yTopTuck = yTopLidCrease + tuck;

    // 1. CORPO PRINCIPAL - VINCOS VERTICAIS
    segments.push({ x0: x1, y0: yBotBodyCrease, x1: x1, y1: yTopBodyCrease, type: 'crease' });
    segments.push({ x0: x2, y0: yBotBodyCrease, x1: x2, y1: yTopBodyCrease, type: 'crease' });
    segments.push({ x0: x3, y0: yBotBodyCrease, x1: x3, y1: yTopBodyCrease, type: 'crease' });
    segments.push({ x0: x4, y0: yBotBodyCrease, x1: x4, y1: yTopBodyCrease, type: 'crease' });

    // VINCOS HORIZONTAIS
    segments.push({ x0: x1, y0: yBotBodyCrease, x1: x5, y1: yBotBodyCrease, type: 'crease' });
    segments.push({ x0: x1, y0: yTopBodyCrease, x1: x5, y1: yTopBodyCrease, type: 'crease' });

    // 2. ABA DE COLA LATERAL
    const chamfer = 6;
    segments.push({ x0: x1, y0: yTopBodyCrease, x1: x0, y1: yTopBodyCrease - chamfer, type: 'cut' });
    segments.push({ x0: x0, y0: yTopBodyCrease - chamfer, x1: x0, y1: yBotBodyCrease + chamfer, type: 'cut' });
    segments.push({ x0: x0, y0: yBotBodyCrease + chamfer, x1: x1, y1: yBotBodyCrease, type: 'cut' });

    // 3. TAMPA SUPERIOR (No Painel 2: x2 -> x3)
    segments.push({ x0: x2, y0: yTopLidCrease, x1: x3, y1: yTopLidCrease, type: 'crease' }); // Vinco da aba de encaixe
    segments.push({ x0: x2, y0: yTopBodyCrease, x1: x2, y1: yTopLidCrease, type: 'cut' });
    segments.push({ x0: x3, y0: yTopBodyCrease, x1: x3, y1: yTopLidCrease, type: 'cut' });

    // Aba tuck superior com cantos arredondados/chanfrados
    const tc = 8;
    segments.push({ x0: x2, y0: yTopLidCrease, x1: x2 + tc, y1: yTopTuck, type: 'cut' });
    segments.push({ x0: x2 + tc, y0: yTopTuck, x1: x3 - tc, y1: yTopTuck, type: 'cut' });
    segments.push({ x0: x3 - tc, y0: yTopTuck, x1: x3, y1: yTopLidCrease, type: 'cut' });

    // Abas de poeira superiores (Painéis 1 e 3)
    const dustCut = (startX: number, endX: number) => {
      segments.push({ x0: startX, y0: yTopBodyCrease, x1: startX + 3, y1: yTopBodyCrease + dustFlapH, type: 'cut' });
      segments.push({ x0: startX + 3, y0: yTopBodyCrease + dustFlapH, x1: endX - 3, y1: yTopBodyCrease + dustFlapH, type: 'cut' });
      segments.push({ x0: endX - 3, y0: yTopBodyCrease + dustFlapH, x1: endX, y1: yTopBodyCrease, type: 'cut' });
    };
    dustCut(x1, x2);
    dustCut(x3, x4);

    // Topo do painel 4 (Corte liso)
    segments.push({ x0: x4, y0: yTopBodyCrease, x1: x5, y1: yTopBodyCrease, type: 'cut' });

    // 4. TAMPA INFERIOR REVERSA (No Painel 4: x4 -> x5)
    segments.push({ x0: x4, y0: yBotLidCrease, x1: x5, y1: yBotLidCrease, type: 'crease' });
    segments.push({ x0: x4, y0: yBotBodyCrease, x1: x4, y1: yBotLidCrease, type: 'cut' });
    segments.push({ x0: x5, y0: yBotBodyCrease, x1: x5, y1: yBotLidCrease, type: 'cut' });

    // Aba tuck inferior
    segments.push({ x0: x4, y0: yBotLidCrease, x1: x4 + tc, y1: yBotTuck, type: 'cut' });
    segments.push({ x0: x4 + tc, y0: yBotTuck, x1: x5 - tc, y1: yBotTuck, type: 'cut' });
    segments.push({ x0: x5 - tc, y0: yBotTuck, x1: x5, y1: yBotLidCrease, type: 'cut' });

    // Abas de poeira inferiores (Painéis 1 e 3)
    const dustBotCut = (startX: number, endX: number) => {
      segments.push({ x0: startX, y0: yBotBodyCrease, x1: startX + 3, y1: yBotBodyCrease - dustFlapH, type: 'cut' });
      segments.push({ x0: startX + 3, y0: yBotBodyCrease - dustFlapH, x1: endX - 3, y1: yBotBodyCrease - dustFlapH, type: 'cut' });
      segments.push({ x0: endX - 3, y0: yBotBodyCrease - dustFlapH, x1: endX, y1: yBotBodyCrease, type: 'cut' });
    };
    dustBotCut(x1, x2);
    dustBotCut(x3, x4);

    // Base do painel 2 (Corte liso)
    segments.push({ x0: x2, y0: yBotBodyCrease, x1: x3, y1: yBotBodyCrease, type: 'cut' });

    // Borda externa direita
    segments.push({ x0: x5, y0: yBotBodyCrease, x1: x5, y1: yTopBodyCrease, type: 'cut' });

    // Cotas
    const dimensions: DimensionLine[] = [
      { x0: x2, y0: yTopBodyCrease, x1: x3, y1: yTopBodyCrease, text: `L = ${L} mm`, offset: 20 },
      { x0: x1, y0: yTopBodyCrease, x1: x2, y1: yTopBodyCrease, text: `B = ${B} mm`, offset: 20 },
      { x0: x5, y0: yBotBodyCrease, x1: x5, y1: yTopBodyCrease, text: `H = ${H} mm`, offset: 25, isVertical: true },
    ];

    const bounds: BoundingBox2D = {
      minX: 0,
      minY: 0,
      maxX: x5,
      maxY: yTopTuck,
      width: x5,
      height: yTopTuck,
    };

    return {
      segments,
      arcs: [],
      dimensions,
      bounds,
    };
  },
};
