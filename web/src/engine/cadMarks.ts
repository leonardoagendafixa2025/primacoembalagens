import type { BoundingBox2D, Segment2D, Arc2D } from './types';

export interface RegistrationMarkGroup {
  center: { x: number; y: number };
  radius: number;
  segments: Segment2D[];
  circle: Arc2D;
}

export interface CadAnnotations {
  bleedBox: BoundingBox2D;
  bleedSegments: Segment2D[];
  registrationMarks: RegistrationMarkGroup[];
  centerMarks: Segment2D[];
}

/**
 * Gera as cruzes de registro óptico CNC e o envelope de sangria gráfica (Bleed)
 * Padrão da indústria gráfica (ISO / ECMA / Packaging CAD)
 */
export function generateCadAnnotations(
  bounds: BoundingBox2D,
  options: {
    bleedMm?: number;
    bleedOffset?: number;
    markOffsetMm?: number;
    markRadiusMm?: number;
    markCrossLenMm?: number;
  } = {}
): CadAnnotations {
  const bleed = options.bleedMm ?? options.bleedOffset ?? 5.0;
  const offset = options.markOffsetMm ?? 14.0;
  const r = options.markRadiusMm ?? 2.5;
  const crossLen = options.markCrossLenMm ?? 10.0;
  const halfCross = crossLen / 2;

  const minX = bounds.minX;
  const maxX = bounds.maxX;
  const minY = bounds.minY;
  const maxY = bounds.maxY;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // 1. Envelope de Sangria Gráfica (Bleed Box)
  const bMinX = minX - bleed;
  const bMaxX = maxX + bleed;
  const bMinY = minY - bleed;
  const bMaxY = maxY + bleed;

  const bleedSegments: Segment2D[] = [
    { x0: bMinX, y0: bMinY, x1: bMaxX, y1: bMinY, type: 'perfo' }, // usaremos estilo visual verde
    { x0: bMaxX, y0: bMinY, x1: bMaxX, y1: bMaxY, type: 'perfo' },
    { x0: bMaxX, y0: bMaxY, x1: bMinX, y1: bMaxY, type: 'perfo' },
    { x0: bMinX, y0: bMaxY, x1: bMinX, y1: bMinY, type: 'perfo' },
  ];

  // 2. Quatro Cruzes de Registro com Círculo de Mira (Cantos)
  const cornerPositions = [
    { x: minX - offset, y: maxY + offset, name: 'TL' },
    { x: maxX + offset, y: maxY + offset, name: 'TR' },
    { x: minX - offset, y: minY - offset, name: 'BL' },
    { x: maxX + offset, y: minY - offset, name: 'BR' },
  ];

  const registrationMarks: RegistrationMarkGroup[] = cornerPositions.map((pos) => {
    return {
      center: { x: pos.x, y: pos.y },
      radius: r,
      circle: {
        cx: pos.x,
        cy: pos.y,
        r,
        startAngle: 0,
        endAngle: 360,
        type: 'cut',
      },
      segments: [
        // Linha Horizontal da Cruz
        {
          x0: pos.x - halfCross,
          y0: pos.y,
          x1: pos.x + halfCross,
          y1: pos.y,
          type: 'cut',
        },
        // Linha Vertical da Cruz
        {
          x0: pos.x,
          y0: pos.y - halfCross,
          x1: pos.x,
          y1: pos.y + halfCross,
          type: 'cut',
        },
      ],
    };
  });

  // 3. Marcas de Centro nos Quatro Eixos Cardeais
  const centerTickLen = 7.0;
  const centerMarks: Segment2D[] = [
    // Topo
    { x0: midX, y0: maxY + 5, x1: midX, y1: maxY + 5 + centerTickLen, type: 'cut' },
    // Base
    { x0: midX, y0: minY - 5, x1: midX, y1: minY - 5 - centerTickLen, type: 'cut' },
    // Esquerda
    { x0: minX - 5, y0: midY, x1: minX - 5 - centerTickLen, y1: midY, type: 'cut' },
    // Direita
    { x0: maxX + 5, y0: midY, x1: maxX + 5 + centerTickLen, y1: midY, type: 'cut' },
  ];

  const bleedBox: BoundingBox2D = {
    minX: bMinX,
    maxX: bMaxX,
    minY: bMinY,
    maxY: bMaxY,
    width: bMaxX - bMinX,
    height: bMaxY - bMinY,
  };

  return {
    bleedBox,
    bleedSegments,
    registrationMarks,
    centerMarks,
  };
}
