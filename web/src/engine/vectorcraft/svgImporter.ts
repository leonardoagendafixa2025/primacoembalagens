/**
 * VectorCraft Engine — Importador SVG para DielineResult do PLMPackLib
 * Converte arquivos SVG vetoriais gerados no VectorCraft ou Illustrator
 * de volta para a estrutura geométrica do PLMPackLib (Segment2D e Arc2D).
 */

import type { DielineResult, Segment2D, Arc2D } from '../types';

interface SvgParseResult {
  dieline: DielineResult;
  stats: {
    cutSegments: number;
    creaseSegments: number;
    perfoSegments: number;
    totalEntities: number;
  };
}

/**
 * Converte uma cor ou atributo SVG em tipo de linha de embalagem
 */
function classifyLineType(stroke: string, layerName: string): 'cut' | 'crease' | 'perfo' | 'dimension' {
  const s = (stroke || '').toLowerCase();
  const l = (layerName || '').toLowerCase();

  if (l.includes('corte') || l.includes('cut') || l.includes('die')) return 'cut';
  if (l.includes('vinco') || l.includes('crease') || l.includes('fold')) return 'crease';
  if (l.includes('picote') || l.includes('perfo')) return 'perfo';
  if (l.includes('cota') || l.includes('dim')) return 'dimension';

  // Por cor de traço
  if (s.includes('red') || s.includes('#ef4444') || s.includes('#ff0000') || s.includes('#f00') || s.includes('rgb(239') || s.includes('rgb(255, 0, 0)')) {
    return 'cut';
  }
  if (s.includes('blue') || s.includes('#3b82f6') || s.includes('#0000ff') || s.includes('#00f') || s.includes('rgb(59') || s.includes('rgb(0, 0, 255)')) {
    return 'crease';
  }
  if (s.includes('green') || s.includes('#10b981') || s.includes('#00ff00') || s.includes('#0f0') || s.includes('rgb(16') || s.includes('rgb(0, 255, 0)')) {
    return 'perfo';
  }

  // Padrão: linha de corte
  return 'cut';
}

/**
 * Analisa uma string SVG e extrai linhas, polilinhas e caminhos como DielineResult
 */
export function parseSvgToDieline(svgText: string): SvgParseResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  const segments: Segment2D[] = [];
  const arcs: Arc2D[] = [];

  // Busca todos os elementos gráficos
  const elements = doc.querySelectorAll('line, rect, polyline, polygon, path, circle');

  elements.forEach((el) => {
    const parentG = el.closest('g');
    const layerName = (parentG?.getAttribute('id') || parentG?.getAttribute('data-name') || '') + ' ' + (el.getAttribute('id') || '');
    const stroke = el.getAttribute('stroke') || parentG?.getAttribute('stroke') || '#ef4444';
    const type = classifyLineType(stroke, layerName);

    const tagName = el.tagName.toLowerCase();

    if (tagName === 'line') {
      const x0 = parseFloat(el.getAttribute('x1') || '0');
      const y0 = parseFloat(el.getAttribute('y1') || '0');
      const x1 = parseFloat(el.getAttribute('x2') || '0');
      const y1 = parseFloat(el.getAttribute('y2') || '0');
      if (!isNaN(x0) && !isNaN(y0) && !isNaN(x1) && !isNaN(y1)) {
        segments.push({ x0, y0, x1, y1, type });
      }
    } else if (tagName === 'rect') {
      const x = parseFloat(el.getAttribute('x') || '0');
      const y = parseFloat(el.getAttribute('y') || '0');
      const w = parseFloat(el.getAttribute('width') || '0');
      const h = parseFloat(el.getAttribute('height') || '0');
      if (w > 0 && h > 0) {
        segments.push({ x0: x, y0: y, x1: x + w, y1: y, type });
        segments.push({ x0: x + w, y0: y, x1: x + w, y1: y + h, type });
        segments.push({ x0: x + w, y0: y + h, x1: x, y1: y + h, type });
        segments.push({ x0: x, y0: y + h, x1: x, y1: y, type });
      }
    } else if (tagName === 'polyline' || tagName === 'polygon') {
      const ptsAttr = el.getAttribute('points') || '';
      const pairs = ptsAttr.trim().split(/[\s,]+/);
      const coords: { x: number; y: number }[] = [];
      for (let i = 0; i < pairs.length - 1; i += 2) {
        const x = parseFloat(pairs[i]);
        const y = parseFloat(pairs[i + 1]);
        if (!isNaN(x) && !isNaN(y)) coords.push({ x, y });
      }
      for (let i = 0; i < coords.length - 1; i++) {
        segments.push({
          x0: coords[i].x,
          y0: coords[i].y,
          x1: coords[i + 1].x,
          y1: coords[i + 1].y,
          type,
        });
      }
      if (tagName === 'polygon' && coords.length > 2) {
        segments.push({
          x0: coords[coords.length - 1].x,
          y0: coords[coords.length - 1].y,
          x1: coords[0].x,
          y1: coords[0].y,
          type,
        });
      }
    } else if (tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx') || '0');
      const cy = parseFloat(el.getAttribute('cy') || '0');
      const r = parseFloat(el.getAttribute('r') || '0');
      if (r > 0) {
        arcs.push({
          cx,
          cy,
          r,
          startAngle: 0,
          endAngle: 360,
          type,
        });
      }
    } else if (tagName === 'path') {
      const d = el.getAttribute('d') || '';
      parsePathData(d, type, segments);
    }
  });

  // Calcula Bounding Box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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

  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  const bounds = {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };

  const cutCount = segments.filter(s => s.type === 'cut').length;
  const creaseCount = segments.filter(s => s.type === 'crease').length;
  const perfoCount = segments.filter(s => s.type === 'perfo').length;

  return {
    dieline: {
      segments,
      arcs,
      dimensions: [],
      bounds,
    },
    stats: {
      cutSegments: cutCount,
      creaseSegments: creaseCount,
      perfoSegments: perfoCount,
      totalEntities: segments.length + arcs.length,
    },
  };
}

