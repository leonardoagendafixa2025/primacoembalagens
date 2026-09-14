import type { PackagingModel, DielineResult, Segment2D, DimensionLine } from '../types';
import { computeBoundingBox, normalizeGeometry } from '../geometry';

export const ecmaB1001: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'ecmaB1001',
  id: 'ecma_b1001',
  code: 'ECMA B10.01',
  name: 'Bandeja Dobrável com Trava (Tray Lock)',
  category: 'ECMA',
  description:
    'Modelo padrão da associação europeia ECMA (B10.01). Bandeja dobrável de papel cartão com abas e linguetas de travamento automático sem necessidade de cola.',
  defaultParams: {
    L: 200, // A no original (Comprimento interior)
    B: 140, // B no original (Largura interior)
    H: 50,  // H no original (Altura interior)
    Ep: 0.6, // ep1 (Espessura do cartão)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (A)', min: 60, max: 800, step: 5, unit: 'mm', description: 'Comprimento da base interna' },
    { key: 'B', label: 'Largura (B)', min: 40, max: 600, step: 5, unit: 'mm', description: 'Largura da base interna' },
    { key: 'H', label: 'Altura (H)', min: 20, max: 200, step: 2, unit: 'mm', description: 'Profundidade da bandeja' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.3, max: 2.0, step: 0.1, unit: 'mm', description: 'Espessura do papel cartão (caliper)' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const A = params.L || 200;
    const B = params.B || 140;
    const H = params.H || 50;
    const ep1 = params.Ep || 0.6;
    const ch2 = 8; // Chanfro das abas

    // Fórmulas originais C# de ecma_b1001_source.cs
    let Hbt = B / 6;
    let Btuck = B / 6;
    const Htuck = ep1 + 2;
    if (Hbt + Btuck > B / 2) Hbt = B / 2;
    if (Hbt + Btuck > B / 2) Btuck = B / 2;
    let F1 = H;
    if (H > B / 2) F1 = B / 2;

    const segments: Segment2D[] = [];

    // Fundo central da bandeja: [0, B] x [0, A]
    const xBaseLeft = H + H;
    const xBaseRight = xBaseLeft + B;
    const yBaseBottom = Htuck + H + H;
    const yBaseTop = yBaseBottom + A;

    // Vincos da base retangular
    segments.push({ x0: xBaseLeft, y0: yBaseBottom, x1: xBaseRight, y1: yBaseBottom, type: 'crease' });
    segments.push({ x0: xBaseLeft, y0: yBaseTop, x1: xBaseRight, y1: yBaseTop, type: 'crease' });
    segments.push({ x0: xBaseLeft, y0: yBaseBottom, x1: xBaseLeft, y1: yBaseTop, type: 'crease' });
    segments.push({ x0: xBaseRight, y0: yBaseBottom, x1: xBaseRight, y1: yBaseTop, type: 'crease' });

    // Parede Superior e Parede Dupla
    const yWallTopCrease = yBaseTop + H;
    const yWallTopEdge = yWallTopCrease + H + Htuck;
    segments.push({ x0: xBaseLeft, y0: yWallTopCrease, x1: xBaseRight, y1: yWallTopCrease, type: 'crease' });

    // Travas da parede superior
    segments.push({ x0: xBaseLeft, y0: yBaseTop, x1: xBaseLeft, y1: yWallTopCrease, type: 'cut' });
    segments.push({ x0: xBaseRight, y0: yBaseTop, x1: xBaseRight, y1: yWallTopCrease, type: 'cut' });

    // Aba de engate superior com linguetas de trava
    segments.push({ x0: xBaseLeft, y0: yWallTopCrease, x1: xBaseLeft + ch2, y1: yWallTopEdge, type: 'cut' });
    segments.push({ x0: xBaseLeft + ch2, y0: yWallTopEdge, x1: xBaseRight - ch2, y1: yWallTopEdge, type: 'cut' });
    segments.push({ x0: xBaseRight - ch2, y0: yWallTopEdge, x1: xBaseRight, y1: yWallTopCrease, type: 'cut' });

    // Frestas de encaixe no vinco da base superior (slots de travamento da lingueta)
    segments.push({ x0: xBaseLeft + Hbt, y0: yBaseTop, x1: xBaseLeft + Hbt + Htuck, y1: yBaseTop - Htuck, type: 'cut' });
    segments.push({ x0: xBaseLeft + Hbt + Htuck, y0: yBaseTop - Htuck, x1: xBaseLeft + Hbt + Btuck - Htuck, y1: yBaseTop - Htuck, type: 'cut' });
    segments.push({ x0: xBaseLeft + Hbt + Btuck - Htuck, y0: yBaseTop - Htuck, x1: xBaseLeft + Hbt + Btuck, y1: yBaseTop, type: 'cut' });

    segments.push({ x0: xBaseRight - Hbt - Btuck, y0: yBaseTop, x1: xBaseRight - Hbt - Btuck + Htuck, y1: yBaseTop - Htuck, type: 'cut' });
    segments.push({ x0: xBaseRight - Hbt - Btuck + Htuck, y0: yBaseTop - Htuck, x1: xBaseRight - Hbt - Htuck, y1: yBaseTop - Htuck, type: 'cut' });
    segments.push({ x0: xBaseRight - Hbt - Htuck, y0: yBaseTop - Htuck, x1: xBaseRight - Hbt, y1: yBaseTop, type: 'cut' });

    // Parede Inferior e Parede Dupla
    const yWallBottomCrease = yBaseBottom - H;
    const yWallBottomEdge = yWallBottomCrease - H - Htuck;
    segments.push({ x0: xBaseLeft, y0: yWallBottomCrease, x1: xBaseRight, y1: yWallBottomCrease, type: 'crease' });

    segments.push({ x0: xBaseLeft, y0: yBaseBottom, x1: xBaseLeft, y1: yWallBottomCrease, type: 'cut' });
    segments.push({ x0: xBaseRight, y0: yBaseBottom, x1: xBaseRight, y1: yWallBottomCrease, type: 'cut' });

    segments.push({ x0: xBaseLeft, y0: yWallBottomCrease, x1: xBaseLeft + ch2, y1: yWallBottomEdge, type: 'cut' });
    segments.push({ x0: xBaseLeft + ch2, y0: yWallBottomEdge, x1: xBaseRight - ch2, y1: yWallBottomEdge, type: 'cut' });
    segments.push({ x0: xBaseRight - ch2, y0: yWallBottomEdge, x1: xBaseRight, y1: yWallBottomCrease, type: 'cut' });

    // Frestas inferiores
    segments.push({ x0: xBaseLeft + Hbt, y0: yBaseBottom, x1: xBaseLeft + Hbt + Htuck, y1: yBaseBottom + Htuck, type: 'cut' });
    segments.push({ x0: xBaseLeft + Hbt + Htuck, y0: yBaseBottom + Htuck, x1: xBaseLeft + Hbt + Btuck - Htuck, y1: yBaseBottom + Htuck, type: 'cut' });
    segments.push({ x0: xBaseLeft + Hbt + Btuck - Htuck, y0: yBaseBottom + Htuck, x1: xBaseLeft + Hbt + Btuck, y1: yBaseBottom, type: 'cut' });

    segments.push({ x0: xBaseRight - Hbt - Btuck, y0: yBaseBottom, x1: xBaseRight - Hbt - Btuck + Htuck, y1: yBaseBottom + Htuck, type: 'cut' });
    segments.push({ x0: xBaseRight - Hbt - Btuck + Htuck, y0: yBaseBottom + Htuck, x1: xBaseRight - Hbt - Htuck, y1: yBaseBottom + Htuck, type: 'cut' });
    segments.push({ x0: xBaseRight - Hbt - Htuck, y0: yBaseBottom + Htuck, x1: xBaseRight - Hbt, y1: yBaseBottom, type: 'cut' });

    // Laterais esquerda e direita com orelhas articuladas (abas de canto)
    const xLeftWallEdge = xBaseLeft - H;
    const xRightWallEdge = xBaseRight + H;

    // Parede lateral esquerda
    segments.push({ x0: xLeftWallEdge, y0: yBaseBottom, x1: xLeftWallEdge, y1: yBaseTop, type: 'cut' });
    // Abas de dobra dos cantos esquerdos
    segments.push({ x0: xLeftWallEdge, y0: yBaseTop, x1: xBaseLeft, y1: yBaseTop + F1, type: 'cut' });
    segments.push({ x0: xBaseLeft, y0: yBaseTop + F1, x1: xBaseLeft, y1: yBaseTop, type: 'crease' });

    segments.push({ x0: xLeftWallEdge, y0: yBaseBottom, x1: xBaseLeft, y1: yBaseBottom - F1, type: 'cut' });
    segments.push({ x0: xBaseLeft, y0: yBaseBottom - F1, x1: xBaseLeft, y1: yBaseBottom, type: 'crease' });

    // Parede lateral direita
    segments.push({ x0: xRightWallEdge, y0: yBaseBottom, x1: xRightWallEdge, y1: yBaseTop, type: 'cut' });
    // Abas de dobra dos cantos direitos
    segments.push({ x0: xRightWallEdge, y0: yBaseTop, x1: xBaseRight, y1: yBaseTop + F1, type: 'cut' });
    segments.push({ x0: xBaseRight, y0: yBaseTop + F1, x1: xBaseRight, y1: yBaseTop, type: 'crease' });

    segments.push({ x0: xRightWallEdge, y0: yBaseBottom, x1: xBaseRight, y1: yBaseBottom - F1, type: 'cut' });
    segments.push({ x0: xBaseRight, y0: yBaseBottom - F1, x1: xBaseRight, y1: yBaseBottom, type: 'crease' });

    const dimensions: DimensionLine[] = [
      { x0: xBaseLeft, y0: yBaseTop, x1: xBaseRight, y1: yBaseTop, text: `B = ${B} mm`, offset: 20 },
      { x0: xBaseRight, y0: yBaseBottom, x1: xBaseRight, y1: yBaseTop, text: `A = ${A} mm`, offset: 25, isVertical: true },
      { x0: xBaseRight, y0: yBaseTop, x1: xBaseRight + H, y1: yBaseTop, text: `H = ${H} mm`, offset: 20 },
    ];

    let geom: DielineResult = {
      segments,
      arcs: [],
      dimensions,
      bounds: computeBoundingBox({ segments }),
    };

    // Normaliza a geometria para origem (0,0)
    geom = normalizeGeometry(geom as any) as DielineResult;

    return geom;
  },
};
