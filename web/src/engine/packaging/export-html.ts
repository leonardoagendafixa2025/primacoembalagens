// Exporta um HTML autocontido com o viewer 3D — para enviar ao cliente.
// Suporta UMA ou VÁRIAS peças (montagem). Embute three.js (CDN), os dados
// das facas (panels + fold tree), as SVGs com a arte de cada peça e a mesma
// lógica de dobra/animação/controles do app, num único arquivo.
import type { Dieline } from "./dieline-types";
import { dielineToSvgString } from "./render";
import { runPipeline } from "./pipeline";
import type { ArtAsset, Pose } from "./store-types.ts";

export interface ExportPart {
  id: string;
  name: string;
  dieline: Dieline;
  art: ArtAsset | null;
  foldAngles: Record<string, number>;
  selectedPanels: string[];
  thickness: number;
  /** Pose final da peça na montagem (mm e radianos). */
  pose: Pose;
}

interface ExportOpts {
  parts: ExportPart[];
  showArt: boolean;
  title?: string;
}

export function exportViewerHtml(opts: ExportOpts): string {
  const { parts, showArt, title } = opts;

  const partsData = parts.map((p) => {
    const pipeline = runPipeline(p.dieline.segments);
    const svg = dielineToSvgString(p.dieline, {
      showPanels: false,
      showBleed: false,
      textureMode: true,
      art: showArt && p.art ? p.art : null,
      selectedIds: [],
    });
    const axisById = new Map(pipeline.foldAxes.map((axis) => [axis.id, axis]));
    const panelById = new Map(pipeline.panels.map((panel) => [panel.id, panel]));
    const children = new Map<string, string[]>();
    for (const panel of pipeline.panels) children.set(panel.id, []);
    for (const step of pipeline.model3D.effectivePlan.steps) {
      const arr = children.get(step.parentId) ?? [];
      arr.push(step.panelId);
      children.set(step.parentId, arr);
    }
    for (const feature of pipeline.staticFeatures) {
      const arr = children.get(feature.parentPanelId) ?? [];
      arr.push(feature.id);
      children.set(feature.parentPanelId, arr);
    }

    const treeEntries = pipeline.panels.map((panel) => {
      const step = pipeline.model3D.effectivePlan.byPanel[panel.id];
      const axis = step ? axisById.get(step.hingeId) : null;
      return [
        panel.id,
        {
          id: panel.id,
          label: panel.label,
          polygon: panel.polygon,
          holes: panel.holes ?? [],
          parent: step?.parentId ?? null,
          hinge: axis ? { a: axis.span.a, b: axis.span.b } : null,
          sign: step?.sign ?? 1,
          target: step?.targetAngle ?? 0,
          children: children.get(panel.id) ?? [],
        },
      ] as const;
    });
    const featureEntries = pipeline.staticFeatures.map((feature) => [
      feature.id,
      {
        id: feature.id,
        label: feature.label,
        polygon: feature.polygon,
        holes: feature.holes ?? [],
        parent: feature.parentPanelId,
        hinge: null,
        sign: 1,
        target: 0,
        children: [],
      },
    ] as const);
    const treeData = Object.fromEntries([...treeEntries, ...featureEntries]);
    return {
      id: p.id,
      name: p.name,
      width: p.dieline.width,
      height: p.dieline.height,
      rootId: pipeline.model3D.effectivePlan.rootPanelId,
      tree: treeData,
      foldingPlan: pipeline.model3D.effectivePlan,
      foldPlanV2: pipeline.foldPlanV2,
      foldGraph: pipeline.graph,
      foldAngles: (() => {
        const remap: Record<string, number> = {};
        const dPanels = p.dieline.panels ?? [];
        for (const [k, v] of Object.entries(p.foldAngles ?? {})) {
          const dp = dPanels.find((x) => x.id === k);
          remap[dp?.pipelinePanelId ?? k] = v;
        }
        return remap;
      })(),
      thickness: p.thickness,
      pose: {
        position: { ...p.pose.position },
        rotation: { ...p.pose.rotation },
      },
      svg,
    };
  });


  const data = {
    title: title || (parts[0]?.dieline.meta.name ?? "Embalagem"),
    parts: partsData,
  };

  return buildHtml(data);
}

