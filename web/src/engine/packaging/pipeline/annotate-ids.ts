// Anota `pipelinePanelId` em cada `Panel` do dieline usando o resultado da
// nova pipeline. Roda uma única vez (em `recomputeDieline`) para evitar o
// re-mapeamento por centróide a cada render do `panels-list` / `viewer-3d`.
//
// Estratégia: para cada painel da dieline, acha o `PipelinePanel` cujo
// polígono contém o centróide do painel (fallback: menor distância ao
// centróide). IDs do pipeline são hashes FNV-1a estáveis do polígono
// normalizado — sobrevivem a edições que não mudem o painel.
import type { Dieline, Pt } from "../dieline-types";
import { runPipeline } from "./run-pipeline";

function pointInPoly(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function centroid(poly: Pt[]): { x: number; y: number } {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p.x; cy += p.y; }
  return { x: cx / poly.length, y: cy / poly.length };
}

/** Mutates `dieline.panels[*].pipelinePanelId` em place. Falha silenciosa
 *  (não anota nada) se a pipeline lançar — não bloqueia a UI. */
export function annotatePipelineIds(dieline: Dieline): void {
  if (!dieline?.panels?.length || !dieline.segments?.length) return;
  let r: ReturnType<typeof runPipeline>;
  try {
    r = runPipeline(dieline.segments);
  } catch {
    return;
  }
  if (!r.panels.length) return;

  for (const dp of dieline.panels) {
    if (dp.polygon.length < 3) continue;
    const c = centroid(dp.polygon);
    let owner = r.panels.find((pp) => pointInPoly(pp.polygon, c.x, c.y));
    if (!owner) {
      let best = Infinity;
      for (const pp of r.panels) {
        const cc = centroid(pp.polygon);
        const d = (cc.x - c.x) ** 2 + (cc.y - c.y) ** 2;
        if (d < best) { best = d; owner = pp; }
      }
    }
    if (owner) dp.pipelinePanelId = owner.id;
  }
}
