import type { BoundingBox2D } from './types';

export interface SheetFormat {
  id: string;
  name: string;
  width: number;  // mm
  height: number; // mm
}

export const STANDARD_SHEETS: SheetFormat[] = [
  { id: 'custom', name: 'Formato Personalizado', width: 1000, height: 700 },
  { id: 'chapa_800x1200', name: 'Chapa Padrão 800 x 1200 mm', width: 1200, height: 800 },
  { id: 'chapa_1000x1400', name: 'Chapa Grande 1000 x 1400 mm', width: 1400, height: 1000 },
  { id: 'folha_700x1000', name: 'Folha 700 x 1000 mm (Offset 1/1)', width: 1000, height: 700 },
  { id: 'folha_660x960', name: 'Folha 660 x 960 mm (Offset BB)', width: 960, height: 660 },
  { id: 'folha_A3_plus', name: 'Super A3 / Plotter 330 x 480 mm', width: 480, height: 330 },
];

export interface ImpositionParams {
  sheetWidth: number;
  sheetHeight: number;
  marginMargin: number; // Pinça e margens (mm)
  gutter: number;       // Distância entre poses (canaleta) (mm)
  allowRotation: boolean;
}

export interface ImpositionItem {
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}

export interface ImpositionResult {
  sheetWidth: number;
  sheetHeight: number;
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
  items: ImpositionItem[];
}

export function calculateImposition(
  dielineBounds: BoundingBox2D,
  params: ImpositionParams
): ImpositionResult {
  const { sheetWidth, sheetHeight, marginMargin, gutter, allowRotation } = params;

  const usableW = Math.max(0, sheetWidth - marginMargin * 2);
  const usableH = Math.max(0, sheetHeight - marginMargin * 2);

  const dw = dielineBounds.width;
  const dh = dielineBounds.height;

  // Opção 1: Sem rotação (0°)
  const cols1 = Math.max(0, Math.floor((usableW + gutter) / (dw + gutter)));
  const rows1 = Math.max(0, Math.floor((usableH + gutter) / (dh + gutter)));
  const total1 = cols1 * rows1;

  // Opção 2: Com rotação (90°)
  let cols2 = 0;
  let rows2 = 0;
  let total2 = 0;

  if (allowRotation) {
    cols2 = Math.max(0, Math.floor((usableW + gutter) / (dh + gutter)));
    rows2 = Math.max(0, Math.floor((usableH + gutter) / (dw + gutter)));
    total2 = cols2 * rows2;
  }

  // Escolhe a melhor orientação
  const useRotated = allowRotation && total2 > total1;
  const totalPoses = useRotated ? total2 : total1;
  const cols = useRotated ? cols2 : cols1;
  const rows = useRotated ? rows2 : rows1;
  const itemW = useRotated ? dh : dw;
  const itemH = useRotated ? dw : dh;

  const items: ImpositionItem[] = [];

  // Centraliza o bloco de poses na chapa
  const blockW = cols > 0 ? cols * itemW + (cols - 1) * gutter : 0;
  const blockH = rows > 0 ? rows * itemH + (rows - 1) * gutter : 0;
  const startX = marginMargin + (usableW - blockW) / 2;
  const startY = marginMargin + (usableH - blockH) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      items.push({
        x: startX + c * (itemW + gutter),
        y: startY + r * (itemH + gutter),
        width: itemW,
        height: itemH,
        rotated: useRotated,
      });
    }
  }

  const sheetAreaM2 = (sheetWidth * sheetHeight) / 1_000_000;
  const singleItemAreaM2 = (dw * dh) / 1_000_000;
  const usedAreaM2 = totalPoses * singleItemAreaM2;
  const utilizationPercentage = sheetAreaM2 > 0 ? Math.min(100, (usedAreaM2 / sheetAreaM2) * 100) : 0;
  const wastePercentage = Math.max(0, 100 - utilizationPercentage);

  return {
    sheetWidth,
    sheetHeight,
    totalPoses,
    posesX: cols,
    posesY: rows,
    rotated: useRotated,
    itemWidth: itemW,
    itemHeight: itemH,
    utilizationPercentage: Number(utilizationPercentage.toFixed(1)),
    wastePercentage: Number(wastePercentage.toFixed(1)),
    sheetAreaM2: Number(sheetAreaM2.toFixed(3)),
    usedAreaM2: Number(usedAreaM2.toFixed(3)),
    items,
  };
}
