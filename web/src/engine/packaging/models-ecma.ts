// Modelos paramétricos da família ECMA (Folding Carton).
// 28 modelos curados — 9 família A, 3 B, 3 C, 2 D, 3 E, 4 F, 3 X.
//
// Cada construtor produz um Dieline topologicamente correto:
//  - cortes ("cut") no contorno e entre abas
//  - vincos ("crease") entre painéis adjacentes (= dobras 3D)
//  - painéis nomeados que compartilham arestas → fold-engine detecta dobras
//
// Para A/B usamos um helper genérico (aBody) com variações de fechamento
// (tuck, straight tuck, crash lock, snap lock, pillow, friction, sleeve).

import type { Dieline, DielineParams, ModelDef, Panel, Pt, Segment } from "./dieline-types";
import { hline, line, panel, polyPanel, polyToCuts, pt, rectSegments, vline } from "./geom";

// ============================================================
// Tipos de fechamento (top/bottom)
// ============================================================
type FlapKind =
  | "tuck"           // RTE — flap retangular com chanfro, abas laterais trapezoidais
  | "straight_tuck"  // STE — flaps frente/verso retos, slits laterais
  | "crash_lock"     // Auto-bottom — pestanas entrelaçadas
  | "snap_lock"      // Snap-lock 1-2-3
  | "tuck_lock"      // Tuck com travas (slits)
  | "friction_lock"  // Friction (atrito) tab
  | "pillow"         // Arco semi-circular
  | "open";          // Sleeve aberto

interface ABodyOpts {
  top: FlapKind;
  bottom: FlapKind;
  fefco: string;
  name: string;
  /** Etiqueta curta de família para o nome composto. */
  family?: string;
}

// ============================================================
// HELPER: corpo retangular A-family (long seam)
//   glue | front | right | back | left
// ============================================================
function flapHeight(kind: FlapKind, p: DielineParams, panelW: number): number {
  const { P, H } = p;
  switch (kind) {
    case "tuck":
    case "straight_tuck":
    case "tuck_lock":
    case "friction_lock":
    case "snap_lock":
      return Math.max(8, P * 0.95);
    case "crash_lock":
      return Math.max(P, panelW * 0.55);
    case "pillow":
      return Math.min(panelW * 0.45, H * 0.28);
    case "open":
      return 0;
  }
}

