// ============================================================================
// classifyRoles — atribui PanelRole3D a cada painel estrutural.
// ----------------------------------------------------------------------------
// Heurística determinística, baseada em:
//   - área relativa
//   - grau no grafo de hinges válidos
//   - razão de aspecto (largura/comprimento) — útil para glue/seam flap
//   - posição relativa ao painel root
//
// NÃO modifica o 2D. Só rotula.
// ============================================================================

import type { PipelinePanel } from "../pipeline/types";
import type { ValidHinge } from "../pipeline/hinge-sanitizer";
import type { PanelRole3D } from "./types";

export interface RoleClassification {
  roles: Record<string, PanelRole3D>;
  bodyIds: Set<string>;
  flapIds: Set<string>;
  seamIds: Set<string>;
}

function aspectRatio(p: PipelinePanel): number {
  const w = Math.max(1e-6, p.bbox.maxX - p.bbox.minX);
  const h = Math.max(1e-6, p.bbox.maxY - p.bbox.minY);
  return Math.max(w, h) / Math.min(w, h);
}

export function classifyRoles(
  panels: PipelinePanel[],
  hinges: ValidHinge[],
  rootPanelId: string,
): RoleClassification {
  const byId = new Map(panels.map((p) => [p.id, p]));
  const degree = new Map<string, number>();
  const neighborSet = new Map<string, Set<string>>();
  for (const h of hinges) {
    degree.set(h.panelA, (degree.get(h.panelA) ?? 0) + 1);
    degree.set(h.panelB, (degree.get(h.panelB) ?? 0) + 1);
    if (!neighborSet.has(h.panelA)) neighborSet.set(h.panelA, new Set());
    if (!neighborSet.has(h.panelB)) neighborSet.set(h.panelB, new Set());
    neighborSet.get(h.panelA)!.add(h.panelB);
    neighborSet.get(h.panelB)!.add(h.panelA);
  }

  // Body candidates: painéis com grau >= 2 (passagem de um painel para outro)
  // E área no top quartil. O root é sempre body.
  const sortedByArea = [...panels].sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
  const q1 = sortedByArea[Math.floor(sortedByArea.length * 0.25)]?.area ?? 0;
  const rootArea = byId.get(rootPanelId)?.area ?? sortedByArea[0]?.area ?? 1;
  const bodyAreaThreshold = Math.max(q1, rootArea * 0.25);

  const roles: Record<string, PanelRole3D> = {};
  const bodyIds = new Set<string>();
  const flapIds = new Set<string>();
  const seamIds = new Set<string>();

  for (const p of panels) {
    if (p.id === rootPanelId) {
      roles[p.id] = "body";
      bodyIds.add(p.id);
      continue;
    }
    const deg = degree.get(p.id) ?? 0;
    const ar = aspectRatio(p);
    const area = p.area ?? 0;

    if (deg >= 2 && area >= bodyAreaThreshold) {
      roles[p.id] = "body-side";
      bodyIds.add(p.id);
    } else if (deg === 1 && ar >= 3.0 && area < rootArea * 0.5) {
      // Painel longo, fino, pendurado por uma única hinge → candidato seam/glue.
      roles[p.id] = "glue-flap";
      flapIds.add(p.id);
      seamIds.add(p.id);
    } else if (deg <= 1) {
      roles[p.id] = "flap";
      flapIds.add(p.id);
    } else {
      roles[p.id] = "aux";
    }
  }

  return { roles, bodyIds, flapIds, seamIds };
}
