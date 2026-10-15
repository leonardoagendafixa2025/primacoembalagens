import type { BoundingBox2D, Point2D, Segment2D } from './types';
import type { PackagingGeometry } from './geometry';
import {
  normalizeGeometry,
  rotateGeometry,
  translateGeometry,
  cloneGeometry,
  computeBoundingBox,
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

export type ImpositionLayoutPattern =
  | 'nested_auto'          // Encaixe inteligente automático (Nesting de Alta Eficiência)
  | 'head_to_foot_rows'    // Cabeça com Pé em Linhas (Linhas alternadas 180° com encaixe)
  | 'head_to_foot_cols'    // Cabeça com Pé em Colunas (Colunas alternadas 180° com encaixe)
  | 'grid';                // Grade Simples Alinhada (0°)

export type StaggerMode = 'auto' | 'none' | 'half' | 'custom';

export interface ImpositionParams {
  sheetWidth: number;                      // Largura da chapa em mm
  sheetHeight: number;                     // Altura da chapa em mm
  marginMargin: number;                    // Margem de segurança lateral e superior em mm
  gripperMargin?: number;                  // Pinça da máquina (base / Ymin)
  gutter: number;                          // Canaleta (espaçamento entre facas) em mm (0 = faca compartilhada)
  allowRotation: boolean;                  // Permite testar rotação de 90° na folha
  forceOrientation?: '0' | '90' | 'auto';  // Força orientação específica da folha ou auto
  layoutPattern?: ImpositionLayoutPattern; // Padrão de imposição / encaixe
  staggerMode?: StaggerMode;               // Modo de defasagem (auto, 50%, 0%, custom)
  customStaggerMm?: number;                // Defasagem horizontal customizada em mm
}

export interface ImpositionPose {
  index: number;
  col: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationAngle: number; // 0, 90, 180, 270
  geometry: PackagingGeometry; // Geometria real com segmentos e arcos transformados
}

export interface ImpositionOrientationSolution {
  orientation: '0' | '90';
  angleDeg: number;
  layoutPattern: ImpositionLayoutPattern;
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
  staggerMm: number;
  interlockGainMm: number; // Economia de altura/largura por encaixe em relação ao bounding box
}

export interface ImpositionResult {
  sheetWidth: number;
  sheetHeight: number;
  selectedOrientation: '0' | '90';
  layoutPattern: ImpositionLayoutPattern;
  bestSolution: ImpositionOrientationSolution;
  solution0: ImpositionOrientationSolution;
  solution90: ImpositionOrientationSolution;
  allSolutions?: ImpositionOrientationSolution[];
  // Campos de compatibilidade
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
 * Perfil de silhueta (Skyline) da faca para cálculo exato de encaixe (Nesting)
 */
interface SkylineProfile {
  width: number;
  height: number;
  sampleStep: number;
  numSamples: number;
  top: Float64Array;    // Y máximo em cada x_i
  bottom: Float64Array; // Y mínimo em cada x_i
}

/**
 * Extrai a silhueta externa (Skyline) dos contornos de corte da faca
 */
function computeSkylineProfile(geom: PackagingGeometry, sampleStep = 1.0): SkylineProfile {
  const b = geom.bounds;
  const width = Math.max(1, b.width);
  const height = Math.max(1, b.height);
  const numSamples = Math.max(10, Math.ceil(width / sampleStep) + 1);

  const top = new Float64Array(numSamples);
  const bottom = new Float64Array(numSamples);
  top.fill(-Infinity);
  bottom.fill(Infinity);

  // Considera preferencialmente segmentos de corte; se não houver, usa todos exceto dimensão
  const cutSegs = geom.segments.filter((s) => s.type === 'cut');
  const targetSegs = cutSegs.length > 0 ? cutSegs : geom.segments.filter((s) => s.type !== 'dimension');

  for (const s of targetSegs) {
    const xMin = Math.min(s.x0, s.x1);
    const xMax = Math.max(s.x0, s.x1);
    const iStart = Math.max(0, Math.floor(xMin / sampleStep));
    const iEnd = Math.min(numSamples - 1, Math.ceil(xMax / sampleStep));

    if (Math.abs(s.x1 - s.x0) < 1e-4) {
      const y0 = Math.min(s.y0, s.y1);
      const y1 = Math.max(s.y0, s.y1);
      const idx = Math.min(numSamples - 1, Math.max(0, Math.round(s.x0 / sampleStep)));
      top[idx] = Math.max(top[idx], y1);
      bottom[idx] = Math.min(bottom[idx], y0);
    } else {
      for (let i = iStart; i <= iEnd; i++) {
        const x = i * sampleStep;
        if (x >= xMin - 1e-4 && x <= xMax + 1e-4) {
          const t = (x - s.x0) / (s.x1 - s.x0);
          const y = s.y0 + t * (s.y1 - s.y0);
          top[i] = Math.max(top[i], y);
          bottom[i] = Math.min(bottom[i], y);
        }
      }
    }
  }

  // Preenchimento de amostras vazias por interpolação de vizinhos
  let lastTop = height;
  let lastBottom = 0;
  for (let i = 0; i < numSamples; i++) {
    if (!isFinite(top[i])) top[i] = lastTop;
    else lastTop = top[i];

    if (!isFinite(bottom[i])) bottom[i] = lastBottom;
    else lastBottom = bottom[i];
  }

  return { width, height, sampleStep, numSamples, top, bottom };
}

/**
 * Calcula o passo vertical mínimo (Ystep) entre duas linhas com silhuetas Skyline
 * para que a linha superior B nunca colida com a linha inferior A, respeitando a canaleta (gutter).
 */
function computeVerticalInterlockStep(
  skylineA: SkylineProfile,
  skylineB: SkylineProfile,
  dx: number,
  pitchX: number,
  gutter: number
): number {
  const step = skylineA.sampleStep;
  let maxRequiredDist = 0;

  const nCheck = Math.ceil(pitchX / step);
  for (let i = 0; i < nCheck; i++) {
    const x = i * step;

    const idxA = Math.floor((((x % pitchX) + pitchX) % pitchX) / step);
    const yTopA = idxA < skylineA.numSamples ? skylineA.top[idxA] : 0;

    const rawX_B = (((x - dx) % pitchX) + pitchX) % pitchX;
    const idxB = Math.floor(rawX_B / step);
    const yBottomB = idxB < skylineB.numSamples ? skylineB.bottom[idxB] : skylineB.height;

    const reqY = yTopA - yBottomB + gutter;
    if (reqY > maxRequiredDist) {
      maxRequiredDist = reqY;
    }
  }

  return Math.max(gutter, maxRequiredDist);
}

/**
 * Calcula uma solução de imposição em GRADE SIMPLES (Standard Grid)
 */
function calculateGridSolution(
  geometry: PackagingGeometry,
  angleDeg: number,
  sheetWidth: number,
  sheetHeight: number,
  margin: number,
  gripper: number,
  gutter: number
): ImpositionOrientationSolution {
  let geom = normalizeGeometry(cloneGeometry(geometry));
  if (angleDeg !== 0) {
    geom = normalizeGeometry(rotateGeometry(geom, angleDeg));
  }

  const itemW = geom.bounds.width;
  const itemH = geom.bounds.height;

  const marginLeft = margin;
  const marginRight = margin;
  const marginBottom = gripper > 0 ? gripper : margin;
  const marginTop = margin;

  const usableW = Math.max(0, sheetWidth - marginLeft - marginRight);
  const usableH = Math.max(0, sheetHeight - marginBottom - marginTop);

  const pitchX = itemW + gutter;
  const pitchY = itemH + gutter;

  let cols = 0;
  let rows = 0;

  if (itemW > 0 && usableW >= itemW) {
    cols = Math.max(0, Math.floor((usableW + gutter) / pitchX));
  }
  if (itemH > 0 && usableH >= itemH) {
    rows = Math.max(0, Math.floor((usableH + gutter) / pitchY));
  }

  const totalPoses = cols * rows;
  const blockWidth = cols > 0 ? cols * itemW + (cols - 1) * gutter : 0;
  const blockHeight = rows > 0 ? rows * itemH + (rows - 1) * gutter : 0;

  const startX = marginLeft + (usableW - blockWidth) / 2;
  const startY = marginBottom + (usableH - blockHeight) / 2;

  const poses: ImpositionPose[] = [];
  let poseIndex = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = startX + c * pitchX;
      const py = startY + r * pitchY;
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

  const sheetAreaM2 = (sheetWidth * sheetHeight) / 1_000_000;
  const singleItemAreaM2 = (itemW * itemH) / 1_000_000;
  const usedAreaM2 = totalPoses * singleItemAreaM2;
  const blockAreaM2 = (blockWidth * blockHeight) / 1_000_000;
  const utilizationPercentage = sheetAreaM2 > 0 ? Math.min(100, (usedAreaM2 / sheetAreaM2) * 100) : 0;
  const wastePercentage = Math.max(0, 100 - utilizationPercentage);

  return {
    orientation: angleDeg === 90 ? '90' : '0',
    angleDeg,
    layoutPattern: 'grid',
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
    staggerMm: 0,
    interlockGainMm: 0,
  };
}

/**
 * Calcula uma solução de imposição com ENCAIXE INTELIGENTE EM LINHAS (Tête-Bêche / Head-to-Foot)
 * Padrão Técnico de Alta Eficiência:
 * Linhas alternadas 180° com encaixe automático dos fundos e tampas.
 */
function calculateInterlockedRowsSolution(
  geometry: PackagingGeometry,
  angleDeg: number,
  sheetWidth: number,
  sheetHeight: number,
  margin: number,
  gripper: number,
  gutter: number,
  staggerMode: StaggerMode = 'auto',
  customStaggerMm?: number
): ImpositionOrientationSolution {
  let geom0 = normalizeGeometry(cloneGeometry(geometry));
  if (angleDeg !== 0) {
    geom0 = normalizeGeometry(rotateGeometry(geom0, angleDeg));
  }
  const geom180 = normalizeGeometry(rotateGeometry(geom0, 180));

  const itemW = geom0.bounds.width;
  const itemH = geom0.bounds.height;
  const pitchX = itemW + gutter;

  const skyline0 = computeSkylineProfile(geom0, 1.0);
  const skyline180 = computeSkylineProfile(geom180, 1.0);

  // Determina o offset horizontal ótimo (dx*)
  let optDx = 0;
  let minPairHeight = Infinity;

  if (staggerMode === 'none') {
    optDx = 0;
  } else if (staggerMode === 'half') {
    optDx = Number((pitchX / 2).toFixed(2));
  } else if (staggerMode === 'custom' && typeof customStaggerMm === 'number') {
    optDx = (((customStaggerMm % pitchX) + pitchX) % pitchX);
  } else {
    // Modo AUTO: Varredura contínua de encaixe ótimo
    const candidateDxs = new Set<number>();
    candidateDxs.add(0);
    candidateDxs.add(pitchX / 2);
    candidateDxs.add(pitchX / 3);
    candidateDxs.add(pitchX / 4);
    candidateDxs.add((2 * pitchX) / 3);
    candidateDxs.add((3 * pitchX) / 4);

    // Adiciona coordenadas X dos vincos como pontos candidatos naturais de dobra
    for (const s of geom0.segments) {
      if (s.type === 'crease') {
        const cx0 = (((s.x0 % pitchX) + pitchX) % pitchX);
        if (cx0 > 2 && cx0 < pitchX - 2) candidateDxs.add(Number(cx0.toFixed(2)));
      }
    }

    // Varredura regular de amostras em passos de 2 mm
    const stepScan = Math.max(2, Math.floor(pitchX / 60));
    for (let x = 0; x <= pitchX; x += stepScan) {
      candidateDxs.add(Number(x.toFixed(2)));
    }

    for (const dx of candidateDxs) {
      const dy1 = computeVerticalInterlockStep(skyline0, skyline180, dx, pitchX, gutter);
      const dy2 = computeVerticalInterlockStep(skyline180, skyline0, -dx, pitchX, gutter);
      const hPair = dy1 + dy2;

      if (hPair < minPairHeight) {
        minPairHeight = hPair;
        optDx = dx;
      }
    }
  }

  // Passos verticais entre linhas alternadas com o offset selecionado
  const dy0to180 = computeVerticalInterlockStep(skyline0, skyline180, optDx, pitchX, gutter);
  const dy180to0 = computeVerticalInterlockStep(skyline180, skyline0, -optDx, pitchX, gutter);

  // Economia vertical obtida pelo encaixe em relação ao bounding box retangular
  const standardPairH = 2 * (itemH + gutter);
  const interlockGainMm = Math.max(0, standardPairH - (dy0to180 + dy180to0));

  // Área útil da chapa
  const marginLeft = margin;
  const marginRight = margin;
  const marginBottom = gripper > 0 ? gripper : margin;
  const marginTop = margin;

  const usableW = Math.max(0, sheetWidth - marginLeft - marginRight);
  const usableH = Math.max(0, sheetHeight - marginBottom - marginTop);

  // Testa duas variantes: começando com 0° ou começando com 180°
  function buildVariant(startWith180: boolean) {
    const rawPoses: Array<{
      col: number;
      row: number;
      x: number;
      y: number;
      width: number;
      height: number;
      rotationAngle: number;
      baseGeom: PackagingGeometry;
    }> = [];

    let currentY = 0;
    let r = 0;

    while (true) {
      const is180 = (r % 2 === 1) ? !startWith180 : startWith180;
      const rowGeom = is180 ? geom180 : geom0;
      const rowRotAngle = is180 ? ((angleDeg + 180) % 360) : angleDeg;

      if (currentY + itemH > usableH + 0.001) break;

      const rowShiftX = (r % 2 === 1) ? optDx : 0;

      // Gera colunas que cabem na largura útil
      for (let c = 0; ; c++) {
        const px = rowShiftX + c * pitchX;
        if (px + itemW > usableW + 0.001) break;

        rawPoses.push({
          col: c,
          row: r,
          x: px,
          y: currentY,
          width: itemW,
          height: itemH,
          rotationAngle: rowRotAngle,
          baseGeom: rowGeom,
        });
      }

      // Avança para a próxima linha
      const stepY = is180 ? dy180to0 : dy0to180;
      currentY += stepY;
      r++;
    }

    return { rawPoses, totalRows: r };
  }

  const v0 = buildVariant(false);
  const v180 = buildVariant(true);
  const bestVariant = v0.rawPoses.length >= v180.rawPoses.length ? v0 : v180;
  const { rawPoses } = bestVariant;

  if (rawPoses.length === 0) {
    return calculateGridSolution(geometry, angleDeg, sheetWidth, sheetHeight, margin, gripper, gutter);
  }

  // Calcula Bounding Box do bloco completo
  let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
  for (const p of rawPoses) {
    if (p.x < bMinX) bMinX = p.x;
    if (p.x + p.width > bMaxX) bMaxX = p.x + p.width;
    if (p.y < bMinY) bMinY = p.y;
    if (p.y + p.height > bMaxY) bMaxY = p.y + p.height;
  }

  const blockWidth = Math.max(0, bMaxX - bMinX);
  const blockHeight = Math.max(0, bMaxY - bMinY);

  // Centralização perfeita do bloco montado na chapa
  const startX = marginLeft + (usableW - blockWidth) / 2 - bMinX;
  const startY = marginBottom + (usableH - blockHeight) / 2 - bMinY;

  const poses: ImpositionPose[] = rawPoses.map((p, idx) => {
    const finalX = p.x + startX;
    const finalY = p.y + startY;
    const poseGeometry = translateGeometry(p.baseGeom, finalX, finalY);

    return {
      index: idx + 1,
      col: p.col,
      row: p.row,
      x: finalX,
      y: finalY,
      width: p.width,
      height: p.height,
      rotationAngle: p.rotationAngle,
      geometry: poseGeometry,
    };
  });

  const colsCount = Math.max(...poses.map((p) => p.col)) + 1;
  const rowsCount = Math.max(...poses.map((p) => p.row)) + 1;

  const totalPoses = poses.length;
  const sheetAreaM2 = (sheetWidth * sheetHeight) / 1_000_000;
  const singleItemAreaM2 = (itemW * itemH) / 1_000_000;
  const usedAreaM2 = totalPoses * singleItemAreaM2;
  const blockAreaM2 = (blockWidth * blockHeight) / 1_000_000;
  const utilizationPercentage = sheetAreaM2 > 0 ? Math.min(100, (usedAreaM2 / sheetAreaM2) * 100) : 0;
  const wastePercentage = Math.max(0, 100 - utilizationPercentage);

  return {
    orientation: angleDeg === 90 ? '90' : '0',
    angleDeg,
    layoutPattern: 'head_to_foot_rows',
    totalPoses,
    posesX: colsCount,
    posesY: rowsCount,
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
    startX: marginLeft + (usableW - blockWidth) / 2,
    startY: marginBottom + (usableH - blockHeight) / 2,
    staggerMm: Number(optDx.toFixed(1)),
    interlockGainMm: Number(interlockGainMm.toFixed(1)),
  };
}

/**
 * Compara e elege a melhor solução entre duas opções
 * Critérios:
 * 1. Maior número de poses;
 * 2. Menor área do bloco ocupado (maior concentração e sobra de retalho);
 * 3. Preferência pela orientação 0°.
 */
function compareImpositionSolutions(
  solA: ImpositionOrientationSolution,
  solB: ImpositionOrientationSolution
): ImpositionOrientationSolution {
  if (solB.totalPoses > solA.totalPoses) return solB;
  if (solB.totalPoses < solA.totalPoses) return solA;

  if (solB.blockAreaM2 < solA.blockAreaM2) return solB;
  if (solB.blockAreaM2 > solA.blockAreaM2) return solA;

  return solA.angleDeg === 0 ? solA : solB;
}

/**
 * Executa o cálculo completo de imposição de facas na chapa
 * Suporta Encaixe Inteligente (Nesting / Tête-Bêche) e Grade Tradicional
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
    layoutPattern = 'nested_auto',
    staggerMode = 'auto',
    customStaggerMm,
  } = params;

  const solutions: ImpositionOrientationSolution[] = [];

  // Helper para resolver um padrão específico em um dado ângulo
  const solvePattern = (pattern: ImpositionLayoutPattern, angle: number): ImpositionOrientationSolution => {
    if (pattern === 'grid') {
      return calculateGridSolution(
        geometry,
        angle,
        sheetWidth,
        sheetHeight,
        marginMargin,
        gripperMargin,
        gutter
      );
    }
    return calculateInterlockedRowsSolution(
      geometry,
      angle,
      sheetWidth,
      sheetHeight,
      marginMargin,
      gripperMargin,
      gutter,
      staggerMode,
      customStaggerMm
    );
  };

  const testAngles = (forceOrientation === '0' || !allowRotation)
    ? [0]
    : forceOrientation === '90'
    ? [90]
    : [0, 90];

  if (layoutPattern === 'nested_auto') {
    // Avalia Encaixe Inteligente vs. Grade em todas as orientações permitidas
    for (const ang of testAngles) {
      solutions.push(solvePattern('head_to_foot_rows', ang));
      solutions.push(solvePattern('grid', ang));
    }
  } else {
    for (const ang of testAngles) {
      solutions.push(solvePattern(layoutPattern, ang));
    }
  }

  // Identifica soluções canônicas 0° e 90° para o comparador
  const sol0 = solutions.find((s) => s.angleDeg === 0) || solvePattern(layoutPattern === 'nested_auto' ? 'head_to_foot_rows' : layoutPattern, 0);
  const sol90 = solutions.find((s) => s.angleDeg === 90) || solvePattern(layoutPattern === 'nested_auto' ? 'head_to_foot_rows' : layoutPattern, 90);

  // Elege a melhor solução global
  let best = solutions[0] || sol0;
  for (let i = 1; i < solutions.length; i++) {
    best = compareImpositionSolutions(best, solutions[i]);
  }

  const items = best.poses.map((p) => ({
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    rotated: p.rotationAngle === 90 || p.rotationAngle === 270,
    geometry: p.geometry,
  }));

  return {
    sheetWidth,
    sheetHeight,
    selectedOrientation: best.orientation,
    layoutPattern: best.layoutPattern,
    bestSolution: best,
    solution0: sol0,
    solution90: sol90,
    allSolutions: solutions,
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