function buildFlap(
  segs: Segment[],
  panels: Panel[],
  idPrefix: string,
  labelPrefix: string,
  kind: FlapKind,
  x0: number,
  x1: number,
  yBase: number,
  h: number,
  dir: 1 | -1,
  isSide: boolean,
  panelId: string,
  panelLabel: string
) {
  const w = x1 - x0;
  let pts: Pt[];

  if (kind === "open" || h <= 0) return;

  if (kind === "pillow") {
    const N = 16;
    const arc = h;
    pts = [pt(x0, yBase)];
    for (let n = 1; n < N; n++) {
      const t = n / N;
      pts.push(pt(x0 + t * w, yBase + dir * arc * Math.sin(Math.PI * t)));
    }
    pts.push(pt(x1, yBase));
  } else if (kind === "crash_lock") {
    if (isSide) {
      const sh = h * 0.5;
      const y1 = yBase + dir * sh;
      pts = [
        pt(x0, yBase),
        pt(x0, yBase + dir * sh * 0.4),
        pt(x0 + w * 0.5, y1),
        pt(x1, yBase + dir * sh * 0.4),
        pt(x1, yBase),
      ];
    } else {
      const y1 = yBase + dir * h;
      pts = [
        pt(x0, yBase),
        pt(x0, yBase + dir * h * 0.5),
        pt(x0 + w * 0.18, y1),
        pt(x1 - w * 0.18, y1),
        pt(x1, yBase + dir * h * 0.5),
        pt(x1, yBase),
      ];
      // Diagonal lock crease (visual)
      segs.push(line(x0, yBase, x0 + w * 0.5, y1, "crease"));
      segs.push(line(x1, yBase, x0 + w * 0.5, y1, "crease"));
    }
  } else if (kind === "tuck" || kind === "tuck_lock" || kind === "friction_lock") {
    if (isSide) {
      // Dust flap trapezoidal
      const dh = h * 0.7;
      const y1 = yBase + dir * dh;
      const inset = w * 0.18;
      pts = [pt(x0, yBase), pt(x0 + inset, y1), pt(x1 - inset, y1), pt(x1, yBase)];
    } else {
      const y1 = yBase + dir * h;
      const corner = Math.min(w * 0.06, h * 0.15);
      pts = [
        pt(x0, yBase),
        pt(x0, y1 - dir * corner),
        pt(x0 + corner, y1),
        pt(x1 - corner, y1),
        pt(x1, y1 - dir * corner),
        pt(x1, yBase),
      ];
      if (kind === "tuck_lock") {
        // Slits de trava nas laterais
        segs.push(line(x0, yBase + dir * h * 0.3, x0 - w * 0.04, yBase + dir * h * 0.3, "cut"));
        segs.push(line(x1, yBase + dir * h * 0.3, x1 + w * 0.04, yBase + dir * h * 0.3, "cut"));
      } else if (kind === "friction_lock") {
        // Pequenos cortes de atrito na ponta
        const yMid = yBase + dir * h * 0.85;
        segs.push(line(x0 + w * 0.2, yMid, x0 + w * 0.4, yMid, "cut"));
        segs.push(line(x1 - w * 0.4, yMid, x1 - w * 0.2, yMid, "cut"));
      }
    }
  } else if (kind === "straight_tuck") {
    if (isSide) {
      const dh = h * 0.65;
      const y1 = yBase + dir * dh;
      const inset = w * 0.15;
      pts = [pt(x0, yBase), pt(x0 + inset, y1), pt(x1 - inset, y1), pt(x1, yBase)];
    } else {
      const y1 = yBase + dir * h;
      const corner = Math.min(w * 0.05, h * 0.12);
      pts = [
        pt(x0, yBase),
        pt(x0, y1 - dir * corner),
        pt(x0 + corner, y1),
        pt(x1 - corner, y1),
        pt(x1, y1 - dir * corner),
        pt(x1, yBase),
      ];
    }
  } else if (kind === "snap_lock") {
    if (isSide) {
      const dh = h * 0.6;
      const y1 = yBase + dir * dh;
      const inset = w * 0.15;
      pts = [pt(x0, yBase), pt(x0 + inset, y1), pt(x1 - inset, y1), pt(x1, yBase)];
    } else {
      const y1 = yBase + dir * h;
      pts = [pt(x0, yBase), pt(x0, y1), pt(x1, y1), pt(x1, yBase)];
      // Snap diagonal
      segs.push(line(x0, yBase, x0 + w * 0.4, y1, "crease"));
    }
  } else {
    const y1 = yBase + dir * h;
    pts = [pt(x0, yBase), pt(x0, y1), pt(x1, y1), pt(x1, yBase)];
  }

  // Cortes do contorno (omitindo a aresta de base — essa é o vinco)
  for (let k = 0; k < pts.length - 1; k++) {
    // pula a aresta de base (entre primeiro e segundo? Na verdade base é a última aresta, entre pts[N-1] e pts[0])
    segs.push({ kind: "cut", points: [pts[k], pts[k + 1]] });
  }
  // Painel: precisa fechar polígono incluindo base
  const panelPoly = [...pts]; // already starts and ends on base line
  panels.push(polyPanel(`${idPrefix}-${panelId}`, `${labelPrefix} ${panelLabel}`, panelPoly));
}

function aBody(p: DielineParams, opts: ABodyOpts): Dieline {
  const { L, H, P, glueTab } = p;
  const W = glueTab + 2 * L + 2 * P;
  const xs = [0, glueTab, glueTab + L, glueTab + L + P, glueTab + 2 * L + P, W];
  const topH = flapHeight(opts.top, p, Math.max(L, P));
  const botH = flapHeight(opts.bottom, p, Math.max(L, P));
  const yBot = botH;
  const yTop = botH + H;
  const Ht = botH + H + topH;

  const segs: Segment[] = [];
  const panels: Panel[] = [];

  // Glue tab (sem flaps)
  segs.push(line(0, yBot, 0, yTop, "cut"));
  segs.push(line(0, yBot, glueTab, yBot, "cut"));
  segs.push(line(0, yTop, glueTab, yTop, "cut"));
  segs.push(vline(glueTab, yBot, yTop, "crease"));
  panels.push(panel("glue", "Aba cola", 0, yBot, glueTab, H));

  // Vincos horizontais do corpo
  segs.push(hline(glueTab, W, yBot, "crease"));
  segs.push(hline(glueTab, W, yTop, "crease"));
  // Vincos verticais entre paredes
  for (let i = 2; i < 5; i++) segs.push(vline(xs[i], yBot, yTop, "crease"));
  // Borda externa direita do corpo
  segs.push(vline(W, yBot, yTop, "cut"));

  // Painéis das paredes
  panels.push(panel("front", "Frente", xs[1], yBot, L, H));
  panels.push(panel("right", "Lat. D", xs[2], yBot, P, H));
  panels.push(panel("back", "Verso", xs[3], yBot, L, H));
  panels.push(panel("left", "Lat. E", xs[4], yBot, P, H));

  const ids = ["front", "right", "back", "left"];
  const labels = ["F", "D", "V", "E"];

  // Top flaps
  if (opts.top !== "open") {
    for (let i = 1; i < 5; i++) {
      const isSide = i === 2 || i === 4;
      buildFlap(segs, panels, "top", "Aba sup.", opts.top, xs[i], xs[i + 1], yTop, topH, +1, isSide, ids[i - 1], labels[i - 1]);
    }
  } else {
    segs.push(hline(glueTab, W, yTop, "cut"));
  }
  // Bottom flaps
  if (opts.bottom !== "open") {
    for (let i = 1; i < 5; i++) {
      const isSide = i === 2 || i === 4;
      buildFlap(segs, panels, "bot", "Aba inf.", opts.bottom, xs[i], xs[i + 1], yBot, botH, -1, isSide, ids[i - 1], labels[i - 1]);
    }
  } else {
    segs.push(hline(glueTab, W, yBot, "cut"));
  }

  return {
    width: W,
    height: Ht,
    segments: segs,
    panels,
    meta: { fefco: opts.fefco, name: opts.name, params: p },
  };
}

