// ============================================================================
//  FASE 1 — Detecção automática de 2 cores (estilo ArtiosCAD / Heidelberg).
// ============================================================================
//
//  Classificador unificado de strokes vetoriais. Recebe (colorKey, label,
//  dashArray?) e devolve a função estrutural do traço com NÍVEL DE CONFIANÇA.
//
//  Pipeline de classificação (ordem de confiança decrescente):
//    NÍVEL 1 — Nome de camada / spot color (cut, corte, knife, faca, schnitt,
//              crease, vinco, fold, dobra, rille, perf, meia-faca, half-cut…)
//    NÍVEL 2 — Cor RGB/CMYK conhecida do setor (vermelho=corte, azul=vinco,
//              magenta=perf, verde=valley, padrão Esko CMYK 0,255,255=cut)
//    NÍVEL 3 — Heurística geométrica + dash (tracejado=perf/crease)
//    NÍVEL 4 — Fallback: corte (loop externo costuma ser o que sobra)
//
//  API pública:
//    classifyStroke(colorKey, label)              → ClassifyKind  (legado)
//    classifyStrokeDetailed(colorKey, label)      → ClassificationResult
//    shouldIgnoreStroke(colorKey, label)          → boolean
//    parseRgbFromColorKey(colorKey)               → Rgb | null
// ============================================================================

import type { SegmentKind } from "../dieline-types";

export type ClassifyKind = SegmentKind | "ignore";
export type ConfidenceLevel = 1 | 2 | 3 | 4;

export interface ClassificationResult {
  kind: ClassifyKind;
  /** 1 = nome de camada, 2 = cor conhecida, 3 = heurística, 4 = fallback. */
  level: ConfidenceLevel;
  reason: string;
}

interface Rgb { r: number; g: number; b: number; }

// ───────────────────────── parsing utilitário ─────────────────────────

export function parseRgbFromColorKey(colorKey: string): Rgb | null {
  const baseKey = colorKey.split("|")[0].toLowerCase();

  const gray = baseKey.match(/^gray:(\d+)$/);
  if (gray) {
    const v = Number(gray[1]);
    return Number.isFinite(v) ? { r: v, g: v, b: v } : null;
  }

  const numeric = baseKey.match(/^rgb:(\d+),(\d+),(\d+)$/);
  if (numeric) return { r: +numeric[1], g: +numeric[2], b: +numeric[3] };

  const hex = baseKey.match(/^rgb:#?([0-9a-f]{6})$/);
  if (hex) {
    const v = hex[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16),
    };
  }

  const cmyk = baseKey.match(/^cmyk:(\d*\.?\d+),(\d*\.?\d+),(\d*\.?\d+),(\d*\.?\d+)$/);
  if (cmyk) {
    const c = +cmyk[1], m = +cmyk[2], y = +cmyk[3], k = +cmyk[4];
    return {
      r: Math.round(255 * (1 - c) * (1 - k)),
      g: Math.round(255 * (1 - m) * (1 - k)),
      b: Math.round(255 * (1 - y) * (1 - k)),
    };
  }
  return null;
}

function isDashed(colorKey: string, label: string): boolean {
  const text = `${colorKey} ${label}`.toLowerCase();
  return /\|dash:|tracejad|dash/.test(text);
}

function isSolid(colorKey: string, label: string): boolean {
  return !isDashed(colorKey, label);
}

// ───────────────────────── ignore (preto/marcas) ─────────────────────────

/** Preto sólido (cota/texto/desenho auxiliar) — sempre ignorado. */
export function shouldIgnoreStroke(colorKey: string, label: string): boolean {
  if (!isSolid(colorKey, label)) return false;
  const baseKey = colorKey.split("|")[0].toLowerCase();
  if (baseKey === "default") return true;
  if (/^spot:.*\b(black|preto|registration|registro)\b/.test(baseKey)) return true;

  const rgb = parseRgbFromColorKey(baseKey);
  if (!rgb) return false;
  // Preto puro ou quase: max canal ≤ 40.
  return Math.max(rgb.r, rgb.g, rgb.b) <= 40;
}

// ───────────────────────── NÍVEL 1 — nome ─────────────────────────

// Cobre PT/EN/DE/ES/IT + variações comuns em prefixos/sufixos de camada
// ("01_cut_lines", "L_Faca_Externa", "DIE-CUT", "Crease_Lines"…).
const NAME_PATTERNS: Array<{ kind: ClassifyKind; rx: RegExp }> = [
  // perf / meia-faca primeiro (mais específico que "cut")
  { kind: "perf",   rx: /(perf(?:ora)?|micro[-_ ]?perf|half[-_ ]?cut|meia[-_ ]faca|pico|kiss[-_ ]?cut)/ },
  // crease / vinco / fold / score / rill
  { kind: "crease", rx: /(crease|vinco|fold(?!er)|dobr[ao]|score|rill|rille|rilsan|plieg|piega|falz)/ },
  // bleed / sangria
  { kind: "bleed",  rx: /(bleed|sangria|sangrado|abfallend|sangratura)/ },
  // cut / corte / knife / faca / die / schnitt / taglio / corteador
  { kind: "cut",    rx: /(cut(?!ter)|corte|cortad|knife|faca|die[-_ ]?cut|^die$|stanz|schnitt|taglio|coupe)/ },
];

