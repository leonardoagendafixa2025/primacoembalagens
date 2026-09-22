import type {
  ImportedCadDocument,
  ImportedEntity,
  ImportedLineEntity,
  ImportedArcEntity,
  ImportedCircleEntity,
  ImportedPolylineEntity,
  ImportedLayer,
  CadColor,
  CadUnit,
  UnsupportedEntityRecord,
} from './types';
import { CAD_UNIT_FACTORS } from './types';
import type { BoundingBox2D } from '../types';

/**
 * Tabela oficial de cores AutoCAD Color Index (ACI 1 a 255)
 */
export const ACI_COLOR_TABLE: Record<number, string> = {
  1: '#FF0000', // Red
  2: '#FFFF00', // Yellow
  3: '#00FF00', // Green
  4: '#00FFFF', // Cyan
  5: '#0000FF', // Blue
  6: '#FF00FF', // Magenta
  7: '#FFFFFF', // White / Black depending on background
  8: '#808080', // Dark Gray
  9: '#C0C0C0', // Light Gray
  10: '#FF0000',
  11: '#FFAAAA',
  12: '#BD0000',
  20: '#FF3F00',
  30: '#FF7F00',
  40: '#FFBF00',
  50: '#FFFF00',
  60: '#BFFF00',
  70: '#7FFF00',
  80: '#3FFF00',
  90: '#00FF00',
  100: '#00FF3F',
  110: '#00FF7F',
  120: '#00FFBF',
  130: '#00FFFF',
  140: '#00BFFF',
  150: '#007FFF',
  160: '#003FFF',
  170: '#0000FF',
  180: '#3F00FF',
  190: '#7F00FF',
  200: '#BF00FF',
  210: '#FF00FF',
  220: '#FF00BF',
  230: '#FF007F',
  240: '#FF003F',
  250: '#333333',
  251: '#505050',
  252: '#696969',
  253: '#828282',
  254: '#BEBEBE',
  255: '#FFFFFF',
};

export function aciToHex(aci: number): string {
  if (aci in ACI_COLOR_TABLE) {
    return ACI_COLOR_TABLE[aci];
  }
  // Cores ACI intermediárias: interpolação aproximada ou padrão cinza
  return '#808080';
}

/**
 * Converte inteiro 24-bit TrueColor para Hex
 */