// ============================================================
// FAMÍLIA A — Long Seam Rectangular (9 modelos)
// ============================================================
const buildA20 = (p: DielineParams) => aBody(p, { top: "tuck", bottom: "tuck", fefco: "A20.20.20.20", name: "A — Reverse Tuck End (RTE)" });
const buildA21 = (p: DielineParams) => aBody(p, { top: "straight_tuck", bottom: "straight_tuck", fefco: "A20.20.21.21", name: "A — Straight Tuck End (STE)" });
const buildA60 = (p: DielineParams) => aBody(p, { top: "tuck", bottom: "crash_lock", fefco: "A60.20.20.20", name: "A — Crash Lock + Tuck Top" });
const buildA60Snap = (p: DielineParams) => aBody(p, { top: "snap_lock", bottom: "crash_lock", fefco: "A60.10.20.20", name: "A — Auto-bottom + Snap Lock" });
const buildA20Lock = (p: DielineParams) => aBody(p, { top: "tuck_lock", bottom: "tuck_lock", fefco: "A20.30.20.30", name: "A — Tuck 1-2-3 Lock" });
const buildA60Friction = (p: DielineParams) => aBody(p, { top: "friction_lock", bottom: "crash_lock", fefco: "A60.30.20.30", name: "A — Crash Lock + Friction Top" });
const buildA40Pillow = (p: DielineParams) => aBody(p, { top: "pillow", bottom: "pillow", fefco: "A20.40.20.40", name: "A — Pillow Pack" });
const buildA10Sleeve = (p: DielineParams) => aBody(p, { top: "open", bottom: "open", fefco: "A30.10.20.10", name: "A — Sleeve aberto" });
const buildA21Slits = (p: DielineParams) => aBody(p, { top: "tuck_lock", bottom: "tuck_lock", fefco: "A21.21.21.21", name: "A — Tuck End com Slits" });

// ============================================================
// FAMÍLIA B — Short Seam (3 modelos) — usamos aBody com L↔P trocados
// ============================================================
function bSwap(p: DielineParams): DielineParams {
  return { ...p, L: p.P, P: p.L };
}
const buildB10 = (p: DielineParams) => {
  const d = aBody(bSwap(p), { top: "open", bottom: "open", fefco: "B10.10.10.10", name: "B — Sleeve curto (short seam)" });
  return d;
};
const buildB20 = (p: DielineParams) => aBody(bSwap(p), { top: "tuck", bottom: "tuck", fefco: "B20.20.20.20", name: "B — Tuck End (short seam)" });
const buildB60 = (p: DielineParams) => aBody(bSwap(p), { top: "tuck", bottom: "crash_lock", fefco: "B60.20.20.20", name: "B — Crash Lock (short seam)" });

// ============================================================
// FAMÍLIA C — Long Seam Non-Rectangular (3 modelos)
// ============================================================
// Sleeve/box poligonal: N paredes iguais de largura L, fechamento opcional no topo.
function polyPrism(p: DielineParams, sides: number, topKind: FlapKind, fefco: string, name: string): Dieline {
  const { L, H, glueTab } = p;
  const W = glueTab + sides * L;
  const topH = flapHeight(topKind, p, L);
  const Ht = H + topH;
  const segs: Segment[] = [];
  const panels: Panel[] = [];

  // Contorno corpo
  segs.push(line(0, 0, 0, H, "cut"));
  segs.push(line(W, 0, W, H, "cut"));
  segs.push(line(0, 0, W, 0, "cut"));
  segs.push(line(0, H, W, H, topKind === "open" ? "cut" : "crease"));

  // Glue tab
  segs.push(vline(glueTab, 0, H, "crease"));
  panels.push(panel("glue", "Aba cola", 0, 0, glueTab, H));

  for (let i = 0; i < sides; i++) {
    const x0 = glueTab + i * L;
    if (i > 0) segs.push(vline(x0, 0, H, "crease"));
    panels.push(panel(`p${i}`, `Face ${i + 1}`, x0, 0, L, H));
  }

  // Top flaps (uma por face)
  if (topKind !== "open") {
    for (let i = 0; i < sides; i++) {
      const x0 = glueTab + i * L;
      const x1 = x0 + L;
      buildFlap(segs, panels, "top", "Aba sup.", topKind, x0, x1, H, topH, +1, false, `p${i}`, `face ${i + 1}`);
      if (i < sides - 1) segs.push(vline(x1, H, H + topH, "cut"));
    }
  }
  return { width: W, height: Ht, segments: segs, panels, meta: { fefco, name, params: p } };
}
const buildC10Hex = (p: DielineParams) => polyPrism(p, 6, "open", "C10.10.10.10", "C — Sleeve hexagonal");
const buildC20Tri = (p: DielineParams) => polyPrism(p, 3, "tuck", "C20.20.20.20", "C — Triangular Tuck End");
const buildC60Oct = (p: DielineParams) => polyPrism(p, 8, "crash_lock", "C60.20.20.20", "C — Octagonal Crash Lock");

