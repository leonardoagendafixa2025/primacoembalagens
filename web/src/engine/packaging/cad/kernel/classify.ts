// Classificação hierárquica de loops por nesting.
//
// REGRA DURA:
//   Um Loop cujo `cutOnly === true` E que está estritamente contido em
//   outro Loop é classificado como `isHole = true`. Isso é absoluto:
//   não importa área relativa, vizinhança de creases, ou heurística
//   topológica. Resolve definitivamente o caso "janela do frasco virando
//   parede no 3D".

import type { Pt } from "../../dieline-types";
import type { Loop } from "./types";

function pointInPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function bboxContains(outer: Loop["bbox"], inner: Loop["bbox"], tol = 0.1): boolean {
  return (
    outer.minX <= inner.minX + tol &&
    outer.maxX >= inner.maxX - tol &&
    outer.minY <= inner.minY + tol &&
    outer.maxY >= inner.maxY - tol
  );
}

function loopStrictlyInside(outer: Loop, inner: Loop): boolean {
  if (outer === inner) return false;
  if (!bboxContains(outer.bbox, inner.bbox)) return false;
  // Todos os pontos de inner devem estar dentro de outer.
  for (const p of inner.points) {
    if (!pointInPoly(outer.points, p.x, p.y)) return false;
  }
  return true;
}

export function classifyLoops(loops: Loop[]): Loop[] {
  // Ordena por área DECRESCENTE (maior primeiro = possíveis pais).
  const sorted = [...loops].sort((a, b) => Math.abs(b.signedArea) - Math.abs(a.signedArea));

  for (const loop of sorted) {
    // Procura o menor loop que o contém estritamente.
    let bestParent: Loop | null = null;
    let bestParentArea = Infinity;
    for (const candidate of sorted) {
      if (candidate === loop) continue;
      const candArea = Math.abs(candidate.signedArea);
      if (candArea <= Math.abs(loop.signedArea)) continue;
      if (!loopStrictlyInside(candidate, loop)) continue;
      if (candArea < bestParentArea) {
        bestParent = candidate;
        bestParentArea = candArea;
      }
    }
    if (bestParent) {
      loop.parentId = bestParent.id;
      loop.depth = bestParent.depth + 1;
    } else {
      loop.parentId = null;
      loop.depth = 0;
    }
  }

  // Aplica a regra de hole: loop aninhado com ≥90% das arestas como `cut`
  // é tratado como janela/vazado. A flexibilização para ≥90% (em vez de
  // 100% via `cutOnly`) absorve 1-2 arestas mal classificadas como `crease`
  // por cor ambígua na origem — caso clássico de janelas em frascos onde
  // um pedaço pequeno do contorno é lido como vinco mas o conjunto é,
  // topologicamente, um furo.
  // Mapa de id → loop para consulta de área do pai.
  const byId = new Map<number, Loop>();
  for (const l of sorted) byId.set(l.id, l);

  for (const loop of sorted) {
    if (loop.parentId === null) {
      loop.isHole = false;
      continue;
    }
    const { cut, crease, perf } = loop.edgeKindCounts;
    const total = cut + crease + perf;
    const cutRatio = total > 0 ? cut / total : 0;
    const mostlyCut = loop.cutOnly || (cutRatio >= 0.9 && crease <= 2);

    // Regra geométrica: loop aninhado MUITO menor que o pai (< 2% da área)
    // é tratado como janela/vazado independente da classificação das arestas.
    // Cobre furinhos/slots/visores cujas bordas foram lidas como `crease`
    // por ambiguidade de cor na origem (ArtiosCAD/Esko às vezes exportam
    // contornos internos com a mesma cor do vinco).
    const parent = byId.get(loop.parentId);
    const areaRatio = parent ? Math.abs(loop.signedArea) / Math.abs(parent.signedArea) : 1;
    const tinyVsParent = areaRatio < 0.02;

    if (mostlyCut || tinyVsParent) {
      loop.isHole = true;
    } else {
      // Loop misto (cut+crease) dentro de outro — pode ser sub-painel real
      // (ex.: aba dentro do bbox). Deixa como não-hole; o pipeline
      // estrutural existente decide.
      loop.isHole = false;
    }
  }

  return sorted;
}
