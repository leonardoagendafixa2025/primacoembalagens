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
  type: 'L' | 'B' | 'M' | 'H' | 'other';
  label: string;
}

interface YIntervalMapping {
  y0Orig: number;
  y1Orig: number;
  y0New: number;
  y1New: number;
  type: 'H' | 'B' | 'L' | 'flap' | 'other';
  label: string;
}

type PackagingStructureType = 'TUBE' | 'TRAY' | 'GENERIC';

/**
 * MOTOR PARAMÉTRICO UNIVERSAL CAD DE EMBALAGENS (PLMPack Parametric Core)
 * 
 * Princípios Fundamentais:
 * 1. Topologia e Conectividade Estrita C0: Nenhum gap ou degrau entre retas e arcos.
 * 2. Reconhecimento de Estrutura (Tubo com 4 paredes vs Bandeja/Tray com base central e abas H).
 * 3. Preservação de Ângulos e Geometria Curva: Arcos e concordâncias (fillets) mantêm tangência contínua.
 * 4. Cotas Fiéis: As cotas exibidas derivam das dimensões reais dos painéis regenerados.
 */
export function computeParametricDieline(
  rawGeom: ParametricInputGeom,
  nominalParams: MorphParams,
  userParams: MorphParams,
  prefix: string = 'par'
): DielineResult {
  const origSegs = rawGeom.segments || [];
  const origArcs = (rawGeom.arcs || []).map((a) => {
    if (!a.r || a.r <= 0) return a;
    let span = a.endAngle - a.startAngle;
    while (span < 0) span += 360;
    while (span > 360) span -= 360;

    // Normalização defensiva: se o arco não for círculo fechado (span ~ 360°) e tiver span > 180°,
    // foi exportado no sentido horário (com ângulos invertidos e endAngle += 360).
    // Normaliza para o arco geométrico menor (span < 180°).
    if (span > 180.1 && Math.abs(span - 360) > 1.0) {
      let invStart = a.endAngle >= 360 ? a.endAngle - 360 : a.endAngle;
      let invEnd = a.startAngle >= 360 ? a.startAngle - 360 : a.startAngle;
      if (invEnd < invStart) invEnd += 360;
      return {
        ...a,
        startAngle: invStart,
        endAngle: invEnd,
      };
    }
    return a;
  });

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

  const origWidth = maxX0 - minX0;
  const origHeight = maxY0 - minY0;

  // Parâmetros nominais base e novos parâmetros definidos pelo usuário
  const baseL = Math.max(nominalParams.L || 300, 10);
  const baseB = Math.max(nominalParams.B || 200, 10);
  const baseH = Math.max(nominalParams.H || 150, 10);
  const baseM = Math.max(nominalParams.M || 25, 5);

  const targetL = Math.max(userParams.L ?? baseL, 10);
  const targetB = Math.max(userParams.B ?? baseB, 10);
  const targetH = Math.max(userParams.H ?? baseH, 10);
  const targetM = Math.max(userParams.M ?? baseM, 5);

  // 2. Análise Topológica dos Vincos: Detecção de Linhas de Dobra Principais
  const verticalCreases: Array<{ x: number; y0: number; y1: number; len: number }> = [];
  const horizontalCreases: Array<{ y: number; x0: number; x1: number; len: number }> = [];

  for (const s of origSegs) {
    if (s.type === 'crease') {
      const dx = Math.abs(s.x1 - s.x0);
      const dy = Math.abs(s.y1 - s.y0);
      if (dx <= 1.2 && dy >= 12.0) {
        verticalCreases.push({ x: (s.x0 + s.x1) / 2, y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1), len: dy });
      } else if (dy <= 1.2 && dx >= 12.0) {
        horizontalCreases.push({ y: (s.y0 + s.y1) / 2, x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), len: dx });
      }
    }
  }

  // Agrupamento de vincos em divisores de zonas
  function clusterCoordinates(coords: number[], tolerance: number = 3.5): number[] {
    const sorted = [...new Set(coords.map(c => Math.round(c * 10) / 10))].sort((a, b) => a - b);
    const clustered: number[] = [];
    for (const c of sorted) {
      if (clustered.length === 0 || Math.abs(c - clustered[clustered.length - 1]) >= tolerance) {
        clustered.push(c);
      }
    }
    return clustered;
  }

  const vXClusters = clusterCoordinates(verticalCreases.map(c => c.x));
  const hYClusters = clusterCoordinates(horizontalCreases.map(c => c.y));

  // 3. Classificação de Arquitetura da Embalagem (Tubo de 4 Paredes vs Bandeja/Folder)
  let structure: PackagingStructureType = 'GENERIC';
  if (vXClusters.length >= 3 && vXClusters.length <= 6 && hYClusters.length >= 2) {
    structure = 'TUBE';
  } else if (vXClusters.length === 2 && hYClusters.length === 2) {
    structure = 'TRAY';
  } else if (origWidth > origHeight * 1.6 && vXClusters.length >= 4) {
    structure = 'TUBE';
  } else if (vXClusters.length === 2 || hYClusters.length === 2) {
    structure = 'TRAY';
  }

  // 4. Mapeamento de Zonas Horizontais X
  const fullXBoundaries: number[] = [minX0];
  for (const x of vXClusters) {
    if (x > minX0 + 4.0 && x < maxX0 - 4.0) {
      fullXBoundaries.push(x);
    }
  }
  fullXBoundaries.push(maxX0);

  const xIntervals: IntervalMapping[] = [];
  let currNewX = minX0; // Mantém a mesma ancoragem de origem

  const spansX = [];
  for (let i = 0; i < fullXBoundaries.length - 1; i++) {
    spansX.push(fullXBoundaries[i + 1] - fullXBoundaries[i]);
  }

  if (structure === 'TUBE') {
    // Tubo clássico (ECMA A/B, FEFCO 02xx): M + L + B + L + B ou L + B + L + B
    // Identifica se a primeira zona é uma aba de cola estreita (< 40mm e span << outros)
    const hasGlueFlap = spansX.length >= 4 && spansX[0] <= Math.max(baseM * 1.6, 38) && spansX[0] < spansX[1] * 0.45;
    let panelIdx = 0;

    for (let i = 0; i < spansX.length; i++) {
      const origSpan = spansX[i];
      let targetSpan = origSpan;
      let type: 'L' | 'B' | 'M' | 'other' = 'other';
      let label = `${Math.round(origSpan)} mm`;

      if (i === 0 && hasGlueFlap) {
        type = 'M';
        targetSpan = targetM;
        label = `Aba: ${Math.round(targetM)}`;
      } else {
        // Alternância dos painéis do tubo: L, B, L, B ou correspondência nominal
        const diffL = Math.abs(origSpan - baseL);
        const diffB = Math.abs(origSpan - baseB);

        if (diffL <= diffB && diffL < baseL * 0.45) {
          type = 'L';
          targetSpan = targetL;
          label = `L = ${Math.round(targetL)}`;
        } else if (diffB < diffL && diffB < baseB * 0.45) {
          type = 'B';
          targetSpan = targetB;
          label = `B = ${Math.round(targetB)}`;
        } else {
          // Alternância sequencial
          if (panelIdx % 2 === 0) {
            type = 'L';
            targetSpan = (origSpan / baseL) * targetL;
            label = `L = ${Math.round(targetSpan)}`;
          } else {
            type = 'B';
            targetSpan = (origSpan / baseB) * targetB;
            label = `B = ${Math.round(targetSpan)}`;
          }
        }
        panelIdx++;
      }

      xIntervals.push({
        x0Orig: fullXBoundaries[i],
        x1Orig: fullXBoundaries[i + 1],
        x0New: currNewX,
        x1New: currNewX + targetSpan,
        type,
        label,
      });
      currNewX += targetSpan;
    }
  } else if (structure === 'TRAY') {
    // Bandeja (FEFCO 04xx, 03xx): aba lateral esquerda (H) + base central (L ou B) + aba lateral direita (H)
    for (let i = 0; i < spansX.length; i++) {
      const origSpan = spansX[i];
      let targetSpan = origSpan;
      let type: 'L' | 'B' | 'H' | 'other' = 'other';
      let label = `${Math.round(origSpan)} mm`;

      if (i === 0 || i === spansX.length - 1) {
        // Abas laterais de bandeja representam a altura das paredes (H)
        type = 'H';
        targetSpan = (origSpan / baseH) * targetH;
        label = `H = ${Math.round(targetSpan)}`;
      } else {
        // Painel central da bandeja
        type = 'L';
        targetSpan = (origSpan / baseL) * targetL;
        label = `L = ${Math.round(targetSpan)}`;
      }

      xIntervals.push({
        x0Orig: fullXBoundaries[i],
        x1Orig: fullXBoundaries[i + 1],
        x0New: currNewX,
        x1New: currNewX + targetSpan,
        type,
        label,
      });
      currNewX += targetSpan;
    }
  } else {
    // Caso Genérico proporcional suave
    const scaleX = targetL / baseL;
    for (let i = 0; i < spansX.length; i++) {
      const origSpan = spansX[i];
      const targetSpan = origSpan * scaleX;
      xIntervals.push({
        x0Orig: fullXBoundaries[i],
        x1Orig: fullXBoundaries[i + 1],
        x0New: currNewX,
        x1New: currNewX + targetSpan,
        type: 'other',
        label: `${Math.round(targetSpan)}`,
      });
      currNewX += targetSpan;
    }
  }

  // 5. Mapeamento de Zonas Verticais Y
  const fullYBoundaries: number[] = [minY0];
  for (const y of hYClusters) {
    if (y > minY0 + 4.0 && y < maxY0 - 4.0) {
      fullYBoundaries.push(y);
    }
  }
  fullYBoundaries.push(maxY0);

  const yIntervals: YIntervalMapping[] = [];
  let currNewY = minY0;

  const spansY = [];
  for (let j = 0; j < fullYBoundaries.length - 1; j++) {
    spansY.push(fullYBoundaries[j + 1] - fullYBoundaries[j]);
  }

  if (structure === 'TUBE') {
    // Em tubos: Fundo + Corpo central (H) + Tampa/Abas
    let bestHIdx = -1;
    let minHDiff = Infinity;
    for (let j = 0; j < spansY.length; j++) {
      const diff = Math.abs(spansY[j] - baseH);
      if (diff < minHDiff) {
        minHDiff = diff;
        bestHIdx = j;
      }
    }

    for (let j = 0; j < spansY.length; j++) {
      const origSpan = spansY[j];
      let targetSpan = origSpan;
      let type: 'H' | 'B' | 'flap' | 'other' = 'other';
      let label = `${Math.round(origSpan)}`;

      if (j === bestHIdx && spansY.length >= 3) {
        type = 'H';
        targetSpan = (origSpan / baseH) * targetH;
        label = `H = ${Math.round(targetSpan)}`;
      } else {
        // Abas de tampa ou fundo dependem prioritariamente da largura B
        type = 'flap';
        const flapScale = targetB / baseB;
        targetSpan = origSpan * flapScale;
        label = `Aba: ${Math.round(targetSpan)}`;
      }

      yIntervals.push({
        y0Orig: fullYBoundaries[j],
        y1Orig: fullYBoundaries[j + 1],
        y0New: currNewY,
        y1New: currNewY + targetSpan,
        type,
        label,
      });
      currNewY += targetSpan;
    }
  } else if (structure === 'TRAY') {
    // Em bandejas: Parede superior (H) + Fundo Central (B) + Parede inferior (H)
    for (let j = 0; j < spansY.length; j++) {
      const origSpan = spansY[j];
      let targetSpan = origSpan;
      let type: 'H' | 'B' | 'other' = 'other';
      let label = `${Math.round(origSpan)}`;

      if (j === 0 || j === spansY.length - 1) {
        type = 'H';
        targetSpan = (origSpan / baseH) * targetH;
        label = `H = ${Math.round(targetSpan)}`;
      } else {
        type = 'B';
        targetSpan = (origSpan / baseB) * targetB;
        label = `B = ${Math.round(targetSpan)}`;
      }

      yIntervals.push({
        y0Orig: fullYBoundaries[j],
        y1Orig: fullYBoundaries[j + 1],
        y0New: currNewY,
        y1New: currNewY + targetSpan,
        type,
        label,
      });
      currNewY += targetSpan;
    }
  } else {
    // Genérico Y
    const scaleY = targetH / baseH;
    for (let j = 0; j < spansY.length; j++) {
      const origSpan = spansY[j];
      const targetSpan = origSpan * scaleY;
      yIntervals.push({
        y0Orig: fullYBoundaries[j],
        y1Orig: fullYBoundaries[j + 1],
        y0New: currNewY,
        y1New: currNewY + targetSpan,
        type: 'other',
        label: `${Math.round(targetSpan)}`,
      });
      currNewY += targetSpan;
    }
  }

  // 6. Funções Bijetoras de Mapeamento Monotônico Contínuo C0
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

  // 7. Mapeamento de Vértices Únicos com Tolerância Zero de Degraus
  // Registra todos os pontos de extremidade (segmentos e arcos) em uma malha topológica única.
  const VERTEX_TOL = 0.04;
  const vtxKey = (x: number, y: number) =>
    `${Math.round(x / VERTEX_TOL)},${Math.round(y / VERTEX_TOL)}`;

  const vertexMap = new Map<string, { mapX: number; mapY: number }>();

  function registerVertex(x: number, y: number): { mapX: number; mapY: number } {
    const k = vtxKey(x, y);
    const existing = vertexMap.get(k);
    if (existing) return existing;
    const mapped = {
      mapX: Math.round(mapX(x) * 1000) / 1000,
      mapY: Math.round(mapY(y) * 1000) / 1000,
    };
    vertexMap.set(k, mapped);
    return mapped;
  }

  // Registra vértices de todos os segmentos
  for (const s of origSegs) {
    registerVertex(s.x0, s.y0);
    registerVertex(s.x1, s.y1);
  }

  // Registra endpoints dos arcos para amarrar perfeitamente arcos e segmentos
  for (const a of origArcs) {
    const isFull = Math.abs(Math.abs(a.endAngle - a.startAngle) - 360) < 1;
    if (!isFull) {
      const a0Rad = (a.startAngle * Math.PI) / 180;
      const a1Rad = (a.endAngle * Math.PI) / 180;
      registerVertex(a.cx + a.r * Math.cos(a0Rad), a.cy + a.r * Math.sin(a0Rad));
      registerVertex(a.cx + a.r * Math.cos(a1Rad), a.cy + a.r * Math.sin(a1Rad));
    }
  }

  // Constrói segmentos transformados usando exatamente os vértices compartilhados
  const segments: Segment2D[] = origSegs.map((s, idx) => {
    const v0 = registerVertex(s.x0, s.y0);
    const v1 = registerVertex(s.x1, s.y1);
    return {
      id: `${prefix}-seg-${idx}`,
      type: s.type === 'crease' ? 'crease' : (s.type === 'perfo' || s.type === 'perforation' ? 'perfo' : 'cut'),
      x0: v0.mapX,
      y0: v0.mapY,
      x1: v1.mapX,
      y1: v1.mapY,
    };
  });

  // 8. Transformação de Arcos Preservando Tangência e Continuidade Estrita
  const arcs: Arc2D[] = [];
  let extraCurveSegCount = 0;

  for (let idx = 0; idx < origArcs.length; idx++) {
    const a = origArcs[idx];
    const isFullCircle = Math.abs(Math.abs(a.endAngle - a.startAngle) - 360) < 1;

    if (isFullCircle) {
      // Furos circulares e alívios redondos preservam o centro transformado e raio
      const cxNew = mapX(a.cx);
      const cyNew = mapY(a.cy);
      const scaleLocal = ((mapX(a.cx + a.r) - cxNew) + (mapY(a.cy + a.r) - cyNew)) / (2 * a.r || 1);
      const rNew = Math.max(1.0, a.r * Math.abs(scaleLocal));

      arcs.push({
        id: `${prefix}-arc-${idx}`,
        type: a.type === 'crease' ? 'crease' : 'cut',
        cx: Math.round(cxNew * 1000) / 1000,
        cy: Math.round(cyNew * 1000) / 1000,
        r: Math.round(rNew * 1000) / 1000,
        startAngle: 0,
        endAngle: 360,
      });
    } else {
      // Arcos de canto, fillets e concordâncias de abas:
      // Para garantir que NENHUMA LINHA QUEBRE sob escala não-isotrópica (X != Y),
      // discretizamos o arco em uma cadeia de micro-segmentos conectando rigidamente
      // do endpoint v0 (mesmo vértice do segmento reto anterior) até v1 (mesmo vértice do segmento seguinte).
      const a0Rad = (a.startAngle * Math.PI) / 180;
      const a1Rad = (a.endAngle * Math.PI) / 180;
      const p0 = registerVertex(a.cx + a.r * Math.cos(a0Rad), a.cy + a.r * Math.sin(a0Rad));
      const p1 = registerVertex(a.cx + a.r * Math.cos(a1Rad), a.cy + a.r * Math.sin(a1Rad));

      let span = a.endAngle - a.startAngle;
      while (span < 0) span += 360;

      // Se o arco for um raio pequeno de concordância (< 15mm), 6 a 12 passos geram suavidade CAD industrial
      const steps = Math.max(6, Math.min(18, Math.round((span / 90) * 8)));
      const da = (span * Math.PI / 180) / steps;

      let lastPt = p0;
      for (let s = 1; s <= steps; s++) {
        let currPt;
        if (s === steps) {
          // Último passo conecta EXATAMENTE ao endpoint p1 do segmento adjacente (GAP ZERO)
          currPt = p1;
        } else {
          const ang = a0Rad + s * da;
          const origX = a.cx + a.r * Math.cos(ang);
          const origY = a.cy + a.r * Math.sin(ang);
          currPt = {
            mapX: Math.round(mapX(origX) * 1000) / 1000,
            mapY: Math.round(mapY(origY) * 1000) / 1000,
          };
        }

        segments.push({
          id: `${prefix}-arc-seg-${idx}-${s}`,
          type: a.type === 'crease' ? 'crease' : 'cut',
          x0: lastPt.mapX,
          y0: lastPt.mapY,
          x1: currPt.mapX,
          y1: currPt.mapY,
        });

        lastPt = currPt;
        extraCurveSegCount++;
      }
    }
  }

  // 9. BoundingBox da Geometria Regenerada
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

  // 10. Cotas Técnicas Fiéis
  const dimensions: DimensionLine[] = [];

  // Cotas Horizontais por Painel
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

  // Cotas Verticais
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

  // Cota Geral Aberta
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
