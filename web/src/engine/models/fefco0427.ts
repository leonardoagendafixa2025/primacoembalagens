import type { PackagingModel, DielineResult, Segment2D, Arc2D, DimensionLine } from '../types';
import { computeBoundingBox } from '../geometry';

/**
 * FEFCO 0427 - Caixa de Envio / Maleta Postal com Tampa Articulada e Travas Laterais
 * Portabilidade matemática 1:1 do PLMPackLib C# original
 * 
 * Componentes originais integrados:
 * 1. Fefco_0427 (Guid: 88b02e77-ec56-4551-a38b-93b5b889609b)
 * 2. Dbl_Wall_v2 (Guid: 2dfe5684-676d-4851-b90a-f8a2b2102b3d)
 * 3. top_cover_427 (Guid: 0dfcd248-5b10-415a-a7bb-a18f5d336557)
 * 
 * Validação numérica C# vs TS:
 * 122 segmentos, 10 arcos
 * Concordâncias tangenciais perfeitas via PicToolRound (orelhas e cantos de tampa)
 */

interface Pt2D { x: number; y: number; }

function ptSub(a: Pt2D, b: Pt2D): Pt2D { return { x: a.x - b.x, y: a.y - b.y }; }
function ptAdd(a: Pt2D, b: Pt2D): Pt2D { return { x: a.x + b.x, y: a.y + b.y }; }
function ptMul(a: Pt2D, s: number): Pt2D { return { x: a.x * s, y: a.y * s }; }
function ptDot(a: Pt2D, b: Pt2D): number { return a.x * b.x + a.y * b.y; }
function ptLen(a: Pt2D): number { return Math.hypot(a.x, a.y); }
function ptKross(a: Pt2D, b: Pt2D): number { return a.x * b.y - a.y * b.x; }

function intersectLines(p0: Pt2D, p1: Pt2D, q0: Pt2D, q1: Pt2D): Pt2D | null {
  const den = (p1.x - p0.x) * (q1.y - q0.y) - (p1.y - p0.y) * (q1.x - q0.x);
  if (Math.abs(den) < 1e-10) return null;
  const r = ((p0.y - q0.y) * (q1.x - q0.x) - (p0.x - q0.x) * (q1.y - q0.y)) / den;
  return { x: p0.x + r * (p1.x - p0.x), y: p0.y + r * (p1.y - p0.y) };
}

function intersectSegments(p0: Pt2D, p1: Pt2D, q0: Pt2D, q1: Pt2D): Pt2D | null {
  const den = (p1.x - p0.x) * (q1.y - q0.y) - (p1.y - p0.y) * (q1.x - q0.x);
  if (Math.abs(den) < 1e-10) return null;
  const r = ((p0.y - q0.y) * (q1.x - q0.x) - (p0.x - q0.x) * (q1.y - q0.y)) / den;
  const s = ((p0.y - q0.y) * (p1.x - p0.x) - (p0.x - q0.x) * (p1.y - p0.y)) / den;
  if (r >= -1e-6 && r <= 1.0 + 1e-6 && s >= -1e-6 && s <= 1.0 + 1e-6) {
    return { x: p0.x + r * (p1.x - p0.x), y: p0.y + r * (p1.y - p0.y) };
  }
  return null;
}

function extendSegment(p0: Pt2D, p1: Pt2D, pt: Pt2D): { p0: Pt2D; p1: Pt2D } {
  const v = ptSub(p1, p0);
  const pr0 = ptDot(ptSub(p0, pt), v);
  const pr1 = ptDot(ptSub(p1, pt), v);
  if (pr0 > 0 && pr1 > 0) return { p0: pt, p1 };
  if (pr0 < 0 && pr1 < 0) return { p0: pt, p1: p0 };
  return { p0, p1 };
}

