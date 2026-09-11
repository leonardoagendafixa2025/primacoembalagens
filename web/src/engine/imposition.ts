import type { BoundingBox2D } from './types';
import type { PackagingGeometry } from './geometry';
import {
  normalizeGeometry,
  rotateGeometry,
  translateGeometry,
  cloneGeometry,
} from './geometry';

export interface SheetFormat {
  id: string;
  name: string;
  width: number;  // mm (Eixo X)
  height: number; // mm (Eixo Y)
}

export const STANDARD_SHEETS: SheetFormat[] = [
  { id: 'custom', name: 'Formato Personalizado', width: 1000, height: 700 },
  { id: 'chapa_800x1200', name: 'Chapa Padrão 800 x 1200 mm', width: 1200, height: 800 },
  { id: 'chapa_1000x1400', name: 'Chapa Grande 1000 x 1400 mm', width: 1400, height: 1000 },
  { id: 'chapa_1200x1600', name: 'Chapa Industrial 1200 x 1600 mm', width: 1600, height: 1200 },
  { id: 'folha_700x1000', name: 'Folha Offset 700 x 1000 mm (1/1)', width: 1000, height: 700 },
  { id: 'folha_660x960', name: 'Folha Offset 660 x 960 mm (BB)', width: 960, height: 660 },
  { id: 'folha_A3_plus', name: 'Super A3 / Plotter 330 x 480 mm', width: 480, height: 330 },
];

export interface ImpositionParams {
  sheetWidth: number;          // Largura da chapa em mm
  sheetHeight: number;         // Altura da chapa em mm
  marginMargin: number;        // Margem de segurança lateral e superior em mm
  gripperMargin?: number;      // Pinça da máquina (se especificada, caso contrário usa marginMargin)
  gutter: number;              // Canaleta (espaçamento entre facas) em mm
  allowRotation: boolean;      // Permite rotação em 90° para testar melhor aproveitamento
  forceOrientation?: '0' | '90' | 'auto'; // Força orientação específica ou usa auto
}

export interface ImpositionPose {
  index: number;
  col: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationAngle: number;
  geometry: PackagingGeometry; // Geometria real com segmentos e arcos transformados
}

export interface ImpositionOrientationSolution {
  orientation: '0' | '90';
  angleDeg: number;
  totalPoses: number;
  posesX: number;
  posesY: number;
  itemWidth: number;
  itemHeight: number;
  blockWidth: number;
  blockHeight: number;
  blockAreaM2: number;
  utilizationPercentage: number;
  wastePercentage: number;
  sheetAreaM2: number;
  usedAreaM2: number;
  poses: ImpositionPose[];
  startX: number;
  startY: number;
}

export interface ImpositionResult {
  sheetWidth: number;
  sheetHeight: number;
  selectedOrientation: '0' | '90';
  bestSolution: ImpositionOrientationSolution;
  solution0: ImpositionOrientationSolution;
  solution90: ImpositionOrientationSolution;
  // Campos de compatibilidade com versões anteriores
  totalPoses: number;
  posesX: number;
  posesY: number;
  rotated: boolean;
  itemWidth: number;
  itemHeight: number;
  utilizationPercentage: number;
  wastePercentage: number;
  sheetAreaM2: number;
  usedAreaM2: number;
  items: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    rotated: boolean;
    geometry: PackagingGeometry;
  }>;
}

/**
 * Calcula uma solução de imposição em uma dada orientação (0° ou 90°)
 */
