// Modelos paramétricos de dielines (FEFCO/ECMA + comuns).
// Cada construtor recebe DielineParams e retorna um Dieline com cortes (cut),
// vincos (crease), perfurações (perf) e painéis nomeados.
//
// Geometria simplificada mas topologicamente correta para servir de template.

import type { Dieline, DielineParams, ModelDef, Segment, Panel } from "./dieline-types";
import { hline, line, panel, pt, rectSegments, vline, polyToCuts, polyPanel } from "./geom";
import { ECMA_MODELS } from "./models-ecma";

// ============ 0201 — Caixa reta cola (RSC) ============
function build0201(p: DielineParams): Dieline {
  const { L, H, P, glueTab } = p;
  const W = glueTab + L + P + L + P;
  const Ht = P / 2 + H + P / 2;
  const xs = [0, glueTab, glueTab + L, glueTab + L + P, glueTab + L + P + L, W];
  const yTop = P / 2 + H;
  const yBot = P / 2;

  const segs: Segment[] = [];
  // Contorno externo
  segs.push(...rectSegments(0, 0, W, Ht));
  // Cortes verticais entre abas (cima e baixo) — entre painéis a partir do glueTab
  for (let i = 1; i < xs.length - 1; i++) {
    if (i === 1) continue; // junção glueTab/painel não tem corte de aba
    segs.push(vline(xs[i], 0, yBot, "cut"));
    segs.push(vline(xs[i], yTop, Ht, "cut"));
  }
  // Vincos horizontais (corpo) — atravessam só painéis (a partir do glueTab)
  segs.push(hline(glueTab, W, yBot, "crease"));
  segs.push(hline(glueTab, W, yTop, "crease"));
  // Vincos verticais entre painéis (corpo)
  for (let i = 2; i < xs.length - 1; i++) {
    segs.push(vline(xs[i], yBot, yTop, "crease"));
  }
  // Vinco da aba de cola
  segs.push(vline(glueTab, yBot, yTop, "crease"));

  const panels: Panel[] = [
    panel("glue", "Aba cola", 0, yBot, glueTab, H),
    panel("front", "Frente", xs[1], yBot, L, H),
    panel("right", "Lateral D", xs[2], yBot, P, H),
    panel("back", "Verso", xs[3], yBot, L, H),
    panel("left", "Lateral E", xs[4], yBot, P, H),
    panel("topF", "Aba sup. frente", xs[1], yTop, L, P / 2),
    panel("topR", "Aba sup. lat. D", xs[2], yTop, P, P / 2),
    panel("topB", "Aba sup. verso", xs[3], yTop, L, P / 2),
    panel("topL", "Aba sup. lat. E", xs[4], yTop, P, P / 2),
    panel("botF", "Aba inf. frente", xs[1], 0, L, P / 2),
    panel("botR", "Aba inf. lat. D", xs[2], 0, P, P / 2),
    panel("botB", "Aba inf. verso", xs[3], 0, L, P / 2),
    panel("botL", "Aba inf. lat. E", xs[4], 0, P, P / 2),
  ];

  return {
    width: W,
    height: Ht,
    segments: segs,
    panels,
    meta: { fefco: "0201", name: "Caixa reta cola (RSC)", params: p },
  };
}

// ============ 0217 — Caixa fundo americano (semi-auto) ============
// Topologia idêntica ao 0201; abas inferiores travam por dobra cruzada.
function build0217(p: DielineParams): Dieline {
  const d = build0201(p);
  // Indica perfuração diagonal nas abas inferiores (referência visual de dobra/trava).
  const yBot = p.P / 2;
  const xs = [p.glueTab, p.glueTab + p.L, p.glueTab + p.L + p.P, p.glueTab + p.L + p.P + p.L];
  for (const x of xs) {
    d.segments.push(line(x, 0, x + p.L * 0.05, yBot * 0.5, "perf"));
  }
  d.meta = { fefco: "0217", name: "Fundo americano (semi-auto)", params: p };
  return d;
}

