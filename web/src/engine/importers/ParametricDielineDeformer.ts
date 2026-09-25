import type { DielineResult, Segment2D, Arc2D, PackagingModel } from '../types';

export interface CreaseAnalysisResult {
  xCreases: number[];
  yCreases: number[];
  initialParams: {
    L: number;
    B: number;
    H: number;
    AbaLat: number;
    AbaLatH: number;
    AbaTampa: number;
    AbaCola: number;
    Ep: number;
    origL: number;
    origB: number;
  };
}

/**
 * Analisa a geometria de uma faca importada (PDF/DXF) e extrai os parâmetros estruturais
 * fundamentais de embalagem: L (Comprimento), B (Largura/Profundidade), H (Altura),
 * Aba Lateral, Aba da Tampa e Aba de Cola.
 */
export function analyzeImportedDieline(dieline: DielineResult): CreaseAnalysisResult {
  const b = dieline.bounds || { minX: 0, minY: 0, maxX: 300, maxY: 200, width: 300, height: 200 };
  const minX = b.minX;
  const maxX = b.maxX;
  const minY = b.minY;
  const maxY = b.maxY;
  const width = Math.max(10, b.width || maxX - minX);
  const height = Math.max(10, b.height || maxY - minY);

  const creases = dieline.segments.filter((s) => s.type === 'crease');

  // Coleta vincos verticais (|x0 - x1| <= 1.5 e comprimento >= 8)
  const rawVertX: number[] = [];
  for (const c of creases) {
    if (Math.abs(c.x1 - c.x0) <= 1.5 && Math.abs(c.y1 - c.y0) >= 8) {
      rawVertX.push((c.x0 + c.x1) / 2);
    }
  }

  // Agrupa valores de X próximos (<= 4mm)
  const clusteredX: number[] = [];
  rawVertX.sort((a, b) => a - b);
  for (const x of rawVertX) {
    if (clusteredX.length === 0 || Math.abs(x - clusteredX[clusteredX.length - 1]) > 4) {
      clusteredX.push(x);
    }
  }

  // Coleta vincos horizontais (|y0 - y1| <= 1.5 e comprimento >= 8)
  const rawHorizY: number[] = [];
  for (const c of creases) {
    if (Math.abs(c.y1 - c.y0) <= 1.5 && Math.abs(c.x1 - c.x0) >= 8) {
      rawHorizY.push((c.y0 + c.y1) / 2);
    }
  }

  // Agrupa valores de Y próximos (<= 4mm)
  const clusteredY: number[] = [];
  rawHorizY.sort((a, b) => a - b);
  for (const y of rawHorizY) {
    if (clusteredY.length === 0 || Math.abs(y - clusteredY[clusteredY.length - 1]) > 4) {
      clusteredY.push(y);
    }
  }

  // Cálculo de L, B, H e Abas
  let L = Math.round(width * 0.45);
  let H = Math.round(width * 0.2);
  let AbaLat = Math.round(width * 0.15);
  let AbaCola = 15;

  if (clusteredX.length >= 4) {
    // Ex: Estojo FEFCO 0427 com 4 vincos verticais ou cartucho ECMA
    const c0 = clusteredX[0];
    const c1 = clusteredX[1];
    const c2 = clusteredX[clusteredX.length - 2];
    const c3 = clusteredX[clusteredX.length - 1];
    L = Math.max(20, Math.round(c2 - c1));
    H = Math.max(15, Math.round(((c1 - c0) + (c3 - c2)) / 2));
    AbaLat = Math.max(10, Math.round(((c0 - minX) + (maxX - c3)) / 2));
    AbaCola = Math.min(25, Math.max(10, Math.round(c0 - minX)));
  } else if (clusteredX.length >= 2) {
    const c0 = clusteredX[0];
    const c1 = clusteredX[clusteredX.length - 1];
    L = Math.max(20, Math.round(c1 - c0));
    H = Math.max(15, Math.round(((c0 - minX) + (maxX - c1)) / 2));
    AbaLat = Math.max(10, Math.round(H * 0.8));
    AbaCola = 15;
  }

  let B = Math.round(height * 0.4);
  let AbaTampa = Math.round(height * 0.15);
  let AbaLatH = Math.round(height * 0.15);

  if (clusteredY.length >= 3) {
    // Ex: fundo, parede traseira, tampa, aba de encaixe
    const y0 = clusteredY[0];
    const y1 = clusteredY[1];
    const yLast = clusteredY[clusteredY.length - 1];
    B = Math.max(20, Math.round(y1 - y0));
    AbaTampa = Math.max(10, Math.round(maxY - yLast));
    AbaLatH = Math.max(10, Math.round(y0 - minY));
    if (clusteredX.length < 4 && clusteredY.length >= 4) {
      H = Math.max(15, Math.round(clusteredY[2] - y1));
    }
  } else if (clusteredY.length >= 2) {
    const y0 = clusteredY[0];
    const y1 = clusteredY[clusteredY.length - 1];
    B = Math.max(20, Math.round(y1 - y0));
    AbaTampa = Math.max(10, Math.round(maxY - y1));
    AbaLatH = Math.max(10, Math.round(y0 - minY));
  }

  return {
    xCreases: clusteredX,
    yCreases: clusteredY,
    initialParams: {
      L,
      B,
      H,
      AbaLat,
      AbaLatH,
      AbaTampa,
      AbaCola,
      Ep: 0.4,
      origL: L,
      origB: B,
    },
  };
}

