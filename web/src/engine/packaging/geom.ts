// Helpers geométricos reutilizados pelos modelos FEFCO.
import type { Pt, Segment, Panel } from "./dieline-types";

export const pt = (x: number, y: number): Pt => ({ x, y });

export function rectSegments(x: number, y: number, w: number, h: number, kind: Segment["kind"] = "cut"): Segment[] {
  return [
    { kind, points: [pt(x, y), pt(x + w, y)] },
    { kind, points: [pt(x + w, y), pt(x + w, y + h)] },
    { kind, points: [pt(x + w, y + h), pt(x, y + h)] },
    { kind, points: [pt(x, y + h), pt(x, y)] },
  ];
}

export function line(x1: number, y1: number, x2: number, y2: number, kind: Segment["kind"]): Segment {
  return { kind, points: [pt(x1, y1), pt(x2, y2)] };
}

export function vline(x: number, y1: number, y2: number, kind: Segment["kind"]): Segment {
  return line(x, y1, x, y2, kind);
}
export function hline(x1: number, x2: number, y: number, kind: Segment["kind"]): Segment {
  return line(x1, y, x2, y, kind);
}

export function panel(id: string, label: string, x: number, y: number, w: number, h: number): Panel {
  return {
    id,
    label,
    polygon: [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)],
  };
}

export function polyPanel(id: string, label: string, points: Pt[]): Panel {
  return { id, label, polygon: points };
}

/** Polígono trapezoidal usado em abas (chanfro de 45° no topo). */
export function trapezoid(x: number, y: number, w: number, h: number, chamfer = 0): Pt[] {
  const c = Math.min(chamfer, w / 2, h);
  return [
    pt(x, y),
    pt(x + w, y),
    pt(x + w - c, y + h),
    pt(x + c, y + h),
  ];
}

/** Converte polígono fechado em segmentos de corte. */
export function polyToCuts(points: Pt[]): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    segs.push({ kind: "cut", points: [a, b] });
  }
  return segs;
}

export function bleedRect(x: number, y: number, w: number, h: number, b: number): Segment[] {
  return rectSegments(x - b, y - b, w + 2 * b, h + 2 * b, "bleed");
}