function calculateSingleOrientation(
  geometry: PackagingGeometry,
  angleDeg: number,
  sheetWidth: number,
  sheetHeight: number,
  margin: number,
  gripper: number,
  gutter: number
): ImpositionOrientationSolution {
  // 1. Prepara e normaliza a geometria com a rotação solicitada
  let geom = normalizeGeometry(cloneGeometry(geometry));
  if (angleDeg !== 0) {
    geom = normalizeGeometry(rotateGeometry(geom, angleDeg));
  }

  const itemW = geom.bounds.width;
  const itemH = geom.bounds.height;

  // 2. Área útil da chapa considerando margens e pinça (gripper na base/Ymin)
  const marginLeft = margin;
  const marginRight = margin;
  const marginBottom = gripper > 0 ? gripper : margin;
  const marginTop = margin;

  const usableW = Math.max(0, sheetWidth - marginLeft - marginRight);
  const usableH = Math.max(0, sheetHeight - marginBottom - marginTop);

  // 3. Cálculo de poses X e Y respeitando a canaleta (gutter)
  let cols = 0;
  let rows = 0;

  if (itemW > 0 && usableW >= itemW) {
    cols = Math.max(0, Math.floor((usableW + gutter) / (itemW + gutter)));
  }

  if (itemH > 0 && usableH >= itemH) {
    rows = Math.max(0, Math.floor((usableH + gutter) / (itemH + gutter)));
  }

  const totalPoses = cols * rows;

  // 4. Dimensões do bloco ocupado
  const blockWidth = cols > 0 ? cols * itemW + (cols - 1) * gutter : 0;
  const blockHeight = rows > 0 ? rows * itemH + (rows - 1) * gutter : 0;

  // 5. Centralização do bloco na área útil
  const startX = marginLeft + (usableW - blockWidth) / 2;
  const startY = marginBottom + (usableH - blockHeight) / 2;

  // 6. Geração de cada pose com sua geometria real transformada
  const poses: ImpositionPose[] = [];
  let poseIndex = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = startX + c * (itemW + gutter);
      const py = startY + r * (itemH + gutter);

      // Translada a geometria individual da faca para a coordenada exata na chapa
      const poseGeometry = translateGeometry(geom, px, py);

      poses.push({
        index: poseIndex++,
        col: c,
        row: r,
        x: px,
        y: py,
        width: itemW,
        height: itemH,
        rotationAngle: angleDeg,
        geometry: poseGeometry,
      });
    }
  }

  // 7. Métricas de rendimento e áreas
  const sheetAreaM2 = (sheetWidth * sheetHeight) / 1_000_000;
  const singleItemAreaM2 = (itemW * itemH) / 1_000_000;
  const usedAreaM2 = totalPoses * singleItemAreaM2;
  const blockAreaM2 = (blockWidth * blockHeight) / 1_000_000;

  const utilizationPercentage =
    sheetAreaM2 > 0 ? Math.min(100, (usedAreaM2 / sheetAreaM2) * 100) : 0;
  const wastePercentage = Math.max(0, 100 - utilizationPercentage);

  return {
    orientation: angleDeg === 90 ? '90' : '0',
    angleDeg,
    totalPoses,
    posesX: cols,
    posesY: rows,
    itemWidth: itemW,
    itemHeight: itemH,
    blockWidth,
    blockHeight,
    blockAreaM2,
    utilizationPercentage: Number(utilizationPercentage.toFixed(1)),
    wastePercentage: Number(wastePercentage.toFixed(1)),
    sheetAreaM2: Number(sheetAreaM2.toFixed(3)),
    usedAreaM2: Number(usedAreaM2.toFixed(3)),
    poses,
    startX,
    startY,
  };
}

/**
 * Compara duas soluções de imposição seguindo fielmente a regra de SolutionComparerFormat do PLMPackLib C#:
 * 1. Prioridade absoluta: maior número de poses (totalPoses);
 * 2. Em caso de empate: menor área do bloco ocupado (blockAreaM2) - concentra as caixas e deixa maior retalho contínuo;
 * 3. Em caso de empate em área: preferência pela orientação padrão (0°).
 */