export function trueColorToHex(val: number): string {
  const r = (val >> 16) & 0xff;
  const g = (val >> 8) & 0xff;
  const b = val & 0xff;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

interface DxfPair {
  code: number;
  value: string;
}

/**
 * Tokenizador de alta performance para arquivos DXF (ASCII)
 */
function tokenizeDxf(dxfText: string): DxfPair[] {
  const lines = dxfText.split(/\r?\n/);
  const pairs: DxfPair[] = [];
  let i = 0;
  while (i < lines.length - 1) {
    const codeStr = lines[i].trim();
    if (codeStr === '') {
      i++;
      continue;
    }
    const code = parseInt(codeStr, 10);
    const value = lines[i + 1] !== undefined ? lines[i + 1].trim() : '';
    if (!isNaN(code)) {
      pairs.push({ code, value });
    }
    i += 2;
  }
  return pairs;
}

/**
 * Parser DXF Profissional para CAD de Embalagens (PRIMACOR EMBALAGENS)
 */
export function parseDxfDocument(dxfText: string, filename: string = 'imported.dxf'): ImportedCadDocument {
  const pairs = tokenizeDxf(dxfText);
  const layers: Record<string, ImportedLayer> = {};
  const entities: ImportedEntity[] = [];
  const unsupportedMap = new Map<string, UnsupportedEntityRecord>();
  const warnings: string[] = [];
  const errors: string[] = [];

  let detectedUnit: CadUnit = 'unknown';
  let unitConfirmed = false;

  // 1. Varredura de Seções
  let currentSection = '';
  let inHeader = false;
  let inTables = false;
  let inBlocks = false;
  let inEntities = false;

  // Bloco temporário
  interface BlockDef {
    name: string;
    baseX: number;
    baseY: number;
    entities: ImportedEntity[];
  }
  const blocks = new Map<string, BlockDef>();
  let currentBlock: BlockDef | null = null;

  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i];

    if (p.code === 0 && p.value === 'SECTION') {
      i++;
      if (i < pairs.length && pairs[i].code === 2) {
        currentSection = pairs[i].value;
        inHeader = currentSection === 'HEADER';
        inTables = currentSection === 'TABLES';
        inBlocks = currentSection === 'BLOCKS';
        inEntities = currentSection === 'ENTITIES';
      }
      i++;
      continue;
    }

    if (p.code === 0 && p.value === 'ENDSEC') {
      inHeader = false;
      inTables = false;
      inBlocks = false;
      inEntities = false;
      currentSection = '';
      i++;
      continue;
    }

    // 1.1 Seção HEADER: Unidades e Metadados
    if (inHeader) {
      if (p.code === 9 && p.value === '$INSUNITS') {
        i++;
        if (i < pairs.length) {
          const unitCode = parseInt(pairs[i].value, 10);
          switch (unitCode) {
            case 1:
              detectedUnit = 'inch';
              unitConfirmed = true;
              break;
            case 2: // Feet -> inch
              detectedUnit = 'inch';
              unitConfirmed = true;
              break;
            case 4:
              detectedUnit = 'mm';
              unitConfirmed = true;
              break;
            case 5:
              detectedUnit = 'cm';
              unitConfirmed = true;
              break;
            case 6: // Meters -> cm * 100
              detectedUnit = 'cm';
              unitConfirmed = true;
              break;
            default:
              if (unitCode > 0) {
                warnings.push(`Código de unidade DXF não-padrão detectado: $INSUNITS = ${unitCode}`);
              }
              break;
          }
        }
      } else if (p.code === 9 && p.value === '$MEASUREMENT' && detectedUnit === 'unknown') {
        i++;
        if (i < pairs.length) {
          const mVal = parseInt(pairs[i].value, 10);
          if (mVal === 1) {
            detectedUnit = 'mm'; // 1 = Metric
          } else if (mVal === 0) {
            detectedUnit = 'inch'; // 0 = Imperial
          }
        }
      }
      i++;
      continue;
    }

    // 1.2 Seção TABLES: Definições de Layers
    if (inTables) {
      if (p.code === 0 && p.value === 'LAYER') {
        let layerName = '0';
        let layerColorAci = 7;
        let layerColorTrue: number | null = null;
        let lineTypeName = 'CONTINUOUS';

        i++;
        while (i < pairs.length && pairs[i].code !== 0) {
          const lp = pairs[i];
          if (lp.code === 2) layerName = lp.value;
          else if (lp.code === 62) layerColorAci = Math.abs(parseInt(lp.value, 10));
          else if (lp.code === 420) layerColorTrue = parseInt(lp.value, 10);
          else if (lp.code === 6) lineTypeName = lp.value;
          i++;
        }

        const hex = layerColorTrue !== null ? trueColorToHex(layerColorTrue) : aciToHex(layerColorAci);
        layers[layerName] = {
          name: layerName,
          color: {
            hex,
            raw: layerColorTrue !== null ? `TrueColor:${hex}` : `ACI:${layerColorAci}`,
            aciIndex: layerColorAci,
          },
          lineType: lineTypeName,
          visible: true,
          entityCount: 0,
        };
        continue;
      }
      i++;
      continue;
    }

    // 1.3 Seção BLOCKS: Definição de blocos
    if (inBlocks) {
      if (p.code === 0 && p.value === 'BLOCK') {
        currentBlock = { name: '', baseX: 0, baseY: 0, entities: [] };
        i++;
        while (i < pairs.length && pairs[i].code !== 0) {
          const bp = pairs[i];
          if (bp.code === 2) currentBlock.name = bp.value;
          else if (bp.code === 10) currentBlock.baseX = parseFloat(bp.value);
          else if (bp.code === 20) currentBlock.baseY = parseFloat(bp.value);
          i++;
        }
        continue;
      }

      if (p.code === 0 && p.value === 'ENDBLK') {
        if (currentBlock && currentBlock.name) {
          blocks.set(currentBlock.name, currentBlock);
        }
        currentBlock = null;
        i++;
        continue;
      }

      // Se houver entidades dentro do bloco, processa e guarda no currentBlock
      if (currentBlock && p.code === 0) {
        const ent = parseEntityFromPairs(pairs, i, layers, unsupportedMap);
        if (ent.entity) {
          currentBlock.entities.push(ent.entity);
        }
        i = ent.nextIndex;
        continue;
      }
      i++;
      continue;
    }

    // 1.4 Seção ENTITIES: Entidades do Model Space
    if (inEntities && p.code === 0) {
      if (p.value === 'INSERT') {
        // Expande bloco inserido
        let blockName = '';
        let insX = 0, insY = 0;
        let scaleX = 1, scaleY = 1;
        let rotDeg = 0;
        let layer = '0';

        i++;
        while (i < pairs.length && pairs[i].code !== 0) {
          const ip = pairs[i];
          if (ip.code === 2) blockName = ip.value;
          else if (ip.code === 10) insX = parseFloat(ip.value);
          else if (ip.code === 20) insY = parseFloat(ip.value);
          else if (ip.code === 41) scaleX = parseFloat(ip.value);
          else if (ip.code === 42) scaleY = parseFloat(ip.value);
          else if (ip.code === 50) rotDeg = parseFloat(ip.value);
          else if (ip.code === 8) layer = ip.value;
          i++;
        }

        const blk = blocks.get(blockName);
        if (blk) {
          const rad = (rotDeg * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          for (const bEnt of blk.entities) {
            const cloned = cloneAndTransformEntity(bEnt, insX, insY, scaleX, scaleY, cos, sin, layer);
            entities.push(cloned);
          }
        }
        continue;
      }

      const ent = parseEntityFromPairs(pairs, i, layers, unsupportedMap);
      if (ent.entity) {
        entities.push(ent.entity);
      }
      i = ent.nextIndex;
      continue;
    }

    i++;
  }

  // Se nenhum layer foi encontrado no TABLES, garante layer '0'
  if (Object.keys(layers).length === 0) {
    layers['0'] = {
      name: '0',
      color: { hex: '#FFFFFF', raw: 'ACI:7', aciIndex: 7 },
      lineType: 'CONTINUOUS',
      visible: true,
      entityCount: 0,
    };
  }

  // 2. Atualiza contagem de layers e agrega estatísticas
  for (const ent of entities) {
    if (!layers[ent.layer]) {
      layers[ent.layer] = {
        name: ent.layer,
        color: ent.color,
        lineType: ent.lineType || 'CONTINUOUS',
        visible: true,
        entityCount: 0,
      };
    }
    layers[ent.layer].entityCount++;
  }

  // 3. Agregação de Estatísticas de Cores, Layers e Linetypes
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

  // 4. Bounding Box
  const bounds = computeImportedBounds(entities);

  // 5. Verificação de unidade heurística se veio 'unknown'
  if (detectedUnit === 'unknown' && bounds.width > 0) {
    // Em embalagens dobráveis, medidas em polegadas costumam ter dimensão < 50
    // enquanto em mm costumam estar entre 100 e 2000.
    if (bounds.width < 50 && bounds.height < 50) {
      warnings.push(`Unidade não informada no DXF. Dimensões compactas (${bounds.width.toFixed(1)} x ${bounds.height.toFixed(1)}) sugerem POLEGADAS ou centímetros. Confirme a unidade.`);
    } else {
      warnings.push(`Unidade não especificada explicitamente no cabeçalho DXF. Padrão milímetros (mm) assumido.`);
    }
  }

  return {
    filename,
    format: 'DXF',
    detectedUnit,
    unitConfirmed,
    scaleFactorToMm: CAD_UNIT_FACTORS[detectedUnit] || 1.0,
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
      pairsCount: pairs.length,
      layersCount: Object.keys(layers).length,
      blocksCount: blocks.size,
    },
  };
}