// ============ 0215 — Fundo automático (crash-lock) ============
// 4 painéis verticais; abas inferiores entrelaçadas (representadas como pestanas).
function build0215(p: DielineParams): Dieline {
  const { L, H, P, glueTab } = p;
  const W = glueTab + L + P + L + P;
  const tabH = Math.max(P, L) * 0.65; // pestanas inferiores
  const topH = P / 2;
  const Ht = tabH + H + topH;

  const xs = [0, glueTab, glueTab + L, glueTab + L + P, glueTab + L + P + L, W];
  const yBot = tabH;
  const yTop = tabH + H;

  const segs: Segment[] = [];
  // Contorno: topo (abas P/2 retas), corpo, fundo (pestanas)
  segs.push(line(0, Ht, W, Ht, "cut"));
  segs.push(line(W, Ht, W, yTop, "cut"));
  segs.push(line(0, Ht, 0, yTop, "cut"));
  // Cortes verticais entre abas superiores
  for (let i = 2; i < xs.length - 1; i++) segs.push(vline(xs[i], yTop, Ht, "cut"));
  // Vinco do glueTab
  segs.push(vline(glueTab, yBot, yTop, "crease"));
  // Topo até base lateral
  segs.push(line(0, yTop, 0, yBot, "cut"));
  segs.push(line(W, yTop, W, yBot, "cut"));
  // Pestanas inferiores: cada par alterna formato
  for (let i = 1; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const wpan = x1 - x0;
    if (i % 2 === 1) {
      // pestana grande (frente/verso)
      segs.push(line(x0, yBot, x0, 0, "cut"));
      segs.push(line(x0, 0, x1 - wpan * 0.15, 0, "cut"));
      segs.push(line(x1 - wpan * 0.15, 0, x1, tabH * 0.4, "cut"));
      segs.push(line(x1, tabH * 0.4, x1, yBot, "cut"));
    } else {
      // pestana menor (laterais)
      segs.push(line(x0, yBot, x0, tabH * 0.3, "cut"));
      segs.push(line(x0, tabH * 0.3, x0 + wpan * 0.5, tabH * 0.05, "cut"));
      segs.push(line(x0 + wpan * 0.5, tabH * 0.05, x1, tabH * 0.3, "cut"));
      segs.push(line(x1, tabH * 0.3, x1, yBot, "cut"));
    }
    // vinco diagonal de trava (crash-lock)
    segs.push(line(x0, yBot, x0 + wpan * 0.5, yBot - tabH * 0.5, "crease"));
  }
  // Vincos do corpo
  segs.push(hline(glueTab, W, yBot, "crease"));
  segs.push(hline(glueTab, W, yTop, "crease"));
  for (let i = 2; i < xs.length - 1; i++) segs.push(vline(xs[i], yBot, yTop, "crease"));

  const panels: Panel[] = [
    panel("glue", "Aba cola", 0, yBot, glueTab, H),
    panel("front", "Frente", xs[1], yBot, L, H),
    panel("right", "Lat. D", xs[2], yBot, P, H),
    panel("back", "Verso", xs[3], yBot, L, H),
    panel("left", "Lat. E", xs[4], yBot, P, H),
    panel("topF", "Aba topo F", xs[1], yTop, L, topH),
    panel("topR", "Aba topo D", xs[2], yTop, P, topH),
    panel("topB", "Aba topo V", xs[3], yTop, L, topH),
    panel("topL", "Aba topo E", xs[4], yTop, P, topH),
  ];
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels,
    meta: { fefco: "0215", name: "Fundo automático (crash-lock)", params: p },
  };
}