// ============================================================
// FAMÍLIA D — Short-Long Seam Non-Rectangular (2 modelos)
// ============================================================
function buildD10(p: DielineParams): Dieline {
  // Pillow short — 3 painéis com fechamento curvo
  const { L, H, glueTab } = p;
  const W = glueTab + 3 * L;
  const arc = H * 0.22;
  const Ht = H + 2 * arc;
  const segs: Segment[] = [];
  segs.push(...rectSegments(0, arc, W, H));
  // Curvas
  function arcCut(y0: number, dir: 1 | -1) {
    const N = 24;
    for (let n = 0; n < N; n++) {
      const t = n / N;
      const t2 = (n + 1) / N;
      const a = pt(t * W, y0 + dir * arc * Math.sin(Math.PI * t));
      const b = pt(t2 * W, y0 + dir * arc * Math.sin(Math.PI * t2));
      segs.push({ kind: "cut", points: [a, b] });
    }
  }
  arcCut(arc, -1);
  arcCut(arc + H, +1);
  [glueTab, glueTab + L, glueTab + 2 * L].forEach((x) => segs.push(vline(x, arc, arc + H, "crease")));
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("glue", "Cola", 0, arc, glueTab, H),
      panel("front", "Frente", glueTab, arc, L, H),
      panel("side", "Lateral", glueTab + L, arc, L, H),
      panel("back", "Verso", glueTab + 2 * L, arc, L, H),
    ],
    meta: { fefco: "D10.10.10.10", name: "D — Pillow curto", params: p },
  };
}

function buildD20(p: DielineParams): Dieline {
  // Trapezoidal — 4 paredes inclinadas (corpo afunilado)
  const { L, H, P, glueTab } = p;
  const taper = P * 0.2;
  const W = glueTab + 2 * L + 2 * P;
  const Ht = H + P;
  const segs: Segment[] = [];
  const panels: Panel[] = [];
  const xs = [0, glueTab, glueTab + L, glueTab + L + P, glueTab + 2 * L + P, W];

  segs.push(line(0, 0, W, 0, "cut"));
  segs.push(line(0, H, 0, 0, "cut"));
  segs.push(line(W, 0, W, H, "cut"));
  segs.push(line(0, H, W, H, "crease"));
  segs.push(vline(glueTab, 0, H, "crease"));
  for (let i = 2; i < 5; i++) segs.push(vline(xs[i], 0, H, "crease"));

  panels.push(panel("glue", "Cola", 0, 0, glueTab, H));
  panels.push(panel("front", "Frente", xs[1], 0, L, H));
  panels.push(panel("right", "Lat. D", xs[2], 0, P, H));
  panels.push(panel("back", "Verso", xs[3], 0, L, H));
  panels.push(panel("left", "Lat. E", xs[4], 0, P, H));

  // Topo trapezoidal — abas afuniladas
  for (let i = 1; i < 5; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    const tp: Pt[] = [pt(x0, H), pt(x0 + taper, Ht), pt(x1 - taper, Ht), pt(x1, H)];
    for (let k = 0; k < tp.length - 1; k++) segs.push({ kind: "cut", points: [tp[k], tp[k + 1]] });
    panels.push(polyPanel(`top-${i}`, `Aba sup. ${i}`, tp));
  }
  return { width: W, height: Ht, segments: segs, panels, meta: { fefco: "D20.20.20.20", name: "D — Caixa trapezoidal", params: p } };
}

