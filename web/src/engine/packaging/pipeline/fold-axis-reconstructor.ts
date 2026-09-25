// ============================================================================
// Stage 4 — Structural Fold Axis Reconstructor
// ----------------------------------------------------------------------------
// Agrupa todas as ClassifiedEdge com kindFinal = "crease" | "perf" que são
// colineares (mesma reta infinita) em UM `StructuralFoldAxis`.
//
// Por que isso é necessário:
//   Quando um vinco horizontal é atravessado por um corte (entalhe de aba,
//   meia-faca de trava), a geometria fica fragmentada em N pedaços de crease
//   separados por gaps. Cada pedaço sozinho é "fraco" e não consegue ser
//   reconhecido como hinge no fold graph. O eixo estrutural CONSERVA a
//   informação de que tudo aquilo é o mesmo vinco lógico.
//
// O eixo NÃO precisa estar geometricamente contínuo. Basta que os fragmentos
// estejam na mesma reta. O span do eixo é o envelope min/max dos fragmentos
// projetados no vetor direção.
// ============================================================================

import type { Pt } from "../dieline-types";
import type {
  ClassifiedEdge,
  ClassifiedTopology,
  NormalizedGeometry,
  StructuralFoldAxis,
} from "./types";

interface AxisBucket {
  type: "crease" | "perf";
  // Reta canônica: direção unitária com primeiro componente não-nulo positivo,
  // e ponto da reta = projeção da origem na reta.
  dirX: number;
  dirY: number;
  offsetX: number;
  offsetY: number;
  fragments: ClassifiedEdge[];
}

/** Canonicaliza a direção: dx ≥ 0; se dx==0, dy ≥ 0. */
function canonicalDir(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  let ux = dx / len, uy = dy / len;
  if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) {
    ux = -ux; uy = -uy;
  }
  return { x: ux, y: uy };
}

/** Pé-da-perpendicular da origem (0,0) à reta passando por A com direção u. */
function perpFoot(a: Pt, ux: number, uy: number): { x: number; y: number } {
  // Parametriza reta: P(t) = A + t*u. Pé = ponto da reta mais próximo de (0,0).
  // t* = -(A . u). Devolve P(t*).
  const t = -(a.x * ux + a.y * uy);
  return { x: a.x + ux * t, y: a.y + uy * t };
}

function bucketKey(b: AxisBucket, parallelTolRad: number, perpTolMm: number): string {
  // Quantiza ângulo (em "fatias" de tolRad) e o pé da perpendicular
  // (em "fatias" de perpTolMm). Buckets que caem no mesmo balde são
  // unificados.
  const angle = Math.atan2(b.dirY, b.dirX);
  const angleStep = Math.max(parallelTolRad, 1e-3);
  const distStep = Math.max(perpTolMm, 0.1);
  const aq = Math.round(angle / angleStep);
  const xq = Math.round(b.offsetX / distStep);
  const yq = Math.round(b.offsetY / distStep);
  return `${b.type}|${aq}|${xq}_${yq}`;
}

/** Span = min/max das projeções dos fragmentos no vetor direção. */
function computeSpan(bucket: AxisBucket): { a: Pt; b: Pt; length: number } {
  const ux = bucket.dirX, uy = bucket.dirY;
  let tMin = Infinity, tMax = -Infinity;
  let originX = 0, originY = 0;
  const f0 = bucket.fragments[0];
  if (f0) { originX = f0.a.x; originY = f0.a.y; }
  for (const e of bucket.fragments) {
    for (const p of [e.a, e.b]) {
      const t = (p.x - originX) * ux + (p.y - originY) * uy;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
    }
  }
  const a = { x: originX + ux * tMin, y: originY + uy * tMin };
  const b = { x: originX + ux * tMax, y: originY + uy * tMax };
  return { a, b, length: tMax - tMin };
}

export function reconstructFoldAxes(
  topology: ClassifiedTopology,
  geometry: NormalizedGeometry,
): StructuralFoldAxis[] {
  const parallelTolRad = geometry.tolerances.parallelTolRad;
  const perpTolMm = geometry.tolerances.perpendicularTolMm;

  const buckets = new Map<string, AxisBucket>();

  for (const e of topology.edges) {
    if (e.kindFinal !== "crease" && e.kindFinal !== "perf") continue;
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    const dir = canonicalDir(dx, dy);
    const foot = perpFoot(e.a, dir.x, dir.y);
    const candidate: AxisBucket = {
      type: e.kindFinal,
      dirX: dir.x,
      dirY: dir.y,
      offsetX: foot.x,
      offsetY: foot.y,
      fragments: [e],
    };
    const key = bucketKey(candidate, parallelTolRad, perpTolMm);
    const existing = buckets.get(key);
    if (existing) {
      existing.fragments.push(e);
    } else {
      buckets.set(key, candidate);
    }
  }

  // Materializa.
  const axes: StructuralFoldAxis[] = [];
  let axisCounter = 0;
  for (const bucket of buckets.values()) {
    const span = computeSpan(bucket);
    if (span.length < 0.6) continue; // descarta eixos degenerados pós-merge
    axes.push({
      id: `axis-${axisCounter++}`,
      sourceSegmentIds: Array.from(new Set(bucket.fragments.map((fragment) => `normalized-seg-${fragment.sourceSegIdx}`))),
      axisLine: {
        origin: { x: bucket.offsetX, y: bucket.offsetY },
        direction: { x: bucket.dirX, y: bucket.dirY },
      },
      span: { a: span.a, b: span.b },
      fragments: bucket.fragments,
      type: bucket.type,
      axisKind: bucket.type,
      role: "unknown",
      length: span.length,
      confidence: 0,
      connectedFaceIds: [], // preenchido em Stage 5 (PanelBuilder).
    });
  }

  return axes;
}
