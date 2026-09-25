// Texturas procedurais para diferentes substratos de embalagem.
// Geramos via Canvas2D e empacotamos como THREE.CanvasTexture — sem assets externos.
import * as THREE from "three";

export type SubstrateKind = "duplex" | "kraft" | "microondulado" | "cartao_branco";

export interface SubstrateMaterials {
  /** Material do verso (face interna da caixa). */
  back: THREE.MeshStandardMaterial;
  /** Material das laterais (espessura). */
  side: THREE.MeshStandardMaterial;
  /** Disposers para liberar memória ao reconstruir. */
  dispose: () => void;
}

const TEX_CACHE = new Map<string, THREE.Texture>();

function makeTexture(key: string, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
  const cached = TEX_CACHE.get(key);
  if (cached) return cached;
  const SIZE = 512;
  const c = document.createElement("canvas");
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext("2d")!;
  draw(ctx, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  TEX_CACHE.set(key, tex);
  return tex;
}

function paperNoise(ctx: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], jitter: number) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * jitter;
    d[i]     = Math.max(0, Math.min(255, base[0] + n));
    d[i + 1] = Math.max(0, Math.min(255, base[1] + n));
    d[i + 2] = Math.max(0, Math.min(255, base[2] + n));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function kraftTexture(): THREE.Texture {
  return makeTexture("kraft", (ctx, w, h) => {
    paperNoise(ctx, w, h, [186, 142, 92], 35);
    // fibras horizontais sutis
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#5a3e22";
    for (let i = 0; i < 200; i++) {
      ctx.beginPath();
      const y = Math.random() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 4, w * 0.6, y + (Math.random() - 0.5) * 4, w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

function duplexTexture(): THREE.Texture {
  return makeTexture("duplex", (ctx, w, h) => paperNoise(ctx, w, h, [232, 226, 214], 14));
}

function cartaoBrancoTexture(): THREE.Texture {
  return makeTexture("cartao_branco", (ctx, w, h) => paperNoise(ctx, w, h, [248, 246, 240], 8));
}

/** Lateral do microondulado: ondas verticais bem visíveis. */
function microonduladoSideTexture(): THREE.Texture {
  return makeTexture("microond_side", (ctx, w, h) => {
    // base kraft
    paperNoise(ctx, w, h, [180, 138, 88], 22);
    // ondas verticais
    const period = 18;
    for (let x = 0; x < w; x += period) {
      const grad = ctx.createLinearGradient(x, 0, x + period, 0);
      grad.addColorStop(0, "rgba(255,255,255,0.35)");
      grad.addColorStop(0.5, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.30)");
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, period, h);
    }
  });
}

export function buildSubstrateMaterials(kind: SubstrateKind, partTint?: number): SubstrateMaterials {
  let backTex: THREE.Texture;
  let sideTex: THREE.Texture;
  let backColor = 0xffffff;
  let roughness = 0.92;

  switch (kind) {
    case "kraft":
      backTex = kraftTexture();
      sideTex = kraftTexture();
      backColor = 0xffffff;
      roughness = 0.95;
      break;
    case "microondulado":
      backTex = kraftTexture();
      sideTex = microonduladoSideTexture();
      backColor = 0xffffff;
      roughness = 0.97;
      break;
    case "cartao_branco":
      backTex = cartaoBrancoTexture();
      sideTex = cartaoBrancoTexture();
      backColor = partTint ?? 0xffffff;
      roughness = 0.85;
      break;
    case "duplex":
    default:
      backTex = duplexTexture();
      sideTex = duplexTexture();
      backColor = partTint ?? 0xe8e2d6;
      roughness = 0.9;
      break;
  }

  const repeat = kind === "microondulado" ? 4 : 2;
  // Clonamos pra ajustar repeat sem mexer no cache compartilhado.
  const bClone = backTex.clone(); bClone.needsUpdate = true; bClone.repeat.set(repeat, repeat);
  const sClone = sideTex.clone(); sClone.needsUpdate = true;
  sClone.repeat.set(kind === "microondulado" ? 8 : repeat, kind === "microondulado" ? 1 : repeat);

  const back = new THREE.MeshStandardMaterial({ map: bClone, color: backColor, roughness, metalness: 0 });
  const side = new THREE.MeshStandardMaterial({ map: sClone, color: backColor, roughness: Math.min(1, roughness + 0.05), metalness: 0 });

  return {
    back,
    side,
    dispose: () => {
      bClone.dispose(); sClone.dispose();
      back.dispose(); side.dispose();
    },
  };
}

export const SUBSTRATE_LABELS: Record<SubstrateKind, string> = {
  duplex: "Duplex",
  cartao_branco: "Cartão branco",
  kraft: "Kraft",
  microondulado: "Microondulado",
};
