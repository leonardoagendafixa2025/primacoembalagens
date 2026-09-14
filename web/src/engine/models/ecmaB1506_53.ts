import type { PackagingModel, DielineResult, Segment2D, Arc2D, BoundingBox2D, DimensionLine } from '../types';
import { applyPicToolRound } from '../picRound';

export const ecmaB1506_53: PackagingModel = {
  id: 'ecma_b1506_53',
  code: 'ECMA B1506.53',
  name: 'B1506 53',
  category: 'ECMA',
  description: 'Cartucho padr?o ECMA B1506.53 com abas de travamento e concord?ncia tangencial param?trica.',
  isFoldable: true,
  status: 'PASS',
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  defaultParams: {
    L: 225,
    B: 200,
    H: 80,
    Ep: 0.5,
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 50, max: 1200, step: 5, unit: 'mm' },
    { key: 'B', label: 'Largura (B)', min: 30, max: 800, step: 5, unit: 'mm' },
    { key: 'H', label: 'Altura (H)', min: 20, max: 600, step: 2, unit: 'mm' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.2, max: 3.0, step: 0.1, unit: 'mm' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L ?? 225;
    const B = params.B ?? 200;
    const H = params.H ?? 80;
    const P = params.P ?? Math.round(H * 0.73);
    const h1 = H / 2;
    const h2 = H / 4;
    const R = Math.sqrt((h2 * h2) + (h2 * h2)) - 0.5;
    const S = R + 1;
    const hx = P - h2;
    const B1 = B - 2;
    let R2 = 16;
    if (R2 > (H - P)) R2 = H - P;

    const entities: Record<number, Segment2D> = {};
    entities[3] = { id: 'seg-3', type: 'cut', x0: 97.8546+H+B, y0: 21.0209+h2+h2+P+L+H, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P+L };
    entities[4] = { id: 'seg-4', type: 'crease', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P+L };
    entities[5] = { id: 'seg-5', type: 'cut', x0: 97.8546+H+B-P+h2, y0: 21.0209+h2+h2+P+L+h2, x1: 97.8546+H+B-P, y1: 21.0209+h2+h2+P+L+h1 };
    entities[6] = { id: 'seg-6', type: 'cut', x0: 97.8546+H+B-P, y0: 21.0209+h2+h2+P+L+h1, x1: 97.8546+H+B-P-S, y1: 21.0209+h2+h2+P+L+h1 };
    entities[7] = { id: 'seg-7', type: 'cut', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B+H, y1: 21.0209+h2+h2+P+L+P };
    entities[8] = { id: 'seg-8', type: 'cut', x0: 97.8546+H+B+h2+h2, y0: 21.0209+h2+h2+P+L+P, x1: 97.8546+H+B+h2+h2+h2, y1: 21.0209+h2+h2+P+L+P+h2 };
    entities[9] = { id: 'seg-9', type: 'cut', x0: 97.8546+H+B, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B+h2, y1: 21.0209+h2+h2+P+L+hx };
    entities[10] = { id: 'seg-10', type: 'cut', x0: 97.8546+H+B+h2+h2, y0: 21.0209+h2+h2+P+L+P, x1: 97.8546+H+B+H, y1: 21.0209+h2+h2+P+L+P };
    entities[11] = { id: 'seg-11', type: 'crease', x0: 97.8546+H, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P+L };
    entities[12] = { id: 'seg-12', type: 'crease', x0: 97.8546+H+B, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P };
    entities[13] = { id: 'seg-13', type: 'cut', x0: 97.8546+H, y0: 21.0209+h2+h2+P+L+H, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P+L+H };
    entities[14] = { id: 'seg-14', type: 'crease', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P, x1: 97.8546+H+B+H, y1: 21.0209+h2+h2+P+L };
    entities[15] = { id: 'seg-15', type: 'cut', x0: 97.8546+H+B+h2+h2+1.41162, y0: 21.0209+h2+h2+P+L+P+h2+h2-1.41418, x1: 97.8546+H+B+h2+h2+h2, y1: 21.0209+h2+h2+P+L+P+h2 };
    entities[16] = { id: 'seg-16', type: 'cut', x0: 97.8546+H+B+h2+h2-1.41681, y0: 21.0209+h2+h2+P+L+P+h2+h2-1.41418, x1: 97.8546+H+B+1.41263, y1: 21.0209+h2+h2+P+L+hx+h2+1.41418 };
    entities[17] = { id: 'seg-17', type: 'cut', x0: 97.8546+H+B+1.4126, y0: 21.0209+h2+h2+P+L+hx+h2-1.41418, x1: 97.8546+H+B+h2, y1: 21.0209+h2+h2+P+L+hx };
    entities[40] = { id: 'seg-40', type: 'cut', x0: 97.8546+H, y0: 21.0209+h2+h2+P+L+H, x1: 97.8546+H, y1: 21.0209+h2+h2+P+L };
    entities[41] = { id: 'seg-41', type: 'crease', x0: 97.8546, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H, y1: 21.0209+h2+h2+P+L };
    entities[42] = { id: 'seg-42', type: 'cut', x0: 97.8546+H+hx, y0: 21.0209+h2+h2+P+L+h2, x1: 97.8546+H+P, y1: 21.0209+h2+h2+P+L+h1 };
    entities[43] = { id: 'seg-43', type: 'cut', x0: 97.8546+H+P, y0: 21.0209+h2+h2+P+L+h1, x1: 97.8546+H+P+S, y1: 21.0209+h2+h2+P+L+h1 };
    entities[44] = { id: 'seg-44', type: 'cut', x0: 97.8546, y0: 21.0209+h2+h2+P+L, x1: 97.8546, y1: 21.0209+h2+h2+P+L+P };
    entities[45] = { id: 'seg-45', type: 'cut', x0: 97.8546+h1, y0: 21.0209+h2+h2+P+L+P, x1: 97.8546+h2, y1: 21.0209+h2+h2+P+L+P+h2 };
    entities[46] = { id: 'seg-46', type: 'cut', x0: 97.8546+H, y0: 21.0209+h2+h2+P+L, x1: 97.8546+h1+h2, y1: 21.0209+h2+h2+P+L+hx };
    entities[47] = { id: 'seg-47', type: 'cut', x0: 97.8546+h1, y0: 21.0209+h2+h2+P+L+P, x1: 97.8546, y1: 21.0209+h2+h2+P+L+P };
    entities[48] = { id: 'seg-48', type: 'crease', x0: 97.8546+H, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H, y1: 21.0209+h2+h2+P };
    entities[49] = { id: 'seg-49', type: 'cut', x0: 97.8546, y0: 21.0209+h2+h2+P, x1: 97.8546, y1: 21.0209+h2+h2+P+L };
    entities[50] = { id: 'seg-50', type: 'cut', x0: 97.8546+h1-1.41164, y0: 21.0209+h2+h2+P+L+P+h2+h2-1.41418, x1: 97.8546+h2, y1: 21.0209+h2+h2+P+L+P+h2 };
    entities[51] = { id: 'seg-51', type: 'cut', x0: 97.8546+h1+1.41681, y0: 21.0209+h2+h2+P+L+P+h2+h2-1.41418, x1: 97.8546+H-1.41263, y1: 21.0209+h2+h2+P+L+hx+h2+1.41418 };
    entities[52] = { id: 'seg-52', type: 'cut', x0: 97.8546+H-1.41258, y0: 21.0209+h2+h2+P+L+hx+h2-1.41418, x1: 97.8546+h1+h2, y1: 21.0209+h2+h2+P+L+hx };
    entities[74] = { id: 'seg-74', type: 'cut', x0: 97.8546+H+B, y0: 21.0209+h2+h2+P-H, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P };
    entities[75] = { id: 'seg-75', type: 'crease', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P };
    entities[76] = { id: 'seg-76', type: 'cut', x0: 97.8546+H+B-P+h2, y0: 21.0209+h2+h2+P-h2, x1: 97.8546+H+B-P, y1: 21.0209+h2+h2+P-h1 };
    entities[77] = { id: 'seg-77', type: 'cut', x0: 97.8546+H+B-P, y0: 21.0209+h2+h2+P-h1, x1: 97.8546+H+B-P-S, y1: 21.0209+h2+h2+P-h1 };
    entities[78] = { id: 'seg-78', type: 'cut', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P, x1: 97.8546+H+B+H, y1: 21.0209+h2+h2 };
    entities[79] = { id: 'seg-79', type: 'cut', x0: 97.8546+H+B+h2+h2, y0: 21.0209+h2+h2, x1: 97.8546+H+B+h2+h2+h2, y1: 21.0209+h2 };
    entities[80] = { id: 'seg-80', type: 'cut', x0: 97.8546+H+B, y0: 21.0209+h2+h2+P, x1: 97.8546+H+B+h2, y1: 21.0209+h2+h2+P-hx };
    entities[81] = { id: 'seg-81', type: 'cut', x0: 97.8546+H+B+h2+h2, y0: 21.0209+h2+h2, x1: 97.8546+H+B+H, y1: 21.0209+h2+h2 };
    entities[82] = { id: 'seg-82', type: 'crease', x0: 97.8546+H, y0: 21.0209+h2+h2+P, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P };
    entities[83] = { id: 'seg-83', type: 'cut', x0: 97.8546+H, y0: 21.0209+h2+h2+P-H, x1: 97.8546+H+B, y1: 21.0209+h2+h2+P-H };
    entities[84] = { id: 'seg-84', type: 'cut', x0: 97.8546+H+B+h2+h2+1.41162, y0: 21.0209+1.41419, x1: 97.8546+H+B+h2+h2+h2, y1: 21.0209+h2 };
    entities[85] = { id: 'seg-85', type: 'cut', x0: 97.8546+H+B+h2+h2-1.41681, y0: 21.0209+1.41418, x1: 97.8546+H+B+1.41263, y1: 21.0209+h2+h2+P-hx-h2-1.41418 };
    entities[86] = { id: 'seg-86', type: 'cut', x0: 97.8546+H+B+1.4126, y0: 21.0209+h2+h2+P-hx-h2+1.41421, x1: 97.8546+H+B+h2, y1: 21.0209+h2+h2+P-hx };
    entities[89] = { id: 'seg-89', type: 'cut', x0: 97.8546+H, y0: 21.0209+h2+h2+P-H, x1: 97.8546+H, y1: 21.0209+h2+h2+P };
    entities[90] = { id: 'seg-90', type: 'crease', x0: 97.8546, y0: 21.0209+h2+h2+P, x1: 97.8546+H, y1: 21.0209+h2+h2+P };
    entities[91] = { id: 'seg-91', type: 'cut', x0: 97.8546+H+hx, y0: 21.0209+h2+h2+P-h2, x1: 97.8546+H+P, y1: 21.0209+h2+h2+P-h1 };
    entities[92] = { id: 'seg-92', type: 'cut', x0: 97.8546+H+P, y0: 21.0209+h2+h2+P-h1, x1: 97.8546+H+P+S, y1: 21.0209+h2+h2+P-h1 };
    entities[93] = { id: 'seg-93', type: 'cut', x0: 97.8546, y0: 21.0209+h2+h2+P, x1: 97.8546, y1: 21.0209+h2+h2 };
    entities[94] = { id: 'seg-94', type: 'cut', x0: 97.8546+h1, y0: 21.0209+h2+h2, x1: 97.8546+h2, y1: 21.0209+h2 };
    entities[95] = { id: 'seg-95', type: 'cut', x0: 97.8546+H, y0: 21.0209+h2+h2+P, x1: 97.8546+h1+h2, y1: 21.0209+h2+h2+P-hx };
    entities[96] = { id: 'seg-96', type: 'cut', x0: 97.8546+h1, y0: 21.0209+h2+h2, x1: 97.8546, y1: 21.0209+h2+h2 };
    entities[97] = { id: 'seg-97', type: 'cut', x0: 97.8546+h1-1.41164, y0: 21.0209+1.41419, x1: 97.8546+h2, y1: 21.0209+h2 };
    entities[98] = { id: 'seg-98', type: 'cut', x0: 97.8546+h1+1.41681, y0: 21.0209+1.41418, x1: 97.8546+H-1.41263, y1: 21.0209+h2+h2+P-hx-h2-1.41418 };
    entities[99] = { id: 'seg-99', type: 'cut', x0: 97.8546+H-1.41258, y0: 21.0209+h2+h2+P-hx-h2+1.41421, x1: 97.8546+h1+h2, y1: 21.0209+h2+h2+P-hx };
    entities[143] = { id: 'seg-143', type: 'crease', x0: 97.8546+H+B+H+B1, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B+H+B1, y1: 21.0209+h2+h2+P };
    entities[144] = { id: 'seg-144', type: 'cut', x0: 97.8546+H+B+H+B1, y0: 21.0209+h2+h2+P+L+H-1.00122, x1: 97.8546+H+B+H+B1, y1: 21.0209+h2+h2+P+L };
    entities[145] = { id: 'seg-145', type: 'cut', x0: 97.8546+H+B+H+B1, y0: 21.0209+h2+h2+P-H+0.999222, x1: 97.8546+H+B+H+B1, y1: 21.0209+h2+h2+P };
    entities[146] = { id: 'seg-146', type: 'cut', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P-H+0.999222, x1: 97.8546+H+B+H, y1: 21.0209+h2+h2+P };
    entities[147] = { id: 'seg-147', type: 'crease', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B+H+B1, y1: 21.0209+h2+h2+P+L };
    entities[148] = { id: 'seg-148', type: 'cut', x0: 97.8546+H+B+H+B1, y0: 21.0209+h2+h2+P+L, x1: 97.8546+H+B+H+B1+H-1, y1: 21.0209+h2+h2+P+L };
    entities[149] = { id: 'seg-149', type: 'crease', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P, x1: 97.8546+H+B+H+B1, y1: 21.0209+h2+h2+P };
    entities[150] = { id: 'seg-150', type: 'cut', x0: 97.8546+H+B+H+B1, y0: 21.0209+h2+h2+P, x1: 97.8546+H+B+H+B1+H-1, y1: 21.0209+h2+h2+P };
    entities[151] = { id: 'seg-151', type: 'cut', x0: 97.8546+H+B+H, y0: 21.0209+h2+h2+P+L+H-1.00122, x1: 97.8546+H+B+H, y1: 21.0209+h2+h2+P+L };
    entities[152] = { id: 'seg-152', type: 'cut', x0: 97.8546+H+B+H+B1+H, y0: 21.0209+h2+h2+P+0.99939, x1: 97.8546+H+B+H+B1+H, y1: 21.0209+h2+h2+P+L-1.00073 };
    entities[153] = { id: 'seg-153', type: 'cut', x0: 97.8546+H+B+H+B1-1, y0: 21.0209+h2+h2+P+L+H, x1: 97.8546+H+B+H+1.00037, y1: 21.0209+h2+h2+P+L+H };
    entities[154] = { id: 'seg-154', type: 'cut', x0: 97.8546+H+B+H+1.00024, y0: 21.0209+h2+h2+P-H, x1: 97.8546+H+B+H+B1-1, y1: 21.0209+h2+h2+P-H };

    const arcs: Arc2D[] = [];
    applyPicToolRound(entities[15], entities[16], R, arcs, 'arc-0');
    applyPicToolRound(entities[16], entities[17], R, arcs, 'arc-1');
    applyPicToolRound(entities[50], entities[51], R, arcs, 'arc-2');
    applyPicToolRound(entities[51], entities[52], R, arcs, 'arc-3');
    applyPicToolRound(entities[84], entities[85], R, arcs, 'arc-4');
    applyPicToolRound(entities[85], entities[86], R, arcs, 'arc-5');
    applyPicToolRound(entities[97], entities[98], R, arcs, 'arc-6');
    applyPicToolRound(entities[98], entities[99], R, arcs, 'arc-7');
    applyPicToolRound(entities[146], entities[154], R2, arcs, 'arc-8');
    applyPicToolRound(entities[145], entities[154], R2, arcs, 'arc-9');
    applyPicToolRound(entities[150], entities[152], R2, arcs, 'arc-10');
    applyPicToolRound(entities[148], entities[152], R2, arcs, 'arc-11');
    applyPicToolRound(entities[144], entities[153], R2, arcs, 'arc-12');
    applyPicToolRound(entities[151], entities[153], R2, arcs, 'arc-13');

    const segments = Object.values(entities);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of segments) {
      if (s.x0 < minX) minX = s.x0; if (s.x1 < minX) minX = s.x1;
      if (s.x0 > maxX) maxX = s.x0; if (s.x1 > maxX) maxX = s.x1;
      if (s.y0 < minY) minY = s.y0; if (s.y1 < minY) minY = s.y1;
      if (s.y0 > maxY) maxY = s.y0; if (s.y1 > maxY) maxY = s.y1;
    }
    for (const a of arcs) {
      if (a.cx - a.r < minX) minX = a.cx - a.r; if (a.cx + a.r > maxX) maxX = a.cx + a.r;
      if (a.cy - a.r < minY) minY = a.cy - a.r; if (a.cy + a.r > maxY) maxY = a.cy + a.r;
    }

    const bounds: BoundingBox2D = {
      minX: Math.round(minX * 100) / 100,
      minY: Math.round(minY * 100) / 100,
      maxX: Math.round(maxX * 100) / 100,
      maxY: Math.round(maxY * 100) / 100,
      width: Math.round((maxX - minX) * 100) / 100,
      height: Math.round((maxY - minY) * 100) / 100,
    };

    const dimensions: DimensionLine[] = [
      {
        x0: bounds.minX,
        y0: bounds.minY - 25,
        x1: bounds.maxX,
        y1: bounds.minY - 25,
        text: `${Math.round(bounds.width)} mm`,
      },
      {
        x0: bounds.minX - 25,
        y0: bounds.minY,
        x1: bounds.minX - 25,
        y1: bounds.maxY,
        text: `${Math.round(bounds.height)} mm`,
        isVertical: true,
      },
      {
        x0: 97.8546 + H + B / 2,
        y0: 21.0209 + h2 + h2 + P,
        x1: 97.8546 + H + B / 2,
        y1: 21.0209 + h2 + h2 + P + L,
        text: `L = ${L} mm`,
        isVertical: true,
      },
      {
        x0: 97.8546 + H,
        y0: 21.0209 + h2 + h2 + P + L / 2,
        x1: 97.8546 + H + B,
        y1: 21.0209 + h2 + h2 + P + L / 2,
        text: `B = ${B} mm`,
      },
      {
        x0: 97.8546,
        y0: 21.0209 + h2 + h2 + P + L / 2,
        x1: 97.8546 + H,
        y1: 21.0209 + h2 + h2 + P + L / 2,
        text: `H = ${H} mm`,
      },
    ];

    return { segments, arcs, dimensions, bounds };
  },
};