/**
 * Cria o motor de deformação paramétrica ortogonal para a faca importada.
 * Permite alterar individualmente:
 * - Comprimento / Frente (L)
 * - Largura / Profundidade (B)
 * - Altura (H)
 * - Aba Lateral (Largura e Altura)
 * - Aba da Tampa (Tuck flap)
 * - Aba de Cola
 * - Espessura (Ep)
 */
export function createParametricDielineCalculator(
  baseDieline: DielineResult,
  analysis: CreaseAnalysisResult
) {
  const init = analysis.initialParams;
  const b = baseDieline.bounds || { minX: 0, minY: 0, maxX: 300, maxY: 200, width: 300, height: 200 };
  const minX = b.minX;
  const maxX = b.maxX;
  const minY = b.minY;
  const maxY = b.maxY;
  const baseW = Math.max(10, b.width || maxX - minX);
  const baseH = Math.max(10, b.height || maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const xc = analysis.xCreases;
  const yc = analysis.yCreases;

  return (params: Record<string, number>): DielineResult => {
    const targetL = typeof params.L === 'number' && params.L > 0 ? params.L : init.L;
    const targetB = typeof params.B === 'number' && params.B > 0 ? params.B : init.B;
    const targetH = typeof params.H === 'number' && params.H > 0 ? params.H : init.H;
    const targetAbaLat = typeof params.AbaLat === 'number' && params.AbaLat > 0 ? params.AbaLat : init.AbaLat;
    const targetAbaLatH = typeof params.AbaLatH === 'number' && params.AbaLatH > 0 ? params.AbaLatH : init.AbaLatH;
    const targetAbaTampa = typeof params.AbaTampa === 'number' && params.AbaTampa > 0 ? params.AbaTampa : init.AbaTampa;
    const targetAbaCola = typeof params.AbaCola === 'number' && params.AbaCola > 0 ? params.AbaCola : init.AbaCola;

    const dL = targetL - init.L;
    const dB = targetB - init.B;
    const dH = targetH - init.H;
    const dAbaLat = targetAbaLat - init.AbaLat;
    const dAbaLatH = targetAbaLatH - init.AbaLatH;
    const dAbaTampa = targetAbaTampa - init.AbaTampa;
    const dAbaCola = targetAbaCola - init.AbaCola;

    // Se nenhum parâmetro foi alterado, retorna o original intacto
    if (
      Math.abs(dL) < 0.05 &&
      Math.abs(dB) < 0.05 &&
      Math.abs(dH) < 0.05 &&
      Math.abs(dAbaLat) < 0.05 &&
      Math.abs(dAbaLatH) < 0.05 &&
      Math.abs(dAbaTampa) < 0.05 &&
      Math.abs(dAbaCola) < 0.05
    ) {
      return baseDieline;
    }

    // Função de mapeamento de ponto (x, y) -> (nx, ny)
    const transformX = (x: number): number => {
      if (xc.length >= 4) {
        const c0 = xc[0];
        const c1 = xc[1];
        const c2 = xc[xc.length - 2];
        const c3 = xc[xc.length - 1];

        if (x >= c3) {
          // Aba lateral direita
          return x + dL / 2 + dH + dAbaLat;
        } else if (x >= c2) {
          // Parede lateral direita
          const t = c3 > c2 ? (x - c2) / (c3 - c2) : 0;
          return x + dL / 2 + t * dH;
        } else if (x >= centerX) {
          // Metade direita do corpo central
          const t = c2 > centerX ? (x - centerX) / (c2 - centerX) : 0;
          return x + t * (dL / 2);
        } else if (x >= c1) {
          // Metade esquerda do corpo central
          const t = centerX > c1 ? (centerX - x) / (centerX - c1) : 0;
          return x - t * (dL / 2);
        } else if (x >= c0) {
          // Parede lateral esquerda
          const t = c1 > c0 ? (c1 - x) / (c1 - c0) : 0;
          return x - dL / 2 - t * dH;
        } else {
          // Aba lateral esquerda / Aba de cola
          return x - dL / 2 - dH - (dAbaLat + dAbaCola) / 2;
        }
      } else if (xc.length >= 2) {
        const c0 = xc[0];
        const c1 = xc[xc.length - 1];
        if (x >= c1) {
          return x + dL / 2 + dH + dAbaLat;
        } else if (x >= centerX) {
          const t = c1 > centerX ? (x - centerX) / (c1 - centerX) : 0;
          return x + t * (dL / 2);
        } else if (x >= c0) {
          const t = centerX > c0 ? (centerX - x) / (centerX - c0) : 0;
          return x - t * (dL / 2);
        } else {
          return x - dL / 2 - dH - dAbaLat;
        }
      } else {
        // Fallback proporcional suave centrado
        const norm = (x - centerX) / (baseW / 2 || 1);
        return x + norm * (dL / 2 + dH + dAbaLat);
      }
    };

    const transformY = (y: number): number => {
      if (yc.length >= 3) {
        const y0 = yc[0];
        const y1 = yc[1];
        const yLast = yc[yc.length - 1];

        if (y >= yLast) {
          // Aba da tampa / tuck flap superior
          return y + dB / 2 + dH + dAbaTampa;
        } else if (y >= centerY) {
          // Zona superior (tampa e parede traseira)
          const t = yLast > centerY ? (y - centerY) / (yLast - centerY) : 0;
          return y + t * (dB / 2 + dH);
        } else if (y >= y0) {
          // Zona central/inferior da base
          const t = centerY > y0 ? (centerY - y) / (centerY - y0) : 0;
          return y - t * (dB / 2);
        } else {
          // Abas inferiores / linguetas inferiores
          return y - dB / 2 - dH - dAbaLatH;
        }
      } else if (yc.length >= 2) {
        const y0 = yc[0];
        const y1 = yc[yc.length - 1];
        if (y >= y1) {
          return y + dB / 2 + dH + dAbaTampa;
        } else if (y >= centerY) {
          const t = y1 > centerY ? (y - centerY) / (y1 - centerY) : 0;
          return y + t * (dB / 2);
        } else if (y >= y0) {
          const t = centerY > y0 ? (centerY - y) / (centerY - y0) : 0;
          return y - t * (dB / 2);
        } else {
          return y - dB / 2 - dH - dAbaLatH;
        }
      } else {
        const norm = (y - centerY) / (baseH / 2 || 1);
        return y + norm * (dB / 2 + dH + dAbaTampa);
      }
    };

    // Aplica a transformação a cada segmento da faca
    const nextSegments: Segment2D[] = baseDieline.segments.map((s) => ({
      ...s,
      x0: Number(transformX(s.x0).toFixed(3)),
      y0: Number(transformY(s.y0).toFixed(3)),
      x1: Number(transformX(s.x1).toFixed(3)),
      y1: Number(transformY(s.y1).toFixed(3)),
    }));

    // Aplica a transformação aos arcos da faca
    const nextArcs: Arc2D[] = baseDieline.arcs.map((a) => {
      const ncx = Number(transformX(a.cx).toFixed(3));
      const ncy = Number(transformY(a.cy).toFixed(3));
      return {
        ...a,
        cx: ncx,
        cy: ncy,
      };
    });

    // Recalcula o bounding box
    let newMinX = Infinity, newMaxX = -Infinity;
    let newMinY = Infinity, newMaxY = -Infinity;
    for (const s of nextSegments) {
      if (s.x0 < newMinX) newMinX = s.x0;
      if (s.x1 < newMinX) newMinX = s.x1;
      if (s.x0 > newMaxX) newMaxX = s.x0;
      if (s.x1 > newMaxX) newMaxX = s.x1;
      if (s.y0 < newMinY) newMinY = s.y0;
      if (s.y1 < newMinY) newMinY = s.y1;
      if (s.y0 > newMaxY) newMaxY = s.y0;
      if (s.y1 > newMaxY) newMaxY = s.y1;
    }

    if (newMinX === Infinity) {
      newMinX = minX; newMaxX = maxX;
      newMinY = minY; newMaxY = maxY;
    }

    const newW = Number((newMaxX - newMinX).toFixed(3));
    const newH = Number((newMaxY - newMinY).toFixed(3));

    return {
      ...baseDieline,
      segments: nextSegments,
      arcs: nextArcs,
      bounds: {
        minX: newMinX,
        minY: newMinY,
        maxX: newMaxX,
        maxY: newMaxY,
        width: newW,
        height: newH,
      },
    };
  };
}