// ============ 0300 — Telescópica (tampa + fundo) ============
// Renderiza fundo e tampa lado a lado.
function build0300(p: DielineParams): Dieline {
  const { L, H, P } = p;
  // Cruz para fundo
  const baseW = L + 2 * P;
  const baseH = P + 2 * P;
  const segs: Segment[] = [];
  const panels: Panel[] = [];

  function cross(ox: number, label: string, idPrefix: string, height: number) {
    // base central LxH em (ox+P, P)
    const cx = ox + P;
    const cy = P;
    // contorno em cruz
    segs.push(line(cx, 0, cx + L, 0, "cut"));
    segs.push(line(cx + L, 0, cx + L, cy, "cut"));
    segs.push(line(cx + L, cy, cx + L + P, cy, "cut"));
    segs.push(line(cx + L + P, cy, cx + L + P, cy + height, "cut"));
    segs.push(line(cx + L + P, cy + height, cx + L, cy + height, "cut"));
    segs.push(line(cx + L, cy + height, cx + L, cy + height + P, "cut"));
    segs.push(line(cx + L, cy + height + P, cx, cy + height + P, "cut"));
    segs.push(line(cx, cy + height + P, cx, cy + height, "cut"));
    segs.push(line(cx, cy + height, cx - P, cy + height, "cut"));
    segs.push(line(cx - P, cy + height, cx - P, cy, "cut"));
    segs.push(line(cx - P, cy, cx, cy, "cut"));
    segs.push(line(cx, cy, cx, 0, "cut"));
    // vincos (4 dobras da base)
    segs.push(hline(cx, cx + L, cy, "crease"));
    segs.push(hline(cx, cx + L, cy + height, "crease"));
    segs.push(vline(cx, cy, cy + height, "crease"));
    segs.push(vline(cx + L, cy, cy + height, "crease"));
    panels.push(panel(`${idPrefix}-base`, `${label} base`, cx, cy, L, height));
    panels.push(panel(`${idPrefix}-top`, `${label} topo`, cx, cy + height, L, P));
    panels.push(panel(`${idPrefix}-bot`, `${label} fundo`, cx, 0, L, cy));
    panels.push(panel(`${idPrefix}-l`, `${label} esq`, cx - P, cy, P, height));
    panels.push(panel(`${idPrefix}-r`, `${label} dir`, cx + L, cy, P, height));
  }
  cross(0, "Fundo", "fundo", H);
  cross(baseW + 20, "Tampa", "tampa", H + 4); // tampa um pouco mais alta

  return {
    width: baseW * 2 + 20,
    height: baseH + (H + 4),
    segments: segs,
    panels,
    meta: { fefco: "0300", name: "Telescópica (tampa + fundo)", params: p },
  };
}

// ============ Sleeve (luva) ============
function buildSleeve(p: DielineParams): Dieline {
  // 4 painéis: Frente | Topo | Verso | Fundo + aba de cola
  const { L, H, P, glueTab } = p;
  const W = glueTab + 2 * L + 2 * P;
  const Ht = H;
  const xs = [0, glueTab, glueTab + L, glueTab + L + P, glueTab + 2 * L + P, W];
  const segs: Segment[] = [];
  segs.push(...rectSegments(0, 0, W, Ht));
  for (let i = 1; i < xs.length - 1; i++) segs.push(vline(xs[i], 0, Ht, "crease"));
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("glue", "Cola", 0, 0, glueTab, Ht),
      panel("front", "Frente", xs[1], 0, L, Ht),
      panel("top", "Topo", xs[2], 0, P, Ht),
      panel("back", "Verso", xs[3], 0, L, Ht),
      panel("bot", "Fundo", xs[4], 0, P, Ht),
    ],
    meta: { fefco: "Sleeve", name: "Luva (sleeve)", params: p },
  };
}

