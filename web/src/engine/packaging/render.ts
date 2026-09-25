// Renderiza Dieline em SVG (string). Cores conforme padrão de mercado:
// vermelho = corte, azul tracejado = vinco, verde pontilhado = perfuração,
// magenta = sangria, ciano = área segura.
import type { Dieline, Segment } from "./dieline-types";

export const KIND_STYLE: Record<Segment["kind"], { color: string; dash?: string; label: string }> = {
  cut:   { color: "#ff2d55", label: "Corte" },
  crease:{ color: "#3b82f6", dash: "4 3", label: "Vinco" },
  perf:  { color: "#22c55e", dash: "1.2 2", label: "Perfuração" },
  bleed: { color: "#ec4899", dash: "2 2", label: "Sangria" },
  safe:  { color: "#06b6d4", dash: "1 3", label: "Área segura" },
};

function segToPath(s: Segment): string {
  if (!s.points.length) return "";
  let d = `M ${s.points[0].x} ${s.points[0].y}`;
  for (let i = 1; i < s.points.length; i++) d += ` L ${s.points[i].x} ${s.points[i].y}`;
  if (s.closed) d += " Z";
  return d;
}

function panelToPath(polygon: { x: number; y: number }[], holes?: { x: number; y: number }[][]): string {
  let d = `M ${polygon.map((pp) => `${pp.x} ${pp.y}`).join(" L ")} Z`;
  if (!holes?.length) return d;
  for (const ring of holes) {
    if (ring.length < 3) continue;
    d += ` M ${ring.map((pt) => `${pt.x} ${pt.y}`).join(" L ")} Z`;
  }
  return d;
}

export interface ArtOverlay {
  url: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
  opacity: number;
  /** Espelha a arte horizontalmente. */
  mirrorX?: boolean;
}

