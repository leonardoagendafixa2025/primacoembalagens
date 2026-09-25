// Reconhecimento de Pantones e nomes de spot color para acabamentos especiais.
// Usado pelo pipeline de import para classificar spots de hot stamping e verniz UV.

export type FinishKind =
  | "foil-gold"
  | "foil-silver"
  | "uv-flood"
  | "uv-spot"
  | "emboss"
  | "deboss";

export interface FinishMatch {
  kind: FinishKind;
  pantone?: string;
  reason: string;
  confidence: number; // 0..1
}

const PANTONE_GOLD = new Set([
  "871", "872", "873", "874", "875", "876",
  "10117", "10118", "10119", "10120", "10121", "10122", "10123",
  "10125", "10126", "10127", "10128",
  "8003", "8021", "8062", "8100", "8120", "8140", "8160",
  "8180", "8200", "8220", "8240", "8260", "8280", "8300",
  "8320", "8340", "8360", "8380", "8400", "8420", "8440",
  "8460", "8480", "8500", "8520", "8540", "8560", "8580",
  "8600", "8620", "8640", "8660", "8680", "8700", "8720",
  "8740", "8900", "8920", "8940", "8960",
]);

const PANTONE_SILVER = new Set([
  "877",
  "8001", "8002", "8021", "8061", "8101", "8141", "8161",
  "877C", "10077", "10078", "10079", "10080", "10081", "10082", "10083",
  "10084", "10085", "10086", "10087", "10088", "10089",
]);

function normalize(s: string) {
  return s.toLowerCase().replace(/[\s_\-]+/g, " ").trim();
}