// ============ Envelope (cruz) ============
function buildEnvelope(p: DielineParams): Dieline {
  const { L, H } = p;
  const flap = p.P; // altura da aba (usa P como aba)
  const W = L + 2 * flap;
  const Ht = H + 2 * flap;
  const segs: Segment[] = [];
  // cruz
  const pts = [
    pt(flap, 0), pt(flap + L, 0), pt(flap + L, flap), pt(W, flap),
    pt(W, flap + H), pt(flap + L, flap + H), pt(flap + L, Ht),
    pt(flap, Ht), pt(flap, flap + H), pt(0, flap + H), pt(0, flap), pt(flap, flap),
  ];
  segs.push(...polyToCuts(pts));
  // vincos das 4 abas
  segs.push(hline(flap, flap + L, flap, "crease"));
  segs.push(hline(flap, flap + L, flap + H, "crease"));
  segs.push(vline(flap, flap, flap + H, "crease"));
  segs.push(vline(flap + L, flap, flap + H, "crease"));
  return {
    width: W,
    height: Ht,
    segments: segs,
    panels: [
      panel("center", "Centro", flap, flap, L, H),
      panel("top", "Aba sup", flap, flap + H, L, flap),
      panel("bot", "Aba inf", flap, 0, L, flap),
      panel("left", "Aba esq", 0, flap, flap, H),
      panel("right", "Aba dir", flap + L, flap, flap, H),
    ],
    meta: { fefco: "Envelope", name: "Envelope (cruz)", params: p },
  };
}

// ============ Display de balcão (frontal trapezoidal) ============
function buildDisplayBalcao(p: DielineParams): Dieline {
  const { L, H, P } = p;
  const front = H; // altura frontal
  const back = H * 1.6; // altura traseira
  const segs: Segment[] = [];
  // base + frente + costas + 2 laterais trapezoidais
  // Layout: [lateral E trap] [base] [frente] [costas] [lateral D trap]
  let x = 0;
  // lateral esq (trapézio)
  const latPts = [pt(x, 0), pt(x + P, 0), pt(x + P, back), pt(x, front)];
  segs.push(...polyToCuts(latPts));
  segs.push(vline(x + P, 0, Math.min(back, front), "crease"));
  x += P;
  segs.push(...rectSegments(x, 0, L, P)); segs.push(vline(x + L, 0, P, "crease")); x += L; // base
  segs.push(...rectSegments(x, 0, L, front)); segs.push(vline(x + L, 0, front, "crease")); x += L; // frente
  segs.push(...rectSegments(x, 0, L, back)); segs.push(vline(x + L, 0, back, "crease")); x += L; // costas
  // lateral dir (trapézio)
  const latPts2 = [pt(x, 0), pt(x + P, 0), pt(x + P, front), pt(x, back)];
  segs.push(...polyToCuts(latPts2));
  return {
    width: x + P,
    height: back,
    segments: segs,
    panels: [
      polyPanel("latE", "Lateral E", latPts),
      panel("base", "Base", P, 0, L, P),
      panel("front", "Frente", P + L, 0, L, front),
      panel("back", "Costas", P + 2 * L, 0, L, back),
      polyPanel("latD", "Lateral D", latPts2),
    ],
    meta: { fefco: "Display", name: "Display de balcão", params: p },
  };
}

// ============ Expositor de chão (display alto) ============
function buildExpositor(p: DielineParams): Dieline {
  // Variação do display de balcão com altura maior (back grande).
  const d = buildDisplayBalcao({ ...p, H: p.H * 1.4 });
  d.meta = { fefco: "Display Floor", name: "Expositor de chão", params: p };
  return d;
}

// ============ Caixa berço (tray) ============
function buildBerco(p: DielineParams): Dieline {
  const { L, H, P } = p;
  const W = 2 * P + L;
  const Ht = 2 * P + H;
  const segs: Segment[] = [];
  // cruz simples
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
  return {
    width: W, height: Ht, segments: segs,
    panels: [
      panel("base", "Base", P, P, L, H),
      panel("top", "Lateral sup", P, P + H, L, P),
      panel("bot", "Lateral inf", P, 0, L, P),
      panel("l", "Lateral E", 0, P, P, H),
      panel("r", "Lateral D", P + L, P, P, H),
    ],
    meta: { fefco: "Tray", name: "Caixa berço", params: p },
  };
}