/**
 * Extrai uma entidade geométrica individual dos pares de códigos DXF
 */
function parseEntityFromPairs(
  pairs: DxfPair[],
  startIndex: number,
  layers: Record<string, ImportedLayer>,
  unsupportedMap: Map<string, UnsupportedEntityRecord>
): { entity: ImportedEntity | null; nextIndex: number } {
  const entType = pairs[startIndex].value.toUpperCase();
  let i = startIndex + 1;

  let layer = '0';
  let colorAci: number | null = null;
  let colorTrue: number | null = null;
  let lineType: string | undefined;
  let lineWidth: number | undefined;

  // Propriedades específicas
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  let cx = 0, cy = 0, r = 0;
  let startAngle = 0, endAngle = 360;
  let polyVertices: Array<{ x: number; y: number; bulge?: number }> = [];
  let isClosed = false;

  // Leitura das propriedades até o próximo grupo 0
  let curVertexX = 0, curVertexY = 0, curBulge = 0;
  let hasVertex = false;

  while (i < pairs.length && pairs[i].code !== 0) {
    const p = pairs[i];
    if (p.code === 8) layer = p.value;
    else if (p.code === 62) colorAci = parseInt(p.value, 10);
    else if (p.code === 420) colorTrue = parseInt(p.value, 10);
    else if (p.code === 6) lineType = p.value;
    else if (p.code === 370) lineWidth = parseInt(p.value, 10) / 100; // mm

    // Coordenadas
    else if (p.code === 10) {
      x0 = parseFloat(p.value);
      cx = x0;
      if (entType === 'LWPOLYLINE') {
        if (hasVertex) {
          polyVertices.push({ x: curVertexX, y: curVertexY, bulge: curBulge || undefined });
          curBulge = 0;
        }
        curVertexX = x0;
        hasVertex = true;
      }
    } else if (p.code === 20) {
      y0 = parseFloat(p.value);
      cy = y0;
      if (entType === 'LWPOLYLINE') {
        curVertexY = y0;
      }
    } else if (p.code === 11) x1 = parseFloat(p.value);
    else if (p.code === 21) y1 = parseFloat(p.value);
    else if (p.code === 40) r = parseFloat(p.value);
    else if (p.code === 50) startAngle = parseFloat(p.value);
    else if (p.code === 51) endAngle = parseFloat(p.value);
    else if (p.code === 42 && entType === 'LWPOLYLINE') curBulge = parseFloat(p.value);
    else if (p.code === 70 && entType === 'LWPOLYLINE') {
      const flags = parseInt(p.value, 10);
      isClosed = (flags & 1) === 1;
    }
    i++;
  }

  if (entType === 'LWPOLYLINE' && hasVertex) {
    polyVertices.push({ x: curVertexX, y: curVertexY, bulge: curBulge || undefined });
  }

  // Resolve cor com herança de ByLayer
  const color: CadColor = resolveColor(colorAci, colorTrue, layer, layers);

  // Mapeamento das entidades suportadas
  const entityId = `dxf_${startIndex}_${entType.toLowerCase()}`;

  if (entType === 'LINE') {
    const lineEnt: ImportedLineEntity = {
      id: entityId,
      sourceType: 'LINE',
      layer,
      color,
      lineType,
      lineWidth,
      x0,
      y0,
      x1,
      y1,
    };
    return { entity: lineEnt, nextIndex: i };
  }

  if (entType === 'ARC') {
    const arcEnt: ImportedArcEntity = {
      id: entityId,
      sourceType: 'ARC',
      layer,
      color,
      lineType,
      lineWidth,
      cx,
      cy,
      r,
      startAngleDeg: startAngle,
      endAngleDeg: endAngle,
    };
    return { entity: arcEnt, nextIndex: i };
  }

  if (entType === 'CIRCLE') {
    const circleEnt: ImportedCircleEntity = {
      id: entityId,
      sourceType: 'CIRCLE',
      layer,
      color,
      lineType,
      lineWidth,
      cx,
      cy,
      r,
    };
    return { entity: circleEnt, nextIndex: i };
  }

  if (entType === 'LWPOLYLINE' && polyVertices.length >= 2) {
    const polyEnt: ImportedPolylineEntity = {
      id: entityId,
      sourceType: 'LWPOLYLINE',
      layer,
      color,
      lineType,
      lineWidth,
      vertices: polyVertices,
      isClosed,
    };
    return { entity: polyEnt, nextIndex: i };
  }

  // Entidades POLYLINE clássicas (2D POLYLINE com VERTEX)
  if (entType === 'POLYLINE') {
    const polyVerts: Array<{ x: number; y: number; bulge?: number }> = [];
    while (i < pairs.length) {
      if (pairs[i].code === 0 && pairs[i].value === 'SEQEND') {
        i++;
        break;
      }
      if (pairs[i].code === 0 && pairs[i].value === 'VERTEX') {
        let vx = 0, vy = 0, vBulge = 0;
        i++;
        while (i < pairs.length && pairs[i].code !== 0) {
          if (pairs[i].code === 10) vx = parseFloat(pairs[i].value);
          else if (pairs[i].code === 20) vy = parseFloat(pairs[i].value);
          else if (pairs[i].code === 42) vBulge = parseFloat(pairs[i].value);
          i++;
        }
        polyVerts.push({ x: vx, y: vy, bulge: vBulge || undefined });
        continue;
      }
      i++;
    }
    if (polyVerts.length >= 2) {
      const polyEnt: ImportedPolylineEntity = {
        id: entityId,
        sourceType: 'POLYLINE',
        layer,
        color,
        lineType,
        lineWidth,
        vertices: polyVerts,
        isClosed,
      };
      return { entity: polyEnt, nextIndex: i };
    }
  }

  // Registro rigoroso de entidades não suportadas ou anotações (DIMENSION, TEXT, MTEXT, SPLINE, ELLIPSE, etc.)
  const unKey = `${entType}_${layer}`;
  const un = unsupportedMap.get(unKey);
  if (un) {
    un.count++;
  } else {
    unsupportedMap.set(unKey, {
      type: entType,
      layer,
      count: 1,
      details: `Entidade CAD ${entType} registrada no layer ${layer}`,
      location: { x: x0 || cx, y: y0 || cy },
    });
  }

  return { entity: null, nextIndex: i };
}