function parseRgbDescriptor(text: string) {
  const hex = text.match(/#([0-9a-f]{6})/i);
  if (hex) {
    const value = hex[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  const rgb = text.match(/rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
    };
  }

  return null;
}

function colorScore(
  rgb: { r: number; g: number; b: number },
  refs: Array<[number, number, number]>,
) {
  let best = 0;
  for (const [rr, gg, bb] of refs) {
    const distance = Math.hypot(rgb.r - rr, rgb.g - gg, rgb.b - bb);
    const score = Math.max(0, 1 - distance / 220);
    if (score > best) best = score;
  }
  return best;
}

function decodePdfNameEscapes(text: string) {
  return text.replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function extractPantoneCode(name: string): string | undefined {
  // Aceita: "PANTONE 871 C", "PMS 871", "P 871 U", "871 C", "871C", ou simplesmente "871".
  const text = name.toLowerCase();
  let m = text.match(/\b(?:pantone|pms|p)\s*([0-9]{2,5})\s*[cuhmt]?\b/i);
  if (m) return m[1];
  // fallback: número de 3-5 dígitos seguido opcionalmente de C/U/M/T (típico Pantone).
  m = text.match(/\b([0-9]{3,5})\s*[cuhmt]\b/i);
  if (m) return m[1];
  // fallback final: número isolado de 3-5 dígitos (quando o spot vem só como "871").
  m = text.match(/^\s*([0-9]{3,5})\s*$/);
  return m ? m[1] : undefined;
}

export function classifyFinishSpot(colorKey: string, label: string): FinishMatch | null {
  const text = normalize(`${label} ${colorKey}`);
  const pantone = extractPantoneCode(text);

  // Hot stamping ouro
  if (pantone && PANTONE_GOLD.has(pantone)) {
    return { kind: "foil-gold", pantone: `PANTONE ${pantone}`, reason: `Pantone metálico ouro (${pantone})`, confidence: 0.95 };
  }
  if (/(gold[\s-]*foil|hot[\s-]*stamp[\s-]*gold|foil[\s-]*gold|hotstamp[\s-]*gold|stamping[\s-]*gold|dour[ao]d[ao]|ouro)/.test(text)) {
    return { kind: "foil-gold", pantone, reason: "Nome de spot indica hot stamping ouro", confidence: 0.85 };
  }

  // Hot stamping prata
  if (pantone && PANTONE_SILVER.has(pantone)) {
    return { kind: "foil-silver", pantone: `PANTONE ${pantone}`, reason: `Pantone metálico prata (${pantone})`, confidence: 0.95 };
  }
  if (/(silver[\s-]*foil|hot[\s-]*stamp[\s-]*silver|foil[\s-]*silver|hotstamp[\s-]*silver|stamping[\s-]*silver|prat[ae]ad[ao]|prata)/.test(text)) {
    return { kind: "foil-silver", pantone, reason: "Nome de spot indica hot stamping prata", confidence: 0.85 };
  }

  // Verniz UV localizado
  if (/(spot[\s-]*uv|uv[\s-]*spot|spot[\s-]*varnish|verniz[\s-]*loc|reserva[\s-]*uv|uv[\s-]*local)/.test(text)) {
    return { kind: "uv-spot", pantone, reason: "Nome de spot indica verniz UV localizado", confidence: 0.9 };
  }

  // Verniz UV total
  if (/(uv[\s-]*flood|flood[\s-]*uv|uv[\s-]*total|verniz[\s-]*tot|gloss[\s-]*uv|uv[\s-]*gloss|uv[\s-]*coat|uv[\s-]*varnish|verniz[\s-]*uv)/.test(text)) {
    return { kind: "uv-flood", pantone, reason: "Nome de spot indica verniz UV total", confidence: 0.85 };
  }

  // Relevo / baixo-relevo
  if (/(deboss|baixo[\s-]*relev)/.test(text)) {
    return { kind: "deboss", pantone, reason: "Nome de spot indica baixo-relevo", confidence: 0.85 };
  }
  if (/(emboss|relev)/.test(text)) {
    return { kind: "emboss", pantone, reason: "Nome de spot indica relevo", confidence: 0.85 };
  }

  return null;
}

export function extractFinishHintsFromPdfBytes(bytes: Uint8Array): FinishMatch[] {
  const raw = new TextDecoder("latin1").decode(bytes).replace(/\0/g, " ");
  const text = decodePdfNameEscapes(raw);
  const candidates = new Set<string>();

  for (const match of text.matchAll(/\/[A-Za-z0-9#._\-]{3,120}/g)) {
    candidates.add(match[0].slice(1).replace(/[._]+/g, " "));
  }
  for (const match of text.matchAll(/\b(?:pantone|pms|p)\s*[0-9]{3,5}\s*[cuhmt]?\b/gi)) {
    candidates.add(match[0]);
  }
  for (const match of text.matchAll(/\b(?:spot\s*uv|uv\s*spot|verniz\s*(?:uv|local|loc|total)|foil\s*(?:gold|silver)|hot\s*stamp(?:ing)?\s*(?:gold|silver)|emboss|deboss)\b/gi)) {
    candidates.add(match[0]);
  }

  const found = new Map<string, FinishMatch>();
  for (const candidate of candidates) {
    const hit = classifyFinishSpot(candidate, candidate);
    if (!hit) continue;
    found.set(`${hit.kind}:${hit.pantone ?? normalize(candidate)}`, hit);
  }

  return [...found.values()];
}

export function classifyFinishFromRgbFallback(
  colorKey: string,
  label: string,
  hints: FinishMatch[],
): FinishMatch | null {
  if (!hints.length) return null;

  const rgb = parseRgbDescriptor(`${colorKey} ${label}`);
  if (!rgb) return null;

  const wantGold = hints.find((hint) => hint.kind === "foil-gold");
  const wantSilver = hints.find((hint) => hint.kind === "foil-silver");

  const goldScore = wantGold
    ? colorScore(rgb, [[123, 108, 72], [169, 141, 74], [212, 175, 55]])
    : 0;
  const silverScore = wantSilver
    ? colorScore(rgb, [[131, 131, 131], [153, 153, 153], [191, 195, 200]])
    : 0;

  if (goldScore < 0.58 && silverScore < 0.58) return null;

  if (goldScore >= silverScore && wantGold) {
    return {
      kind: "foil-gold",
      pantone: wantGold.pantone,
      reason: `Fallback por cor RGB próxima de hot stamping ouro (${Math.round(goldScore * 100)}%)`,
      confidence: Math.min(0.74, 0.4 + goldScore * 0.35),
    };
  }

  if (wantSilver) {
    return {
      kind: "foil-silver",
      pantone: wantSilver.pantone,
      reason: `Fallback por cor RGB próxima de hot stamping prata (${Math.round(silverScore * 100)}%)`,
      confidence: Math.min(0.74, 0.4 + silverScore * 0.35),
    };
  }

  return null;
}

export const FINISH_LABELS: Record<FinishKind, string> = {
  "foil-gold": "Hot stamping ouro",
  "foil-silver": "Hot stamping prata",
  "uv-flood": "Verniz UV total",
  "uv-spot": "Verniz UV localizado",
  "emboss": "Relevo",
  "deboss": "Baixo-relevo",
};

export const FINISH_COLORS: Record<FinishKind, string> = {
  "foil-gold": "#d4af37",
  "foil-silver": "#bfc3c8",
  "uv-flood": "#7dd3fc",
  "uv-spot": "#38bdf8",
  "emboss": "#c4a484",
  "deboss": "#8b7355",
};