// ============================================================
// FAMÍLIA E — Product-Integrated (3 modelos)
// ============================================================
function buildE10(p: DielineParams): Dieline {
  // Bandeja com tampa integrada (clamshell-like)
  const { L, H, P } = p;
  const W = L + 2 * P;
  const Ht = 2 * (P + L) + H;
  const segs: Segment[] = [];

  // Base
  segs.push(...rectSegments(P, P, L, L));
  // Costas (articulação)
  segs.push(...rectSegments(P, P + L, L, H));
  // Tampa
  segs.push(...rectSegments(P, P + L + H, L, L));
  // Pestana frontal de fechamento
  segs.push(...rectSegments(P, 0, L, P));
  segs.push(...rectSegments(P, P + 2 * L + H, L, P));
  // Abas laterais
  segs.push(...rectSegments(0, P, P, L));
  segs.push(...rectSegments(P + L, P, P, L));
  segs.push(...rectSegments(0, P + L + H, P, L));
  segs.push(...rectSegments(P + L, P + L + H, P, L));

  // Vincos
  [P, P + L, P + L + H, P + 2 * L + H].forEach((y) => segs.push(hline(P, P + L, y, "crease")));
  segs.push(vline(P, P, P + 2 * L + H, "crease"));
  segs.push(vline(P + L, P, P + 2 * L + H, "crease"));

  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("base", "Base", P, P, L, L),
      panel("back", "Articulação", P, P + L, L, H),
      panel("top", "Tampa", P, P + L + H, L, L),
      panel("front-tab", "Pestana frontal", P, 0, L, P),
      panel("top-tab", "Pestana topo", P, P + 2 * L + H, L, P),
      panel("base-l", "Lat. base E", 0, P, P, L),
      panel("base-r", "Lat. base D", P + L, P, P, L),
      panel("top-l", "Lat. tampa E", 0, P + L + H, P, L),
      panel("top-r", "Lat. tampa D", P + L, P + L + H, P, L),
    ],
    meta: { fefco: "E10.10.10.10", name: "E — Bandeja c/ tampa integrada", params: p },
  };
}

function buildE20(p: DielineParams): Dieline {
  // Caixa A20 + divisória interna (separadora de garrafas)
  const d = aBody(p, { top: "tuck", bottom: "tuck", fefco: "E20.20.20.20", name: "E — Box c/ divisórias" });
  // Adiciona divisória ao lado (peça avulsa)
  const { L, H, P } = p;
  const dx = d.width + 20;
  const dy = 0;
  // Cruz para divisória 4 cavidades
  const segs = d.segments;
  segs.push(...rectSegments(dx, dy, L, H));
  segs.push(line(dx + L / 2, dy, dx + L / 2, dy + H, "cut"));
  // segundo cruzeta vertical com slot
  segs.push(...rectSegments(dx + L + 10, dy, P, H));
  segs.push(line(dx + L + 10 + P / 2, dy, dx + L + 10 + P / 2, dy + H / 2, "cut"));

  d.width = dx + L + 10 + P;
  d.height = Math.max(d.height, H);
  d.panels.push(polyPanel("div-h", "Divisória H", [pt(dx, dy), pt(dx + L, dy), pt(dx + L, dy + H), pt(dx, dy + H)]));
  d.panels.push(polyPanel("div-v", "Divisória V", [pt(dx + L + 10, dy), pt(dx + L + 10 + P, dy), pt(dx + L + 10 + P, dy + H), pt(dx + L + 10, dy + H)]));
  return d;
}

function buildE30(p: DielineParams): Dieline {
  // Caixa A20 com janela cortada na frente
  const d = aBody(p, { top: "tuck", bottom: "tuck", fefco: "E30.30.30.30", name: "E — Box c/ janela" });
  const { L, H, P, glueTab } = p;
  const wx = glueTab + L * 0.18;
  const wy = (P / 2) + H * 0.18;
  const ww = L * 0.64;
  const wh = H * 0.55;
  d.segments.push(...rectSegments(wx, wy, ww, wh, "cut"));
  return d;
}

// ============================================================
// FAMÍLIA F — Other Folding Cartons (4 modelos)
// ============================================================
function buildF10Handle(p: DielineParams): Dieline {
  // Caixa A20 com alça integrada (handle hole nas abas superiores)
  const d = aBody(p, { top: "tuck", bottom: "crash_lock", fefco: "F10.10.10.10", name: "F — Carrying Handle" });
  const { L, P, H, glueTab } = p;
  // Alça (oval) na aba superior frontal — recorte
  const cx = glueTab + L / 2;
  const cy = H + P + P * 0.55;
  const handleW = L * 0.45;
  const handleH = P * 0.22;
  const N = 24;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(pt(cx - handleW / 2 + t * handleW, cy + Math.sin(Math.PI * t) * handleH));
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pts.push(pt(cx - handleW / 2 + t * handleW, cy - Math.sin(Math.PI * t) * handleH));
  }
  for (let i = 0; i < pts.length - 1; i++) d.segments.push({ kind: "cut", points: [pts[i], pts[i + 1]] });
  return d;
}