export function downloadViewerHtml(opts: ExportOpts, filename = "embalagem-3d.html") {
  const html = exportViewerHtml(opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildHtml(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>Primacor 3D — Visualizador Interativo de Embalagem</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-dark: #07090E;
    --panel-bg: rgba(13, 17, 26, 0.78);
    --panel-border: rgba(255, 255, 255, 0.08);
    --panel-glow: rgba(56, 189, 248, 0.12);
    --accent: #38BDF8;
    --accent-hover: #0284C7;
    --accent-glow: rgba(56, 189, 248, 0.35);
    --text-main: #F1F5F9;
    --text-muted: #94A3B8;
    --text-dim: #64748B;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%;
    overflow: hidden;
    background-color: var(--bg-dark);
    color: var(--text-main);
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  #app {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    width: 100vw;
    position: relative;
    background: radial-gradient(circle at 50% 15%, rgba(56, 189, 248, 0.05) 0%, transparent 65%),
                radial-gradient(circle at 50% 85%, rgba(99, 102, 241, 0.04) 0%, transparent 70%);
  }

  /* Header Superior Flutuante Glass */
  header {
    position: absolute;
    top: 14px;
    left: 14px;
    right: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 18px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.03);
    z-index: 20;
    flex-wrap: wrap;
  }
  .brand-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.5px;
    color: #fff;
  }
  .brand-logo svg {
    color: var(--accent);
    filter: drop-shadow(0 0 8px var(--accent-glow));
  }
  .brand-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.12);
    border: 1px solid rgba(16, 185, 129, 0.3);
    font-size: 10px;
    font-weight: 700;
    color: #34D399;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }
  .brand-badge::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #34D399;
    box-shadow: 0 0 8px #34D399;
    animation: pulseDot 2s infinite ease-in-out;
  }
  @keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }

  .title-group {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .doc-title {
    font-size: 14px;
    font-weight: 700;
    color: #FFFFFF;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }
  .dim-pill {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 7px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 11px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--panel-border);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  }
  .btn-chip:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #fff;
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }
  .btn-chip.active {
    background: var(--accent-glow);
    border-color: var(--accent);
    color: #fff;
    box-shadow: 0 0 14px var(--accent-glow);
  }
  .btn-chip.highlight {
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.4);
    color: var(--accent);
  }
  .btn-chip.highlight:hover {
    background: rgba(56, 189, 248, 0.25);
    color: #fff;
  }

  /* Palco 3D WebGL */
  .stage {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  #canvasHolder {
    position: absolute;
    inset: 0;
    cursor: grab;
  }
  #canvasHolder:active {
    cursor: grabbing;
  }

  /* Painel de Vistas de Câmera (Floating Glass Pill) */
  .camera-dock {
    position: absolute;
    top: 76px;
    left: 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    padding: 5px;
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    z-index: 15;
  }
  .camera-dock-title {
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    padding: 3px 6px;
  }
  .cam-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 10.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.14s ease;
    text-align: left;
  }
  .cam-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  /* Seletor de Substrato Flutuante (Topo Direito) */
  .substrate-dock {
    position: absolute;
    top: 76px;
    right: 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    padding: 6px 8px;
    border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    z-index: 15;
  }
  .dock-label {
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
    padding: 2px 4px;
  }
  .sub-btn-group {
    display: flex;
    gap: 4px;
  }
  .sub-btn {
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .sub-btn:hover {
    background: rgba(255, 255, 255, 0.09);
    color: #fff;
  }
  .sub-btn.active {
    background: var(--accent);
    color: #000;
    font-weight: 700;
    border-color: var(--accent);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
  }

  /* Dock Inferior de Controle de Dobra */
  .control-dock {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: min(720px, 94vw);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border-radius: 18px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04);
    padding: 14px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 20;
    user-select: none;
  }

  /* Linha Superior do Dock: Presets e Info */
  .dock-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .presets-group {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .preset-btn {
    padding: 4px 9px;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .preset-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }
  .preset-btn.active {
    background: rgba(56, 189, 248, 0.15);
    border-color: var(--accent);
    color: var(--accent);
  }

  .fold-meta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .fold-meta-label {
    font-size: 9.5px;
    color: var(--text-dim);
    font-weight: 500;
    text-transform: uppercase;
  }

  /* Linha Inferior do Dock: Slider com Botão Play */
  .dock-bottom {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
  }
  .play-btn {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: linear-gradient(135deg, #38BDF8, #0284C7);
    border: none;
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.45);
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    flex-shrink: 0;
  }
  .play-btn:hover {
    transform: scale(1.08);
    box-shadow: 0 0 24px rgba(56, 189, 248, 0.65);
  }
  .play-btn.playing {
    background: linear-gradient(135deg, #F59E0B, #D97706);
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.45);
  }

  .slider-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }
  .fold-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    outline: none;
    cursor: pointer;
    transition: background 0.15s;
  }
  .fold-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #FFFFFF;
    border: 2px solid var(--accent);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .fold-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.9);
  }
  .fold-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #FFFFFF;
    border: 2px solid var(--accent);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.7);
    cursor: pointer;
  }

  /* Badge de Créditos e Versão */
  .footer-credit {
    position: absolute;
    bottom: 6px;
    right: 14px;
    font-size: 9px;
    color: var(--text-dim);
    letter-spacing: 0.3px;
    pointer-events: none;
  }

  /* Notificação Toast */
  .toast {
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%) translateY(-20px);
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid var(--accent);
    color: #fff;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    opacity: 0;
    pointer-events: none;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 100;
  }
  .toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  @media (max-width: 768px) {
    header { padding: 8px 12px; }
    .doc-title { max-width: 150px; font-size: 12px; }
    .camera-dock { top: auto; bottom: 100px; left: 10px; }
    .substrate-dock { top: auto; bottom: 100px; right: 10px; }
    .control-dock { bottom: 10px; width: 96vw; padding: 10px 14px; }
  }
