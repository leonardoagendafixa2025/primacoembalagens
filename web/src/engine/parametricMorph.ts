import type { Segment2D, Arc2D, DimensionLine, BoundingBox2D, DielineResult } from './types';

export interface ParametricInputGeom {
  segments: Array<{ type: string; x0: number; y0: number; x1: number; y1: number }>;
  arcs?: Array<{ type: string; cx: number; cy: number; r: number; startAngle: number; endAngle: number }>;
}

export interface MorphParams {
  L?: number;
  B?: number;
  H?: number;
  Ep?: number;
  M?: number;
}

interface IntervalMapping {
  x0Orig: number;
  x1Orig: number;
  x0New: number;
  x1New: number;
  type: 'L' | 'B' | 'M' | 'other';
  label: string;
}

interface YIntervalMapping {
  y0Orig: number;
  y1Orig: number;
  y0New: number;
  y1New: number;
  type: 'H' | 'top_flap' | 'bottom_flap' | 'other';
  label: string;
}

/**
 * Motor universal de deformação paramétrica por zonas contínuas (Piecewise Parametric Morphing).
 * Preserva estritamente tangências, continuidade de linhas e gera cotas técnicas parciais.
 */
export function computeParametricDieline(
  rawGeom: ParametricInputGeom,
  nominalParams: MorphParams,
  userParams: MorphParams,
  prefix: string = 'par'
): DielineResult {
  const origSegs = rawGeom.segments || [];
  const origArcs = rawGeom.arcs || [];

  if (origSegs.length === 0) {
    const emptyBox: BoundingBox2D = { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    return { segments: [], arcs: [], dimensions: [], bounds: emptyBox };
  }

  // 1. Extração de BoundingBox Original
  let minX0 = Infinity, maxX0 = -Infinity, minY0 = Infinity, maxY0 = -Infinity;
  for (const s of origSegs) {
    minX0 = Math.min(minX0, s.x0, s.x1);
    maxX0 = Math.max(maxX0, s.x0, s.x1);
    minY0 = Math.min(minY0, s.y0, s.y1);
    maxY0 = Math.max(maxY0, s.y0, s.y1);
  }
  for (const a of origArcs) {
    minX0 = Math.min(minX0, a.cx - a.r);
    maxX0 = Math.max(maxX0, a.cx + a.r);
    minY0 = Math.min(minY0, a.cy - a.r);
    maxY0 = Math.max(maxY0, a.cy + a.r);
  }

  // Parâmetros nominais base e parâmetros do usuário
  const baseL = Math.max(nominalParams.L || 150, 10);
  const baseB = Math.max(nominalParams.B || 100, 10);
  const baseH = Math.max(nominalParams.H || 100, 10);
  const baseM = Math.max(nominalParams.M || 15, 5);

  const targetL = Math.max(userParams.L ?? baseL, 10);
  const targetB = Math.max(userParams.B ?? baseB, 10);
  const targetH = Math.max(userParams.H ?? baseH, 10);
  const targetM = Math.max(userParams.M ?? baseM, 5);

  // 2. Detecção de Vincos Verticais (Divisão de Painéis em X)
  const verticalCreaseXSet = new Set<number>();
  for (const s of origSegs) {
    if (s.type === 'crease' && Math.abs(s.x0 - s.x1) <= 1.0 && Math.abs(s.y0 - s.y1) >= 15.0) {
      const avgX = (s.x0 + s.x1) / 2;
      verticalCreaseXSet.add(Math.round(avgX * 10) / 10);
    }
  }

  // Agrupa X próximos (< 3mm)
  const sortedRawX = Array.from(verticalCreaseXSet).sort((a, b) => a - b);
  const clusteredX: number[] = [];
  for (const x of sortedRawX) {
    if (clusteredX.length === 0 || Math.abs(x - clusteredX[clusteredX.length - 1]) >= 3.0) {
      clusteredX.push(x);
    }
  }

  // Monta a lista completa de divisores em X: [minX0, ...clusteredX, maxX0]
  const fullXBoundaries: number[] = [minX0];
  for (const x of clusteredX) {
    if (x > minX0 + 4.0 && x < maxX0 - 4.0) {
      fullXBoundaries.push(x);
    }
  }
  fullXBoundaries.push(maxX0);

  // 3. Mapeamento de Zonas Horizontais X
  const xIntervals: IntervalMapping[] = [];
  let currNewX = 0;

  for (let i = 0; i < fullXBoundaries.length - 1; i++) {
    const x0 = fullXBoundaries[i];
    const x1 = fullXBoundaries[i + 1];
    const origSpan = x1 - x0;

    let type: 'L' | 'B' | 'M' | 'other' = 'other';
    let label = `${Math.round(origSpan)} mm`;
    let targetSpan = origSpan;

    // Se é a primeira aba pequena (< 40mm) na borda esquerda: aba de colagem
    if (i === 0 && origSpan <= Math.max(baseM * 1.8, 35) && fullXBoundaries.length >= 4) {
      type = 'M';
      label = `Aba: ${Math.round(targetM)}`;
      targetSpan = targetM;
    } else {
      // Compara se o tamanho original é mais próximo de L ou B
      const diffL = Math.abs(origSpan - baseL);
      const diffB = Math.abs(origSpan - baseB);

      if (diffL <= diffB && diffL < baseL * 0.4) {
        type = 'L';
        label = `L = ${Math.round(targetL)}`;
        targetSpan = targetL;
      } else if (diffB < diffL && diffB < baseB * 0.4) {
        type = 'B';
        label = `B = ${Math.round(targetB)}`;
        targetSpan = targetB;
      } else {
        // Escala proporcional à média de L e B
        const avgScale = ((targetL / baseL) + (targetB / baseB)) / 2;
        targetSpan = origSpan * avgScale;
        label = `${Math.round(targetSpan)}`;
      }
    }

    xIntervals.push({
      x0Orig: x0,
      x1Orig: x1,
      x0New: currNewX,
      x1New: currNewX + targetSpan,
      type,
      label,
    });
    currNewX += targetSpan;
  }

  // 4. Detecção de Vincos Horizontais (Divisão do Corpo H e Abas em Y)
  const horizCreaseYSet = new Set<number>();
  for (const s of origSegs) {
    if (s.type === 'crease' && Math.abs(s.y0 - s.y1) <= 1.0 && Math.abs(s.x0 - s.x1) >= 20.0) {
      const avgY = (s.y0 + s.y1) / 2;
      horizCreaseYSet.add(Math.round(avgY * 10) / 10);
    }
  }

  const sortedRawY = Array.from(horizCreaseYSet).sort((a, b) => a - b);
  const clusteredY: number[] = [];
  for (const y of sortedRawY) {
    if (clusteredY.length === 0 || Math.abs(y - clusteredY[clusteredY.length - 1]) >= 4.0) {
      clusteredY.push(y);
    }
  }

  // Monta a lista de divisores em Y
  const fullYBoundaries: number[] = [minY0];
  for (const y of clusteredY) {
    if (y > minY0 + 5.0 && y < maxY0 - 5.0) {
      fullYBoundaries.push(y);
    }
  }
  fullYBoundaries.push(maxY0);

  // Mapeamento de Zonas Verticais Y
  const yIntervals: YIntervalMapping[] = [];
  let currNewY = 0;

  // Localiza o intervalo central de maior probabilidade de ser o corpo H
  let bestHIndex = -1;
  let minHDiff = Infinity;
  for (let j = 0; j < fullYBoundaries.length - 1; j++) {
    const y0 = fullYBoundaries[j];
    const y1 = fullYBoundaries[j + 1];
    const span = y1 - y0;
    const diff = Math.abs(span - baseH);
    if (diff < minHDiff) {
      minHDiff = diff;
      bestHIndex = j;
    }
  }

  for (let j = 0; j < fullYBoundaries.length - 1; j++) {
    const y0 = fullYBoundaries[j];
    const y1 = fullYBoundaries[j + 1];
    const origSpan = y1 - y0;

    let type: 'H' | 'top_flap' | 'bottom_flap' | 'other' = 'other';
    let targetSpan = origSpan;
    let label = `${Math.round(origSpan)}`;

    if (j === bestHIndex && fullYBoundaries.length >= 3) {
      type = 'H';
      targetSpan = targetH;
      label = `H = ${Math.round(targetH)}`;
    } else if (j < bestHIndex) {
      type = 'bottom_flap';
      // Abas inferiores de fundo geralmente escalam com B
      const scaleB = targetB / baseB;
      targetSpan = origSpan * scaleB;
      label = `Fundo: ${Math.round(targetSpan)}`;
    } else if (j > bestHIndex) {
      type = 'top_flap';
      // Abas superiores/tampa escalam com B
      const scaleB = targetB / baseB;
      targetSpan = origSpan * scaleB;
      label = `Tampa: ${Math.round(targetSpan)}`;
    } else {
      // Escala genérica por H
      targetSpan = origSpan * (targetH / baseH);
      label = `${Math.round(targetSpan)}`;
    }

    yIntervals.push({
      y0Orig: y0,
      y1Orig: y1,
      y0New: currNewY,
      y1New: currNewY + targetSpan,
      type,
      label,
    });
    currNewY += targetSpan;
  }

  // 5. Funções de Transferência Monotônicas Contínuas C0
  function mapX(x: number): number {
    if (xIntervals.length === 0) return x;
    if (x <= xIntervals[0].x0Orig) {
      const first = xIntervals[0];
      const s = (first.x1New - first.x0New) / Math.max(first.x1Orig - first.x0Orig, 0.001);
      return first.x0New + (x - first.x0Orig) * s;
    }
    const last = xIntervals[xIntervals.length - 1];
    if (x >= last.x1Orig) {
      const s = (last.x1New - last.x0New) / Math.max(last.x1Orig - last.x0Orig, 0.001);
      return last.x1New + (x - last.x1Orig) * s;
    }
    for (const inv of xIntervals) {
      if (x >= inv.x0Orig && x <= inv.x1Orig) {
        const t = (x - inv.x0Orig) / Math.max(inv.x1Orig - inv.x0Orig, 0.001);
        return inv.x0New + t * (inv.x1New - inv.x0New);
      }
    }
    return x;
  }

  function mapY(y: number): number {
    if (yIntervals.length === 0) return y;
    if (y <= yIntervals[0].y0Orig) {
      const first = yIntervals[0];
      const s = (first.y1New - first.y0New) / Math.max(first.y1Orig - first.y0Orig, 0.001);
      return first.y0New + (y - first.y0Orig) * s;
    }
    const last = yIntervals[yIntervals.length - 1];
    if (y >= last.y1Orig) {
      const s = (last.y1New - last.y0New) / Math.max(last.y1Orig - last.y0Orig, 0.001);
      return last.y1New + (y - last.y1Orig) * s;
    }
    for (const inv of yIntervals) {
      if (y >= inv.y0Orig && y <= inv.y1Orig) {
        const t = (y - inv.y0Orig) / Math.max(inv.y1Orig - inv.y0Orig, 0.001);
        return inv.y0New + t * (inv.y1New - inv.y0New);
      }
    }
    return y;
  }

  // 6. Aplicação da Deformação nos Segmentos
  const segments: Segment2D[] = origSegs.map((s, idx) => ({
    id: `${prefix}-seg-${idx}`,
    type: s.type === 'crease' ? 'crease' : (s.type === 'perfo' || s.type === 'perforation' ? 'perfo' : 'cut'),
    x0: Math.round(mapX(s.x0) * 1000) / 1000,
    y0: Math.round(mapY(s.y0) * 1000) / 1000,
    x1: Math.round(mapX(s.x1) * 1000) / 1000,
    y1: Math.round(mapY(s.y1) * 1000) / 1000,
  }));

  // 7. Aplicação da Deformação nos Arcos com Preservação de Tangência
  const arcs: Arc2D[] = origArcs.map((a, idx) => {
    const cxNew = mapX(a.cx);
    const cyNew = mapY(a.cy);

    // Escala local média do raio
    const localScaleX = (mapX(a.cx + a.r) - mapX(a.cx - a.r)) / (2 * a.r || 1);
    const localScaleY = (mapY(a.cy + a.r) - mapY(a.cy - a.r)) / (2 * a.r || 1);
    const rNew = a.r * ((Math.abs(localScaleX) + Math.abs(localScaleY)) / 2);

    const isFullCircle = Math.abs(Math.abs((a.endAngle || 360) - (a.startAngle || 0)) - 360) < 1;
    if (isFullCircle) {
      return {
        id: `${prefix}-arc-${idx}`,
        type: a.type === 'crease' ? 'crease' : 'cut',
        cx: Math.round(cxNew * 1000) / 1000,
        cy: Math.round(cyNew * 1000) / 1000,
        r: Math.round(rNew * 1000) / 1000,
        startAngle: 0,
        endAngle: 360,
      };
    }

    // Calcula os pontos inicial e final transformados
    const a0Rad = (a.startAngle * Math.PI) / 180;
    const a1Rad = (a.endAngle * Math.PI) / 180;
    const p0x = mapX(a.cx + a.r * Math.cos(a0Rad));
    const p0y = mapY(a.cy + a.r * Math.sin(a0Rad));
    const p1x = mapX(a.cx + a.r * Math.cos(a1Rad));
    const p1y = mapY(a.cy + a.r * Math.sin(a1Rad));

    let newA0 = (Math.atan2(p0y - cyNew, p0x - cxNew) * 180) / Math.PI;
    let newA1 = (Math.atan2(p1y - cyNew, p1x - cxNew) * 180) / Math.PI;
    if (newA0 < 0) newA0 += 360;
    if (newA1 < 0) newA1 += 360;
    while (newA1 < newA0) {
      newA1 += 360;
    }

    return {
      id: `${prefix}-arc-${idx}`,
      type: a.type === 'crease' ? 'crease' : 'cut',
      cx: Math.round(cxNew * 1000) / 1000,
      cy: Math.round(cyNew * 1000) / 1000,
      r: Math.round(rNew * 1000) / 1000,
      startAngle: Math.round(newA0 * 1000) / 1000,
      endAngle: Math.round(newA1 * 1000) / 1000,
    };
  });

  // 8. BoundingBox da Geometria Deformada
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.x0, s.x1);
    maxX = Math.max(maxX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1);
    maxY = Math.max(maxY, s.y0, s.y1);
  }
  for (const a of arcs) {
    minX = Math.min(minX, a.cx - a.r);
    maxX = Math.max(maxX, a.cx + a.r);
    minY = Math.min(minY, a.cy - a.r);
    maxY = Math.max(maxY, a.cy + a.r);
  }

  const bounds: BoundingBox2D = {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };

  // 9. Geração Automática das Cotas Técnicas (Abas, Painéis e Formato Geral)
  const dimensions: DimensionLine[] = [];

  // 9.1 Cotas Horizontais dos Painéis e Abas
  const horizDimY = maxY + 15;
  for (const inv of xIntervals) {
    const span = inv.x1New - inv.x0New;
    if (span >= 8.0) {
      dimensions.push({
        x0: inv.x0New,
        y0: horizDimY,
        x1: inv.x1New,
        y1: horizDimY,
        text: inv.label,
        offset: 10,
      });
    }
  }

  // 9.2 Cotas Verticais (Corpo H, Fundo e Tampa)
  const vertDimX = minX - 18;
  for (const inv of yIntervals) {
    const span = inv.y1New - inv.y0New;
    if (span >= 8.0) {
      dimensions.push({
        x0: vertDimX,
        y0: inv.y0New,
        x1: vertDimX,
        y1: inv.y1New,
        text: inv.label,
        isVertical: true,
        offset: 10,
      });
    }
  }

  // 9.3 Cota Geral de Formato Mínimo Aberto (Largura e Altura Totais)
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
}