function getParallelSegs(p0: Pt2D, p1: Pt2D, dist: number): [{ p0: Pt2D; p1: Pt2D }, { p0: Pt2D; p1: Pt2D }] {
  const d = ptSub(p1, p0);
  const l = ptLen(d);
  const u = { x: d.x / l, y: d.y / l };
  const n = { x: -u.y, y: u.x };
  const p00 = ptAdd(p0, ptMul(n, dist));
  const p10 = ptAdd(p0, ptMul(n, -dist));
  return [
    { p0: p00, p1: ptAdd(p00, d) },
    { p0: p10, p1: ptAdd(p10, d) },
  ];
}

function vecToDeg(v: Pt2D): number {
  const l = ptLen(v);
  if (l < 1e-6) return 0.0;
  const ux = Math.max(-1.0, Math.min(1.0, v.x / l));
  const uy = v.y / l;
  const ang = uy >= 0 ? Math.acos(ux) : 2 * Math.PI - Math.acos(ux);
  let deg = (ang * 180) / Math.PI;
  deg = deg % 360;
  if (deg < 0) deg += 360;
  if (Math.abs(deg) < 1e-4 || Math.abs(deg - 360) < 1e-4) return 0.0;
  if (Math.abs(deg - 90) < 1e-4) return 90.0;
  if (Math.abs(deg - 180) < 1e-4) return 180.0;
  if (Math.abs(deg - 270) < 1e-4) return 270.0;
  return deg;
}

function applyPicToolRound(seg0: Segment2D, seg1: Segment2D, radius: number): Arc2D | null {
  const s0p0 = { x: seg0.x0, y: seg0.y0 };
  const s0p1 = { x: seg0.x1, y: seg0.y1 };
  const s1p0 = { x: seg1.x0, y: seg1.y0 };
  const s1p1 = { x: seg1.x1, y: seg1.y1 };

  const ptExt = intersectLines(s0p0, s0p1, s1p0, s1p1);
  if (!ptExt) return null;

  const ext0 = extendSegment(s0p0, s0p1, ptExt);
  const ext1 = extendSegment(s1p0, s1p1, ptExt);

  const [s00, s01] = getParallelSegs(ext0.p0, ext0.p1, radius);
  const [s10, s11] = getParallelSegs(ext1.p0, ext1.p1, radius);

  const ptCenter =
    intersectSegments(s00.p0, s00.p1, s10.p0, s10.p1) ||
    intersectSegments(s00.p0, s00.p1, s11.p0, s11.p1) ||
    intersectSegments(s01.p0, s01.p1, s10.p0, s10.p1) ||
    intersectSegments(s01.p0, s01.p1, s11.p0, s11.p1);
  if (!ptCenter) return null;

  const v0 = ptSub(ext0.p1, ext0.p0);
  const n0a = { x: -v0.y, y: v0.x };
  const n0b = { x: v0.y, y: -v0.x };
  const pt0 =
    intersectSegments(ext0.p0, ext0.p1, ptCenter, ptAdd(ptCenter, n0a)) ||
    intersectSegments(ext0.p0, ext0.p1, ptCenter, ptAdd(ptCenter, n0b));

  const v1 = ptSub(ext1.p1, ext1.p0);
  const n1a = { x: -v1.y, y: v1.x };
  const n1b = { x: v1.y, y: -v1.x };
  const pt1 =
    intersectSegments(ext1.p0, ext1.p1, ptCenter, ptAdd(ptCenter, n1a)) ||
    intersectSegments(ext1.p0, ext1.p1, ptCenter, ptAdd(ptCenter, n1b));

  if (!pt0 || !pt1) return null;

  // Modify seg0
  if (ptLen(ptSub(ext0.p0, ptExt)) < ptLen(ptSub(ext0.p1, ptExt))) {
    seg0.x0 = pt0.x; seg0.y0 = pt0.y;
    seg0.x1 = ext0.p1.x; seg0.y1 = ext0.p1.y;
  } else {
    seg0.x0 = pt0.x; seg0.y0 = pt0.y;
    seg0.x1 = ext0.p0.x; seg0.y1 = ext0.p0.y;
  }

  // Modify seg1
  if (ptLen(ptSub(ext1.p0, ptExt)) < ptLen(ptSub(ext1.p1, ptExt))) {
    seg1.x0 = pt1.x; seg1.y0 = pt1.y;
    seg1.x1 = ext1.p1.x; seg1.y1 = ext1.p1.y;
  } else {
    seg1.x0 = pt1.x; seg1.y0 = pt1.y;
    seg1.x1 = ext1.p0.x; seg1.y1 = ext1.p0.y;
  }

  let startPt = pt0;
  let endPt = pt1;
  if (ptKross(ptSub(pt0, ptCenter), ptSub(pt1, ptCenter)) <= 0) {
    startPt = pt1;
    endPt = pt0;
  }

  let aBeg = vecToDeg(ptSub(startPt, ptCenter));
  let aEnd = vecToDeg(ptSub(endPt, ptCenter));
  while (aBeg < 0) aBeg += 360;
  while (aEnd < aBeg) aEnd += 360;

  return {
    cx: ptCenter.x,
    cy: ptCenter.y,
    r: radius,
    startAngle: aBeg,
    endAngle: aEnd,
    type: 'cut',
  };
}