// ============ Hexagonal ============
function buildHexagonal(p: DielineParams): Dieline {
  const { L, H } = p;
  const sides = 6;
  const W = L * sides;
  const Ht = H + L; // corpo + tampa
  const segs: Segment[] = [];
  // 6 painéis verticais
  segs.push(...rectSegments(0, 0, W, H));
  for (let i = 1; i < sides; i++) segs.push(vline(i * L, 0, H, "crease"));
  // tampa hexagonal acima do painel central
  const cx = (W) / 2;
  const r = L * 0.6;
  const hexPts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    hexPts.push(pt(cx + r * Math.cos(a), H + L * 0.5 + r * Math.sin(a)));
  }
  segs.push(...polyToCuts(hexPts));
  // vinco ligando tampa ao painel
  segs.push(hline(cx - L / 2, cx + L / 2, H, "crease"));
  return {
    width: W, height: Ht, segments: segs,
    panels: [
      ...Array.from({ length: 6 }, (_, i) => panel(`p${i}`, `Face ${i + 1}`, i * L, 0, L, H)),
      polyPanel("top", "Tampa hex", hexPts),
    ],
    meta: { fefco: "Hex", name: "Caixa hexagonal", params: p },
  };
}

// ============ Pillow box (travesseiro) ============
function buildPillow(p: DielineParams): Dieline {
  const { L, H, glueTab } = p;
  const W = glueTab + 2 * L + L * 0.4;
  const arc = H * 0.18;
  const Ht = H + 2 * arc;
  const segs: Segment[] = [];
  segs.push(...rectSegments(0, arc, W, H));
  // arcos superior/inferior aproximados por curvas em segmentos
  function arcSeg(y0: number, dir: 1 | -1) {
    const N = 32;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = t * W;
      const yy = y0 + dir * arc * Math.sin(Math.PI * t);
      pts.push(pt(x, yy));
    }
    for (let i = 0; i < pts.length - 1; i++) segs.push({ kind: "cut", points: [pts[i], pts[i + 1]] });
  }
  arcSeg(arc, -1);
  arcSeg(arc + H, 1);
  // vincos verticais
  [glueTab, glueTab + L, glueTab + L + L * 0.4].forEach(x => segs.push(vline(x, arc, arc + H, "crease")));
  return {
    width: W, height: Ht, segments: segs,
    panels: [
      panel("glue", "Cola", 0, arc, glueTab, H),
      panel("front", "Frente", glueTab, arc, L, H),
      panel("side", "Lateral", glueTab + L, arc, L * 0.4, H),
      panel("back", "Verso", glueTab + L + L * 0.4, arc, L, H),
    ],
    meta: { fefco: "Pillow", name: "Caixa travesseiro", params: p },
  };
}

// ============ Maleta com alça ============
function buildMaleta(p: DielineParams): Dieline {
  const d = build0201(p);
  // adiciona perfuração em formato de alça nas duas abas superiores frontais
  const handleW = p.L * 0.4;
  const handleH = p.P * 0.25;
  const cx = p.glueTab + p.L / 2;
  const cy = p.P / 2 + p.H + p.P * 0.25;
  // retângulo arredondado simplificado
  const N = 24;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(pt(cx - handleW / 2 + t * handleW, cy + Math.sin(Math.PI * t) * handleH));
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pts.push(pt(cx - handleW / 2 + t * handleW, cy - Math.sin(Math.PI * t) * handleH));
  }
  for (let i = 0; i < pts.length - 1; i++) d.segments.push({ kind: "cut", points: [pts[i], pts[i + 1]] });
  d.meta = { fefco: "Suitcase", name: "Maleta com alça", params: p };
  return d;
}