/**
 * Resolve cor considerando TrueColor, ACI e ByLayer
 */
function resolveColor(
  colorAci: number | null,
  colorTrue: number | null,
  layerName: string,
  layers: Record<string, ImportedLayer>
): CadColor {
  if (colorTrue !== null) {
    const hex = trueColorToHex(colorTrue);
    return { hex, raw: `TrueColor:${hex}` };
  }

  if (colorAci !== null && colorAci > 0 && colorAci < 256) {
    const hex = aciToHex(colorAci);
    return { hex, raw: `ACI:${colorAci}`, aciIndex: colorAci };
  }

  // ByLayer (colorAci === 256 ou null)
  const layer = layers[layerName];
  if (layer && layer.color) {
    return { ...layer.color };
  }

  return { hex: '#FFFFFF', raw: 'ACI:7', aciIndex: 7 };
}

/**
 * Clona e transforma entidade de bloco inserido
 */
function cloneAndTransformEntity(
  ent: ImportedEntity,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  cos: number,
  sin: number,
  parentLayer: string
): ImportedEntity {
  const transformPt = (px: number, py: number) => {
    const sx_px = px * sx;
    const sy_py = py * sy;
    return {
      x: sx_px * cos - sy_py * sin + tx,
      y: sx_px * sin + sy_py * cos + ty,
    };
  };

  const finalLayer = ent.layer === '0' ? parentLayer : ent.layer;

  if (ent.sourceType === 'LINE') {
    const p0 = transformPt(ent.x0, ent.y0);
    const p1 = transformPt(ent.x1, ent.y1);
    return {
      ...ent,
      id: `${ent.id}_ins`,
      layer: finalLayer,
      x0: p0.x,
      y0: p0.y,
      x1: p1.x,
      y1: p1.y,
    };
  }

  if (ent.sourceType === 'ARC') {
    const c = transformPt(ent.cx, ent.cy);
    return {
      ...ent,
      id: `${ent.id}_ins`,
      layer: finalLayer,
      cx: c.x,
      cy: c.y,
      r: ent.r * Math.abs(sx),
    };
  }

  if (ent.sourceType === 'CIRCLE') {
    const c = transformPt(ent.cx, ent.cy);
    return {
      ...ent,
      id: `${ent.id}_ins`,
      layer: finalLayer,
      cx: c.x,
      cy: c.y,
      r: ent.r * Math.abs(sx),
    };
  }

  if (ent.sourceType === 'LWPOLYLINE' || ent.sourceType === 'POLYLINE') {
    const newVerts = ent.vertices.map((v) => {
      const pt = transformPt(v.x, v.y);
      return { x: pt.x, y: pt.y, bulge: v.bulge };
    });
    return {
      ...ent,
      id: `${ent.id}_ins`,
      layer: finalLayer,
      vertices: newVerts,
    };
  }

  return { ...ent, layer: finalLayer };
}