export function dielineToSvgString(
  d: Dieline,
  opts?: {
    showPanels?: boolean;
    showBleed?: boolean;
    art?: ArtOverlay | null;
    selectedIds?: string[];
    interactive?: boolean;
    hideSegments?: boolean;
    textureMode?: boolean;
    editSegments?: boolean;
    highlightSegmentIdx?: number | null;
    pinnedSegmentIdx?: number | null;
    selectedSegmentIdxs?: number[];
    visibleKinds?: Segment["kind"][];
  },
): string {
  const textureMode = opts?.textureMode ?? false;
  const showPanels = opts?.showPanels ?? false;
  const showBleed = textureMode ? false : (opts?.showBleed ?? true);
  const hideSegments = opts?.hideSegments ?? textureMode;
  const art = opts?.art ?? null;
  const selectedIds = opts?.selectedIds ?? [];
  const interactive = opts?.interactive ?? false;
  const editSegments = opts?.editSegments ?? false;
  const highlightIdx = opts?.highlightSegmentIdx ?? null;
  const pinnedIdx = opts?.pinnedSegmentIdx ?? null;
  const selSegIdxs = new Set(opts?.selectedSegmentIdxs ?? []);
  const visibleKinds = opts?.visibleKinds ? new Set(opts.visibleKinds) : null;
  const selSet = new Set(selectedIds);
  const m = textureMode ? 0 : 5;
  const W = d.width + 2 * m;
  const H = d.height + 2 * m;
  let body = "";

  // clip-path com a união dos painéis selecionados (se houver), para recortar a arte
  const hasSelection = selectedIds.length > 0;
  if (art && hasSelection) {
    let clipBody = "";
    for (const p of d.panels) {
      if (!selSet.has(p.id)) continue;
      const path = panelToPath(p.polygon, p.holes);
      clipBody += `<path d="${path}" clip-rule="evenodd" />`;
    }
    body += `<defs><clipPath id="art-clip" clipPathUnits="userSpaceOnUse">${clipBody}</clipPath></defs>`;
  }

  // arte (atrás dos traços), opcionalmente recortada nos painéis selecionados
  if (art) {
    const w = art.widthMm;
    const h = art.heightMm;
    const clip = hasSelection ? ` clip-path="url(#art-clip)"` : "";
    const mirror = art.mirrorX ? ` translate(${w} 0) scale(-1 1)` : "";
    body += `<g${clip} opacity="${art.opacity}">`;
    body += `<g transform="translate(${art.x} ${art.y + h}) scale(1 -1) rotate(${art.rotation} ${w / 2} ${h / 2})${mirror}">`;
    body += `<image href="${art.url}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" />`;
    body += `</g></g>`;
  }

  // sangria total ao redor do bbox
  if (showBleed && d.meta.params.bleed > 0) {
    const b = d.meta.params.bleed;
    body += `<rect x="${-b}" y="${-b}" width="${d.width + 2 * b}" height="${d.height + 2 * b}" fill="none" stroke="${KIND_STYLE.bleed.color}" stroke-width="0.3" stroke-dasharray="${KIND_STYLE.bleed.dash}" />`;
  }

  // painéis: visíveis quando showPanels OU interactive (para hit-test) OU selecionados
  if (showPanels || interactive || hasSelection) {
    for (let i = 0; i < d.panels.length; i++) {
      const p = d.panels[i];
      const path = panelToPath(p.polygon, p.holes);
      const isSel = selSet.has(p.id);
      const fill = isSel
        ? "rgba(99,102,241,0.18)"
        : showPanels ? "rgba(255,255,255,0.04)" : "transparent";
      const stroke = isSel
        ? "#818cf8"
        : showPanels ? "rgba(255,255,255,0.15)" : "transparent";
      const sw = isSel ? 0.5 : 0.15;
      const dataAttr = interactive ? ` data-panel-id="${escapeXml(p.id)}" style="cursor:pointer;pointer-events:all"` : "";
      body += `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" fill-rule="evenodd" clip-rule="evenodd"${dataAttr} />`;
      if (showPanels || isSel) {
        const cx = p.polygon.reduce((a, b) => a + b.x, 0) / p.polygon.length;
        const cy = p.polygon.reduce((a, b) => a + b.y, 0) / p.polygon.length;
        const num = i + 1;
        const labelColor = isSel ? "#c7d2fe" : "rgba(255,255,255,0.7)";
        const badgeBg = isSel ? "#6366f1" : "rgba(99,102,241,0.85)";
        body += `<g transform="translate(${cx} ${cy}) scale(1 -1)" style="pointer-events:none">`;
        body += `<circle cx="0" cy="-2.2" r="2.6" fill="${badgeBg}" stroke="rgba(255,255,255,0.9)" stroke-width="0.25" />`;
        body += `<text x="0" y="-2.2" fill="#ffffff" font-size="3" font-weight="700" text-anchor="middle" dominant-baseline="central">${num}</text>`;
        body += `<text x="0" y="2.6" fill="${labelColor}" font-size="2.4" text-anchor="middle" dominant-baseline="central">${escapeXml(p.label)}</text>`;
        body += `</g>`;
      }
    }
  }

  // Vazados (holes) explícitos dos painéis
  if (!hideSegments) {
    const cutColor = KIND_STYLE.cut.color;
    for (const p of d.panels) {
      if (!p.holes || !p.holes.length) continue;
      for (const ring of p.holes) {
        if (ring.length < 3) continue;
        const path = "M " + ring.map((pt) => `${pt.x} ${pt.y}`).join(" L ") + " Z";
        body += `<path d="${path}" fill="none" stroke="${cutColor}" stroke-width="0.4" style="pointer-events:none" />`;
      }
    }
  }

  if (!hideSegments) {
    for (let i = 0; i < d.segments.length; i++) {
      const s = d.segments[i];
      const style = KIND_STYLE[s.kind];
      const isVisible = !visibleKinds || visibleKinds.has(s.kind);
      const isHi = editSegments && highlightIdx === i;
      const isPin = editSegments && pinnedIdx === i;
      const isSelSeg = editSegments && selSegIdxs.has(i);
      const sw = isPin || isSelSeg ? 1.1 : isHi ? 0.9 : 0.4;
      const op = isVisible ? 1 : 0.1;
      const dPath = segToPath(s);
      if ((isPin || isSelSeg) && isVisible) {
        const haloColor = isSelSeg && !isPin ? "#fbbf24" : style.color;
        body += `<path d="${dPath}" fill="none" stroke="${haloColor}" stroke-width="2.4" opacity="0.4" style="pointer-events:none" />`;
      }
      body += `<path d="${dPath}" fill="none" stroke="${style.color}" stroke-width="${sw}" opacity="${op}"${style.dash ? ` stroke-dasharray="${style.dash}"` : ""} style="pointer-events:none" />`;
      if (editSegments && isVisible) {
        body += `<path d="${dPath}" fill="none" stroke="rgba(0,0,0,0)" stroke-width="2.2" data-seg-idx="${i}" style="cursor:crosshair;pointer-events:stroke" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${W} ${H}" width="100%" height="100%"><g transform="translate(0 ${d.height}) scale(1 -1)">${body}</g></svg>`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}
