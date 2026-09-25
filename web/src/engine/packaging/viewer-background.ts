// Configuração e geração de fundo para o viewer 3D (estilo Packdora).
// Suporta cor sólida e gradientes (linear/radial). Para o three.js geramos
// uma CanvasTexture que vira `scene.background`. Para o DOM, geramos o
// equivalente em CSS para o container atrás do canvas.
import * as THREE from "three";

export type BgSpec =
  | { type: "solid"; color: string }
  | { type: "linear"; start: string; end: string; angle: number }
  | { type: "radial"; start: string; end: string };

export const DEFAULT_BG: BgSpec = { type: "solid", color: "#0e1018" };

// Paleta de cores sólidas (semelhante ao Packdora).
export const SOLID_PRESETS = [
  "#0e1018", "#1a1a1a", "#2d2d2d", "#4a4a4a", "#7a7a7a",
  "#ffffff", "#f5f5f5", "#e8e8e8",
  "#cbd5e1", "#cbb4d4", "#e8d5d5", "#d6e4cc", "#fbe2c7",
];

// Pares (start, end) para gradientes.
export const GRADIENT_PRESETS: Array<[string, string]> = [
  ["#ffffff", "#cbd5e1"], ["#cbd5e1", "#94a3b8"], ["#94a3b8", "#475569"],
  ["#475569", "#0f172a"], ["#1e293b", "#475569"], ["#0f172a", "#1e293b"],
  ["#fde2c7", "#e8a87c"], ["#e8c5d0", "#c9a0dc"], ["#f8e8ee", "#c9b99a"],
  ["#c2956b", "#6b3a2a"], ["#e8a87c", "#c4654a"], ["#d4a574", "#8b6f5e"],
  ["#bae6fd", "#0284c7"], ["#7dd3fc", "#0c4a6e"], ["#e0f2fe", "#3b82f6"],
  ["#a78bfa", "#4f46e5"], ["#c4b5fd", "#7c3aed"], ["#818cf8", "#1e3a8a"],
  ["#86efac", "#15803d"], ["#bbf7d0", "#22c55e"], ["#a7f3d0", "#0d9488"],
  ["#fde68a", "#d97706"], ["#fcd34d", "#92400e"], ["#fef08a", "#a16207"],
  ["#fecaca", "#ef4444"], ["#fda4af", "#be123c"], ["#fbcfe8", "#db2777"],
];

export function bgToCss(b: BgSpec): string {
  if (b.type === "solid") return b.color;
  if (b.type === "radial") return `radial-gradient(circle at 50% 50%, ${b.start}, ${b.end})`;
  return `linear-gradient(${b.angle}deg, ${b.start}, ${b.end})`;
}

/** Cria uma textura 2D 512×512 com o gradiente desejado, pronta para `scene.background`. */
export function bgToTexture(b: BgSpec): THREE.Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  if (b.type === "solid") {
    ctx.fillStyle = b.color;
    ctx.fillRect(0, 0, size, size);
  } else if (b.type === "radial") {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, b.start);
    grad.addColorStop(1, b.end);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else {
    // CSS-like ângulo: 0deg = de baixo para cima; 90deg = esquerda → direita.
    const rad = ((b.angle - 90) * Math.PI) / 180;
    const cx = size / 2, cy = size / 2;
    const len = size * 0.75;
    const dx = Math.cos(rad) * len;
    const dy = Math.sin(rad) * len;
    const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    grad.addColorStop(0, b.start);
    grad.addColorStop(1, b.end);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
