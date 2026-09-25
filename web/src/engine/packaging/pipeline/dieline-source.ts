// ============================================================================
// Stage 0 — DielineSource
// ----------------------------------------------------------------------------
// Fonte imutável da faca importada. Nenhum estágio estrutural altera esta
// estrutura: reclassificações e usos posteriores são somente metadados derivados.
// ============================================================================

import type { Segment } from "../dieline-types";
import type { DielineSource, SourceSegment, StructuralKind } from "./types";

function clonePoint(p: { x: number; y: number }) {
  return Object.freeze({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) });
}

function normalizeKind(kind: Segment["kind"]): StructuralKind {
  if (kind === "cut" || kind === "crease" || kind === "perf") return kind;
  return "unknown";
}

export function buildDielineSource(rawSegments: ReadonlyArray<Segment>): DielineSource {
  const byOriginalKind: Record<string, number> = {};
  const segments: SourceSegment[] = rawSegments.map((segment, index) => {
    const pointsOriginal = segment.points.map(clonePoint);
    const a = pointsOriginal[0] ?? Object.freeze({ x: 0, y: 0 });
    const b = pointsOriginal[pointsOriginal.length - 1] ?? a;
    byOriginalKind[segment.kind] = (byOriginalKind[segment.kind] ?? 0) + 1;
    return Object.freeze({
      id: `src-seg-${index.toString(36).padStart(5, "0")}`,
      kindOriginal: segment.kind,
      kindNormalized: normalizeKind(segment.kind),
      source: segment.source,
      endpointsOriginal: Object.freeze({ a, b }),
      endpointsSnapped: Object.freeze({ a, b }),
      pointsOriginal: Object.freeze(pointsOriginal),
      pointsNormalized: Object.freeze(pointsOriginal),
      parentLoopIds: Object.freeze([]),
      flags: Object.freeze({
        healed: false,
        snapped: false,
        merged: false,
        reclassified: false,
        dropped: false,
      }),
      usage: Object.freeze({
        structuralPanelIds: Object.freeze([]),
        absorbedFeatureIds: Object.freeze([]),
        foldAxisIds: Object.freeze([]),
      }),
    });
  });

  return Object.freeze({
    version: "v3" as const,
    segments: Object.freeze(segments),
    loops: Object.freeze([]),
    intersections: Object.freeze([]),
    metadata: Object.freeze({
      segmentCount: segments.length,
      byOriginalKind: Object.freeze(byOriginalKind),
      frozenAt: Date.now(),
    }),
  });
}
