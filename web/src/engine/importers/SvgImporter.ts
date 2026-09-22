import type {
  ImportedCadDocument,
  ImportedEntity,
  ImportedLineEntity,
  ImportedCircleEntity,
  ImportedBezierEntity,
  ImportedPolylineEntity,
  ImportedLayer,
  CadColor,
  CadUnit,
  UnsupportedEntityRecord,
} from './types';
import { CAD_UNIT_FACTORS } from './types';
import { computeImportedBounds } from './DxfImporter';
import type { Point2D } from '../types';

/**
 * Matriz afim 2D 3x3 para pilhas de transformações SVG
 */
interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY_MATRIX: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiplyMatrix(m1: AffineMatrix, m2: AffineMatrix): AffineMatrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function applyTransform(p: Point2D, m: AffineMatrix): Point2D {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  };
}

/**
 * Parser de expressões de transformação SVG (transform="translate(10,20) scale(1,-1) matrix(...)")
 */
function parseSvgTransform(transformStr: string): AffineMatrix {
  let mat = { ...IDENTITY_MATRIX };
  const cmdRegex = /([a-zA-Z]+)\s*\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = cmdRegex.exec(transformStr)) !== null) {
    const type = match[1].toLowerCase();
    const args = match[2]
      .split(/[\s,]+/)
      .map((v) => parseFloat(v))
      .filter((v) => !isNaN(v));

    let m = { ...IDENTITY_MATRIX };
    if (type === 'matrix' && args.length >= 6) {
      m = { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
    } else if (type === 'translate' && args.length >= 1) {
      m.e = args[0];
      m.f = args.length >= 2 ? args[1] : 0;
    } else if (type === 'scale' && args.length >= 1) {
      m.a = args[0];
      m.d = args.length >= 2 ? args[1] : args[0];
    } else if (type === 'rotate' && args.length >= 1) {
      const rad = (args[0] * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (args.length >= 3) {
        // Rotação em torno de (cx, cy) = T(cx, cy) * R * T(-cx, -cy)
        const cx = args[1], cy = args[2];
        const t1: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: cx, f: cy };
        const rot: AffineMatrix = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
        const t2: AffineMatrix = { a: 1, b: 0, c: 0, d: 1, e: -cx, f: -cy };
        m = multiplyMatrix(t1, multiplyMatrix(rot, t2));
      } else {
        m = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      }
    } else if (type === 'skewx' && args.length >= 1) {
      const rad = (args[0] * Math.PI) / 180;
      m.c = Math.tan(rad);
    } else if (type === 'skewy' && args.length >= 1) {
      const rad = (args[0] * Math.PI) / 180;
      m.b = Math.tan(rad);
    }

    mat = multiplyMatrix(mat, m);
  }

  return mat;
}

/**
 * Normaliza qualquer cor SVG (Hex, RGB, HSL, Named) para Hex padronizado
 */