function buildF20Pizza(p: DielineParams): Dieline {
  // Pizza box — base quadrada L×L, abas P em volta
  const { L, P } = p;
  const W = L + 2 * P + L * 0.3; // pestana frontal
  const Ht = L + 2 * P;
  const segs: Segment[] = [];
  // Base
  segs.push(...rectSegments(P, P, L, L));
  // Abas em volta
  segs.push(...rectSegments(P, 0, L, P));
  segs.push(...rectSegments(P, P + L, L, P));
  segs.push(...rectSegments(0, P, P, L));
  segs.push(...rectSegments(P + L, P, P, L));
  // Pestana de fechamento
  segs.push(...rectSegments(P + L + P, P + L * 0.1, L * 0.3, L * 0.8));
  // Vincos
  segs.push(hline(P, P + L, P, "crease"));
  segs.push(hline(P, P + L, P + L, "crease"));
  segs.push(vline(P, P, P + L, "crease"));
  segs.push(vline(P + L, P, P + L, "crease"));
  segs.push(vline(P + L + P, P + L * 0.1, P + L * 0.9, "crease"));
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("base", "Base", P, P, L, L),
      panel("front", "Frente", P, 0, L, P),
      panel("back", "Costas", P, P + L, L, P),
      panel("latE", "Lat. E", 0, P, P, L),
      panel("latD", "Lat. D", P + L, P, P, L),
      panel("tab", "Pestana", P + L + P, P + L * 0.1, L * 0.3, L * 0.8),
    ],
    meta: { fefco: "F20.20.20.20", name: "F — Pizza Box", params: p },
  };
}

function buildF30Display(p: DielineParams): Dieline {
  // Display tray — bandeja com frontal baixo e costas alto
  const { L, H, P } = p;
  const front = P * 0.9;
  const back = H;
  const W = L + 2 * P;
  const Ht = back + P + front;
  const segs: Segment[] = [];
  // base
  segs.push(...rectSegments(P, front, L, P));
  // frente baixa
  segs.push(...rectSegments(P, 0, L, front));
  // costas alta
  segs.push(...rectSegments(P, front + P, L, back));
  // laterais trapezoidais (simplificadas)
  const latEsq = [pt(0, front), pt(P, front), pt(P, front + P), pt(0, front + P)];
  const latDir = [pt(P + L, front), pt(P + L + P, front), pt(P + L + P, front + P), pt(P + L, front + P)];
  segs.push(...polyToCuts(latEsq));
  segs.push(...polyToCuts(latDir));
  // Vincos
  segs.push(hline(P, P + L, front, "crease"));
  segs.push(hline(P, P + L, front + P, "crease"));
  segs.push(vline(P, front, front + P, "crease"));
  segs.push(vline(P + L, front, front + P, "crease"));
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("base", "Base", P, front, L, P),
      panel("front", "Frente baixa", P, 0, L, front),
      panel("back", "Costas alta", P, front + P, L, back),
      polyPanel("latE", "Lat. E", latEsq),
      polyPanel("latD", "Lat. D", latDir),
    ],
    meta: { fefco: "F30.30.30.30", name: "F — Display Tray", params: p },
  };
}

function buildF40Book(p: DielineParams): Dieline {
  // Book-style box — abre como livro (charneira na lateral)
  const { L, H, P } = p;
  const W = 2 * L + P + 2 * P; // base + lombada + tampa + abas
  const Ht = H + 2 * P;
  const segs: Segment[] = [];
  // Layout horizontal: [aba E][base L×H][lombada P×H][tampa L×H][aba D]
  const xs = [0, P, P + L, P + L + P, P + 2 * L + P, W];
  segs.push(...rectSegments(P, P, L, H)); // base
  segs.push(...rectSegments(P + L, P, P, H)); // lombada
  segs.push(...rectSegments(P + L + P, P, L, H)); // tampa
  segs.push(...rectSegments(0, P, P, H)); // aba esq
  segs.push(...rectSegments(P + 2 * L + P, P, P, H)); // aba dir
  // Abas sup/inf da base e tampa
  segs.push(...rectSegments(P, 0, L, P));
  segs.push(...rectSegments(P, P + H, L, P));
  segs.push(...rectSegments(P + L + P, 0, L, P));
  segs.push(...rectSegments(P + L + P, P + H, L, P));
  // Vincos
  for (let i = 1; i < xs.length - 1; i++) segs.push(vline(xs[i], P, P + H, "crease"));
  segs.push(hline(P, P + L, P, "crease"));
  segs.push(hline(P, P + L, P + H, "crease"));
  segs.push(hline(P + L + P, P + L + P + L, P, "crease"));
  segs.push(hline(P + L + P, P + L + P + L, P + H, "crease"));
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("base", "Base", P, P, L, H),
      panel("spine", "Lombada", P + L, P, P, H),
      panel("cover", "Tampa", P + L + P, P, L, H),
      panel("latE", "Aba E", 0, P, P, H),
      panel("latD", "Aba D", P + 2 * L + P, P, P, H),
      panel("baseTop", "Base topo", P, P + H, L, P),
      panel("baseBot", "Base base", P, 0, L, P),
      panel("coverTop", "Tampa topo", P + L + P, P + H, L, P),
      panel("coverBot", "Tampa base", P + L + P, 0, L, P),
    ],
    meta: { fefco: "F40.40.40.40", name: "F — Book-style", params: p },
  };
}