// ============ Caixa de pizza (FEFCO 0421-like) ============
function buildPizza(p: DielineParams): Dieline {
  const { L, P } = p;
  const tabH = P * 0.6;
  const W = L + 2 * (P + tabH);
  const Ht = L + 2 * P;
  const segs: Segment[] = [];
  // Base central LxL, abas P em volta + abinhas tabH nas laterais
  const ox = P + tabH, oy = P;
  segs.push(...rectSegments(ox, oy, L, L));
  // vincos da base para abas P
  segs.push(hline(ox, ox + L, oy, "crease"));
  segs.push(hline(ox, ox + L, oy + L, "crease"));
  segs.push(vline(ox, oy, oy + L, "crease"));
  segs.push(vline(ox + L, oy, oy + L, "crease"));
  // aba inferior com aba de fechamento
  segs.push(...rectSegments(ox, 0, L, P));
  segs.push(...rectSegments(ox, oy + L, L, P)); // aba superior
  segs.push(hline(ox, ox + L, oy + L + P, "crease"));
  // aba topo (frente) com pestana
  segs.push(...rectSegments(ox, oy + L + P - 0.001, L, 0.001)); // marca
  // Laterais E e D com tabH
  segs.push(...rectSegments(P, oy, tabH, L)); // tab esq base
  segs.push(...rectSegments(0, oy, P, L));     // aba esq
  segs.push(...rectSegments(ox + L, oy, tabH, L));
  segs.push(...rectSegments(ox + L + tabH, oy, P, L));
  // vincos para abas laterais
  segs.push(vline(P, oy, oy + L, "crease"));
  segs.push(vline(P + tabH, oy, oy + L, "crease"));
  segs.push(vline(ox + L, oy, oy + L, "crease"));
  segs.push(vline(ox + L + tabH, oy, oy + L, "crease"));
  return {
    width: W, height: Ht, segments: segs,
    panels: [
      panel("base", "Base", ox, oy, L, L),
      panel("front", "Frente", ox, 0, L, P),
      panel("back", "Costas", ox, oy + L, L, P),
      panel("latE", "Lat. E", 0, oy, P, L),
      panel("latD", "Lat. D", ox + L + tabH, oy, P, L),
    ],
    meta: { fefco: "Pizza", name: "Caixa pizza", params: p },
  };
}

// ============ Hambúrguer (clamshell) ============
function buildHamburguer(p: DielineParams): Dieline {
  const { L, H, P } = p;
  const W = L + 2 * P;
  const Ht = 2 * (L + P) + H;
  const segs: Segment[] = [];
  // base
  segs.push(...rectSegments(P, P, L, L));
  // tampa em cima
  segs.push(...rectSegments(P, P + L + H, L, L));
  // costas (com vinco do clamshell)
  segs.push(...rectSegments(P, P + L, L, H));
  // abas laterais base
  segs.push(...rectSegments(0, P, P, L));
  segs.push(...rectSegments(P + L, P, P, L));
  // abas laterais tampa
  segs.push(...rectSegments(0, P + L + H, P, L));
  segs.push(...rectSegments(P + L, P + L + H, P, L));
  // pestana frontal (fechamento)
  segs.push(...rectSegments(P, 0, L, P));
  segs.push(...rectSegments(P, P + 2 * L + H, L, P));
  // vincos
  [P, P + L, P + L + H, P + 2 * L + H].forEach(y => segs.push(hline(P, P + L, y, "crease")));
  segs.push(vline(P, P, P + 2 * L + H, "crease"));
  segs.push(vline(P + L, P, P + 2 * L + H, "crease"));
  return {
    width: W, height: Ht, segments: segs,
    panels: [
      panel("base", "Base", P, P, L, L),
      panel("back", "Articulação", P, P + L, L, H),
      panel("top", "Tampa", P, P + L + H, L, L),
    ],
    meta: { fefco: "Clamshell", name: "Caixa hambúrguer", params: p },
  };
}

// ============ Gaveta + Luva ============
function buildGavetaLuva(p: DielineParams): Dieline {
  // Gaveta (tray) à esquerda + Luva (sleeve) à direita
  const tray = buildBerco(p);
  const sleeve = buildSleeve(p);
  const gap = 20;
  const segs: Segment[] = [];
  // copia tray
  segs.push(...tray.segments);
  // sleeve deslocado
  for (const s of sleeve.segments) {
    segs.push({ ...s, points: s.points.map(pp => pt(pp.x + tray.width + gap, pp.y)) });
  }
  const panels: Panel[] = [
    ...tray.panels,
    ...sleeve.panels.map(pn => ({
      ...pn,
      id: `sl-${pn.id}`,
      label: `Luva ${pn.label}`,
      polygon: pn.polygon.map(pp => pt(pp.x + tray.width + gap, pp.y)),
    })),
  ];
  return {
    width: tray.width + gap + sleeve.width,
    height: Math.max(tray.height, sleeve.height),
    segments: segs,
    panels,
    meta: { fefco: "Drawer+Sleeve", name: "Gaveta + Luva", params: p },
  };
}

