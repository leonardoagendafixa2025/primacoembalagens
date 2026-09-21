import type { DielineResult, Segment2D, Arc2D } from './types';

// Cache em memória de facas SVG já parseadas para performance instantânea
const svgDielineCache = new Map<string, DielineResult>();

export async function fetchAndParseSvgDieline(svgUrl: string, modelId: string): Promise<DielineResult> {
  if (svgDielineCache.has(modelId)) {
    return svgDielineCache.get(modelId)!;
  }
  const response = await fetch(svgUrl);
  if (!response.ok) {
    throw new Error(`Falha ao carregar SVG da faca: ${svgUrl}`);
  }
  const svgText = await response.text();
  const dieline = parseEngViewSvg(svgText);
  svgDielineCache.set(modelId, dieline);
  return dieline;
}

export function getLoadedSvgDieline(modelId: string): DielineResult | null {
  return svgDielineCache.get(modelId) || null;
}

export function setLoadedSvgDieline(modelId: string, dieline: DielineResult) {
  svgDielineCache.set(modelId, dieline);
}

/**
 * Parser de alta performance para Dielines industriais em SVG (EngView / Picador CAD)
 * Converte marcações vetoriais de corte (Cutting) e vinco (Creasing) em DielineResult
 */
export function parseEngViewSvg(svgText: string): DielineResult {
  // 1. Extração da translação global do grupo principal e fator de escala (96 DPI CSS px -> mm)
  const gMatch = svgText.match(/<g\s+transform=\"translate\(([-\d.]+),([-\d.]+)\)\s+scale\(1,-1\)\s*\"/);
  const tx = gMatch ? parseFloat(gMatch[1]) : 0;
  const SCALE_DPI = 96 / 25.4; // 1 mm = 3.779527559 px

  const rawSegments: Segment2D[] = [];
  const rawArcs: Arc2D[] = [];

  // 2. Parser de Linhas (<line>)
  const lineRegex = /<line\b([^>]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(svgText)) !== null) {
    const attrStr = m[1];
    const x1m = attrStr.match(/x1=\"([^\"]+)\"/);
    const y1m = attrStr.match(/y1=\"([^\"]+)\"/);
    const x2m = attrStr.match(/x2=\"([^\"]+)\"/);
    const y2m = attrStr.match(/y2=\"([^\"]+)\"/);
    const stylem = attrStr.match(/ev-style=\"([^\"]+)\"/);

    if (!x1m || !y1m || !x2m || !y2m || !stylem) continue;

    const style = stylem[1];
    if (!style.includes('Cutting') && !style.includes('Creasing')) continue;

    const rawX1 = (parseFloat(x1m[1]) + tx) / SCALE_DPI;
    const rawY1 = parseFloat(y1m[1]) / SCALE_DPI;
    const rawX2 = (parseFloat(x2m[1]) + tx) / SCALE_DPI;
    const rawY2 = parseFloat(y2m[1]) / SCALE_DPI;

    rawSegments.push({
      x0: rawX1,
      y0: rawY1,
      x1: rawX2,
      y1: rawY2,
      type: style.includes('Cutting') ? 'cut' : 'crease',
    });
  }

  // 3. Parser de Curvas e Caminhos (<path>)
  const pathRegex = /<path\b([^>]+)>/g;
  while ((m = pathRegex.exec(svgText)) !== null) {
    const attrStr = m[1];
    const dm = attrStr.match(/d=\"([^\"]+)\"/);
    const stylem = attrStr.match(/ev-style=\"([^\"]+)\"/);

    if (!dm) continue;
    let style = stylem ? stylem[1] : null;
    if (!style) {
      if (attrStr.includes('rgb(255,0,0)') || attrStr.includes('#ff0000') || attrStr.includes('red')) {
        style = 'Cutting';
      } else if (attrStr.includes('rgb(0,255,0)') || attrStr.includes('#00ff00') || attrStr.includes('green')) {
        style = 'Creasing';
      }
    }

    if (!style || (!style.includes('Cutting') && !style.includes('Creasing'))) continue;
    const type = style.includes('Cutting') ? 'cut' : 'crease';

    const d = dm[1];
    const tokens = d.match(/([a-zA-Z]|[-+]?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)/g) || [];
    let curX = 0, curY = 0;
    let startX = 0, startY = 0;
    let i = 0;

    while (i < tokens.length) {
      const cmd = tokens[i];
      if (/^[a-zA-Z]$/.test(cmd)) {
        i++;
        if (cmd === 'M' || cmd === 'm') {
          const nx = parseFloat(tokens[i++]);
          const ny = parseFloat(tokens[i++]);
          curX = cmd === 'm' ? curX + nx : nx;
          curY = cmd === 'm' ? curY + ny : ny;
          startX = curX;
          startY = curY;
        } else if (cmd === 'L' || cmd === 'l') {
          const nx = parseFloat(tokens[i++]);
          const ny = parseFloat(tokens[i++]);
          const targetX = cmd === 'l' ? curX + nx : nx;
          const targetY = cmd === 'l' ? curY + ny : ny;
          rawSegments.push({
            x0: (curX + tx) / SCALE_DPI,
            y0: curY / SCALE_DPI,
            x1: (targetX + tx) / SCALE_DPI,
            y1: targetY / SCALE_DPI,
            type,
          });
          curX = targetX;
          curY = targetY;
        } else if (cmd === 'H' || cmd === 'h') {
          const nx = parseFloat(tokens[i++]);
          const targetX = cmd === 'h' ? curX + nx : nx;
          rawSegments.push({
            x0: (curX + tx) / SCALE_DPI,
            y0: curY / SCALE_DPI,
            x1: (targetX + tx) / SCALE_DPI,
            y1: curY / SCALE_DPI,
            type,
          });
          curX = targetX;
        } else if (cmd === 'V' || cmd === 'v') {
          const ny = parseFloat(tokens[i++]);
          const targetY = cmd === 'v' ? curY + ny : ny;
          rawSegments.push({
            x0: (curX + tx) / SCALE_DPI,
            y0: curY / SCALE_DPI,
            x1: (curX + tx) / SCALE_DPI,
            y1: targetY / SCALE_DPI,
            type,
          });
          curY = targetY;
        } else if (cmd === 'Z' || cmd === 'z') {
          if (curX !== startX || curY !== startY) {
            rawSegments.push({
              x0: (curX + tx) / SCALE_DPI,
              y0: curY / SCALE_DPI,
              x1: (startX + tx) / SCALE_DPI,
              y1: startY / SCALE_DPI,
              type,
            });
            curX = startX;
            curY = startY;
          }
        } else if (cmd === 'A' || cmd === 'a') {
          // Arc SVG: rx ry x-axis-rotation large-arc-flag sweep-flag x y
          i += 5; // ignora parâmetros rx, ry, rot, largeArc, sweep
          const endXRaw = parseFloat(tokens[i++]);
          const endYRaw = parseFloat(tokens[i++]);
          const targetX = cmd === 'a' ? curX + endXRaw : endXRaw;
          const targetY = cmd === 'a' ? curY + endYRaw : endYRaw;

          rawSegments.push({
            x0: (curX + tx) / SCALE_DPI,
            y0: curY / SCALE_DPI,
            x1: (targetX + tx) / SCALE_DPI,
            y1: targetY / SCALE_DPI,
            type,
          });
          curX = targetX;
          curY = targetY;
        }
      } else {
        i++;
      }
    }
  }

  // 3.5 Parser de Círculos (<circle>), Elipses (<ellipse>) e Retângulos (<rect>)
  const circleRegex = /<circle\b([^>]+)>/g;
  while ((m = circleRegex.exec(svgText)) !== null) {
    const attrStr = m[1];
    const cxM = attrStr.match(/cx=\"([^\"]+)\"/);
    const cyM = attrStr.match(/cy=\"([^\"]+)\"/);
    const rM = attrStr.match(/r=\"([^\"]+)\"/);
    const stylem = attrStr.match(/ev-style=\"([^\"]+)\"/);
    if (!cxM || !cyM || !rM) continue;

    let style = stylem ? stylem[1] : 'Cutting';
    if (!style.includes('Cutting') && !style.includes('Creasing')) {
      if (attrStr.includes('rgb(255,0,0)') || attrStr.includes('#ff0000')) style = 'Cutting';
      else if (attrStr.includes('rgb(0,255,0)') || attrStr.includes('#00ff00')) style = 'Creasing';
      else continue;
    }
    const type = style.includes('Cutting') ? 'cut' : 'crease';

    const cx = (parseFloat(cxM[1]) + tx) / SCALE_DPI;
    const cy = parseFloat(cyM[1]) / SCALE_DPI;
    const r = parseFloat(rM[1]) / SCALE_DPI;

    rawArcs.push({ cx, cy, r, startAngle: 0, endAngle: 2 * Math.PI, type });

    const N = 48;
    for (let k = 0; k < N; k++) {
      const th0 = (2 * Math.PI * k) / N;
      const th1 = (2 * Math.PI * (k + 1)) / N;
      rawSegments.push({
        x0: cx + r * Math.cos(th0),
        y0: cy + r * Math.sin(th0),
        x1: cx + r * Math.cos(th1),
        y1: cy + r * Math.sin(th1),
        type,
      });
    }
  }

  const ellipseRegex = /<ellipse\b([^>]+)>/g;
  while ((m = ellipseRegex.exec(svgText)) !== null) {
    const attrStr = m[1];
    const cxM = attrStr.match(/cx=\"([^\"]+)\"/);
    const cyM = attrStr.match(/cy=\"([^\"]+)\"/);
    const rxM = attrStr.match(/rx=\"([^\"]+)\"/);
    const ryM = attrStr.match(/ry=\"([^\"]+)\"/);
    const stylem = attrStr.match(/ev-style=\"([^\"]+)\"/);
    if (!cxM || !cyM || !rxM || !ryM) continue;

    let style = stylem ? stylem[1] : 'Cutting';
    if (!style.includes('Cutting') && !style.includes('Creasing')) {
      if (attrStr.includes('rgb(255,0,0)') || attrStr.includes('#ff0000')) style = 'Cutting';
      else if (attrStr.includes('rgb(0,255,0)') || attrStr.includes('#00ff00')) style = 'Creasing';
      else continue;
    }
    const type = style.includes('Cutting') ? 'cut' : 'crease';

    const cx = (parseFloat(cxM[1]) + tx) / SCALE_DPI;
    const cy = parseFloat(cyM[1]) / SCALE_DPI;
    const rx = parseFloat(rxM[1]) / SCALE_DPI;
    const ry = parseFloat(ryM[1]) / SCALE_DPI;

    const N = 48;
    for (let k = 0; k < N; k++) {
      const th0 = (2 * Math.PI * k) / N;
      const th1 = (2 * Math.PI * (k + 1)) / N;
      rawSegments.push({
        x0: cx + rx * Math.cos(th0),
        y0: cy + ry * Math.sin(th0),
        x1: cx + rx * Math.cos(th1),
        y1: cy + ry * Math.sin(th1),
        type,
      });
    }
  }

  const rectRegex = /<rect\b([^>]+)>/g;
  while ((m = rectRegex.exec(svgText)) !== null) {
    const attrStr = m[1];
    const xM = attrStr.match(/x=\"([^\"]+)\"/);
    const yM = attrStr.match(/y=\"([^\"]+)\"/);
    const wM = attrStr.match(/width=\"([^\"]+)\"/);
    const hM = attrStr.match(/height=\"([^\"]+)\"/);
    const stylem = attrStr.match(/ev-style=\"([^\"]+)\"/);
    if (!xM || !yM || !wM || !hM) continue;

    let style = stylem ? stylem[1] : null;
    if (!style || (!style.includes('Cutting') && !style.includes('Creasing'))) {
      if (attrStr.includes('rgb(255,0,0)') || attrStr.includes('#ff0000')) style = 'Cutting';
      else if (attrStr.includes('rgb(0,255,0)') || attrStr.includes('#00ff00')) style = 'Creasing';
      else continue;
    }
    const type = style.includes('Cutting') ? 'cut' : 'crease';

    const rx0 = (parseFloat(xM[1]) + tx) / SCALE_DPI;
    const ry0 = parseFloat(yM[1]) / SCALE_DPI;
    const rw = parseFloat(wM[1]) / SCALE_DPI;
    const rh = parseFloat(hM[1]) / SCALE_DPI;

    rawSegments.push(
      { x0: rx0, y0: ry0, x1: rx0 + rw, y1: ry0, type },
      { x0: rx0 + rw, y0: ry0, x1: rx0 + rw, y1: ry0 + rh, type },
      { x0: rx0 + rw, y0: ry0 + rh, x1: rx0, y1: ry0 + rh, type },
      { x0: rx0, y0: ry0 + rh, x1: rx0, y1: ry0, type }
    );
  }

  // 4. Normalização do Bounding Box (origem no canto inferior esquerdo a 0, 0)
  if (rawSegments.length === 0) {
    return {
      bounds: { minX: 0, minY: 0, maxX: 400, maxY: 300, width: 400, height: 300 },
      segments: [],
      arcs: [],
      dimensions: [],
    };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of rawSegments) {
    minX = Math.min(minX, s.x0, s.x1);
    maxX = Math.max(maxX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1);
    maxY = Math.max(maxY, s.y0, s.y1);
  }

  const normSegments = rawSegments.map((s) => ({
    x0: Number((s.x0 - minX).toFixed(3)),
    y0: Number((s.y0 - minY).toFixed(3)),
    x1: Number((s.x1 - minX).toFixed(3)),
    y1: Number((s.y1 - minY).toFixed(3)),
    type: s.type,
  }));

  const normArcs = rawArcs.map((a) => ({
    ...a,
    cx: Number((a.cx - minX).toFixed(3)),
    cy: Number((a.cy - minY).toFixed(3)),
  }));

  return {
    bounds: {
      minX: 0,
      minY: 0,
      maxX: Number((maxX - minX).toFixed(3)),
      maxY: Number((maxY - minY).toFixed(3)),
      width: Number((maxX - minX).toFixed(3)),
      height: Number((maxY - minY).toFixed(3)),
    },
    segments: normSegments,
    arcs: normArcs,
    dimensions: [],
  };
}
