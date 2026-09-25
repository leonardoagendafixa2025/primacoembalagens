// Reclassificação topológica de loops fechados internos.
//
// Regra industrial (Heidelberg/ArtiosCAD):
//   Um loop FECHADO que está totalmente CONTIDO dentro de uma face estrutural
//   (painel) e NÃO toca o boundary externo NÃO é perfuração — é um corte
//   interno (janela, vazado, furo). Perfuração real é LINEAR, conecta regiões
//   e acompanha linhas de dobra/corte, nunca forma ilhas fechadas independentes.
//
// Hierarquia aplicada: topologia > geometria > aparência (cor/dash).
//
// Entrada: segments já classificados + panels reconstruídos.
// Saída: segments com closed-perf-loops-dentro-de-painel reescritos para "cut",
//        + contagem de quantos foram reclassificados.

import type { Pt, Segment } from "../dieline-types";

function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(a) / 2;
}

function bbox(poly: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  // ray casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isLoopClosed(seg: Segment): boolean {
  if (seg.points.length < 4) return false;
  if (seg.closed) return true;
  const a = seg.points[0];
  const b = seg.points[seg.points.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) <= 0.5;
}

/**
 * Reclassifica loops perf fechados contidos em painéis como "cut" (internal cut).
 * Retorna o número de loops reclassificados.
 */
export function reclassifyInternalCuts(
  segments: Segment[],
  panels: Pt[][],
): { segments: Segment[]; internalCuts: number } {
  if (!panels.length) return { segments, internalCuts: 0 };

  // pré-calcula bbox + área dos painéis (descarta os "wrappers" gigantes)
  const panelMeta = panels.map((poly) => ({ poly, area: polygonArea(poly), bb: bbox(poly) }));
  panelMeta.sort((a, b) => a.area - b.area); // menores primeiro = mais específicos

  let internalCuts = 0;

  const out = segments.map((seg) => {
    if (seg.kind !== "perf") return seg;
    if (!isLoopClosed(seg)) return seg;

    const segBB = bbox(seg.points);
    const segArea = polygonArea(seg.points);
    if (segArea < 0.5) return seg; // ruído

    // centróide aproximado
    let cx = 0, cy = 0;
    for (const p of seg.points) { cx += p.x; cy += p.y; }
    cx /= seg.points.length;
    cy /= seg.points.length;

    for (const m of panelMeta) {
      // área da panel precisa ser maior que do loop (loop é interno)
      if (m.area <= segArea * 1.05) continue;
      // bbox containment rápido
      if (
        segBB.minX < m.bb.minX - 0.5 || segBB.maxX > m.bb.maxX + 0.5 ||
        segBB.minY < m.bb.minY - 0.5 || segBB.maxY > m.bb.maxY + 0.5
      ) continue;
      // centróide e um ponto extremo dentro do painel
      if (!pointInPolygon({ x: cx, y: cy }, m.poly)) continue;
      // garante que NÃO toca o boundary: bbox estritamente interno
      const touchesEdge =
        Math.abs(segBB.minX - m.bb.minX) < 0.3 ||
        Math.abs(segBB.maxX - m.bb.maxX) < 0.3 ||
        Math.abs(segBB.minY - m.bb.minY) < 0.3 ||
        Math.abs(segBB.maxY - m.bb.maxY) < 0.3;
      if (touchesEdge) continue;

      internalCuts++;
      return { ...seg, kind: "cut" as const };
    }

    return seg;
  });

  return { segments: out, internalCuts };
}