// ============================================================
// FAMÍLIA X — Auxiliary Devices (3 modelos)
// ============================================================
function buildX10(p: DielineParams): Dieline {
  // Divisória em cruz — 2 peças que se encaixam
  const { L, H, P } = p;
  const segs: Segment[] = [];
  // Peça horizontal
  segs.push(...rectSegments(0, 0, L, H));
  // Slots verticais (3 fendas)
  for (let i = 1; i <= 3; i++) {
    const x = (L * i) / 4;
    segs.push(vline(x, 0, H / 2, "cut"));
  }
  // Peça vertical (deslocada)
  const dx = L + 30;
  segs.push(...rectSegments(dx, 0, P, H));
  for (let i = 1; i <= 3; i++) {
    const x = dx + (P * i) / 4;
    segs.push(vline(x, H / 2, H, "cut"));
  }
  return {
    width: dx + P,
    height: H,
    segments: segs,
    panels: [
      panel("div-h", "Divisória H", 0, 0, L, H),
      panel("div-v", "Divisória V", dx, 0, P, H),
    ],
    meta: { fefco: "X10.10.10.10", name: "X — Divisória em cruz", params: p },
  };
}

function buildX20(p: DielineParams): Dieline {
  // Insert/berço com cavidades
  const { L, H, P } = p;
  const W = L + 2 * P;
  const Ht = 2 * P + H;
  const segs: Segment[] = [];
  const pts = [
    pt(P, 0), pt(P + L, 0), pt(P + L, P), pt(W, P),
    pt(W, P + H), pt(P + L, P + H), pt(P + L, Ht),
    pt(P, Ht), pt(P, P + H), pt(0, P + H), pt(0, P), pt(P, P),
  ];
  segs.push(...polyToCuts(pts));
  segs.push(hline(P, P + L, P, "crease"));
  segs.push(hline(P, P + L, P + H, "crease"));
  segs.push(vline(P, P, P + H, "crease"));
  segs.push(vline(P + L, P, P + H, "crease"));
  // Cavidades circulares (recortes)
  const cx = P + L / 2, cy = P + H / 2;
  const r = Math.min(L, H) * 0.2;
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a1 = (i / N) * 2 * Math.PI;
    const a2 = ((i + 1) / N) * 2 * Math.PI;
    segs.push({
      kind: "cut",
      points: [pt(cx + r * Math.cos(a1), cy + r * Math.sin(a1)), pt(cx + r * Math.cos(a2), cy + r * Math.sin(a2))],
    });
  }
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("base", "Base insert", P, P, L, H),
      panel("top", "Lat. sup", P, P + H, L, P),
      panel("bot", "Lat. inf", P, 0, L, P),
      panel("l", "Lat. E", 0, P, P, H),
      panel("r", "Lat. D", P + L, P, P, H),
    ],
    meta: { fefco: "X20.20.20.20", name: "X — Insert / berço", params: p },
  };
}

function buildX30(p: DielineParams): Dieline {
  // Separador horizontal (placa com slots)
  const { L, H, P } = p;
  const segs: Segment[] = [];
  segs.push(...rectSegments(0, 0, L, P));
  // 5 slots para encaixe
  for (let i = 1; i <= 5; i++) {
    const x = (L * i) / 6;
    segs.push(vline(x, P * 0.2, P * 0.8, "cut"));
  }
  return {
    width: L,
    height: P,
    segments: segs,
    panels: [panel("sep", "Separador", 0, 0, L, P)],
    meta: { fefco: "X30.30.30.30", name: "X — Separador horizontal", params: p },
  };
}

// ============================================================
// REGISTRY — 27 modelos ECMA
// ============================================================
const ecmaDefaults: Partial<DielineParams> = { L: 90, H: 130, P: 35, thickness: 0.35, glueTab: 12, bleed: 3 };