// ============ Registry ============
const defs: Omit<DielineParams, never> = {} as DielineParams;

const baseDefaults: Partial<DielineParams> = {
  L: 100, H: 80, P: 50, thickness: 0.4, glueTab: 18, bleed: 3,
};

export const MODELS: ModelDef[] = [
  { id: "fefco-0201", fefco: "0201", name: "Caixa reta cola (RSC)", category: "fefco", defaults: baseDefaults, build: build0201 },
  { id: "fefco-0215", fefco: "0215", name: "Fundo automático (crash-lock)", category: "fefco", defaults: baseDefaults, build: build0215 },
  { id: "fefco-0217", fefco: "0217", name: "Fundo americano", category: "fefco", defaults: baseDefaults, build: build0217 },
  { id: "fefco-0300", fefco: "0300", name: "Telescópica (tampa+fundo)", category: "fefco", defaults: { ...baseDefaults, P: 30 }, build: build0300 },
  { id: "sleeve", fefco: "Sleeve", name: "Luva (sleeve)", category: "ecma", defaults: baseDefaults, build: buildSleeve },
  { id: "envelope", fefco: "Envelope", name: "Envelope cruz", category: "ecma", defaults: { ...baseDefaults, P: 30 }, build: buildEnvelope },
  { id: "display-balcao", fefco: "Display", name: "Display de balcão", category: "display", defaults: { ...baseDefaults, P: 80, H: 200 }, build: buildDisplayBalcao },
  { id: "expositor", fefco: "Display Floor", name: "Expositor de chão", category: "display", defaults: { ...baseDefaults, L: 300, H: 600, P: 200 }, build: buildExpositor },
  { id: "berco", fefco: "Tray", name: "Caixa berço (tray)", category: "ecma", defaults: { ...baseDefaults, H: 30 }, build: buildBerco },
  { id: "hexagonal", fefco: "Hex", name: "Caixa hexagonal", category: "especial", defaults: { ...baseDefaults, L: 50, H: 120, P: 50 }, build: buildHexagonal },
  { id: "pillow", fefco: "Pillow", name: "Caixa travesseiro (pillow)", category: "especial", defaults: { ...baseDefaults, L: 90, H: 70, P: 30, glueTab: 15 }, build: buildPillow },
  { id: "maleta", fefco: "Suitcase", name: "Maleta com alça", category: "especial", defaults: baseDefaults, build: buildMaleta },
  { id: "pizza", fefco: "Pizza", name: "Caixa pizza", category: "especial", defaults: { ...baseDefaults, L: 300, H: 30, P: 30 }, build: buildPizza },
  { id: "hamburguer", fefco: "Clamshell", name: "Caixa hambúrguer (clamshell)", category: "especial", defaults: { ...baseDefaults, L: 110, H: 55, P: 30 }, build: buildHamburguer },
  { id: "gaveta-luva", fefco: "Drawer+Sleeve", name: "Gaveta + Luva", category: "especial", defaults: baseDefaults, build: buildGavetaLuva },
  ...ECMA_MODELS,
];

export function buildDieline(modelId: string, params: DielineParams): Dieline | null {
  const m = MODELS.find(x => x.id === modelId);
  if (!m) return null;
  return m.build(params);
}

export function defaultParamsFor(modelId: string): DielineParams {
  const m = MODELS.find(x => x.id === modelId);
  const base: DielineParams = { L: 100, H: 80, P: 50, thickness: 0.4, glueTab: 18, bleed: 3 };
  return { ...base, ...(m?.defaults ?? {}) } as DielineParams;
}