function classifyByName(colorKey: string, label: string): ClassificationResult | null {
  const text = `${label} ${colorKey}`.toLowerCase();
  for (const { kind, rx } of NAME_PATTERNS) {
    if (rx.test(text)) {
      return { kind, level: 1, reason: `Nome de camada/spot reconhecido (regex ${rx.source})` };
    }
  }
  return null;
}

// ───────────────────────── NÍVEL 2 — cor conhecida ─────────────────────────

function classifyByKnownColor(colorKey: string, label: string): ClassificationResult | null {
  const rgb = parseRgbFromColorKey(colorKey);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;

  // Saturação muito baixa = cinza. Cinza médio sólido vira vinco (nível 3).
  if (saturation < 25) return null;

  const dashed = isDashed(colorKey, label);

  // Vermelho puro ou variantes (#FF0000, #9d1e24, etc.) → CORTE.
  // Inclui Esko CMYK 0,1,1,0 → RGB 255,0,0.
  const redDominant = r === max && r - g >= 40 && r - b >= 40;
  if (redDominant) {
    return { kind: "cut", level: 2, reason: `Vermelho dominante (R=${r}, G=${g}, B=${b}) → corte` };
  }

  // Magenta puro #FF00FF → PERFURAÇÃO (alguns) ou BLEED (outros).
  // Convenção ArtiosCAD: magenta saturado = bleed; magenta+nome=perf cai no nível 1.
  const magenta = r >= 200 && b >= 200 && g < Math.min(r, b) - 60;
  if (magenta) {
    return { kind: "bleed", level: 2, reason: `Magenta saturado (R=${r}, G=${g}, B=${b}) → sangria` };
  }

  // Amarelo #FFFF00 → PERFURAÇÃO (convenção CAD).
  const yellow = r >= 200 && g >= 180 && b < Math.min(r, g) - 60;
  if (yellow) {
    return { kind: "perf", level: 2, reason: `Amarelo (R=${r}, G=${g}, B=${b}) → perfuração` };
  }

  // Azul puro / azul-escuro #0000FF, #0033FF → VINCO.
  const blueDominant = b === max && b - r >= 40 && b - g >= 40;
  if (blueDominant) {
    const kind: ClassifyKind = dashed ? "perf" : "crease";
    return { kind, level: 2, reason: `Azul dominante (R=${r}, G=${g}, B=${b})${dashed ? " tracejado" : ""}` };
  }

  // Ciano / teal escuro (Esko CMYK 1,0,0,0 → 0,255,255; 0.5,0,0,0.5 → 64,128,128).
  // G≈B ambos muito maiores que R = ciano/teal = VINCO.
  const cyan = Math.abs(g - b) <= 25 && g - r >= 35 && b - r >= 35;
  if (cyan) {
    const kind: ClassifyKind = dashed ? "perf" : "crease";
    return { kind, level: 2, reason: `Ciano/teal (R=${r}, G=${g}, B=${b})${dashed ? " tracejado" : ""}` };
  }

  // Verde puro #00FF00, #5dbf49 → VINCO (Esko CMYK 1,0,1,0 = 0,255,0).
  const greenDominant = g === max && g - r >= 40 && g - b >= 25;
  if (greenDominant) {
    const kind: ClassifyKind = dashed ? "perf" : "crease";
    return { kind, level: 2, reason: `Verde dominante (R=${r}, G=${g}, B=${b})${dashed ? " tracejado" : ""}` };
  }

  return null;
}

// ───────────────────────── NÍVEL 3 — heurística ─────────────────────────

function classifyByHeuristics(colorKey: string, label: string): ClassificationResult | null {
  // Tracejado em qualquer cor → perfuração.
  if (isDashed(colorKey, label)) {
    return { kind: "perf", level: 3, reason: "Stroke tracejado → perfuração" };
  }

  const rgb = parseRgbFromColorKey(colorKey);
  if (rgb) {
    const { r, g, b } = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    // Cinza médio sólido → vinco (linha auxiliar de dobra).
    if (saturation < 12 && max < 180 && max > 40) {
      return { kind: "crease", level: 3, reason: `Cinza médio (max=${max}) → vinco` };
    }
  }

  return null;
}

// ───────────────────────── orquestrador ─────────────────────────

export function classifyStrokeDetailed(colorKey: string, label: string): ClassificationResult {
  if (shouldIgnoreStroke(colorKey, label)) {
    return { kind: "ignore", level: 1, reason: "Preto sólido / marca auxiliar" };
  }

  const byName = classifyByName(colorKey, label);
  if (byName) return byName;

  const byColor = classifyByKnownColor(colorKey, label);
  if (byColor) return byColor;

  const byHeuristic = classifyByHeuristics(colorKey, label);
  if (byHeuristic) return byHeuristic;

  // NÍVEL 4 — fallback: corte (contorno externo costuma ser o que resta).
  return { kind: "cut", level: 4, reason: "Fallback — sem regra aplicável, assumindo corte" };
}

/** API legado: devolve só o tipo. */
export function classifyStroke(colorKey: string, label: string): ClassifyKind {
  return classifyStrokeDetailed(colorKey, label).kind;
}
