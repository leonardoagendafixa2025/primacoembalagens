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
  // 1. Extração da translação global do grupo principal
  const gMatch = svgText.match(/<g\s+transform=\"translate\(([-\d.]+),([-\d.]+)\)\s+scale\(1,-1\)\s*\"/);
  const tx = gMatch ? parseFloat(gMatch[1]) : 0;

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

    const rawX1 = parseFloat(x1m[1]);
    const rawY1 = parseFloat(y1m[1]);
    const rawX2 = parseFloat(x2m[1]);
    const rawY2 = parseFloat(y2m[1]);

    rawSegments.push({
      x0: rawX1 + tx,
      y0: rawY1,
      x1: rawX2 + tx,
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
            x0: curX + tx,
            y0: curY,
            x1: targetX + tx,
            y1: targetY,
            type,
          });
          curX = targetX;
          curY = targetY;
        } else if (cmd === 'H' || cmd === 'h') {
          const nx = parseFloat(tokens[i++]);
          const targetX = cmd === 'h' ? curX + nx : nx;
          rawSegments.push({
            x0: curX + tx,
            y0: curY,
            x1: targetX + tx,
            y1: curY,
            type,
          });
          curX = targetX;
        } else if (cmd === 'V' || cmd === 'v') {
          const ny = parseFloat(tokens[i++]);
          const targetY = cmd === 'v' ? curY + ny : ny;
          rawSegments.push({
            x0: curX + tx,
            y0: curY,
            x1: curX + tx,
            y1: targetY,
            type,
          });
          curY = targetY;
        } else if (cmd === 'Z' || cmd === 'z') {
          if (curX !== startX || curY !== startY) {
            rawSegments.push({
              x0: curX + tx,
              y0: curY,
              x1: startX + tx,
              y1: startY,
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
            x0: curX + tx,
            y0: curY,
            x1: targetX + tx,
            y1: targetY,
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
    arcs: rawArcs,
    dimensions: [],
  };
}
