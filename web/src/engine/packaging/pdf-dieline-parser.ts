// Extrai todos os paths vetoriais e cores de stroke de um PDF de faca.
// Usa pdf.js (operatorList) e converte coordenadas para milímetros, com origem (0,0)
// no canto inferior-esquerdo da bounding box dos paths (mesmo sistema do nosso Dieline).

import { pdfjsLib } from "@/lib/pdf-worker";
import { shouldIgnoreStroke } from "./cad/stroke-classifier";
import { detectStitchedDashes } from "./cad/stitch-detector";

const PT_TO_MM = 25.4 / 72;

/** Mantido como alias por compatibilidade. */
export const isIgnoredImportedStroke = shouldIgnoreStroke;

export interface ImportedPath {
  points: { x: number; y: number }[];
  closed: boolean;
  colorKey: string;
  colorLabel: string;
  cssColor: string;
  dashArray: number[];
  /** true quando a path foi pintada (fill/eoFill/fillStroke). */
  filled?: boolean;
  /** true se o constructPath original continha curveTo/quadraticCurveTo. */
  hasCurves?: boolean;
  /** "fill" se foi fill puro; "stroke" caso contrário. */
  paintOp?: "fill" | "stroke";
}


export interface ImportedColor {
  key: string;
  label: string;
  css: string;
  count: number;
}

export interface ImportResult {
  widthMm: number;
  heightMm: number;
  paths: ImportedPath[];
  colors: ImportedColor[];
  /** Nome original do arquivo PDF importado (sem extensão), usado em exports. */
  sourceName?: string;
  /** Estatísticas do snap de endpoints (gaps fechados na origem). */
  snap?: { tolMm: number; clusters: number; pointsSnapped: number };
}

type Mat = [number, number, number, number, number, number];
const ID: Mat = [1, 0, 0, 1, 0, 0];

function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function apply(m: Mat, x: number, y: number) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function dashLabel(dashArray: number[]) {
  if (!dashArray.length) return "Sólido";
  const pretty = dashArray.map((n) => Number(n.toFixed(2))).join("/");
  return `Tracejado ${pretty}`;
}

/** Snap de vértices com tolerância em mm.
 *  Constrói clusters via union-find (busca 3×3 num hash espacial de células
 *  de `tolMm`) e move cada vértice para o centróide do seu cluster.
 *  - mode "endpoints": só primeiro/último ponto de cada path. Fecha gaps
 *    típicos de PDF (overshoots Illustrator, arredondamento CorelDRAW).
 *  - mode "all": todos os vértices. Usar com tolerância MUITO menor (ruído
 *    de coords), porque snap agressivo em curvas amostradas distorce. */
function snapVertices(
  paths: ImportedPath[],
  tolMm: number,
  mode: "endpoints" | "all",
): { clusters: number; pointsSnapped: number } {
  type Ref = { p: { x: number; y: number } };
  const refs: Ref[] = [];
  for (const p of paths) {
    if (p.points.length === 0) continue;
    if (mode === "endpoints") {
      refs.push({ p: p.points[0] });
      if (p.points.length > 1) refs.push({ p: p.points[p.points.length - 1] });
    } else {
      for (const pt of p.points) refs.push({ p: pt });
    }
  }
  if (refs.length === 0) return { clusters: 0, pointsSnapped: 0 };

  const cell = tolMm;
  const key = (cx: number, cy: number) => `${cx}:${cy}`;
  const cellOf = (x: number) => Math.round(x / cell);
  const parent = refs.map((_, i) => i);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const buckets = new Map<string, number[]>();

  for (let i = 0; i < refs.length; i++) {
    const { p } = refs[i];
    const cx = cellOf(p.x), cy = cellOf(p.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = buckets.get(key(cx + dx, cy + dy));
        if (!arr) continue;
        for (const j of arr) {
          const q = refs[j].p;
          if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= tolMm * tolMm) {
            const ra = find(i), rb = find(j);
            if (ra !== rb) parent[ra] = rb;
          }
        }
      }
    }
    const k0 = key(cx, cy);
    const arr = buckets.get(k0) ?? [];
    arr.push(i);
    buckets.set(k0, arr);
  }

  const sums = new Map<number, { x: number; y: number; n: number }>();
  for (let i = 0; i < refs.length; i++) {
    const r = find(i);
    const s = sums.get(r) ?? { x: 0, y: 0, n: 0 };
    s.x += refs[i].p.x; s.y += refs[i].p.y; s.n += 1;
    sums.set(r, s);
  }

  let snapped = 0, clusters = 0;
  for (const s of sums.values()) if (s.n >= 2) clusters++;
  for (let i = 0; i < refs.length; i++) {
    const r = find(i);
    const s = sums.get(r)!;
    if (s.n < 2) continue;
    const cx = s.x / s.n, cy = s.y / s.n;
    const p = refs[i].p;
    if (Math.abs(p.x - cx) > 1e-9 || Math.abs(p.y - cy) > 1e-9) {
      p.x = cx; p.y = cy; snapped++;
    }
  }
  return { clusters, pointsSnapped: snapped };
}