</style>
</head>
<body>
<div id="app">
  <!-- Toast Notificação -->
  <div id="toast" class="toast">Foto HD capturada com sucesso!</div>

  <!-- Header Superior -->
  <header>
    <div class="brand-group">
      <div class="brand-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
        <span>PRIMACOR 3D</span>
      </div>
      <div class="brand-badge">Interativo</div>
    </div>

    <div class="title-group">
      <span class="doc-title" id="docTitle">Embalagem</span>
      <span class="dim-pill" id="dimBadge">0 × 0 mm</span>
    </div>

    <div class="header-actions">
      <button class="btn-chip" id="btnResetRot" title="Resetar Rotação da Câmera">
        ↺ Resetar Ângulo
      </button>
      <button class="btn-chip" id="btnAuto" title="Girar 360° Automaticamente">
        ⟳ Girar 360°
      </button>
      <button class="btn-chip" id="btnWire" title="Alternar Modo Aramado CAD">
        🕸️ Aramado
      </button>
      <button class="btn-chip highlight" id="btnSnap" title="Baixar Imagem HD do Modelo">
        📸 Foto HD
      </button>
      <button class="btn-chip" id="btnFull" title="Modo Tela Cheia">
        ⛶
      </button>
    </div>
  </header>

  <!-- Palco 3D -->
  <div class="stage">
    <div id="canvasHolder"></div>

    <!-- Câmeras / Vistas Rápidas -->
    <div class="camera-dock">
      <div class="camera-dock-title">Vistas 3D</div>
      <button class="cam-btn" data-face="iso">◇ 3D Isométrica</button>
      <button class="cam-btn" data-face="front">▪ Frente</button>
      <button class="cam-btn" data-face="back">▪ Trás</button>
      <button class="cam-btn" data-face="top">▪ Topo</button>
      <button class="cam-btn" data-face="bottom">▪ Base (Fundo)</button>
      <button class="cam-btn" data-face="left">▪ Esquerda</button>
      <button class="cam-btn" data-face="right">▪ Direita</button>
    </div>

    <!-- Seletor de Substrato Procedural -->
    <div class="substrate-dock">
      <div class="dock-label">Substrato de Papel</div>
      <div class="sub-btn-group">
        <button class="sub-btn active" data-sub="duplex">Duplex</button>
        <button class="sub-btn" data-sub="kraft">Kraft</button>
        <button class="sub-btn" data-sub="microondulado">Microond.</button>
        <button class="sub-btn" data-sub="cartao_branco">Branco</button>
      </div>
    </div>
  </div>

  <!-- Dock Inferior: Controle de Dobra e Simulação -->
  <div class="control-dock">
    <div class="dock-top">
      <div class="presets-group">
        <button class="preset-btn" data-pct="0">0% Aberta</button>
        <button class="preset-btn" data-pct="0.25">25%</button>
        <button class="preset-btn" data-pct="0.5">50%</button>
        <button class="preset-btn" data-pct="0.75">75%</button>
        <button class="preset-btn active" data-pct="1">100% Fechada</button>
      </div>
      <div class="fold-meta">
        <span class="fold-meta-label">SIMULAÇÃO DE DOBRA:</span>
        <span id="foldPct">100%</span>
      </div>
    </div>

    <div class="dock-bottom">
      <button class="play-btn" id="btnPlay" title="Animar Dobra">
        <svg id="playIcon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </button>

      <div class="slider-wrapper">
        <input id="foldRange" class="fold-slider" type="range" min="0" max="100" step="1" value="100" />
      </div>
    </div>
  </div>

  <div class="footer-credit">Primacor Studio CAD 3D Engine • Three.js WebGL</div>
</div>

<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DATA = ${json};
const docTitleEl = document.getElementById("docTitle");
const dimBadgeEl = document.getElementById("dimBadge");