/**
 * Parser de d="..." do SVG simplificado para comandos lineares (M, L, H, V, Z)
 */
function parsePathData(d: string, type: 'cut' | 'crease' | 'perfo' | 'dimension', segments: Segment2D[]) {
  const commandRegex = /([a-df-z])([^a-df-z]*)/gi;
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  let match: RegExpExecArray | null;
  while ((match = commandRegex.exec(d)) !== null) {
    const cmd = match[1];
    const argsStr = match[2].trim();
    const args = argsStr ? argsStr.split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n)) : [];

    const isRelative = cmd === cmd.toLowerCase();
    const command = cmd.toUpperCase();

    if (command === 'M') {
      if (args.length >= 2) {
        currentX = isRelative ? currentX + args[0] : args[0];
        currentY = isRelative ? currentY + args[1] : args[1];
        startX = currentX;
        startY = currentY;

        for (let i = 2; i < args.length - 1; i += 2) {
          const nx = isRelative ? currentX + args[i] : args[i];
          const ny = isRelative ? currentY + args[i + 1] : args[i + 1];
          segments.push({ x0: currentX, y0: currentY, x1: nx, y1: ny, type });
          currentX = nx;
          currentY = ny;
        }
      }
    } else if (command === 'L') {
      for (let i = 0; i < args.length - 1; i += 2) {
        const nx = isRelative ? currentX + args[i] : args[i];
        const ny = isRelative ? currentY + args[i + 1] : args[i + 1];
        segments.push({ x0: currentX, y0: currentY, x1: nx, y1: ny, type });
        currentX = nx;
        currentY = ny;
      }
    } else if (command === 'H') {
      for (const val of args) {
        const nx = isRelative ? currentX + val : val;
        segments.push({ x0: currentX, y0: currentY, x1: nx, y1: currentY, type });
        currentX = nx;
      }
    } else if (command === 'V') {
      for (const val of args) {
        const ny = isRelative ? currentY + val : val;
        segments.push({ x0: currentX, y0: currentY, x1: currentX, y1: ny, type });
        currentY = ny;
      }
    } else if (command === 'C') {
      // Curva cúbica Bézier — aproximação linear simples de 4 passos
      for (let i = 0; i < args.length - 5; i += 6) {
        const x1 = isRelative ? currentX + args[i] : args[i];
        const y1 = isRelative ? currentY + args[i + 1] : args[i + 1];
        const x2 = isRelative ? currentX + args[i + 2] : args[i + 2];
        const y2 = isRelative ? currentY + args[i + 3] : args[i + 3];
        const x3 = isRelative ? currentX + args[i + 4] : args[i + 4];
        const y3 = isRelative ? currentY + args[i + 5] : args[i + 5];

        let prevX = currentX;
        let prevY = currentY;
        const steps = 4;
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const inv = 1 - t;
          const px = inv * inv * inv * currentX + 3 * inv * inv * t * x1 + 3 * inv * t * t * x2 + t * t * t * x3;
          const py = inv * inv * inv * currentY + 3 * inv * inv * t * y1 + 3 * inv * t * t * y2 + t * t * t * y3;
          segments.push({ x0: prevX, y0: prevY, x1: px, y1: py, type });
          prevX = px;
          prevY = py;
        }
        currentX = x3;
        currentY = y3;
      }
    } else if (command === 'Z') {
      if (Math.hypot(currentX - startX, currentY - startY) > 0.01) {
        segments.push({ x0: currentX, y0: currentY, x1: startX, y1: startY, type });
      }
      currentX = startX;
      currentY = startY;
    }
  }
}
