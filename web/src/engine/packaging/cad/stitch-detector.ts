// Detecta padrões de tracejado emitidos como segmentos sólidos pelo CorelDRAW/Illustrator.
//
// Muitos PDFs vetoriais industriais "achatam" linhas tracejadas em N pequenos
// paths sólidos consecutivos (sem `setDash`). Para o classificador estrutural
// é como se tudo fosse corte — perdemos a perfuração / meio-corte.
//
// Estratégia: para cada cor base, isolamos paths "curtos" (≤ STITCH_MAX_MM)
// que tenham pelo menos um vizinho da mesma cor a até STITCH_GAP_MM. Estes
// recebem uma colorKey virtual `${key}|stitched` e label “(tracejado detectado)”
// — o stroke-classifier já reconhece "tracejad" e manda para `perf`.

import type { ImportedPath } from "../pdf-dieline-parser";

const STITCH_MAX_MM = 4.0;     // comprimento máximo de cada "ponto" do tracejado
const STITCH_GAP_MM = 3.5;     // distância máxima até o próximo stitch da mesma cor
const STITCH_MIN_GROUP = 4;    // precisa de pelo menos 4 stitches alinhados para virar tracejado

function pathLength(p: ImportedPath): number {
  let s = 0;
  for (let i = 0; i < p.points.length - 1; i++) {
    const a = p.points[i], b = p.points[i + 1];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (p.closed && p.points.length > 2) {
    const a = p.points[p.points.length - 1], b = p.points[0];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

function pathEndpoints(p: ImportedPath): { a: { x: number; y: number }; b: { x: number; y: number } } {
  return { a: p.points[0], b: p.points[p.points.length - 1] };
}

export function detectStitchedDashes(paths: ImportedPath[]): ImportedPath[] {
  // Agrupa por cor base (sem o sufixo |solid).
  const byColor = new Map<string, number[]>();
  for (let i = 0; i < paths.length; i++) {
    const baseKey = paths[i].colorKey.split("|")[0];
    const arr = byColor.get(baseKey);
    if (arr) arr.push(i);
    else byColor.set(baseKey, [i]);
  }

  const stitchIndices = new Set<number>();

  for (const indices of byColor.values()) {
    if (indices.length < STITCH_MIN_GROUP) continue;

    // candidatos: paths curtos
    const candidates = indices.filter((i) => pathLength(paths[i]) <= STITCH_MAX_MM);
    if (candidates.length < STITCH_MIN_GROUP) continue;

    // grafo de proximidade: dois candidatos são vizinhos se endpoints distam ≤ STITCH_GAP_MM
    const adj = new Map<number, number[]>();
    for (const i of candidates) adj.set(i, []);
    for (let i = 0; i < candidates.length; i++) {
      const pi = paths[candidates[i]];
      const ei = pathEndpoints(pi);
      for (let j = i + 1; j < candidates.length; j++) {
        const pj = paths[candidates[j]];
        const ej = pathEndpoints(pj);
        const d = Math.min(
          Math.hypot(ei.a.x - ej.a.x, ei.a.y - ej.a.y),
          Math.hypot(ei.a.x - ej.b.x, ei.a.y - ej.b.y),
          Math.hypot(ei.b.x - ej.a.x, ei.b.y - ej.a.y),
          Math.hypot(ei.b.x - ej.b.x, ei.b.y - ej.b.y),
        );
        if (d <= STITCH_GAP_MM) {
          adj.get(candidates[i])!.push(candidates[j]);
          adj.get(candidates[j])!.push(candidates[i]);
        }
      }
    }

    // componentes conexas com ≥ STITCH_MIN_GROUP elementos → tracejado.
    const seen = new Set<number>();
    for (const start of candidates) {
      if (seen.has(start)) continue;
      const stack = [start];
      const group: number[] = [];
      while (stack.length) {
        const v = stack.pop()!;
        if (seen.has(v)) continue;
        seen.add(v);
        group.push(v);
        for (const w of adj.get(v) ?? []) if (!seen.has(w)) stack.push(w);
      }
      if (group.length >= STITCH_MIN_GROUP) for (const i of group) stitchIndices.add(i);
    }
  }

  if (!stitchIndices.size) return paths;

  return paths.map((p, i) => {
    if (!stitchIndices.has(i)) return p;
    const base = p.colorKey.split("|")[0];
    return {
      ...p,
      colorKey: `${base}|stitched`,
      colorLabel: `${p.colorLabel.split(" · ")[0]} · Tracejado (detectado)`,
    };
  });
}