docTitleEl.textContent = DATA.title || "Embalagem Primacor";
if (DATA.parts && DATA.parts[0]) {
  dimBadgeEl.textContent = Math.round(DATA.parts[0].width) + " × " + Math.round(DATA.parts[0].height) + " mm";
}

const INITIAL_CAM_DIR = new THREE.Vector3(0.65, 0.55, 1.0).normalize();

// --- GERADOR DE SUBSTRATOS PROCEDURAIS (CANVAS 2D) ---
function makeProceduralTexture(key, draw) {
  const SIZE = 512;
  const c = document.createElement("canvas");
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext("2d");
  draw(ctx, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function paperNoise(ctx, w, h, base, jitter) {
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

const KRAFT_TEX = makeProceduralTexture("kraft", (ctx, w, h) => {
  paperNoise(ctx, w, h, [186, 142, 92], 30);
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#5a3e22";
  for (let i = 0; i < 200; i++) {
    ctx.beginPath();
    const y = Math.random() * h;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 4, w * 0.6, y + (Math.random() - 0.5) * 4, w, y);
    ctx.stroke();
  }
});

const DUPLEX_TEX = makeProceduralTexture("duplex", (ctx, w, h) => {
  paperNoise(ctx, w, h, [230, 224, 212], 12);
});

const WHITE_TEX = makeProceduralTexture("white", (ctx, w, h) => {
  paperNoise(ctx, w, h, [248, 246, 242], 6);
});

const MICRO_SIDE_TEX = makeProceduralTexture("micro_side", (ctx, w, h) => {
  paperNoise(ctx, w, h, [180, 138, 88], 20);
  const period = 20;
  for (let x = 0; x < w; x += period) {
    const grad = ctx.createLinearGradient(x, 0, x + period, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.3)");
    grad.addColorStop(0.5, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, period, h);
  }
});

// Sombra de Contato Fotorrealista sob a caixa
function makeContactShadowTexture() {
  const SIZE = 512;
  const c = document.createElement("canvas");
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(SIZE/2, SIZE/2, 10, SIZE/2, SIZE/2, SIZE/2);
  grad.addColorStop(0, "rgba(0, 0, 0, 0.65)");
  grad.addColorStop(0.4, "rgba(0, 0, 0, 0.35)");
  grad.addColorStop(0.8, "rgba(0, 0, 0, 0.08)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function svgToTexture(svg, w, h, renderer) {
  const maxTex = renderer?.capabilities?.maxTextureSize ?? 4096;
  const targetLong = Math.min(maxTex, 4096);
  const longSide = Math.max(w, h);
  const scale = Math.max(4, targetLong / longSide);
  const rw = Math.max(64, Math.round(w * scale));
  const rh = Math.max(64, Math.round(h * scale));
  let sized = svg.replace(/<svg\\b([^>]*)>/i, (_m, attrs) => {
    let a = String(attrs).replace(/\\swidth="[^"]*"/i, "").replace(/\\sheight="[^"]*"/i, "");
    if (!/viewBox=/i.test(a)) a += \` viewBox="0 0 \${w} \${h}"\`;
    return \`<svg\${a} width="\${rw}" height="\${rh}">\`;
  });
  const blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im); im.onerror = reject; im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = rw; canvas.height = rh;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, rw, rh);
    ctx.drawImage(img, 0, 0, rw, rh);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  } finally { URL.revokeObjectURL(url); }
}

const holder = document.getElementById("canvasHolder");
let W0 = holder.clientWidth, H0 = holder.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090E);

const camera = new THREE.PerspectiveCamera(40, W0 / H0, 1, 25000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(W0, H0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
holder.appendChild(renderer.domElement);

// Iluminação de Estúdio Fotorrealista
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const mainKeyLight = new THREE.DirectionalLight(0xffffff, 1.4);
mainKeyLight.position.set(500, 800, 600);
scene.add(mainKeyLight);

const fillLight = new THREE.DirectionalLight(0xbbe1fa, 0.6);
fillLight.position.set(-600, 400, -300);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
rimLight.position.set(0, -600, -600);
scene.add(rimLight);

// Plano de Sombra de Contato Fotorrealista
const shadowMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: makeContactShadowTexture(), transparent: true, opacity: 0.75, depthWrite: false })
);
shadowMesh.rotation.x = -Math.PI / 2;
shadowMesh.position.y = 0;
scene.add(shadowMesh);

const pivot = new THREE.Group(); scene.add(pivot);
const world = new THREE.Group(); pivot.add(world);

const builtParts = [];
let currentSubstrate = "duplex";
let isWireframe = false;

async function buildPart(partData, idx) {
  const group = new THREE.Group();
  group.position.set(partData.pose.position.x, partData.pose.position.y, partData.pose.position.z);
  group.rotation.set(partData.pose.rotation.x, partData.pose.rotation.y, partData.pose.rotation.z);
  world.add(group);

  const carrier = new THREE.Group();
  group.add(carrier);

  const root = new THREE.Group();
  root.position.set(-partData.width/2, 0, partData.height/2);
  root.rotation.x = -Math.PI/2;
  carrier.add(root);

  const tex = await svgToTexture(partData.svg, partData.width, partData.height, renderer);
  const thickness = partData.thickness ?? 0.45;
  const pivots = [];
  const partMaterials = [];

  function getSubstrateBackMaterial(kind) {
    let map = DUPLEX_TEX;
    let color = 0xffffff;
    if (kind === "kraft") { map = KRAFT_TEX; }
    else if (kind === "microondulado") { map = KRAFT_TEX; }
    else if (kind === "cartao_branco") { map = WHITE_TEX; }
    const m = new THREE.MeshStandardMaterial({ map, color, roughness: 0.9, metalness: 0 });
    return m;
  }

  function getSubstrateSideMaterial(kind) {
    let map = DUPLEX_TEX;
    if (kind === "kraft") map = KRAFT_TEX;
    else if (kind === "microondulado") map = MICRO_SIDE_TEX;
    else if (kind === "cartao_branco") map = WHITE_TEX;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
  }

  function buildPanelMesh(panelId, polygon, holes) {
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].y);
    for (let i=1; i<polygon.length; i++) shape.lineTo(polygon[i].x, polygon[i].y);
    shape.closePath();

    if (holes && holes.length) {
      for (const ring of holes) {
        const hole = new THREE.Path();
        hole.moveTo(ring[0].x, ring[0].y);
        for (let i=1; i<ring.length; i++) hole.lineTo(ring[i].x, ring[i].y);
        hole.closePath();
        shape.holes.push(hole);
      }
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i=0; i<pos.count; i++) {
      uv[i*2] = pos.getX(i) / partData.width;
      uv[i*2+1] = pos.getY(i) / partData.height;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    const idx = geo.index;
    const getIdx = (i) => idx ? idx.getX(i) : i;
    const newGroups = [];
    for (const g of geo.groups) {
      if (g.materialIndex !== 0) { newGroups.push({ start: g.start, count: g.count, materialIndex: 2 }); continue; }
      let runStart = g.start, runMat = -1, runCount = 0;
      const flush = () => { if (runCount > 0) newGroups.push({ start: runStart, count: runCount, materialIndex: runMat }); };
      for (let t=0; t<g.count; t+=3) {
        const a = getIdx(g.start+t), b = getIdx(g.start+t+1), c = getIdx(g.start+t+2);
        const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
        const mi = z > thickness * 0.5 ? 0 : 1;
        if (mi !== runMat) { flush(); runStart = g.start+t; runMat = mi; runCount = 3; } else runCount += 3;
      }
      flush();
    }
    geo.groups.length = 0;
    for (const g of newGroups) geo.addGroup(g.start, g.count, g.materialIndex);

    const frontMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.05 });
    const backMat = getSubstrateBackMaterial(currentSubstrate);
    const sideMat = getSubstrateSideMaterial(currentSubstrate);
    partMaterials.push({ frontMat, backMat, sideMat });

    return new THREE.Mesh(geo, [frontMat, backMat, sideMat]);
  }

  function visit(id, threeParent) {
    const node = partData.tree[id];
    let parentForChildren;
    if (node.parent && node.hinge) {
      const piv = new THREE.Group();
      piv.position.set(node.hinge.a.x, node.hinge.a.y, 0);
      threeParent.add(piv);
      const ax = node.hinge.b.x - node.hinge.a.x;
      const ay = node.hinge.b.y - node.hinge.a.y;
      const axis = new THREE.Vector3(ax, ay, 0).normalize();
      pivots.push({ panelId: id, pivot: piv, axis, sign: node.sign, target: node.target });
      const mesh = buildPanelMesh(id, node.polygon, node.holes);
      mesh.position.set(-node.hinge.a.x, -node.hinge.a.y, 0);
      piv.add(mesh);
      parentForChildren = mesh;
    } else {
      const mesh = buildPanelMesh(id, node.polygon, node.holes);
      threeParent.add(mesh);
      parentForChildren = mesh;
    }
    for (const c of node.children) visit(c, parentForChildren);
  }
  visit(partData.rootId, root);

  builtParts.push({ data: partData, group, carrier, root, pivots, partMaterials });
}

for (let i = 0; i < DATA.parts.length; i++) {
  await buildPart(DATA.parts[i], i);
}

// Atualiza o material de substrato de todas as peças
function updateSubstrate(kind) {
  currentSubstrate = kind;
  for (const bp of builtParts) {
    for (const pm of bp.partMaterials) {
      let bMap = DUPLEX_TEX;
      let sMap = DUPLEX_TEX;
      if (kind === "kraft") { bMap = KRAFT_TEX; sMap = KRAFT_TEX; }
      else if (kind === "microondulado") { bMap = KRAFT_TEX; sMap = MICRO_SIDE_TEX; }
      else if (kind === "cartao_branco") { bMap = WHITE_TEX; sMap = WHITE_TEX; }
      pm.backMat.map = bMap;
      pm.backMat.needsUpdate = true;
      pm.sideMat.map = sMap;
      pm.sideMat.needsUpdate = true;
    }
  }
}

const easeStep = (x) => x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function planWeights(partData, progress) {
  const planSteps = [...(partData.foldPlanV2?.steps || [])].sort((a,b) => a.index - b.index || a.depth - b.depth);
  const out = {};
  const p = clamp01(progress);
  if (planSteps.length > 0) {
    const g = p >= 1 ? planSteps.length : p * planSteps.length;
    const activeIdx = p >= 1 ? planSteps.length - 1 : Math.min(planSteps.length - 1, Math.floor(g));
    const localT = p >= 1 ? 1 : clamp01(g - activeIdx);
    const eased = easeStep(localT);
    for (let i=0; i<planSteps.length; i++) {
      const w = i < activeIdx ? 1 : i === activeIdx ? eased : 0;
      for (const op of planSteps[i].operations || []) {
        if (op.type === "folding") out[op.faceId] = w;
      }
    }
    return out;
  }
  const steps = [...(partData.foldingPlan?.steps || [])].sort((a,b) => a.step - b.step || String(a.panelId).localeCompare(String(b.panelId)));
  const g = p >= 1 ? steps.length : p * steps.length;
  const activeIdx = p >= 1 ? steps.length - 1 : Math.min(steps.length - 1, Math.floor(g));
  const localT = p >= 1 ? 1 : clamp01(g - activeIdx);
  const eased = easeStep(localT);
  for (let i=0; i<steps.length; i++) out[steps[i].panelId] = i < activeIdx ? 1 : i === activeIdx ? eased : 0;
  return out;
}

function applyFold(t) {
  for (const bp of builtParts) {
    const weights = planWeights(bp.data, t);
    for (const p of bp.pivots) {
      const ov = bp.data.foldAngles?.[p.panelId];
      const target = -p.target * p.sign;
      const manual = ov !== undefined ? (ov * Math.PI / 180) / (Math.abs(target) || 1e-6) : undefined;
      const angle = target * (manual ?? weights[p.panelId] ?? 0);
      p.pivot.quaternion.setFromAxisAngle(p.axis, angle);
    }
  }
}

function recenterPivotOnBase() {
  const savedQ = pivot.quaternion.clone();
  pivot.quaternion.identity();
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(world);
  pivot.quaternion.copy(savedQ);
  pivot.updateMatrixWorld(true);
  if (!isFinite(box.min.x)) return;
  const cx = (box.min.x + box.max.x) / 2;
  const cy = box.min.y;
  const cz = (box.min.z + box.max.z) / 2;
  world.position.x -= cx;
  world.position.y -= cy;
  world.position.z -= cz;
  pivot.updateMatrixWorld(true);

  // Atualiza escala da sombra de contato no piso
  const size = new THREE.Vector3(); box.getSize(size);
  const shadowScale = Math.max(size.x, size.z) * 1.5;
  shadowMesh.scale.set(shadowScale, shadowScale, 1);
  shadowMesh.position.y = -0.5;
}

let fold = 1.0;
applyFold(1.0);
recenterPivotOnBase();

const controls = new OrbitControls(camera, holder);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 1.0;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;
controls.minDistance = 30;
controls.maxDistance = 25000;
controls.target.set(0, 0, 0);

const totalSize = DATA.parts.reduce((acc, p) => Math.max(acc, p.width, p.height), 0);
let baseDist = Math.max(totalSize, 120) * 1.8;
let camDist = baseDist;
let autoFit = true;

function fitToScreen() {
  recenterPivotOnBase();
  const savedQ = pivot.quaternion.clone();
  pivot.quaternion.identity();
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(world);
  pivot.quaternion.copy(savedQ);
  pivot.updateMatrixWorld(true);
  if (!isFinite(box.min.x)) return;

  const size = new THREE.Vector3(); box.getSize(size);
  const vfov = camera.fov * Math.PI / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const d = Math.max(size.y / 2 / Math.tan(vfov / 2), Math.max(size.x, size.z) / 2 / Math.tan(hfov / 2), 1) * 1.55;
  camDist = d;

  const center = new THREE.Vector3();
  box.getCenter(center);
  controls.target.set(0, size.y / 2, 0);

  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  if (dir.lengthSq() < 1e-4) dir.copy(INITIAL_CAM_DIR);
  camera.position.copy(controls.target).addScaledVector(dir, d);
  controls.update();
}

fitToScreen();

let autoRot = false;
const autoAxis = new THREE.Vector3(0, 1, 0);
const autoQuat = new THREE.Quaternion();

function animate() {
  controls.update();
  if (autoRot) {
    autoQuat.setFromAxisAngle(autoAxis, 0.006);
    pivot.quaternion.premultiply(autoQuat);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", () => {
  W0 = holder.clientWidth; H0 = holder.clientHeight;
  camera.aspect = W0 / H0;
  camera.updateProjectionMatrix();
  renderer.setSize(W0, H0);
  if (autoFit) fitToScreen();
});

const foldRange = document.getElementById("foldRange");
const foldPct = document.getElementById("foldPct");
const presetBtns = document.querySelectorAll(".preset-btn");

function setFold(v) {
  fold = Math.max(0, Math.min(1, v));
  applyFold(fold);
  recenterPivotOnBase();
  foldRange.value = String(Math.round(fold * 100));
  foldPct.textContent = Math.round(fold * 100) + "%";

  presetBtns.forEach(btn => {
    const bVal = parseFloat(btn.dataset.pct);
    btn.classList.toggle("active", Math.abs(fold - bVal) < 0.05);
  });
}

foldRange.addEventListener("input", (e) => {
  if (playing) togglePlay();
  setFold(Number(e.target.value) / 100);
});

presetBtns.forEach(btn => {
  btn.onclick = () => {
    if (playing) togglePlay();
    setFold(parseFloat(btn.dataset.pct));
  };
});

// Animação Contínua
let playRaf = 0, playing = false, playState = null;
const playBtn = document.getElementById("btnPlay");
const playIcon = document.getElementById("playIcon");

function playTick(now) {
  if (!playing) return;
  const st = playState;
  const target = st.dir === 1 ? 1 : 0;
  const span = Math.abs(target - st.from) || 1;
  const k = Math.min(1, ((now - st.t0) / 1900) * (1 / span));
  const eased = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k+2, 2)/2;
  setFold(st.from + (target - st.from) * eased);
  if (k >= 1) {
    st.dir = -st.dir;
    st.from = target;
    st.t0 = now;
  }
  playRaf = requestAnimationFrame(playTick);
}

function togglePlay() {
  playing = !playing;
  playBtn.classList.toggle("playing", playing);
  playIcon.innerHTML = playing
    ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>'
    : '<polygon points="5 3 19 12 5 21 5 3"/>';
  if (playing) {
    playState = { dir: fold >= 1 ? -1 : 1, t0: performance.now(), from: fold };
    playRaf = requestAnimationFrame(playTick);
  } else {
    cancelAnimationFrame(playRaf);
  }
}
playBtn.onclick = togglePlay;

// Seletor de Substratos
const subBtns = document.querySelectorAll(".sub-btn");
subBtns.forEach(btn => {
  btn.onclick = () => {
    subBtns.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    updateSubstrate(btn.dataset.sub);
  };
});

// Vistas Rápidas de Câmera
function viewFace(dir) {
  if (playing) togglePlay();
  autoRot = false;
  document.getElementById("btnAuto").classList.remove("active");

  pivot.quaternion.identity();
  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(world);
  if (!isFinite(box.min.x)) return;

  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(0, size.y / 2, 0);
  const vfov = camera.fov * Math.PI / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);

  if (dir === "iso") {
    camera.position.set(baseDist * 0.7, baseDist * 0.65, baseDist * 0.7);
    camera.up.set(0, 1, 0);
    controls.target.copy(center);
    controls.update();
    return;
  }

  const cfg = {
    front:  { axis: new THREE.Vector3(0, 0, 1),  w: size.x, h: size.y, up: new THREE.Vector3(0, 1, 0) },
    back:   { axis: new THREE.Vector3(0, 0, -1), w: size.x, h: size.y, up: new THREE.Vector3(0, 1, 0) },
    right:  { axis: new THREE.Vector3(1, 0, 0),  w: size.z, h: size.y, up: new THREE.Vector3(0, 1, 0) },
    left:   { axis: new THREE.Vector3(-1, 0, 0), w: size.z, h: size.y, up: new THREE.Vector3(0, 1, 0) },
    top:    { axis: new THREE.Vector3(0, 1, 0),  w: size.x, h: size.z, up: new THREE.Vector3(0, 0, -1) },
    bottom: { axis: new THREE.Vector3(0, -1, 0), w: size.x, h: size.z, up: new THREE.Vector3(0, 0, 1) },
  }[dir];

  const d = Math.max(cfg.h / 2 / Math.tan(vfov / 2), cfg.w / 2 / Math.tan(hfov / 2), 1) * 1.5;
  controls.target.copy(center);
  camera.up.copy(cfg.up);
  camera.position.copy(center).addScaledVector(cfg.axis, d);
  controls.update();
}

document.querySelectorAll(".cam-btn").forEach(b => {
  b.onclick = () => viewFace(b.dataset.face);
});

// Ações do Header
document.getElementById("btnResetRot").onclick = () => {
  pivot.quaternion.identity();
  viewFace("iso");
};

const btnAuto = document.getElementById("btnAuto");
btnAuto.onclick = () => {
  autoRot = !autoRot;
  btnAuto.classList.toggle("active", autoRot);
};

const btnWire = document.getElementById("btnWire");
btnWire.onclick = () => {
  isWireframe = !isWireframe;
  btnWire.classList.toggle("active", isWireframe);
  for (const bp of builtParts) {
    for (const pm of bp.partMaterials) {
      pm.frontMat.wireframe = isWireframe;
      pm.backMat.wireframe = isWireframe;
      pm.sideMat.wireframe = isWireframe;
    }
  }
};

// Snapshot / Foto HD
document.getElementById("btnSnap").onclick = () => {
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = (DATA.title || "embalagem-3d") + "-snapshot.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
};

// Tela Cheia
document.getElementById("btnFull").onclick = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
};

setFold(1.0);
</script>
</body>
</html>`;
}

/**
 * Utilitário de alto nível para exportar qualquer DielineResult do Primacor CAD
 * para um arquivo .html 3D independente para envio a clientes.
 */
export function downloadStandaloneHtml(
  dieline: {
    segments: Array<{ x0: number; y0: number; x1: number; y1: number; type: string }>;
    arcs?: Array<{ cx: number; cy: number; r: number; startAngle: number; endAngle: number; type: string }>;
    bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
  },
  modelName: string = "Embalagem-3D",
  thickness: number = 0.45
) {
  const segments: import("./dieline-types").Segment[] = [];
  const minX = dieline.bounds?.minX ?? 0;
  const minY = dieline.bounds?.minY ?? 0;

  for (const s of dieline.segments) {
    let kind: import("./dieline-types").Segment["kind"] = "cut";
    if (s.type === "crease") kind = "crease";
    else if (s.type === "perfo") kind = "perf";

    segments.push({
      kind,
      points: [
        { x: s.x0 - minX, y: s.y0 - minY },
        { x: s.x1 - minX, y: s.y1 - minY },
      ],
      closed: false,
    });
  }

  if (dieline.arcs && dieline.arcs.length > 0) {
    for (const arc of dieline.arcs) {
      let kind: import("./dieline-types").Segment["kind"] = "cut";
      if (arc.type === "crease") kind = "crease";
      else if (arc.type === "perfo") kind = "perf";

      const SAMPLES = 16;
      const pts: { x: number; y: number }[] = [];
      let start = arc.startAngle;
      let end = arc.endAngle;
      if (end < start) end += Math.PI * 2;
      const step = (end - start) / SAMPLES;

      for (let i = 0; i <= SAMPLES; i++) {
        const theta = start + i * step;
        pts.push({
          x: arc.cx + arc.r * Math.cos(theta) - minX,
          y: arc.cy + arc.r * Math.sin(theta) - minY,
        });
      }
      segments.push({ kind, points: pts, closed: false });
    }
  }

  const part: ExportPart = {
    id: "part_main",
    name: modelName,
    dieline: {
      width: Math.max(dieline.bounds?.width ?? 100, 10),
      height: Math.max(dieline.bounds?.height ?? 100, 10),
      segments,
      panels: [],
      meta: {
        fefco: modelName,
        name: modelName,
        params: {
          L: dieline.bounds?.width ?? 100,
          H: dieline.bounds?.height ?? 100,
          P: 50,
          thickness,
          glueTab: 15,
          bleed: 3,
        },
      },
    },
    art: null,
    foldAngles: {},
    selectedPanels: [],
    thickness,
    pose: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  };

  const html = exportViewerHtml({
    parts: [part],
    showArt: true,
    title: modelName,
  });

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = modelName.replace(/[^a-zA-Z0-9_\-\u00C0-\u00FF]/g, "_");
  a.download = `${safeName}_3D.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

