// Operações booleanas planares sobre Loop[] — implementação enxuta
// suficiente para o caso real do kernel: subtrair holes do outer antes
// de extrudar, ou unir loops sobrepostos que vêm de paths duplicados.
//
// NÃO substitui clipper2/polygon-clipping para casos arbitrários — é um
// MVP determinístico que cobre o que o pipeline atual precisa. Quando o
// usuário tiver dielines com overlaps complexos (sangria + offset + cut
// duplicado), migrar para `polygon-clipping` (pure JS, roda em Worker).

import type { Pt } from "../../dieline-types";
import type { Loop } from "./types";

function signedArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}

function ensureCCW(poly: Pt[]): Pt[] {
  return signedArea(poly) >= 0 ? poly : poly.slice().reverse();
}
function ensureCW(poly: Pt[]): Pt[] {
  return signedArea(poly) <= 0 ? poly : poly.slice().reverse();
}

/** Devolve o outer como CCW + os holes como CW (formato Three.Shape).
 *  É a forma usada pela ExtrudeGeometry — garante que o furo é vazado. */
export function orientForExtrude(outer: Pt[], holes: Pt[][]): { outer: Pt[]; holes: Pt[][] } {
  return {
    outer: ensureCCW(outer),
    holes: holes.map(ensureCW),
  };
}

/** Atalho: pega uma Face do kernel e devolve orientação correta para Three. */
export function faceToShapeData(outerLoop: Loop, holeLoops: Loop[]) {
  return orientForExtrude(
    outerLoop.points,
    holeLoops.map((h) => h.points),
  );
}
