import type {
  ImportedCadDocument,
  ImportedEntity,
  ImportedLineEntity,
  ImportedBezierEntity,
  ImportedLayer,
  CadColor,
  CadUnit,
  UnsupportedEntityRecord,
} from './types';
import { CAD_UNIT_FACTORS } from './types';
import { computeImportedBounds } from './DxfImporter';
import type { Point2D } from '../types';

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
 * Converte cor CMYK para Hex
 */
export function cmykToHex(c: number, m: number, y: number, k: number): string {
  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

/**
 * Converte cor RGB [0..1] para Hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const r255 = Math.min(255, Math.max(0, Math.round(r * 255)));
  const g255 = Math.min(255, Math.max(0, Math.round(g * 255)));
  const b255 = Math.min(255, Math.max(0, Math.round(b * 255)));
  return `#${((1 << 24) + (r255 << 16) + (g255 << 8) + b255).toString(16).slice(1).toUpperCase()}`;
}

import * as fflate from 'fflate';

/**
 * Descompressor Flate/Deflate isomórfico (Node.js + Navegador) usando fflate
 */
function inflatePdfStream(bytes: Uint8Array): Uint8Array | null {
  try {
    return fflate.unzlibSync(bytes);
  } catch {
    try {
      return fflate.inflateSync(bytes);
    } catch {
      return null;
    }
  }
}

/**
 * Busca sequência de bytes em um buffer Uint8Array
 */
function findByteSequence(haystack: Uint8Array, needle: number[], start: number = 0): number {
  const nLen = needle.length;
  const limit = haystack.length - nLen;
  for (let i = start; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/**
 * Extrai streams de conteúdo vetorial de um arquivo PDF de forma segura para binários
 */
export function extractPdfContentStreams(pdfBuffer: Uint8Array): string[] {
  const streams: string[] = [];
  const STREAM_NEEDLE = [0x73, 0x74, 0x72, 0x65, 0x61, 0x6d]; // "stream"
  const ENDSTREAM_NEEDLE = [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d]; // "endstream"

  let searchPos = 0;
  while (searchPos < pdfBuffer.length) {
    const streamPos = findByteSequence(pdfBuffer, STREAM_NEEDLE, searchPos);
    if (streamPos === -1) break;

    // Determina o início real dos bytes do stream após newline (\r\n ou \n)
    let dataStart = streamPos + 6;
    if (dataStart < pdfBuffer.length && pdfBuffer[dataStart] === 0x0d) dataStart++;
    if (dataStart < pdfBuffer.length && pdfBuffer[dataStart] === 0x0a) dataStart++;

    // Procura "endstream"
    const endPos = findByteSequence(pdfBuffer, ENDSTREAM_NEEDLE, dataStart);
    if (endPos === -1) {
      searchPos = streamPos + 6;
      continue;
    }

    // Remove \r ou \n anteriores a "endstream"
    let dataEnd = endPos;
    while (dataEnd > dataStart && (pdfBuffer[dataEnd - 1] === 0x0a || pdfBuffer[dataEnd - 1] === 0x0d)) {
      dataEnd--;
    }

    const streamBytes = pdfBuffer.subarray(dataStart, dataEnd);

    // Tenta descompressão FlateDecode
    const decompressed = inflatePdfStream(streamBytes);
    const contentText = new TextDecoder('latin1').decode(decompressed || streamBytes);

    // Verifica se possui operadores gráficos vetoriais do PDF
    if (/(\b\d+(\.\d+)?\s+\d+(\.\d+)?\s+[mlc]\b|\b[Qq]\b|\bcm\b|\b[SsfFbB]\b)/.test(contentText)) {
      streams.push(contentText);
    }

    searchPos = endPos + 9;
  }

  return streams;
}

/**
 * Parser de PDF Vetorial para CAD de Embalagens
 */
export function parsePdfDocument(
  pdfData: Uint8Array | string,
  filename: string = 'imported.pdf'
): ImportedCadDocument {
  const bytes = typeof pdfData === 'string' ? new TextEncoder().encode(pdfData) : pdfData;
  const streams = extractPdfContentStreams(bytes);

  const entities: ImportedEntity[] = [];
  const layers: Record<string, ImportedLayer> = {
    '0': { name: '0', color: { hex: '#000000', raw: 'RGB:0,0,0' }, lineType: 'CONTINUOUS', visible: true, entityCount: 0 },
  };
  const unsupportedMap = new Map<string, UnsupportedEntityRecord>();
  const warnings: string[] = [];
  const errors: string[] = [];

  const detectedUnit: CadUnit = 'pt'; // PDFs usam pontos tipográficos 1/72 pol por padrão
  const scaleToMm = CAD_UNIT_FACTORS['pt']; // 1 pt = 0.352778 mm
  const unitConfirmed = true;

  // Detecta se o PDF possui apenas imagens rasterizadas (XObject /Subtype /Image)
  const fullText = new TextDecoder('latin1').decode(bytes);
  const hasRasterImages = fullText.includes('/Subtype /Image') || fullText.includes('/Image');

  if (streams.length === 0) {
    if (hasRasterImages) {
      return {
        filename,
        format: 'PDF',
        detectedUnit,
        unitConfirmed: false,
        scaleFactorToMm: scaleToMm,
        entities: [],
        layers,
        colorStats: [],
        layerStats: [],
        lineTypeStats: [],
        unsupportedEntities: [
          { type: 'RASTER_IMAGE', layer: '0', count: 1, details: 'PDF contém apenas imagens rasterizadas sem vetores CAD.' },
        ],
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
        hasVectorGeometry: false,
        isRasterOnly: true,
        warnings: [],
        errors: ['Este PDF não contém geometria vetorial suficiente para importação CAD.'],
        metadata: { isRasterOnly: true },
      };
    }
  }

  // Processa os streams vetoriais
  let entityCounter = 0;

  for (const stream of streams) {
    const tokens = stream.match(/(\/[a-zA-Z0-9_-]+|[-+]?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?|[a-zA-Z*]+)/g) || [];

    // Estado gráfico do PDF
    interface GraphicsState {
      ctm: AffineMatrix;
      strokeColor: CadColor;
      fillColor: CadColor;
      lineWidth: number;
      lineType: string;
      currentLayer: string;
    }

    const stateStack: GraphicsState[] = [
      {
        ctm: { ...IDENTITY_MATRIX },
        strokeColor: { hex: '#000000', raw: 'RGB:0,0,0' },
        fillColor: { hex: '#000000', raw: 'RGB:0,0,0' },
        lineWidth: 1.0,
        lineType: 'CONTINUOUS',
        currentLayer: '0',
      },
    ];

    // Subpath atual
    interface SubPathItem {
      type: 'LINE' | 'BEZIER';
      p0: Point2D;
      cp1?: Point2D;
      cp2?: Point2D;
      p1: Point2D;
    }
    let currentSubpath: SubPathItem[] = [];
    let curX = 0, curY = 0;
    let startX = 0, startY = 0;

    let idx = 0;
    const stack: number[] = [];

    while (idx < tokens.length) {
      const tok = tokens[idx++];

      if (/^[-+]?[0-9]*\.?[0-9]+(?:e[-+]?[0-9]+)?$/.test(tok)) {
        stack.push(parseFloat(tok));
        continue;
      }

      const currentState = stateStack[stateStack.length - 1];

      // Operadores de estado gráfico
      if (tok === 'q') {
        stateStack.push({
          ctm: { ...currentState.ctm },
          strokeColor: { ...currentState.strokeColor },
          fillColor: { ...currentState.fillColor },
          lineWidth: currentState.lineWidth,
          lineType: currentState.lineType,
          currentLayer: currentState.currentLayer,
        });
        stack.length = 0;
        continue;
      }

      if (tok === 'Q') {
        if (stateStack.length > 1) {
          stateStack.pop();
        }
        stack.length = 0;
        continue;
      }

      if (tok === 'cm' && stack.length >= 6) {
        const m: AffineMatrix = {
          a: stack[stack.length - 6],
          b: stack[stack.length - 5],
          c: stack[stack.length - 4],
          d: stack[stack.length - 3],
          e: stack[stack.length - 2],
          f: stack[stack.length - 1],
        };
        currentState.ctm = multiplyMatrix(currentState.ctm, m);
        stack.length = 0;
        continue;
      }

      // Cores: RG / rg (RGB), K / k (CMYK), G / g (Grayscale)
      if ((tok === 'RG' || tok === 'rg') && stack.length >= 3) {
        const r = stack[stack.length - 3];
        const g = stack[stack.length - 2];
        const b = stack[stack.length - 1];
        const hex = rgbToHex(r, g, b);
        const color: CadColor = { hex, raw: `RGB:${r},${g},${b}`, rgb: { r: r * 255, g: g * 255, b: b * 255 } };
        if (tok === 'RG') currentState.strokeColor = color;
        else currentState.fillColor = color;
        stack.length = 0;
        continue;
      }

      if ((tok === 'K' || tok === 'k') && stack.length >= 4) {
        const c = stack[stack.length - 4];
        const m = stack[stack.length - 3];
        const y = stack[stack.length - 2];
        const k = stack[stack.length - 1];
        const hex = cmykToHex(c, m, y, k);
        const color: CadColor = { hex, raw: `CMYK:${c},${m},${y},${k}`, cmyk: { c, m, y, k } };
        if (tok === 'K') currentState.strokeColor = color;
        else currentState.fillColor = color;
        stack.length = 0;
        continue;
      }

      if ((tok === 'G' || tok === 'g') && stack.length >= 1) {
        const gray = stack[stack.length - 1];
        const hex = rgbToHex(gray, gray, gray);
        const color: CadColor = { hex, raw: `Gray:${gray}` };
        if (tok === 'G') currentState.strokeColor = color;
        else currentState.fillColor = color;
        stack.length = 0;
        continue;
      }

      // Espessura e tracejado
      if (tok === 'w' && stack.length >= 1) {
        currentState.lineWidth = stack[stack.length - 1];
        stack.length = 0;
        continue;
      }

      if (tok === 'd') {
        currentState.lineType = 'DASHED';
        stack.length = 0;
        continue;
      }

      // Geometria de caminhos: m (moveto), l (lineto), c (curveto), re (rectangle), h (close)
      if (tok === 'm' && stack.length >= 2) {
        curX = stack[stack.length - 2];
        curY = stack[stack.length - 1];
        startX = curX;
        startY = curY;
        stack.length = 0;
        continue;
      }

      if (tok === 'l' && stack.length >= 2) {
        const x = stack[stack.length - 2];
        const y = stack[stack.length - 1];
        const p0 = applyTransform({ x: curX, y: curY }, currentState.ctm);
        const p1 = applyTransform({ x, y }, currentState.ctm);

        currentSubpath.push({ type: 'LINE', p0, p1 });
        curX = x;
        curY = y;
        stack.length = 0;
        continue;
      }

      if (tok === 'c' && stack.length >= 6) {
        const x1 = stack[stack.length - 6];
        const y1 = stack[stack.length - 5];
        const x2 = stack[stack.length - 4];
        const y2 = stack[stack.length - 3];
        const x3 = stack[stack.length - 2];
        const y3 = stack[stack.length - 1];

        const p0 = applyTransform({ x: curX, y: curY }, currentState.ctm);
        const cp1 = applyTransform({ x: x1, y: y1 }, currentState.ctm);
        const cp2 = applyTransform({ x: x2, y: y2 }, currentState.ctm);
        const p1 = applyTransform({ x: x3, y: y3 }, currentState.ctm);

        currentSubpath.push({ type: 'BEZIER', p0, cp1, cp2, p1 });
        curX = x3;
        curY = y3;
        stack.length = 0;
        continue;
      }

      // Operador v: Curva de Bézier cúbica com ponto inicial como 1º ponto de controle
      if (tok === 'v' && stack.length >= 4) {
        const x2 = stack[stack.length - 4];
        const y2 = stack[stack.length - 3];
        const x3 = stack[stack.length - 2];
        const y3 = stack[stack.length - 1];

        const p0 = applyTransform({ x: curX, y: curY }, currentState.ctm);
        const cp1 = { ...p0 };
        const cp2 = applyTransform({ x: x2, y: y2 }, currentState.ctm);
        const p1 = applyTransform({ x: x3, y: y3 }, currentState.ctm);

        currentSubpath.push({ type: 'BEZIER', p0, cp1, cp2, p1 });
        curX = x3;
        curY = y3;
        stack.length = 0;
        continue;
      }

      // Operador y: Curva de Bézier cúbica com ponto final como 2º ponto de controle
      if (tok === 'y' && stack.length >= 4) {
        const x1 = stack[stack.length - 4];
        const y1 = stack[stack.length - 3];
        const x3 = stack[stack.length - 2];
        const y3 = stack[stack.length - 1];

        const p0 = applyTransform({ x: curX, y: curY }, currentState.ctm);
        const cp1 = applyTransform({ x: x1, y: y1 }, currentState.ctm);
        const p1 = applyTransform({ x: x3, y: y3 }, currentState.ctm);
        const cp2 = { ...p1 };

        currentSubpath.push({ type: 'BEZIER', p0, cp1, cp2, p1 });
        curX = x3;
        curY = y3;
        stack.length = 0;
        continue;
      }

      if (tok === 're' && stack.length >= 4) {
        const rx = stack[stack.length - 4];
        const ry = stack[stack.length - 3];
        const rw = stack[stack.length - 2];
        const rh = stack[stack.length - 1];

        const p0 = applyTransform({ x: rx, y: ry }, currentState.ctm);
        const p1 = applyTransform({ x: rx + rw, y: ry }, currentState.ctm);
        const p2 = applyTransform({ x: rx + rw, y: ry + rh }, currentState.ctm);
        const p3 = applyTransform({ x: rx, y: ry + rh }, currentState.ctm);

        currentSubpath.push({ type: 'LINE', p0, p1 });
        currentSubpath.push({ type: 'LINE', p0: p1, p1: p2 });
        currentSubpath.push({ type: 'LINE', p0: p2, p1: p3 });
        currentSubpath.push({ type: 'LINE', p0: p3, p1: p0 });
        curX = rx;
        curY = ry;
        startX = rx;
        startY = ry;
        stack.length = 0;
        continue;
      }

      if (tok === 'h') {
        if (Math.hypot(curX - startX, curY - startY) > 0.001) {
          const p0 = applyTransform({ x: curX, y: curY }, currentState.ctm);
          const p1 = applyTransform({ x: startX, y: startY }, currentState.ctm);
          currentSubpath.push({ type: 'LINE', p0, p1 });
        }
        curX = startX;
        curY = startY;
        stack.length = 0;
        continue;
      }

      // Detecção de spot color / separação / marked content
      if (tok === 'CS' || tok === 'cs' || tok === 'SCN' || tok === 'scn') {
        const prevTok = idx >= 2 ? tokens[idx - 2] : '';
        if (prevTok.startsWith('/')) {
          const name = prevTok.slice(1);
          if (/cut|crease|perf|die|fac|vinc|cort/i.test(name)) {
            currentState.strokeColor.name = name;
            currentState.currentLayer = name;
            if (!layers[name]) {
              layers[name] = {
                name,
                color: currentState.strokeColor,
                lineType: currentState.lineType,
                visible: true,
                entityCount: 0,
              };
            }
          }
        }
      }

      // Operadores de pintura de traço: S, s, B, B*, b, b*, f, F, f*, n
      if (['S', 's', 'B', 'B*', 'b', 'b*', 'f', 'F', 'f*'].includes(tok)) {
        // Operadores com fechamento automático de subpath (s, b, b*)
        if (['s', 'b', 'b*'].includes(tok)) {
          if (Math.hypot(curX - startX, curY - startY) > 0.001) {
            const p0 = applyTransform({ x: curX, y: curY }, currentState.ctm);
            const p1 = applyTransform({ x: startX, y: startY }, currentState.ctm);
            currentSubpath.push({ type: 'LINE', p0, p1 });
          }
          curX = startX;
          curY = startY;
        }

        const isFillOnly = ['f', 'F', 'f*'].includes(tok);
        const paintColor = isFillOnly && currentState.strokeColor.hex === '#000000' && currentState.fillColor.hex !== '#000000'
          ? currentState.fillColor
          : currentState.strokeColor;

        for (const item of currentSubpath) {
          entityCounter++;
          const entId = `pdf_${entityCounter}`;

          if (item.type === 'LINE') {
            entities.push({
              id: entId,
              sourceType: 'LINE',
              layer: currentState.currentLayer,
              color: paintColor,
              lineType: currentState.lineType,
              lineWidth: currentState.lineWidth,
              x0: item.p0.x,
              y0: item.p0.y,
              x1: item.p1.x,
              y1: item.p1.y,
            } as ImportedLineEntity);
          } else if (item.type === 'BEZIER') {
            entities.push({
              id: entId,
              sourceType: 'BEZIER',
              layer: currentState.currentLayer,
              color: paintColor,
              lineType: currentState.lineType,
              lineWidth: currentState.lineWidth,
              p0: item.p0,
              cp1: item.cp1!,
              cp2: item.cp2,
              p1: item.p1,
            } as ImportedBezierEntity);
          }
        }
        currentSubpath = [];
        stack.length = 0;
        continue;
      }

      if (tok === 'n') {
        currentSubpath = [];
        stack.length = 0;
        continue;
      }

      stack.length = 0;
    }
  }

  // Agregação de estatísticas de cores e layers
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

    const ltKey = ent.lineType || 'CONTINUOUS';
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
    entityCount: entities.length,
    color: l.color,
    suggestedTarget: 'UNCLASSIFIED' as const,
  }));

  const lineTypeStats = Array.from(lineTypeMap.entries()).map(([lt, count]) => ({
    lineTypeName: lt,
    entityCount: count,
    suggestedTarget: 'UNCLASSIFIED' as const,
  }));

  const bounds = computeImportedBounds(entities);

  if (entities.length === 0) {
    errors.push('Este PDF não contém geometria vetorial suficiente para importação CAD.');
  }

  return {
    filename,
    format: 'PDF',
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
    isRasterOnly: entities.length === 0 && hasRasterImages,
    warnings,
    errors,
    metadata: {
      streamsCount: streams.length,
      entitiesCount: entities.length,
    },
  };
}