// (a classificação/ignorar ficou centralizada em cad/stroke-classifier.ts)


export async function parseDielinePdf(bytes: Uint8Array): Promise<ImportResult> {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  const page = await pdf.getPage(1);
  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS as Record<string, number>;

  let ctm: Mat = [...ID] as Mat;
  const stack: Mat[] = [];

  let stroke = { key: "default", label: "Sem cor (preto)", css: "#222" };
  let fill = { key: "default", label: "Sem cor (preto)", css: "#222" };
  let dashArray: number[] = [];

  const paths: ImportedPath[] = [];
  const colors = new Map<string, { label: string; css: string; count: number }>();

  const setStrokeColor = (k: string, label: string, css: string) => {
    stroke = { key: k, label, css };
  };
  const setFillColor = (k: string, label: string, css: string) => {
    fill = { key: k, label, css };
  };
  // Mantém compat com o nome antigo.
  const setColor = setStrokeColor;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.save) stack.push([...ctm] as Mat);
    else if (fn === OPS.restore) ctm = (stack.pop() ?? ([...ID] as Mat));
    else if (fn === OPS.transform) ctm = mul(ctm, args as Mat);
    else if (fn === OPS.setStrokeRGBColor) {
      // pdfjs v5: args = [hexString "#rrggbb"]; v4: args = [r, g, b]
      const a0 = (args as unknown[])[0];
      if (typeof a0 === "string") {
        setColor(`rgb:${a0}`, `RGB ${a0}`, a0);
      } else {
        const [r, g, b] = args as [number, number, number];
        setColor(`rgb:${r},${g},${b}`, `RGB ${r} ${g} ${b}`, `rgb(${r},${g},${b})`);
      }
    } else if (fn === OPS.setStrokeGray) {
      const v = Math.round(((args as number[])[0] ?? 0) * 255);
      setColor(`gray:${v}`, `Cinza ${v}`, `rgb(${v},${v},${v})`);
    } else if (fn === OPS.setStrokeCMYKColor) {
      const [c, m, y, k] = args as [number, number, number, number];
      const r = Math.round(255 * (1 - c) * (1 - k));
      const gg = Math.round(255 * (1 - m) * (1 - k));
      const bb = Math.round(255 * (1 - y) * (1 - k));
      setColor(
        `cmyk:${c.toFixed(2)},${m.toFixed(2)},${y.toFixed(2)},${k.toFixed(2)}`,
        `CMYK ${(c * 100) | 0}/${(m * 100) | 0}/${(y * 100) | 0}/${(k * 100) | 0}`,
        `rgb(${r},${gg},${bb})`,
      );
    } else if (fn === OPS.setStrokeColorN || fn === OPS.setStrokeColor) {
      // Spot color (Separation/DeviceN). pdf.js às vezes anexa o nome do colorspace no fim.
      const a = args as unknown[];
      const last = a[a.length - 1];
      const name = typeof last === "string" ? last : `Spot (${a.length}c)`;
      setStrokeColor(`spot:${name}`, name, "#a78bfa");
    } else if (fn === OPS.setFillRGBColor) {
      const a0 = (args as unknown[])[0];
      if (typeof a0 === "string") setFillColor(`rgb:${a0}`, `RGB ${a0}`, a0);
      else {
        const [r, g, b] = args as [number, number, number];
        setFillColor(`rgb:${r},${g},${b}`, `RGB ${r} ${g} ${b}`, `rgb(${r},${g},${b})`);
      }
    } else if (fn === OPS.setFillGray) {
      const v = Math.round(((args as number[])[0] ?? 0) * 255);
      setFillColor(`gray:${v}`, `Cinza ${v}`, `rgb(${v},${v},${v})`);
    } else if (fn === OPS.setFillCMYKColor) {
      const [c, m, y, k] = args as [number, number, number, number];
      const r = Math.round(255 * (1 - c) * (1 - k));
      const gg = Math.round(255 * (1 - m) * (1 - k));
      const bb = Math.round(255 * (1 - y) * (1 - k));
      setFillColor(
        `cmyk:${c.toFixed(2)},${m.toFixed(2)},${y.toFixed(2)},${k.toFixed(2)}`,
        `CMYK ${(c * 100) | 0}/${(m * 100) | 0}/${(y * 100) | 0}/${(k * 100) | 0}`,
        `rgb(${r},${gg},${bb})`,
      );
    } else if (fn === OPS.setFillColorN || fn === OPS.setFillColor) {
      const a = args as unknown[];
      const last = a[a.length - 1];
      const name = typeof last === "string" ? last : `Spot (${a.length}c)`;
      setFillColor(`spot:${name}`, name, "#a78bfa");
    } else if (fn === OPS.setDash) {
      const [arr] = (args as [ArrayLike<number>, number]) ?? [[], 0];
      dashArray = Array.from(arr ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0.01);
    } else if (fn === OPS.constructPath) {
      // pdfjs v5 args = [op, [data], minMax] where data is a Float32Array of
      // interleaved DrawOPS codes + coordinates. v4 used [ops[], coords[], minMax].
      const a = args as unknown[];
      let data: ArrayLike<number> | null = null;

      // Detecta o paint op (stroke vs fill) — usado para decidir cor.
      const paintOp = typeof a[0] === "number" ? (a[0] as number) : -1;
      const isFillOp =
        paintOp === OPS.fill ||
        paintOp === OPS.eoFill ||
        paintOp === OPS.fillStroke ||
        paintOp === OPS.eoFillStroke ||
        paintOp === OPS.closeFillStroke ||
        paintOp === OPS.closeEOFillStroke;
      const isStrokeOp =
        paintOp === OPS.stroke ||
        paintOp === OPS.fillStroke ||
        paintOp === OPS.eoFillStroke ||
        paintOp === OPS.closeStroke ||
        paintOp === OPS.closeFillStroke ||
        paintOp === OPS.closeEOFillStroke;

      if (a && a.length >= 2 && Array.isArray(a[1]) && (a[1] as unknown[]).length > 0 && typeof (a[1] as unknown[])[0] !== "number") {
        // v5 shape: a[1] = [Float32Array | null]
        const inner = (a[1] as unknown[])[0];
        if (inner && typeof (inner as ArrayLike<number>).length === "number") {
          data = inner as ArrayLike<number>;
        }
      }

      let current: { x: number; y: number }[] = [];
      let closed = false;
      let hasCurves = false;
      const out: { points: { x: number; y: number }[]; closed: boolean }[] = [];

      const flushCurrent = () => {
        if (current.length >= 2) out.push({ points: current, closed });
        current = [];
        closed = false;
      };


      if (data) {
        // pdfjs v5 DrawOPS: moveTo=0, lineTo=1, curveTo=2, quadraticCurveTo=3, closePath=4
        let i = 0;
        const n = data.length;
        while (i < n) {
          const dop = data[i++];
          if (dop === 0) {
            if (current.length) flushCurrent();
            current.push(apply(ctm, data[i++], data[i++]));
          } else if (dop === 1) {
            current.push(apply(ctm, data[i++], data[i++]));
          } else if (dop === 2) {
            hasCurves = true;
            const c1 = apply(ctm, data[i++], data[i++]);
            const c2 = apply(ctm, data[i++], data[i++]);
            const c3 = apply(ctm, data[i++], data[i++]);
            const p0 = current[current.length - 1] ?? c1;
            const N = 8;
            for (let t = 1; t <= N; t++) {
              const u = t / N, mt = 1 - u;
              const x = mt*mt*mt*p0.x + 3*mt*mt*u*c1.x + 3*mt*u*u*c2.x + u*u*u*c3.x;
              const y = mt*mt*mt*p0.y + 3*mt*mt*u*c1.y + 3*mt*u*u*c2.y + u*u*u*c3.y;
              current.push({ x, y });
            }
          } else if (dop === 3) {
            hasCurves = true;
            const c1 = apply(ctm, data[i++], data[i++]);
            const c2 = apply(ctm, data[i++], data[i++]);
            const p0 = current[current.length - 1] ?? c1;
            const N = 6;
            for (let t = 1; t <= N; t++) {
              const u = t / N, mt = 1 - u;
              const x = mt*mt*p0.x + 2*mt*u*c1.x + u*u*c2.x;
              const y = mt*mt*p0.y + 2*mt*u*c1.y + u*u*c2.y;
              current.push({ x, y });
            }

          } else if (dop === 4) {
            closed = true;
          } else {
            // unknown — bail out of this path safely
            break;
          }
        }
        flushCurrent();
      } else if (a && Array.isArray(a[0]) && Array.isArray(a[1])) {
        // v4 shape fallback
        const ops = a[0] as number[];
        const coords = a[1] as number[];
        let ci = 0;
        for (const op of ops) {
          if (op === OPS.moveTo) {
            if (current.length) flushCurrent();
            current.push(apply(ctm, coords[ci++], coords[ci++]));
          } else if (op === OPS.lineTo) {
            current.push(apply(ctm, coords[ci++], coords[ci++]));
          } else if (op === OPS.curveTo) {
            hasCurves = true;
            const c1 = apply(ctm, coords[ci++], coords[ci++]);
            const c2 = apply(ctm, coords[ci++], coords[ci++]);
            const c3 = apply(ctm, coords[ci++], coords[ci++]);
            const p0 = current[current.length - 1] ?? c1;
            const N = 8;
            for (let t = 1; t <= N; t++) {
              const u = t / N, mt = 1 - u;
              const x = mt*mt*mt*p0.x + 3*mt*mt*u*c1.x + 3*mt*u*u*c2.x + u*u*u*c3.x;
              const y = mt*mt*mt*p0.y + 3*mt*mt*u*c1.y + 3*mt*u*u*c2.y + u*u*u*c3.y;
              current.push({ x, y });
            }

          } else if (op === OPS.rectangle) {
            const x = coords[ci++], y = coords[ci++], w = coords[ci++], h = coords[ci++];
            if (current.length) flushCurrent();
            current = [
              apply(ctm, x, y),
              apply(ctm, x + w, y),
              apply(ctm, x + w, y + h),
              apply(ctm, x, y + h),
            ];
            closed = true;
            flushCurrent();
          } else if (op === OPS.closePath) {
            closed = true;
          }
        }
        flushCurrent();
      }

      for (const seg of out) {
        const mm = seg.points.map((p) => ({ x: p.x * PT_TO_MM, y: p.y * PT_TO_MM }));
        // Decide qual cor usar: se o paint op é apenas fill, usa cor de fill;
        // caso contrário (stroke ou fillStroke) preserva o stroke para não
        // quebrar a detecção atual de cortes/vincos.
        const useFill = isFillOp && !isStrokeOp;
        const src = useFill ? fill : stroke;
        const stitched = !useFill && dashArray.length;
        const styleKey = `${src.key}|${stitched ? `dash:${dashArray.map((n) => n.toFixed(2)).join(",")}` : (useFill ? "fill" : "solid")}`;
        const styleLabel = useFill
          ? `${src.label} · Preenchido`
          : `${src.label} · ${dashLabel(dashArray)}`;
        if (isIgnoredImportedStroke(styleKey, styleLabel)) continue;
        paths.push({
          points: mm,
          closed: seg.closed,
          colorKey: styleKey,
          colorLabel: styleLabel,
          cssColor: src.css,
          dashArray: useFill ? [] : dashArray,
          filled: useFill || undefined,
          hasCurves,
          paintOp: useFill ? "fill" : "stroke",
        });

        const e = colors.get(styleKey) ?? { label: styleLabel, css: src.css, count: 0 };
        e.count++;
        colors.set(styleKey, e);
      }
    }
  }

  // Pós-processo: detecta tracejados que vieram como segmentos sólidos (CorelDRAW)
  // e re-rotula essas paths com colorKey virtual `|stitched`.
  const processedPaths = detectStitchedDashes(paths);

  // Snap em 2 passes: (1) endpoints @ 0.2 mm fecha gaps reais entre traços;
  // (2) todos os vértices @ 0.05 mm dedup ruído de coords (vértices internos
  // duplicados que o Illustrator às vezes emite). O pass 2 é conservador:
  // tolerância abaixo do menor detalhe útil, então não distorce curvas.
  const SNAP_TOL_MM = 0.2;
  const SNAP_NOISE_MM = 0.05;
  const snapA = snapVertices(processedPaths, SNAP_TOL_MM, "endpoints");
  const snapB = snapVertices(processedPaths, SNAP_NOISE_MM, "all");
  const snapStats = {
    clusters: snapA.clusters + snapB.clusters,
    pointsSnapped: snapA.pointsSnapped + snapB.pointsSnapped,
  };

  // Recalcula o catálogo de cores após o re-rotulamento.
  const colors2 = new Map<string, { label: string; css: string; count: number }>();
  for (const p of processedPaths) {
    if (shouldIgnoreStroke(p.colorKey, p.colorLabel)) continue;
    const e = colors2.get(p.colorKey) ?? { label: p.colorLabel, css: p.cssColor, count: 0 };
    e.count++;
    colors2.set(p.colorKey, e);
  }

  // bounding box e normalização para origem (0,0)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of processedPaths) {
    for (const q of p.points) {
      if (q.x < minX) minX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.x > maxX) maxX = q.x;
      if (q.y > maxY) maxY = q.y;
    }
  }
  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }
  for (const p of processedPaths) {
    for (const q of p.points) {
      q.x -= minX;
      q.y -= minY;
    }
  }

  return {
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    paths: processedPaths,
    colors: Array.from(colors2.entries())
      .map(([key, v]) => ({ key, label: v.label, css: v.css, count: v.count }))
      .sort((a, b) => b.count - a.count),
    snap: { tolMm: SNAP_TOL_MM, ...snapStats },
  };
}