function compareImpositionSolutions(
  sol0: ImpositionOrientationSolution,
  sol90: ImpositionOrientationSolution
): ImpositionOrientationSolution {
  if (sol90.totalPoses > sol0.totalPoses) {
    return sol90;
  }
  if (sol90.totalPoses < sol0.totalPoses) {
    return sol0;
  }

  // Empate no total de poses: desempate por menor área do bloco ocupado
  if (sol90.blockAreaM2 < sol0.blockAreaM2) {
    return sol90;
  }
  if (sol90.blockAreaM2 > sol0.blockAreaM2) {
    return sol0;
  }

  // Empate duplo: preferência pela orientação padrão 0°
  return sol0;
}

/**
 * Executa o cálculo completo de imposição de facas na chapa
 * Portado fielmente do algoritmo do PLMPackLib (ImpositionToolCardboardFormat.cs)
 */
export function calculateImpositionCAD(
  geometry: PackagingGeometry,
  params: ImpositionParams
): ImpositionResult {
  const {
    sheetWidth,
    sheetHeight,
    marginMargin,
    gripperMargin = marginMargin,
    gutter,
    allowRotation,
    forceOrientation = 'auto',
  } = params;

  // Calcula solução 0°
  const sol0 = calculateSingleOrientation(
    geometry,
    0,
    sheetWidth,
    sheetHeight,
    marginMargin,
    gripperMargin,
    gutter
  );

  // Calcula solução 90°
  const sol90 = calculateSingleOrientation(
    geometry,
    90,
    sheetWidth,
    sheetHeight,
    marginMargin,
    gripperMargin,
    gutter
  );

  // Seleciona a melhor solução conforme regras PLMPackLib
  let best: ImpositionOrientationSolution;
  if (forceOrientation === '0') {
    best = sol0;
  } else if (forceOrientation === '90') {
    best = sol90;
  } else if (!allowRotation) {
    best = sol0;
  } else {
    best = compareImpositionSolutions(sol0, sol90);
  }

  const items = best.poses.map((p) => ({
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    rotated: best.orientation === '90',
    geometry: p.geometry,
  }));

  return {
    sheetWidth,
    sheetHeight,
    selectedOrientation: best.orientation,
    bestSolution: best,
    solution0: sol0,
    solution90: sol90,
    totalPoses: best.totalPoses,
    posesX: best.posesX,
    posesY: best.posesY,
    rotated: best.orientation === '90',
    itemWidth: best.itemWidth,
    itemHeight: best.itemHeight,
    utilizationPercentage: best.utilizationPercentage,
    wastePercentage: best.wastePercentage,
    sheetAreaM2: best.sheetAreaM2,
    usedAreaM2: best.usedAreaM2,
    items,
  };
}

/**
 * Função de retrocompatibilidade para chamadas que passavam apenas BoundingBox2D
 */
export function calculateImposition(
  dielineOrBounds: PackagingGeometry | BoundingBox2D,
  params: ImpositionParams
): ImpositionResult {
  if ('segments' in dielineOrBounds) {
    return calculateImpositionCAD(dielineOrBounds as PackagingGeometry, params);
  }

  // Constrói uma PackagingGeometry simples a partir do BoundingBox
  const bounds = dielineOrBounds as BoundingBox2D;
  const geom: PackagingGeometry = {
    segments: [
      { x0: 0, y0: 0, x1: bounds.width, y1: 0, type: 'cut' },
      { x0: bounds.width, y0: 0, x1: bounds.width, y1: bounds.height, type: 'cut' },
      { x0: bounds.width, y0: bounds.height, x1: 0, y1: bounds.height, type: 'cut' },
      { x0: 0, y0: bounds.height, x1: 0, y1: 0, type: 'cut' },
    ],
    arcs: [],
    dimensions: [],
    bounds: {
      minX: 0,
      minY: 0,
      maxX: bounds.width,
      maxY: bounds.height,
      width: bounds.width,
      height: bounds.height,
    },
  };

  return calculateImpositionCAD(geom, params);
}