export const fefco0427: PackagingModel = {
  status: 'PASS',
  isFoldable: true,
  originalSource: 'C#_PARAMETRIC_DLL',
  implementationType: 'NATIVE_TS',
  generator: 'fefco0427',
  id: 'fefco_0427',
  code: 'FEFCO 0427',
  name: 'Caixa de Envio com Tampa Integrada e Travas (FEFCO 0427)',
  category: 'FEFCO',
  description:
    'Modelo clássico internacional FEFCO 0427 com fundo em paredes duplas de travamento, abas laterais e tampa com orelhas de inserção curvas fiéis ao C#.',
  defaultParams: {
    L: 300, // Comprimento interior (mm)
    B: 200, // Largura interior (mm)
    H: 150, // Altura interior (mm)
    Ep: 3.0, // Espessura do papelão (mm)
  },
  paramDefs: [
    { key: 'L', label: 'Comprimento (L)', min: 100, max: 1200, step: 5, unit: 'mm', description: 'Comprimento interno da caixa' },
    { key: 'B', label: 'Largura (B)', min: 80, max: 800, step: 5, unit: 'mm', description: 'Largura interna da caixa' },
    { key: 'H', label: 'Altura (H)', min: 30, max: 400, step: 5, unit: 'mm', description: 'Altura interna da caixa' },
    { key: 'Ep', label: 'Espessura (Ep)', min: 0.1, max: 8.0, step: 0.05, unit: 'mm', description: 'Espessura do material (a partir de 0,1mm)' },
  ],
  calculate(params: Record<string, number>): DielineResult {
    const L = params.L || 300;
    const B = params.B || 200;
    const H = params.H || 150;
    const ep1 = params.Ep || 3.0;

    // Fórmulas originais C# do fefco_0427_source.cs
    const PP = (2.0 * ep1) / 3.0;
    const GE = ep1 - PP;

    const m1 = 6.0 * ep1 + GE;
    const m2 = 3.0 * ep1;
    const m3 = 2.0 * ep1 + GE;
    const m4 = 3.0 * ep1 + GE;
    const m5 = PP;
    const m6 = ep1 + GE / 2.0;
    const m8 = GE;
    const m9 = GE;
    const m10 = m6;
    const m11 = m4;
    const m12 = ep1 + GE;
    const m13 = PP;
    const m14 = m4;
    const m15 = m4;
    const m16 = m3;
    const m17 = GE;

    const L1 = (L + m1) / 2.0;
    const L2 = (L + m2) / 2.0;
    const B1 = (B + m3) / 2.0;
    const B2 = (B + m4) / 2.0;
    const B4 = B / 2.0;

    const H1 = H + m5;
    let H2 = H1 - (B1 - B2);
    // Dbl_Wall_v2 restringe H2 a no máximo H1 - (B2 - B1)
    if (H2 > H1 - (B2 - B1)) {
      H2 = H1 - (B2 - B1);
    }

    const H3 = H - m8;
    const H4 = H + m9;
    const D1 = B / 2.0 + m10;
    const mth = m11;
    const T1 = m12;
    const dbw = 2.0 * ep1 + m13;

    // Constantes do Dbl_Wall_v2
    const Pos = 40.0;
    const mtl = 33.0;
    const tml = 33.0;
    const agT1 = 15.0;
    const aT1 = T1 * Math.tan((agT1 * Math.PI) / 180);

    const v5 = (B2 - mtl) - Pos;
    const v6 = v5 + mtl / 2.0 - tml / 2.0;

    // Constantes do top_cover_427
    let H7 = 50.0;
    if (H7 > H) H7 = H;
    let Ra = 20.0;
    let A = 20.0;
    const cw = m14 / 2.0;
    const dp = m16;
    const cs = m17;
    const B2top = B + m15;
    const H6 = H;
    const st = 3.0;
    let r7T = 10.0;
    let r7B = 10.0;
    const ch7T = 15.0;
    const ch7B = 15.0;
    const ds1 = 4.0;
    const ds2 = 10.0;
    const cs1 = cs;
    const cs2 = 10.0;
    const Rc = 10.0;

    const segments: Segment2D[] = [];
    const arcs: Arc2D[] = [];

    // =========================================================================
    // DBL_WALL_V2 (Add = 1 "Top open")
    // =========================================================================
    const signs = [
      { sx: 1, sy: 1 },
      { sx: -1, sy: 1 },
      { sx: 1, sy: -1 },
      { sx: -1, sy: -1 },
    ];

    for (const q of signs) {
      const sx = q.sx;
      const sy = q.sy;

      // 1. Vinco vertical aba canto
      segments.push({ type: 'crease', x0: sx * L2, y0: sy * (B2 + H2), x1: sx * L2, y1: sy * B1 });
      // 2. Corte entre aba e fundo
      segments.push({ type: 'cut', x0: sx * L1, y0: sy * B2, x1: sx * L2, y1: sy * B1 });
      // 3. Vinco horizontal base
      segments.push({ type: 'crease', x0: sx * L2, y0: sy * B1, x1: 0.0, y1: sy * B1 });
      // 4. Corte topo parede 1
      segments.push({ type: 'cut', x0: sx * L1, y0: sy * B2, x1: sx * (L1 + H4), y1: sy * B2 });
      // 5. Corte topo parede 2
      segments.push({ type: 'cut', x0: sx * (L1 + H4 + dbw + H3), y0: sy * B4, x1: sx * (L1 + H4 + dbw), y1: sy * B4 });
      // 6. Vinco vertical retorno dbw
      segments.push({ type: 'crease', x0: sx * (L1 + H4 + dbw), y0: sy * B4, x1: sx * (L1 + H4 + dbw), y1: 0.0 });
      // 7. Corte chanfro dbw
      segments.push({ type: 'cut', x0: sx * (L1 + H4 + dbw), y0: sy * B4, x1: sx * (L1 + H4), y1: sy * B2 });
      // 8. Vinco vertical parede 1
      segments.push({ type: 'crease', x0: sx * (L1 + H4), y0: sy * B2, x1: sx * (L1 + H4), y1: 0.0 });

      // Tenon (Travas de inserção)
      segments.push({ type: 'cut', x0: sx * (L1 + H4 + dbw + H3), y0: sy * v6, x1: sx * (L1 + H4 + dbw + H3 + T1), y1: sy * (v6 + aT1) });
      segments.push({ type: 'cut', x0: sx * (L1 + H4 + dbw + H3 + T1), y0: sy * (v6 + tml - aT1), x1: sx * (L1 + H4 + dbw + H3 + T1), y1: sy * (v6 + aT1) });
      segments.push({ type: 'cut', x0: sx * (L1 + H4 + dbw + H3), y0: sy * (v6 + tml), x1: sx * (L1 + H4 + dbw + H3 + T1), y1: sy * (v6 + tml - aT1) });

      // Mortise (Furos de encaixe)
      segments.push({ type: 'cut', x0: sx * L1, y0: sy * (v5 + mtl), x1: sx * L1, y1: sy * v5 });
      segments.push({ type: 'cut', x0: sx * L1, y0: sy * v5, x1: sx * (L1 - mth), y1: sy * v5 });
      segments.push({ type: 'cut', x0: sx * (L1 - mth), y0: sy * (v5 + mtl), x1: sx * (L1 - mth), y1: sy * v5 });
      segments.push({ type: 'cut', x0: sx * L1, y0: sy * (v5 + mtl), x1: sx * (L1 - mth), y1: sy * (v5 + mtl) });

      // Paredes
      segments.push({ type: 'cut', x0: sx * (L1 + H4 + dbw + H3), y0: sy * (v6 + tml), x1: sx * (L1 + H4 + dbw + H3), y1: sy * B4 });
      segments.push({ type: 'crease', x0: sx * L1, y0: sy * (v5 + mtl), x1: sx * L1, y1: sy * B2 });
      segments.push({ type: 'cut', x0: sx * (L1 + H4 + dbw + H3), y0: sy * v6, x1: sx * (L1 + H4 + dbw + H3), y1: 0.0 });
      segments.push({ type: 'crease', x0: sx * L1, y0: sy * v5, x1: sx * L1, y1: 0.0 });

      // Aba de canto
      segments.push({ type: 'cut', x0: sx * L2, y0: sy * (B2 + H2), x1: sx * (L2 + D1), y1: sy * (B2 + H2) });

      if (D1 - (L1 - L2) > H4) {
        const v4 = 5.0;
        const dec = 10.0;
        const R4 = 3.0;
        const x7 = L1 + H4;
        const x_end = L2 + D1;

        const s_vert: Segment2D = { type: 'cut', x0: x7, y0: B2 + v4, x1: x7, y1: B2 };
        const s_diag: Segment2D = { type: 'cut', x0: x7, y0: B2 + v4, x1: x_end, y1: B2 + v4 + dec };
        const arc_ch = applyPicToolRound(s_vert, s_diag, R4);

        segments.push({ type: 'cut', x0: sx * x_end, y0: sy * (B2 + v4 + dec), x1: sx * x_end, y1: sy * (B2 + H2) });
        segments.push({ type: 'cut', x0: sx * s_diag.x0, y0: sy * s_diag.y0, x1: sx * s_diag.x1, y1: sy * s_diag.y1 });
        segments.push({ type: 'cut', x0: sx * s_vert.x0, y0: sy * s_vert.y0, x1: sx * s_vert.x1, y1: sy * s_vert.y1 });

        if (arc_ch) {
          const a_beg = arc_ch.startAngle;
          const a_end = arc_ch.endAngle;
          let a_b = a_beg;
          let a_e = a_end;

          if (sx < 0 && sy > 0) {
            a_b = (180.0 - a_beg + 360.0) % 360.0;
            a_e = (180.0 - a_end + 360.0) % 360.0;
          } else if (sx > 0 && sy < 0) {
            a_b = (360.0 - a_beg + 360.0) % 360.0;
            a_e = (360.0 - a_end + 360.0) % 360.0;
          } else if (sx < 0 && sy < 0) {
            a_b = (180.0 - (360.0 - a_beg) + 360.0) % 360.0;
            a_e = (180.0 - (360.0 - a_end) + 360.0) % 360.0;
          }

          arcs.push({
            type: 'cut',
            cx: sx * arc_ch.cx,
            cy: sy * arc_ch.cy,
            r: arc_ch.r,
            startAngle: a_b,
            endAngle: a_e,
          });
        }
      } else {
        segments.push({ type: 'cut', x0: sx * (L2 + D1), y0: sy * B2, x1: sx * (L2 + D1), y1: sy * (B2 + H2) });
      }

      if (sy < 0) {
        segments.push({ type: 'cut', x0: 0.0, y0: sy * (B1 + H1), x1: sx * L2, y1: sy * (B1 + H1) });
        // Segmento de alívio vertical (quando H2 != H1-(B2-B1))
        segments.push({ type: 'cut', x0: sx * L2, y0: sy * (B2 + H2), x1: sx * L2, y1: sy * (B1 + H1) });
      } else {
        // No topo positivo, o segmento vertical também é gerado no C# original
        segments.push({ type: 'cut', x0: sx * L2, y0: sy * (B2 + H2), x1: sx * L2, y1: sy * (B1 + H1) });
      }
    }

    // =========================================================================
    // TOP_COVER_427 (Transladado em Y = B1 + H1)
    // =========================================================================
    const yCoverOrig = B1 + H1;

    if (Ra > H6 / 2.0) Ra = H6 / 2.0;
    const limitA = 90.0 - ((Math.atan((3.0 * Ra) / (H6 - Ra)) * 180) / Math.PI);
    if (A > limitA) A = limitA;

    const R_ear = H6 - st;
    const ar = ((2.0 * Math.atan(Ra / R_ear)) * 180) / Math.PI;
    const hv = R_ear * Math.sin(((A) * Math.PI) / 180) + ds1;
    const hh = R_ear * Math.cos(((A) * Math.PI) / 180);
    const v7 = R_ear * Math.cos(((A + ar) * Math.PI) / 180);
    const v8 = R_ear * Math.sin(((A + ar) * Math.PI) / 180);

    if (r7T > H7) r7T = H7 - 0.0001;
    if (r7B > H7) r7B = H7 - 0.0001;
    const chH7T = Math.tan((ch7T * Math.PI) / 180) * H7;
    const chH7B = Math.tan((ch7B * Math.PI) / 180) * H7;

    function generateCoverHalfRight() {
      const covSegs: Segment2D[] = [];
      const covArcs: Arc2D[] = [];

      covSegs.push({ type: 'cut', x0: L2 - cw, y0: yCoverOrig + cs1, x1: L2 - cw, y1: yCoverOrig + cs1 + cs2 });
      covSegs.push({ type: 'cut', x0: L2 - cw, y0: yCoverOrig + cs1, x1: L2, y1: yCoverOrig + 0.0 });

      const s4: Segment2D = { type: 'cut', x0: L2 - cw, y0: yCoverOrig + cs1 + cs2, x1: L2 - cw + H7 - 0.0001, y1: yCoverOrig + cs1 + cs2 + chH7B };
      const s5: Segment2D = { type: 'cut', x0: L2 - cw + H7, y0: yCoverOrig + cs1 + chH7B + cs2, x1: L2 - cw + H7, y1: yCoverOrig + cs1 + B2top - chH7T };
      const s6: Segment2D = { type: 'cut', x0: L2 - cw + H7 - 0.0001, y0: yCoverOrig + cs1 + B2top - ds2 - chH7T, x1: L2 - cw, y1: yCoverOrig + cs1 + B2top - ds2 };

      const arcB = applyPicToolRound(s4, s5, r7B);
      const arcT = applyPicToolRound(s5, s6, r7T);

      covSegs.push(s4);
      covSegs.push(s5);
      covSegs.push(s6);
      if (arcB) covArcs.push(arcB);
      if (arcT) covArcs.push(arcT);

      covSegs.push({ type: 'cut', x0: L2 - cw, y0: yCoverOrig + cs1 + B2top - ds2, x1: L2 - cw, y1: yCoverOrig + cs1 + B2top });
      covSegs.push({ type: 'cut', x0: L2 - cw, y0: yCoverOrig + cs1 + B2top + ds1, x1: L2 - cw + dp, y1: yCoverOrig + cs1 + B2top + ds1 });
      covSegs.push({ type: 'cut', x0: L2 - cw, y0: yCoverOrig + cs1 + B2top + ds1, x1: L2 - cw, y1: yCoverOrig + cs1 + B2top });

      covSegs.push({ type: 'crease', x0: L2 - cw + dp, y0: yCoverOrig + cs1 + B2top + ds1, x1: L2 - cw + dp, y1: yCoverOrig + cs1 + B2top + H6 - st });
      covSegs.push({ type: 'crease', x0: L2 - cw, y0: yCoverOrig + cs1 + cs2, x1: L2 - cw, y1: yCoverOrig + cs1 + B2top - ds2 });

      covSegs.push({ type: 'cut', x0: L2 - cw + dp, y0: yCoverOrig + cs1 + B2top + H6, x1: Rc, y1: yCoverOrig + cs1 + B2top + H6 });
      covArcs.push({ type: 'cut', cx: 0.0, cy: yCoverOrig + cs1 + B2top + H6, r: Rc, startAngle: 270.0, endAngle: 360.0 });

      covSegs.push({ type: 'crease', x0: L2 - cw, y0: yCoverOrig + cs1, x1: 0.0, y1: yCoverOrig + cs1 });
      covSegs.push({ type: 'crease', x0: L2 - cw, y0: yCoverOrig + cs1 + B2top, x1: 0.0, y1: yCoverOrig + cs1 + B2top });

      covSegs.push({ type: 'cut', x0: L2 - cw + dp, y0: yCoverOrig + cs1 + B2top + H6, x1: L2 - cw + dp, y1: yCoverOrig + cs1 + B2top + H6 - st });

      const s20: Segment2D = { type: 'cut', x0: L2 - cw + dp, y0: yCoverOrig + cs1 + B2top + ds1, x1: L2 - cw + dp + hh - 0.0001, y1: yCoverOrig + cs1 + B2top + hv - 0.0001 };
      const s22: Segment2D = { type: 'cut', x0: L2 - cw + dp + v7, y0: yCoverOrig + cs1 + B2top + v8, x1: L2 - cw + dp + hh - 0.0001, y1: yCoverOrig + cs1 + B2top + hv + 0.0001 };

      const arcEar = applyPicToolRound(s20, s22, Ra);
      covSegs.push(s20);
      covSegs.push(s22);

      const xc21 = L2 - cw + dp;
      const yc21 = yCoverOrig + cs1 + B2top;
      covArcs.push({ type: 'cut', cx: xc21, cy: yc21, r: R_ear, startAngle: A + ar, endAngle: 90.0 });

      if (arcEar) {
        covArcs.push(arcEar);
      }

      return { covSegs, covArcs };
    }

    const right = generateCoverHalfRight();
    
    // Espelhamento exato em Y (ReflectionY: x -> -x) como no C# original
    const leftCovSegs: Segment2D[] = right.covSegs.map((s) => ({
      type: s.type,
      x0: -s.x0,
      y0: s.y0,
      x1: -s.x1,
      y1: s.y1,
    }));

    const leftCovArcs: Arc2D[] = right.covArcs.map((a) => ({
      type: a.type,
      cx: -a.cx,
      cy: a.cy,
      r: a.r,
      startAngle: (180.0 - a.startAngle + 360.0) % 360.0,
      endAngle: (180.0 - a.endAngle + 360.0) % 360.0,
    }));

    segments.push(...right.covSegs, ...leftCovSegs);
    arcs.push(...right.covArcs, ...leftCovArcs);

    const dimensions: DimensionLine[] = [
      { x0: -L2, y0: -(B1 + H1 + 20), x1: L2, y1: -(B1 + H1 + 20), text: `L = ${L} mm`, offset: -20 },
      { x0: -(L1 + H4 + dbw + H3 + T1 + 20), y0: -B1, x1: -(L1 + H4 + dbw + H3 + T1 + 20), y1: B1, text: `B = ${B} mm`, offset: -20, isVertical: true },
      { x0: (L1 + H4 + dbw + H3 + T1 + 20), y0: 0, x1: (L1 + H4 + dbw + H3 + T1 + 20), y1: H1, text: `H = ${H} mm`, offset: 20, isVertical: true },
      { x0: 25, y0: yCoverOrig + cs1, x1: 25, y1: yCoverOrig + cs1 + B2top, text: `Tampa = ${B2top.toFixed(1)} mm`, offset: 25, isVertical: true },
    ];

    const bounds = computeBoundingBox({ segments, arcs });

    return {
      segments,
      arcs,
      dimensions,
      bounds,
    };
  },
};