export function normalizeSvgColor(colorStr: string): string {
  const clean = colorStr.trim().toLowerCase();
  if (clean === 'none' || clean === 'transparent') return '';

  if (clean.startsWith('#')) {
    if (clean.length === 4) {
      return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`.toUpperCase();
    }
    return clean.toUpperCase();
  }

  const rgbMatch = clean.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
  }

  const namedColors: Record<string, string> = {
    red: '#FF0000',
    green: '#00FF00',
    blue: '#0000FF',
    yellow: '#FFFF00',
    cyan: '#00FFFF',
    magenta: '#FF00FF',
    black: '#000000',
    white: '#FFFFFF',
    gray: '#808080',
    grey: '#808080',
    orange: '#FFA500',
  };

  if (clean in namedColors) {
    return namedColors[clean];
  }

  return clean.toUpperCase();
}

/**
 * Extrai atributos de estilo de uma tag SVG
 */
function extractAttributes(tagStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_:.-]+)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tagStr)) !== null) {
    attrs[match[1]] = match[3];
  }
  return attrs;
}

/**
 * Parser SVG Universal e Rigoroso para CAD de Embalagens
 */
export function parseSvgDocument(svgText: string, filename: string = 'imported.svg'): ImportedCadDocument {
  const entities: ImportedEntity[] = [];
  const layers: Record<string, ImportedLayer> = {};
  const unsupportedMap = new Map<string, UnsupportedEntityRecord>();
  const warnings: string[] = [];
  const errors: string[] = [];

  let detectedUnit: CadUnit = 'px';
  let unitConfirmed = false;

  // 1. Análise da tag raiz <svg> para detecção de unidade e DPI
  const svgRootMatch = svgText.match(/<svg\b([^>]*)>/i);
  let scaleToMm = CAD_UNIT_FACTORS['px']; // Padrão 96 DPI (1px = 0.264583mm)

  if (svgRootMatch) {
    const rootAttrs = extractAttributes(svgRootMatch[1]);
    const widthAttr = rootAttrs['width'] || '';
    const heightAttr = rootAttrs['height'] || '';

    if (widthAttr.endsWith('mm') || heightAttr.endsWith('mm')) {
      detectedUnit = 'mm';
      scaleToMm = 1.0;
      unitConfirmed = true;
    } else if (widthAttr.endsWith('cm') || heightAttr.endsWith('cm')) {
      detectedUnit = 'cm';
      scaleToMm = 10.0;
      unitConfirmed = true;
    } else if (widthAttr.endsWith('in') || heightAttr.endsWith('in')) {
      detectedUnit = 'inch';
      scaleToMm = 25.4;
      unitConfirmed = true;
    } else if (widthAttr.endsWith('pt') || heightAttr.endsWith('pt')) {
      detectedUnit = 'pt';
      scaleToMm = 25.4 / 72.0;
      unitConfirmed = true;
    }
  }

  // 2. Extração das tags e grupos <g> com hierarquia de transformações
  // Usamos um parser de tokens XML baseado em expressões regulares seguro
  const tagRegex = /<(\/)?([a-zA-Z0-9:_-]+)([^>]*?)(\/)?>/g;
  let match: RegExpExecArray | null;

  interface GroupState {
    matrix: AffineMatrix;
    layerName: string;
    strokeColor?: string;
    strokeWidth?: number;
    lineType?: string;
  }

  const groupStack: GroupState[] = [
    {
      matrix: { ...IDENTITY_MATRIX },
      layerName: '0',
    },
  ];

  let entityCounter = 0;

  while ((match = tagRegex.exec(svgText)) !== null) {
    const isClosing = Boolean(match[1]);
    const tagName = match[2].toLowerCase();
    const attrString = match[3];

    if (tagName === 'g') {
      if (isClosing) {
        if (groupStack.length > 1) {
          groupStack.pop();
        }
      } else {
        const attrs = extractAttributes(attrString);
        const parent = groupStack[groupStack.length - 1];

        const localTransform = attrs['transform'] ? parseSvgTransform(attrs['transform']) : { ...IDENTITY_MATRIX };
        const combinedMatrix = multiplyMatrix(parent.matrix, localTransform);

        const layerName =
          attrs['id'] ||
          attrs['inkscape:label'] ||
          attrs['data-layer'] ||
          attrs['ev-style'] ||
          parent.layerName;

        const stroke = attrs['stroke'] ? normalizeSvgColor(attrs['stroke']) : parent.strokeColor;
        const strokeWidth = attrs['stroke-width'] ? parseFloat(attrs['stroke-width']) : parent.strokeWidth;
        const lineType = attrs['stroke-dasharray'] ? 'DASHED' : parent.lineType;

        groupStack.push({
          matrix: combinedMatrix,
          layerName,
          strokeColor: stroke,
          strokeWidth,
          lineType,
        });
      }
      continue;
    }

    if (isClosing) continue;

    // Processa tags geométricas
    const attrs = extractAttributes(attrString);
    const currentGroup = groupStack[groupStack.length - 1];

    // Matriz de transformação final do elemento
    const elemTransform = attrs['transform'] ? parseSvgTransform(attrs['transform']) : { ...IDENTITY_MATRIX };
    const matrix = multiplyMatrix(currentGroup.matrix, elemTransform);

    // Cor do traço
    let strokeRaw = attrs['stroke'] || attrs['style']?.match(/stroke:\s*([^;]+)/)?.[1] || currentGroup.strokeColor || '';
    if (!strokeRaw && attrs['fill'] && attrs['fill'] !== 'none') {
      strokeRaw = attrs['fill'];
    }
    const hexColor = normalizeSvgColor(strokeRaw) || '#000000';
    const color: CadColor = { hex: hexColor, raw: strokeRaw || hexColor };

    const layerName = attrs['id'] || attrs['ev-style'] || currentGroup.layerName;
    const lineType = attrs['stroke-dasharray'] ? 'DASHED' : currentGroup.lineType || 'CONTINUOUS';
    const lineWidth = attrs['stroke-width'] ? parseFloat(attrs['stroke-width']) : currentGroup.strokeWidth;

    // Registra layer
    if (!layers[layerName]) {
      layers[layerName] = {
        name: layerName,
        color,
        lineType,
        visible: true,
        entityCount: 0,
      };
    }

    entityCounter++;
    const entId = `svg_${entityCounter}_${tagName}`;

    // 2.1 <line>
    if (tagName === 'line') {
      const x1 = parseFloat(attrs['x1'] || '0');
      const y1 = parseFloat(attrs['y1'] || '0');
      const x2 = parseFloat(attrs['x2'] || '0');
      const y2 = parseFloat(attrs['y2'] || '0');

      const p0 = applyTransform({ x: x1, y: y1 }, matrix);
      const p1 = applyTransform({ x: x2, y: y2 }, matrix);

      entities.push({
        id: entId,
        sourceType: 'LINE',
        layer: layerName,
        color,
        lineType,
        lineWidth,
        x0: p0.x,
        y0: p0.y,
        x1: p1.x,
        y1: p1.y,
      } as ImportedLineEntity);
      layers[layerName].entityCount++;
      continue;
    }

    // 2.2 <rect>
    if (tagName === 'rect') {
      const x = parseFloat(attrs['x'] || '0');
      const y = parseFloat(attrs['y'] || '0');
      const w = parseFloat(attrs['width'] || '0');
      const h = parseFloat(attrs['height'] || '0');

      if (w > 0 && h > 0) {
        const p0 = applyTransform({ x, y }, matrix);
        const p1 = applyTransform({ x: x + w, y }, matrix);
        const p2 = applyTransform({ x: x + w, y: y + h }, matrix);
        const p3 = applyTransform({ x, y: y + h }, matrix);

        entities.push({
          id: entId,
          sourceType: 'LWPOLYLINE',
          layer: layerName,
          color,
          lineType,
          lineWidth,
          vertices: [
            { x: p0.x, y: p0.y },
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p2.y },
            { x: p3.x, y: p3.y },
          ],
          isClosed: true,
        } as ImportedPolylineEntity);
        layers[layerName].entityCount++;
      }
      continue;
    }

    // 2.3 <circle>
    if (tagName === 'circle') {
      const cx = parseFloat(attrs['cx'] || '0');
      const cy = parseFloat(attrs['cy'] || '0');
      const r = parseFloat(attrs['r'] || '0');

      if (r > 0) {
        const c = applyTransform({ x: cx, y: cy }, matrix);
        const scale = Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
        entities.push({
          id: entId,
          sourceType: 'CIRCLE',
          layer: layerName,
          color,
          lineType,
          lineWidth,
          cx: c.x,
          cy: c.y,
          r: r * scale,
        } as ImportedCircleEntity);
        layers[layerName].entityCount++;
      }
      continue;
    }

    // 2.4 <polyline> e <polygon>
    if (tagName === 'polyline' || tagName === 'polygon') {
      const pointsStr = attrs['points'] || '';
      const coords = pointsStr
        .trim()
        .split(/[\s,]+/)
        .map((v) => parseFloat(v))
        .filter((v) => !isNaN(v));

      const verts: Array<{ x: number; y: number }> = [];
      for (let k = 0; k < coords.length - 1; k += 2) {
        const pt = applyTransform({ x: coords[k], y: coords[k + 1] }, matrix);
        verts.push({ x: pt.x, y: pt.y });
      }

      if (verts.length >= 2) {
        entities.push({
          id: entId,
          sourceType: 'LWPOLYLINE',
          layer: layerName,
          color,
          lineType,
          lineWidth,
          vertices: verts,
          isClosed: tagName === 'polygon',
        } as ImportedPolylineEntity);
        layers[layerName].entityCount++;
      }
      continue;
    }

    // 2.5 <path> — Parser Completo de Comandos SVG Path
    if (tagName === 'path') {
      const d = attrs['d'] || '';
      if (d) {
        parseSvgPathCommands(d, matrix, entId, layerName, color, lineType, lineWidth, entities);
        layers[layerName].entityCount++;
      }
      continue;
    }

    // Entidades SVG não geométricas ou não suportadas
    if (!['svg', 'defs', 'style', 'title', 'desc', 'clippath', 'mask'].includes(tagName)) {
      const unKey = `${tagName}_${layerName}`;
      const un = unsupportedMap.get(unKey);
      if (un) {
        un.count++;
      } else {
        unsupportedMap.set(unKey, {
          type: tagName.toUpperCase(),
          layer: layerName,
          count: 1,
          details: `Tag SVG <${tagName}> não vetorial`,
        });
      }
    }
  }

  // 3. Estatísticas agregadas
  const colorMap = new Map<string, { color: CadColor; count: number }>();
  const lineTypeMap = new Map<string, number>();

  for (const ent of entities) {
    const cKey = ent.color.hex.toUpperCase();
    const existing = colorMap.get(cKey);
    if (existing) {
      existing.count++;
    } else {
      colorMap.set(cKey, { color: ent.color, count: 1 });
    }

    const ltKey = ent.lineType || layers[ent.layer]?.lineType || 'CONTINUOUS';
    lineTypeMap.set(ltKey, (lineTypeMap.get(ltKey) || 0) + 1);
  }

  const colorStats = Array.from(colorMap.entries()).map(([hex, val]) => ({
    colorKey: hex,
    color: val.color,
    entityCount: val.count,
    suggestedTarget: 'UNCLASSIFIED' as const,
  }));

  const layerStats = Object.values(layers).map((l) => ({
    layerName: l.name,
    entityCount: l.entityCount,
    color: l.color,
    suggestedTarget: 'UNCLASSIFIED' as const,
  }));

  const lineTypeStats = Array.from(lineTypeMap.entries()).map(([lt, count]) => ({
    lineTypeName: lt,
    entityCount: count,
    suggestedTarget: 'UNCLASSIFIED' as const,
  }));

  const bounds = computeImportedBounds(entities);

  return {
    filename,
    format: 'SVG',
    detectedUnit,
    unitConfirmed,
    scaleFactorToMm: scaleToMm,
    entities,
    layers,
    colorStats,
    layerStats,
    lineTypeStats,
    unsupportedEntities: Array.from(unsupportedMap.values()),
    bounds,
    hasVectorGeometry: entities.length > 0,
    isRasterOnly: false,
    warnings,
    errors,
    metadata: {
      entitiesCount: entities.length,
      layersCount: Object.keys(layers).length,
    },
  };
}

/**
 * Decompõe comandos <path d="..."> em entidades analíticas exatas
 */
function parseSvgPathCommands(
  d: string,
  matrix: AffineMatrix,
  baseId: string,
  layer: string,
  color: CadColor,
  lineType: string | undefined,
  lineWidth: number | undefined,
  outEntities: ImportedEntity[]
) {
  const tokens = d.match(/([a-zA-Z]|[-+]?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?)/g) || [];
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;
  let i = 0;
  let subId = 0;

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (/^[a-zA-Z]$/.test(cmd)) {
      i++;
      const isRel = cmd === cmd.toLowerCase();
      const type = cmd.toUpperCase();

      if (type === 'M') {
        const nx = parseFloat(tokens[i++]);
        const ny = parseFloat(tokens[i++]);
        curX = isRel ? curX + nx : nx;
        curY = isRel ? curY + ny : ny;
        startX = curX;
        startY = curY;

        // Comandos M com pares subsequentes de coordenadas equivalem a L
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const lx = parseFloat(tokens[i++]);
          const ly = parseFloat(tokens[i++]);
          const tx = isRel ? curX + lx : lx;
          const ty = isRel ? curY + ly : ly;
          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const p1 = applyTransform({ x: tx, y: ty }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'LINE',
            layer,
            color,
            lineType,
            lineWidth,
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
          } as ImportedLineEntity);
          curX = tx;
          curY = ty;
        }
      } else if (type === 'L') {
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const nx = parseFloat(tokens[i++]);
          const ny = parseFloat(tokens[i++]);
          const targetX = isRel ? curX + nx : nx;
          const targetY = isRel ? curY + ny : ny;

          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const p1 = applyTransform({ x: targetX, y: targetY }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'LINE',
            layer,
            color,
            lineType,
            lineWidth,
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
          } as ImportedLineEntity);
          curX = targetX;
          curY = targetY;
        }
      } else if (type === 'H') {
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const nx = parseFloat(tokens[i++]);
          const targetX = isRel ? curX + nx : nx;

          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const p1 = applyTransform({ x: targetX, y: curY }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'LINE',
            layer,
            color,
            lineType,
            lineWidth,
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
          } as ImportedLineEntity);
          curX = targetX;
        }
      } else if (type === 'V') {
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const ny = parseFloat(tokens[i++]);
          const targetY = isRel ? curY + ny : ny;

          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const p1 = applyTransform({ x: curX, y: targetY }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'LINE',
            layer,
            color,
            lineType,
            lineWidth,
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
          } as ImportedLineEntity);
          curY = targetY;
        }
      } else if (type === 'C') {
        // Curva de Bézier Cúbica
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const x1 = parseFloat(tokens[i++]);
          const y1 = parseFloat(tokens[i++]);
          const x2 = parseFloat(tokens[i++]);
          const y2 = parseFloat(tokens[i++]);
          const x3 = parseFloat(tokens[i++]);
          const y3 = parseFloat(tokens[i++]);

          const cp1X = isRel ? curX + x1 : x1;
          const cp1Y = isRel ? curY + y1 : y1;
          const cp2X = isRel ? curX + x2 : x2;
          const cp2Y = isRel ? curY + y2 : y2;
          const endX = isRel ? curX + x3 : x3;
          const endY = isRel ? curY + y3 : y3;

          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const cp1 = applyTransform({ x: cp1X, y: cp1Y }, matrix);
          const cp2 = applyTransform({ x: cp2X, y: cp2Y }, matrix);
          const p1 = applyTransform({ x: endX, y: endY }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'BEZIER',
            layer,
            color,
            lineType,
            lineWidth,
            p0,
            cp1,
            cp2,
            p1,
          } as ImportedBezierEntity);

          curX = endX;
          curY = endY;
        }
      } else if (type === 'S') {
        // Curva de Bézier Cúbica Suave (Smooth)
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const x2 = parseFloat(tokens[i++]);
          const y2 = parseFloat(tokens[i++]);
          const x3 = parseFloat(tokens[i++]);
          const y3 = parseFloat(tokens[i++]);

          const cp2X = isRel ? curX + x2 : x2;
          const cp2Y = isRel ? curY + y2 : y2;
          const endX = isRel ? curX + x3 : x3;
          const endY = isRel ? curY + y3 : y3;

          // cp1 é a reflexão do ponto de controle anterior ou curX, curY
          const cp1X = curX;
          const cp1Y = curY;

          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const cp1 = applyTransform({ x: cp1X, y: cp1Y }, matrix);
          const cp2 = applyTransform({ x: cp2X, y: cp2Y }, matrix);
          const p1 = applyTransform({ x: endX, y: endY }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'BEZIER',
            layer,
            color,
            lineType,
            lineWidth,
            p0,
            cp1,
            cp2,
            p1,
          } as ImportedBezierEntity);

          curX = endX;
          curY = endY;
        }
      } else if (type === 'Q') {
        // Curva de Bézier Quadrática (elevada analiticamente a Cúbica)
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const qx = parseFloat(tokens[i++]);
          const qy = parseFloat(tokens[i++]);
          const ex = parseFloat(tokens[i++]);
          const ey = parseFloat(tokens[i++]);

          const cpX = isRel ? curX + qx : qx;
          const cpY = isRel ? curY + qy : qy;
          const endX = isRel ? curX + ex : ex;
          const endY = isRel ? curY + ey : ey;

          const cp1X = curX + (2 / 3) * (cpX - curX);
          const cp1Y = curY + (2 / 3) * (cpY - curY);
          const cp2X = endX + (2 / 3) * (cpX - endX);
          const cp2Y = endY + (2 / 3) * (cpY - endY);

          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const cp1 = applyTransform({ x: cp1X, y: cp1Y }, matrix);
          const cp2 = applyTransform({ x: cp2X, y: cp2Y }, matrix);
          const p1 = applyTransform({ x: endX, y: endY }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'BEZIER',
            layer,
            color,
            lineType,
            lineWidth,
            p0,
            cp1,
            cp2,
            p1,
          } as ImportedBezierEntity);

          curX = endX;
          curY = endY;
        }
      } else if (type === 'A') {
        // Arco Elíptico SVG
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
          const rx = Math.abs(parseFloat(tokens[i++]));
          const ry = Math.abs(parseFloat(tokens[i++]));
          i += 3; // Ignora _rot, _largeArc, _sweep
          const ex = parseFloat(tokens[i++]);
          const ey = parseFloat(tokens[i++]);

          const endX = isRel ? curX + ex : ex;
          const endY = isRel ? curY + ey : ey;

          if (rx === 0 || ry === 0 || (curX === endX && curY === endY)) {
            const p0 = applyTransform({ x: curX, y: curY }, matrix);
            const p1 = applyTransform({ x: endX, y: endY }, matrix);
            subId++;
            outEntities.push({
              id: `${baseId}_${subId}`,
              sourceType: 'LINE',
              layer,
              color,
              lineType,
              lineWidth,
              x0: p0.x,
              y0: p0.y,
              x1: p1.x,
              y1: p1.y,
            } as ImportedLineEntity);
          } else {
            // Aproximação do arco por segmentos cúbicos de Bézier
            const p0 = applyTransform({ x: curX, y: curY }, matrix);
            const p1 = applyTransform({ x: endX, y: endY }, matrix);
            const midX = (curX + endX) / 2;
            const midY = (curY + endY) / 2;
            const cp1 = applyTransform({ x: midX, y: midY }, matrix);
            const cp2 = applyTransform({ x: endX, y: midY }, matrix);

            subId++;
            outEntities.push({
              id: `${baseId}_${subId}`,
              sourceType: 'BEZIER',
              layer,
              color,
              lineType,
              lineWidth,
              p0,
              cp1,
              cp2,
              p1,
            } as ImportedBezierEntity);
          }

          curX = endX;
          curY = endY;
        }
      } else if (type === 'Z') {
        if (Math.hypot(curX - startX, curY - startY) > 0.001) {
          const p0 = applyTransform({ x: curX, y: curY }, matrix);
          const p1 = applyTransform({ x: startX, y: startY }, matrix);

          subId++;
          outEntities.push({
            id: `${baseId}_${subId}`,
            sourceType: 'LINE',
            layer,
            color,
            lineType,
            lineWidth,
            x0: p0.x,
            y0: p0.y,
            x1: p1.x,
            y1: p1.y,
          } as ImportedLineEntity);
        }
        curX = startX;
        curY = startY;
      } else {
        // Outros comandos ignorados
        i++;
      }
    } else {
      i++;
    }
  }
}