export const ECMA_MODELS: ModelDef[] = [
  // A
  { id: "ecma-a20", fefco: "A20.20.20.20", name: "A — Reverse Tuck End (RTE)", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA20 },
  { id: "ecma-a21", fefco: "A20.20.21.21", name: "A — Straight Tuck End (STE)", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA21 },
  { id: "ecma-a60", fefco: "A60.20.20.20", name: "A — Crash Lock + Tuck Top", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA60 },
  { id: "ecma-a60-snap", fefco: "A60.10.20.20", name: "A — Auto-bottom + Snap Lock", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA60Snap },
  { id: "ecma-a20-lock", fefco: "A20.30.20.30", name: "A — Tuck 1-2-3 Lock", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA20Lock },
  { id: "ecma-a60-friction", fefco: "A60.30.20.30", name: "A — Crash Lock + Friction Top", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA60Friction },
  { id: "ecma-a40-pillow", fefco: "A20.40.20.40", name: "A — Pillow Pack", category: "ecma", subcategory: "A", defaults: { ...ecmaDefaults, L: 110, H: 70, P: 30 }, build: buildA40Pillow },
  { id: "ecma-a10-sleeve", fefco: "A30.10.20.10", name: "A — Sleeve aberto", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA10Sleeve },
  { id: "ecma-a21-slits", fefco: "A21.21.21.21", name: "A — Tuck End com Slits", category: "ecma", subcategory: "A", defaults: ecmaDefaults, build: buildA21Slits },
  // B
  { id: "ecma-b10", fefco: "B10.10.10.10", name: "B — Sleeve curto", category: "ecma", subcategory: "B", defaults: ecmaDefaults, build: buildB10 },
  { id: "ecma-b20", fefco: "B20.20.20.20", name: "B — Tuck End (short seam)", category: "ecma", subcategory: "B", defaults: ecmaDefaults, build: buildB20 },
  { id: "ecma-b60", fefco: "B60.20.20.20", name: "B — Crash Lock (short seam)", category: "ecma", subcategory: "B", defaults: ecmaDefaults, build: buildB60 },
  // C
  { id: "ecma-c10-hex", fefco: "C10.10.10.10", name: "C — Sleeve hexagonal", category: "ecma", subcategory: "C", defaults: { ...ecmaDefaults, L: 50, H: 140 }, build: buildC10Hex },
  { id: "ecma-c20-tri", fefco: "C20.20.20.20", name: "C — Triangular Tuck End", category: "ecma", subcategory: "C", defaults: { ...ecmaDefaults, L: 70, H: 160 }, build: buildC20Tri },
  { id: "ecma-c60-oct", fefco: "C60.20.20.20", name: "C — Octagonal Crash Lock", category: "ecma", subcategory: "C", defaults: { ...ecmaDefaults, L: 45, H: 120 }, build: buildC60Oct },
  // D
  { id: "ecma-d10", fefco: "D10.10.10.10", name: "D — Pillow curto", category: "ecma", subcategory: "D", defaults: { ...ecmaDefaults, L: 80, H: 60 }, build: buildD10 },
  { id: "ecma-d20", fefco: "D20.20.20.20", name: "D — Caixa trapezoidal", category: "ecma", subcategory: "D", defaults: ecmaDefaults, build: buildD20 },
  // E
  { id: "ecma-e10", fefco: "E10.10.10.10", name: "E — Bandeja c/ tampa integrada", category: "ecma", subcategory: "E", defaults: { ...ecmaDefaults, L: 110, H: 50, P: 30 }, build: buildE10 },
  { id: "ecma-e20", fefco: "E20.20.20.20", name: "E — Box c/ divisórias", category: "ecma", subcategory: "E", defaults: ecmaDefaults, build: buildE20 },
  { id: "ecma-e30", fefco: "E30.30.30.30", name: "E — Box c/ janela", category: "ecma", subcategory: "E", defaults: ecmaDefaults, build: buildE30 },
  // F
  { id: "ecma-f10", fefco: "F10.10.10.10", name: "F — Carrying Handle", category: "ecma", subcategory: "F", defaults: { ...ecmaDefaults, L: 180, H: 220, P: 90 }, build: buildF10Handle },
  { id: "ecma-f20", fefco: "F20.20.20.20", name: "F — Pizza Box", category: "ecma", subcategory: "F", defaults: { ...ecmaDefaults, L: 300, P: 30, H: 30 }, build: buildF20Pizza },
  { id: "ecma-f30", fefco: "F30.30.30.30", name: "F — Display Tray", category: "ecma", subcategory: "F", defaults: { ...ecmaDefaults, L: 200, H: 250, P: 80 }, build: buildF30Display },
  { id: "ecma-f40", fefco: "F40.40.40.40", name: "F — Book-style", category: "ecma", subcategory: "F", defaults: { ...ecmaDefaults, L: 150, H: 200, P: 30 }, build: buildF40Book },
  // X
  { id: "ecma-x10", fefco: "X10.10.10.10", name: "X — Divisória em cruz", category: "ecma", subcategory: "X", defaults: ecmaDefaults, build: buildX10 },
  { id: "ecma-x20", fefco: "X20.20.20.20", name: "X — Insert / berço", category: "ecma", subcategory: "X", defaults: { ...ecmaDefaults, L: 120, H: 80, P: 25 }, build: buildX20 },
  { id: "ecma-x30", fefco: "X30.30.30.30", name: "X — Separador horizontal", category: "ecma", subcategory: "X", defaults: { ...ecmaDefaults, L: 180, P: 60 }, build: buildX30 },
];