/**
 * Calcula Bounding Box 2D exato de entidades importadas
 */
export function computeImportedBounds(entities: ImportedEntity[]): BoundingBox2D {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const ent of entities) {
    if (ent.sourceType === 'LINE') {
      minX = Math.min(minX, ent.x0, ent.x1);
      maxX = Math.max(maxX, ent.x0, ent.x1);
      minY = Math.min(minY, ent.y0, ent.y1);
      maxY = Math.max(maxY, ent.y0, ent.y1);
    } else if (ent.sourceType === 'ARC') {
      const startRad = (ent.startAngleDeg * Math.PI) / 180;
      const span = ent.endAngleDeg >= ent.startAngleDeg ? ent.endAngleDeg - ent.startAngleDeg : 360 - (ent.startAngleDeg - ent.endAngleDeg);
      const steps = 16;
      const da = (span * Math.PI) / 180 / steps;
      for (let k = 0; k <= steps; k++) {
        const a = startRad + k * da;
        const px = ent.cx + ent.r * Math.cos(a);
        const py = ent.cy + ent.r * Math.sin(a);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    } else if (ent.sourceType === 'CIRCLE') {
      minX = Math.min(minX, ent.cx - ent.r);
      maxX = Math.max(maxX, ent.cx + ent.r);
      minY = Math.min(minY, ent.cy - ent.r);
      maxY = Math.max(maxY, ent.cy + ent.r);
    } else if (ent.sourceType === 'LWPOLYLINE' || ent.sourceType === 'POLYLINE') {
      for (const v of ent.vertices) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}
