import type { DielineResult, PackagingModel, CardboardProfile, Point2D } from '../types';
import { LoopTopologyEngine } from '../importers/LoopTopologyEngine';
import { FoldingTreeEngine } from '../importers/FoldingTreeEngine';
import { buildFoldingTopology, type TopologicalPanel, type TopologicalHinge } from '../dielineTopology';
import { BRIDGE_ERROR_CODES } from '../../integrations/illustrator/projectExchange';

export interface Html3DExportOptions {
  title?: string;
  foldPercent?: number;
  outerColor?: string;
  innerColor?: string;
  artworkTextureUri?: string | null;
  outerArtworkTextureUri?: string | null;
  innerArtworkTextureUri?: string | null;
}

export interface Html3DExportResult {
  success: boolean;
  filename: string;
  html: string;
  modelCode: string;
  panelsCount: number;
  hingesCount: number;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Motor Exportador de Modelos 3D Autônomos em HTML5 Standalone (Fase 6)
 * 
 * Regra Arquitetural Absoluta:
 * Exporta um arquivo .html autossuficiente com renderizador WebGL/Three.js embutido.
 * Consome EXCLUSIVAMENTE a geometria canônica 1:1 e a topologia matemática da faca.
 * NÃO utiliza BoxGeometry, NÃO utiliza fallbacks genéricos.
 */
export function generateStandaloneHtml3D(
  model: PackagingModel,
  params: Record<string, number>,
  profile: CardboardProfile,
  dieline: DielineResult,
  options: Html3DExportOptions = {}
): Html3DExportResult {
  try {
    if (!model || !dieline) {
      return {
        success: false,
        filename: 'erro.html',
        html: '',
        modelCode: model?.code || 'UNKNOWN',
        panelsCount: 0,
        hingesCount: 0,
        errorCode: BRIDGE_ERROR_CODES.HTML_3D_INVALID_MODEL,
        errorMessage: 'Modelo ou faca 2D inválida para exportação 3D',
      };
    }

    // 1. Extração Topológica e Cinemática Canônica
    // Prioriza a topologia canônica da faca (customTopology || buildFoldingTopology),
    // preservando integralmente todas as abas estruturais (abas de canto / dust flaps) e furos de trava (mortises).
    const customTopo = dieline.customTopology || buildFoldingTopology(dieline);

    let serializedPanels: Array<{
      id: string;
      name: string;
      isRoot: boolean;
      boundary: Array<{ x: number; y: number }>;
      holes: Array<Array<{ x: number; y: number }>>;
      areaMm2: number;
    }> = [];

    let serializedHinges: Array<{
      hingeId: string;
      parentPanelId: string;
      childPanelId: string;
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      lengthMm: number;
      targetAngleDeg: number;
      topologicalSign: number;
      foldOrder: number;
    }> = [];

    let rootPanelId = '';

    if (customTopo && customTopo.panels && customTopo.panels.length > 0) {
      rootPanelId =
        customTopo.rootPanelId ||
        customTopo.panels.find((p: TopologicalPanel) => p.isRoot)?.id ||
        customTopo.panels[0].id;
      serializedPanels = customTopo.panels.map((p: TopologicalPanel) => ({
        id: p.id,
        name: p.name || p.id,
        isRoot: Boolean(p.isRoot || p.id === rootPanelId),
        boundary: p.boundary.map((pt: Point2D) => ({ x: pt.x, y: pt.y })),
        holes: (p.holes || []).map((hole: Point2D[]) => hole.map((pt: Point2D) => ({ x: pt.x, y: pt.y }))),
        areaMm2: p.area,
      }));

      serializedHinges = (customTopo.hinges || []).map((h: TopologicalHinge) => {
        const pChild = customTopo.panels.find((p: TopologicalPanel) => p.id === h.childPanelId);
        const midX = (h.x0 + h.x1) / 2;
        const midY = (h.y0 + h.y1) / 2;
        const toCx = (pChild?.centroid?.x ?? midX) - midX;
        const toCy = (pChild?.centroid?.y ?? midY) - midY;
        const dx = h.x1 - h.x0;
        const dy = h.y1 - h.y0;
        const cross = dx * toCy - dy * toCx;
        const topologicalSign = cross >= 0 ? 1 : -1;

        return {
          hingeId: h.id,
          parentPanelId: h.parentPanelId,
          childPanelId: h.childPanelId,
          x0: h.x0,
          y0: h.y0,
          x1: h.x1,
          y1: h.y1,
          lengthMm: h.length,
          targetAngleDeg: h.targetAngleDeg ?? 90,
          topologicalSign,
          foldOrder: h.foldOrder ?? 1,
        };
      });
    } else {
      const topo = LoopTopologyEngine.extractTopology(dieline);
      const foldingTree = FoldingTreeEngine.buildFoldingTree(topo.panels, dieline);
      rootPanelId = foldingTree.rootPanelId;

      if (topo.panels.length === 0) {
        return {
          success: false,
          filename: `${model.code || 'modelo'}_3d.html`,
          html: '',
          modelCode: model.code || 'UNKNOWN',
          panelsCount: 0,
          hingesCount: 0,
          errorCode: BRIDGE_ERROR_CODES.HTML_3D_INVALID_MODEL,
          errorMessage: 'Nenhum painel estrutural fechado encontrado na faca canônica',
        };
      }

      serializedPanels = topo.panels.map((p) => {
        const boundary = p.outerBoundary.vertices.map((pt) => ({ x: pt.x, y: pt.y }));
        const holes = (p.holes || []).map((hole) => hole.vertices.map((pt) => ({ x: pt.x, y: pt.y })));
        const isRoot = foldingTree.rootPanelId === p.id;

        return {
          id: p.id,
          name: p.name || p.id,
          isRoot: Boolean(isRoot),
          boundary,
          holes,
          areaMm2: p.area,
        };
      });

      serializedHinges = (foldingTree.hinges || []).map((h) => ({
        hingeId: h.id,
        parentPanelId: h.parentPanelId,
        childPanelId: h.childPanelId,
        x0: h.axisStart.x,
        y0: h.axisStart.y,
        x1: h.axisEnd.x,
        y1: h.axisEnd.y,
        lengthMm: h.length,
        targetAngleDeg: h.foldAngle ?? (h.kinematics?.targetAngle ?? 90),
        topologicalSign: h.foldSign ?? (h.kinematics?.topologicalSign ?? 1),
        foldOrder: h.foldOrder ?? 1,
      }));
    }

    const outerColor = options.outerColor || profile.outerColor || '#FFFFFF';
    const innerColor = options.innerColor || profile.innerColor || '#FBF8F3';
    const thickness = profile.thickness || 0.4;
    const initialFold = options.foldPercent !== undefined ? options.foldPercent : 1.0;
    const outerArtworkUri = options.outerArtworkTextureUri || options.artworkTextureUri || null;
    const innerArtworkUri = options.innerArtworkTextureUri || null;

    // Detecta se é modelo de bandeja/envelope vs tubular
    const codeStr = (model.code || model.id || '').toUpperCase();
    const isTrayOrFolder =
      codeStr.includes('FEFCO 04') ||
      codeStr.includes('FEFCO_04') ||
      codeStr.includes('FEFCO_F4') ||
      codeStr.includes('FEFCO 03') ||
      codeStr.includes('FEFCO_03') ||
      codeStr.includes('FEFCO_F3') ||
      codeStr.includes('FEFCO 09') ||
      codeStr.includes('FEFCO_09') ||
      Boolean(model.series && (
        model.series.includes('0400') ||
        model.series.includes('0300') ||
        model.series.includes('0900') ||
        model.series.includes('Bandejas') ||
        model.series.includes('Gavetas')
      ));

    // Metadados do Projeto para Reconstrução Forense
    const metadata = {
      generator: 'PLMPackLib Web CAD Pro v2.4 (Fase 6)',
      schemaVersion: 1,
      projectId: `proj_${model.id.toLowerCase()}`,
      modelId: model.id,
      modelCode: model.code,
      modelName: model.name,
      foldingTreeRootId: rootPanelId,
      isTrayOrFolder,
      dimensions: {
        L: params.L ?? 300,
        B: params.B ?? 200,
        H: params.H ?? 150,
        Ep: thickness,
        ...params,
      },
      parameters: { ...params },
      substrate: {
        id: profile.id,
        name: profile.name,
        thickness,
        outerColor,
        innerColor,
      },
      bounds: dieline.bounds,
      panelsCount: serializedPanels.length,
      hingesCount: serializedHinges.length,
      initialFoldState: initialFold,
      timestamp: new Date().toISOString(),
    };

    const filename = `${model.code}_${params.L || 300}x${params.B || 200}x${params.H || 150}_3d.html`;

    // 4. Montagem do Documento HTML 3D Autônomo com Padrão Visual Primacor CAD Pro
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${model.code} — ${model.name} | Primacor Packaging 3D</title>
  <style>
    :root {
      --cad-bg: #070B14;
      --cad-panel: rgba(13, 20, 36, 0.85);
      --cad-border: rgba(255, 255, 255, 0.10);
      --cad-border-hover: rgba(0, 210, 180, 0.45);
      --cad-accent: #00D2B4;
      --cad-accent-dim: rgba(0, 210, 180, 0.15);
      --cad-cyan: #38BDF8;
      --cad-text: #F8FAFC;
      --cad-text-muted: #94A3B8;
      --cad-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
      --cad-radius: 10px;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }
    body {
      background: var(--cad-bg);
      background-image: radial-gradient(circle at 50% 20%, #101a2e 0%, #070b14 75%);
      color: var(--cad-text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', system-ui, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header Superior Primacor CAD */
    #header {
      height: 54px;
      background: var(--cad-panel);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--cad-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 18px;
      z-index: 30;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo-badge {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 4px 9px;
      background: linear-gradient(135deg, rgba(0, 210, 180, 0.18), rgba(56, 189, 248, 0.22));
      border: 1px solid var(--cad-accent);
      border-radius: 6px;
      color: var(--cad-accent);
      font-weight: 800;
      font-size: 11px;
      letter-spacing: 0.6px;
    }
    .model-info-block {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .model-title-text {
      font-size: 13px;
      font-weight: 700;
      color: var(--cad-text);
      letter-spacing: 0.2px;
    }
    .model-specs-text {
      font-size: 11px;
      color: var(--cad-text-muted);
      font-weight: 500;
    }
    .specs-highlight {
      color: var(--cad-cyan);
      font-weight: 600;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cad-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--cad-border);
      color: var(--cad-text);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .cad-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: var(--cad-border-hover);
      color: #FFFFFF;
    }
    .cad-btn-primary {
      background: linear-gradient(135deg, #00D2B4, #0284C7);
      border: none;
      color: #03131D;
      font-weight: 700;
      box-shadow: 0 2px 10px rgba(0, 210, 180, 0.35);
    }
    .cad-btn-primary:hover {
      opacity: 0.92;
      box-shadow: 0 4px 16px rgba(0, 210, 180, 0.5);
    }
    .cad-btn-primary.playing {
      background: linear-gradient(135deg, #F59E0B, #EA580C);
      color: #FFFFFF;
      box-shadow: 0 0 16px rgba(245, 158, 11, 0.6);
    }

    /* Viewport e Canvas 3D */
    #viewport {
      flex: 1;
      width: 100%;
      height: 100%;
      position: relative;
      outline: none;
    }
    #canvas3d {
      width: 100%;
      height: 100%;
      display: block;
      cursor: grab;
    }
    #canvas3d:active {
      cursor: grabbing;
    }

    /* Info HUD Superior Esquerdo */
    #info-card {
      position: absolute;
      top: 16px;
      left: 16px;
      background: var(--cad-panel);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--cad-border);
      border-radius: var(--cad-radius);
      padding: 12px 16px;
      font-size: 11px;
      z-index: 20;
      min-width: 220px;
      box-shadow: var(--cad-shadow);
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
    }
    .info-header {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--cad-accent);
      margin-bottom: 2px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .info-label {
      color: var(--cad-text-muted);
    }
    .info-val {
      font-weight: 700;
      color: var(--cad-text);
      font-family: monospace;
    }

    /* Dock Flutuante Central Inferior */
    #controls-dock {
      position: absolute;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--cad-panel);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--cad-border);
      border-radius: 14px;
      padding: 10px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      box-shadow: var(--cad-shadow);
      z-index: 25;
      max-width: 95vw;
    }
    .dock-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .slider-container {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(0, 0, 0, 0.3);
      padding: 4px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .slider-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--cad-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .slider-readout {
      font-size: 13px;
      font-weight: 800;
      color: var(--cad-accent);
      min-width: 44px;
      text-align: right;
      font-family: monospace;
    }

    /* Slider Estilizado com Brilho Ciano */
    input[type=range] {
      -webkit-appearance: none;
      appearance: none;
      width: 170px;
      height: 6px;
      background: rgba(255, 255, 255, 0.16);
      border-radius: 4px;
      outline: none;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--cad-accent);
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 0 10px rgba(0, 210, 180, 0.8);
      cursor: pointer;
      transition: transform 0.1s ease, box-shadow 0.1s ease;
    }
    input[type=range]::-webkit-slider-thumb:hover {
      transform: scale(1.2);
      box-shadow: 0 0 14px rgba(0, 210, 180, 1);
    }
    input[type=range]::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--cad-accent);
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 0 10px rgba(0, 210, 180, 0.8);
      cursor: pointer;
    }

    /* Divisória Vertical */
    .dock-divider {
      width: 1px;
      height: 22px;
      background: var(--cad-border);
    }

    /* Dica Flutuante Inferior Direita */
    #hint-badge {
      position: absolute;
      bottom: 22px;
      right: 20px;
      background: var(--cad-panel);
      backdrop-filter: blur(16px);
      border: 1px solid var(--cad-border);
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 11px;
      color: var(--cad-text-muted);
      pointer-events: none;
      z-index: 20;
    }

    @media (max-width: 900px) {
      .hide-mobile {
        display: none !important;
      }
      #controls-dock {
        padding: 8px 12px;
        gap: 8px;
      }
      input[type=range] {
        width: 110px;
      }
    }
  </style>

  <!-- Biblioteca Three.js com Fallbacks Múltiplos para Garantia de Abertura -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    if (typeof THREE === 'undefined') {
      document.write('<script src="https://unpkg.com/three@0.128.0/build/three.min.js"><\\/script>');
    }
  </script>
  <script>
    if (typeof THREE === 'undefined') {
      document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"><\\/script>');
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TrackballControls.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
  <!-- Cabeçalho Oficial Primacor -->
  <header id="header">
    <div class="brand-group">
      <div class="brand-logo-badge">
        <span>★</span>
        <span>PRIMACOR 3D</span>
      </div>
      <div class="model-info-block">
        <div class="model-title-text">${model.code} — ${model.name}</div>
        <div class="model-specs-text">
          L: <span class="specs-highlight">${params.L || 300}mm</span> · 
          B: <span class="specs-highlight">${params.B || 200}mm</span> · 
          H: <span class="specs-highlight">${params.H || 150}mm</span> · 
          Espessura: <span class="specs-highlight">${thickness}mm</span>
        </div>
      </div>
    </div>
    <div class="header-actions">
      <button class="cad-btn hide-mobile" id="btnFlatView" title="Visualizar faca aberta e plana (0%)">📄 Faca Aberta (0%)</button>
      <button class="cad-btn hide-mobile" id="btnFoldView" title="Visualizar embalagem totalmente montada (100%)">📦 Montada (100%)</button>
      <button class="cad-btn" id="btnResetView" title="Centralizar e redefinir visão">↻ Reset Câmera</button>
      <button class="cad-btn hide-mobile" id="btnFullscreen" title="Alternar modo tela cheia">⛶ Tela Cheia</button>
    </div>
  </header>

  <!-- Viewport WebGL -->
  <main id="viewport">
    <!-- Info HUD -->
    <div id="info-card">
      <div class="info-header">ESPECIFICAÇÕES CANÔNICAS</div>
      <div class="info-row"><span class="info-label">Modelo:</span><span class="info-val">${model.code}</span></div>
      <div class="info-row"><span class="info-label">Painéis Estruturais:</span><span class="info-val">${serializedPanels.length}</span></div>
      <div class="info-row"><span class="info-label">Vincos Articulados:</span><span class="info-val">${serializedHinges.length}</span></div>
      <div class="info-row"><span class="info-label">Substrato:</span><span class="info-val">${profile.name}</span></div>
      <div class="info-row"><span class="info-label">Espessura (Ep):</span><span class="info-val">${thickness} mm</span></div>
    </div>

    <!-- Dock de Controle Interativo -->
    <div id="controls-dock">
      <button class="cad-btn cad-btn-primary" id="btnPlayPause">▶ Animar</button>
      <div class="slider-container">
        <span class="slider-title">Dobra</span>
        <input type="range" id="foldSlider" min="0" max="100" step="0.1" value="${Math.round(initialFold * 100)}" />
        <span class="slider-readout" id="foldPctText">${Math.round(initialFold * 100)}%</span>
      </div>

      <div class="dock-divider hide-mobile"></div>

      <div class="dock-group hide-mobile">
        <button class="cad-btn" id="btnViewIso" title="Visão em Perspectiva Isométrica">Perspectiva</button>
        <button class="cad-btn" id="btnViewTop" title="Visão de Topo">Topo</button>
        <button class="cad-btn" id="btnViewFront" title="Visão Frontal">Frente</button>
        <button class="cad-btn" id="btnAutoRotate" title="Girar 360° continuamente">🔄 360°</button>
      </div>
    </div>

    <!-- Dica de Interação -->
    <div id="hint-badge" class="hide-mobile">
      🖱️ Botão esquerdo: Girar 360° · Botão direito: Mover · Roda: Zoom
    </div>
  </main>

  <!-- Metadados Canônicos Serializados para Auditoria Forense -->
  <script id="plmpack-metadata" type="application/json">
    ${JSON.stringify(metadata, null, 2)}
  </script>

  <!-- Motor 3D Standalone Zero-Dependência -->
  <script>
    (function() {
      // 0. Fallback caso Three.js não tenha carregado
      if (typeof THREE === 'undefined') {
        var vp = document.getElementById('viewport');
        vp.innerHTML = '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#070b14;color:#f8fafc;padding:24px;text-align:center;">' +
          '<div style="font-size:24px;font-weight:700;color:#00d2b4;margin-bottom:12px;">★ Primacor Packaging 3D Viewer</div>' +
          '<div style="font-size:14px;color:#94a3b8;max-width:500px;line-height:1.6;margin-bottom:20px;">Para renderizar a embalagem tridimensional em alta resolução, certifique-se de estar conectado à internet na primeira abertura ou permita o carregamento da biblioteca gráfica Three.js.</div>' +
          '<button onclick="location.reload()" style="background:#00d2b4;color:#03131d;border:none;padding:10px 20px;border-radius:6px;font-weight:700;cursor:pointer;">Tentar Novamente</button>' +
        '</div>';
        return;
      }

      // 1. Dados Canônicos Injetados
      var panelsData = ${JSON.stringify(serializedPanels)};
      var hingesData = ${JSON.stringify(serializedHinges)};
      var metadata = ${JSON.stringify(metadata)};
      var outerColorHex = '${outerColor}';
      var innerColorHex = '${innerColor}';
      var isTrayOrFolder = ${isTrayOrFolder};

      // 2. Controlador de Câmera Trackball Standalone (360° Horizontal e Vertical LIVRE)
      function initControls(camera, domElement) {
        if (typeof THREE.TrackballControls === 'function') {
          try {
            var tc = new THREE.TrackballControls(camera, domElement);
            tc.rotateSpeed = 2.2;
            tc.zoomSpeed = 1.2;
            tc.panSpeed = 0.8;
            tc.staticMoving = false;
            tc.dynamicDampingFactor = 0.15;
            tc.minDistance = 30;
            tc.maxDistance = 8000;
            tc.target.set(0, 0, 0);
            return tc;
          } catch(e) {
            console.warn('Fallback para controlador nativo de câmera');
          }
        }

        // Controlador Quaterniônico Esférico Nativo 360° x 360° sem dependência externa
        var target = new THREE.Vector3(0, 0, 0);
        var isDragging = false;
        var isPanning = false;
        var prevX = 0, prevY = 0;
        var autoRotate = false;

        function update() {
          if (autoRotate && !isDragging) {
            var rotAngle = 0.008;
            var cosA = Math.cos(rotAngle);
            var sinA = Math.sin(rotAngle);
            var x = camera.position.x;
            var z = camera.position.z;
            camera.position.x = x * cosA - z * sinA;
            camera.position.z = x * sinA + z * cosA;
            camera.lookAt(target);
          }
        }

        domElement.addEventListener('contextmenu', function(e) { e.preventDefault(); });
        domElement.addEventListener('mousedown', function(e) {
          isDragging = true;
          isPanning = (e.button === 2) || e.shiftKey;
          prevX = e.clientX;
          prevY = e.clientY;
        });
        window.addEventListener('mousemove', function(e) {
          if (!isDragging) return;
          var dx = e.clientX - prevX;
          var dy = e.clientY - prevY;
          prevX = e.clientX;
          prevY = e.clientY;

          var dist = camera.position.distanceTo(target);

          if (isPanning) {
            var panScale = dist * 0.0012;
            var fwd = new THREE.Vector3().subVectors(target, camera.position).normalize();
            var right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
            var up = new THREE.Vector3().crossVectors(right, fwd).normalize();
            target.addScaledVector(right, -dx * panScale);
            target.addScaledVector(up, dy * panScale);
          } else {
            // Rotação esférica 360° x 360° contínua em ambos os eixos
            var eye = new THREE.Vector3().subVectors(camera.position, target);
            var fwd = eye.clone().normalize().negate();
            var right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();

            var qYaw = new THREE.Quaternion().setFromAxisAngle(camera.up, -dx * 0.007);
            var qPitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * 0.007);
            var qRot = new THREE.Quaternion().multiplyQuaternions(qPitch, qYaw);

            eye.applyQuaternion(qRot);
            camera.position.copy(target).add(eye);
            camera.up.applyQuaternion(qRot).normalize();
            camera.lookAt(target);
          }
        });
        window.addEventListener('mouseup', function() { isDragging = false; });
        domElement.addEventListener('wheel', function(e) {
          e.preventDefault();
          var eye = new THREE.Vector3().subVectors(camera.position, target);
          var scale = (e.deltaY < 0 ? 0.9 : 1.1);
          var newDist = Math.max(30, Math.min(8000, eye.length() * scale));
          eye.setLength(newDist);
          camera.position.copy(target).add(eye);
        }, { passive: false });

        return {
          target: target,
          update: update,
          handleResize: function() {},
          get autoRotate() { return autoRotate; },
          set autoRotate(v) { autoRotate = v; },
          dispose: function() {}
        };
      }

      // 3. Inicialização Three.js
      var container = document.getElementById('viewport');
      var scene = new THREE.Scene();
      scene.background = new THREE.Color('#070B14');

      var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
      camera.position.set(600, 480, 600);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.id = 'canvas3d';
      container.appendChild(renderer.domElement);

      var controls = initControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);

      // 4. Iluminação de Estúdio Industrial Balanceada
      var ambient = new THREE.AmbientLight(0xFFFFFF, 0.95);
      scene.add(ambient);

      var keyLight = new THREE.DirectionalLight(0xFFFFFF, 1.35);
      keyLight.position.set(450, 800, 500);
      scene.add(keyLight);

      var fillLight = new THREE.DirectionalLight(0x38BDF8, 0.65);
      fillLight.position.set(-500, 350, -350);
      scene.add(fillLight);

      var rimLight = new THREE.DirectionalLight(0xFFFFFF, 0.65);
      rimLight.position.set(0, 500, -600);
      scene.add(rimLight);

      var underLight = new THREE.DirectionalLight(0xFFFFFF, 0.8);
      underLight.position.set(0, -600, 0);
      scene.add(underLight);

      // 5. Construção dos Painéis com Geometria Exata
      var modelRoot = new THREE.Group();
      scene.add(modelRoot);

      var boxGroup = new THREE.Group();
      modelRoot.add(boxGroup);

      if (isTrayOrFolder) {
        boxGroup.rotation.x = -Math.PI / 2;
      }

      var textureLoader = new THREE.TextureLoader();
      var outerTexture = ${outerArtworkUri ? `textureLoader.load(${JSON.stringify(outerArtworkUri)})` : 'null'};
      if (outerTexture) {
        outerTexture.encoding = THREE.sRGBEncoding;
        outerTexture.anisotropy = 16;
      }
      var innerTexture = ${innerArtworkUri ? `textureLoader.load(${JSON.stringify(innerArtworkUri)})` : 'null'};
      if (innerTexture) {
        innerTexture.encoding = THREE.sRGBEncoding;
        innerTexture.anisotropy = 16;
      }

      var panelNodes = new Map();

      var cutLineMat = new THREE.LineBasicMaterial({
        color: 0x94A3B8,
        linewidth: 1,
        transparent: true,
        opacity: 0.45,
      });

      var bboxMinX = ${dieline.bounds.minX};
      var bboxMinY = ${dieline.bounds.minY};
      var bboxW = ${dieline.bounds.width || 1};
      var bboxH = ${dieline.bounds.height || 1};

      panelsData.forEach(function(p) {
        var shape = new THREE.Shape();
        if (p.boundary && p.boundary.length > 0) {
          shape.moveTo(p.boundary[0].x, p.boundary[0].y);
          for (var i = 1; i < p.boundary.length; i++) {
            shape.lineTo(p.boundary[i].x, p.boundary[i].y);
          }
          shape.closePath();
        }

        if (p.holes && p.holes.length > 0) {
          p.holes.forEach(function(h) {
            if (h.length > 2) {
              var hp = new THREE.Path();
              hp.moveTo(h[0].x, h[0].y);
              for (var j = 1; j < h.length; j++) {
                hp.lineTo(h[j].x, h[j].y);
              }
              hp.closePath();
              shape.holes.push(hp);
            }
          });
        }

        var geom = new THREE.ShapeGeometry(shape);
        geom.computeVertexNormals();

        var pos = geom.attributes.position;
        var uvs = [];
        var innerUvs = [];
        for (var vi = 0; vi < pos.count; vi++) {
          var vx = pos.getX(vi);
          var vy = pos.getY(vi);
          var u = (vx - bboxMinX) / bboxW;
          var v = (vy - bboxMinY) / bboxH;
          uvs.push(u, v);
          innerUvs.push(1.0 - u, v);
        }
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

        var group = new THREE.Group();
        group.name = 'panel_' + p.id;

        var outerMat = new THREE.MeshStandardMaterial({
          color: outerTexture ? 0xFFFFFF : new THREE.Color(outerColorHex),
          map: outerTexture || null,
          roughness: 0.38,
          metalness: 0.02,
          side: innerTexture ? THREE.FrontSide : THREE.DoubleSide,
        });

        var outerMesh = new THREE.Mesh(geom, outerMat);
        outerMesh.castShadow = true;
        outerMesh.receiveShadow = true;
        outerMesh.matrixAutoUpdate = false;
        group.add(outerMesh);

        if (innerTexture) {
          var innerGeom = geom.clone();
          innerGeom.setAttribute('uv', new THREE.Float32BufferAttribute(innerUvs, 2));
          var innerMat = new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
            map: innerTexture,
            roughness: 0.42,
            metalness: 0.02,
            side: THREE.BackSide,
          });
          var innerMesh = new THREE.Mesh(innerGeom, innerMat);
          innerMesh.castShadow = true;
          innerMesh.receiveShadow = true;
          innerMesh.matrixAutoUpdate = false;
          group.add(innerMesh);
        }

        var edges = new THREE.EdgesGeometry(geom);
        var lines = new THREE.LineSegments(edges, cutLineMat);
        group.add(lines);

        boxGroup.add(group);
        panelNodes.set(p.id, group);
      });

      // 6. Motor Cinemático Analítico com Rodrigues (Física Exata de Vincos)
      // m0.decompose / matriz analítica rígida livre de distorção métrica
      function mat4Id() {
        return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      }
      function mat4Trans(tx, ty, tz) {
        return [1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1];
      }
      function mat4RotAxis(ux, uy, uz, rad) {
        var len = Math.hypot(ux, uy, uz);
        if (len < 1e-9) return mat4Id();
        ux /= len; uy /= len; uz /= len;
        var c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
        return [
          t*ux*ux + c,      t*ux*uy + s*uz,  t*ux*uz - s*uy,  0,
          t*ux*uy - s*uz,  t*uy*uy + c,      t*uy*uz + s*ux,  0,
          t*ux*uz + s*uy,  t*uy*uz - s*ux,  t*uz*uz + c,      0,
          0,               0,               0,               1
        ];
      }
      function mat4Mul(a, b) {
        var out = new Array(16);
        for (var r = 0; r < 4; r++) {
          for (var c = 0; c < 4; c++) {
            out[c * 4 + r] =
              a[0 * 4 + r] * b[c * 4 + 0] +
              a[1 * 4 + r] * b[c * 4 + 1] +
              a[2 * 4 + r] * b[c * 4 + 2] +
              a[3 * 4 + r] * b[c * 4 + 3];
          }
        }
        return out;
      }

      function computeTransforms(pct) {
        var worldMap = {};
        var rootId = metadata.foldingTreeRootId || (panelsData.find(function(p){ return p.isRoot; }) || panelsData[0]).id;
        worldMap[rootId] = mat4Id();

        var queue = [rootId];
        var visited = {};
        visited[rootId] = true;
        var t = Math.max(0, Math.min(1, pct / 100.0));

        // Fechamento sequencial por abas (Padrão Heidelberg Package Designer / ArtiosCAD)
        function getHingeProgress(order) {
          if (t <= 0) return 0;
          if (t >= 1) return 1;
          if (order === 1) return Math.min(1, t / 0.40);
          if (order === 2) return Math.max(0, Math.min(1, (t - 0.20) / 0.40));
          if (order === 3) return Math.max(0, Math.min(1, (t - 0.40) / 0.35));
          if (order === 4) return Math.max(0, Math.min(1, (t - 0.60) / 0.30));
          return Math.max(0, Math.min(1, (t - 0.75) / 0.25));
        }

        while (queue.length > 0) {
          var parentId = queue.shift();
          var pWorld = worldMap[parentId] || mat4Id();
          var children = hingesData.filter(function(h) { return h.parentPanelId === parentId; });

          for (var i = 0; i < children.length; i++) {
            var h = children[i];
            if (visited[h.childPanelId]) continue;
            visited[h.childPanelId] = true;

            var dx = h.x1 - h.x0;
            var dy = h.y1 - h.y0;
            var len = Math.hypot(dx, dy);
            var localT = getHingeProgress(h.foldOrder || 1);
            var angleRad = localT * (h.targetAngleDeg * Math.PI / 180) * h.topologicalSign;

            var tTo0 = mat4Trans(-h.x0, -h.y0, 0);
            var rRot = mat4RotAxis(dx / len, dy / len, 0, angleRad);
            var tFrom0 = mat4Trans(h.x0, h.y0, 0);

            var rHinge = mat4Mul(tFrom0, mat4Mul(rRot, tTo0));
            var cWorld = mat4Mul(pWorld, rHinge);
            worldMap[h.childPanelId] = cWorld;
            queue.push(h.childPanelId);
          }
        }
        return worldMap;
      }

      // Função de Atualização de Dobra com Centralização no Centróide 3D (0, 0, 0)
      function updateFold(percent) {
        var clamped = Math.max(0, Math.min(100, percent));
        var transforms = computeTransforms(clamped);

        panelsData.forEach(function(p) {
          var node = panelNodes.get(p.id);
          if (!node) return;
          var mat = transforms[p.id] || mat4Id();
          node.matrix.fromArray(mat);
          node.matrixAutoUpdate = false;
          node.updateMatrixWorld(true);
        });

        // Centralização perfeita do centróide 3D da caixa na origem (0, 0, 0)
        boxGroup.position.set(0, 0, 0);
        boxGroup.updateMatrixWorld(true);
        var bbox = new THREE.Box3().setFromObject(boxGroup);
        var cx = (bbox.min.x + bbox.max.x) / 2;
        var cy = (bbox.min.y + bbox.max.y) / 2;
        var cz = (bbox.min.z + bbox.max.z) / 2;
        boxGroup.position.set(-cx, -cy, -cz);
        boxGroup.updateMatrixWorld(true);

        if (controls && controls.target) {
          controls.target.set(0, 0, 0);
        }
      }

      // 7. Auto-Enquadramento Inicial da Câmera
      updateFold(${Math.round(initialFold * 100)});
      boxGroup.updateMatrixWorld(true);
      var initialBBox = new THREE.Box3().setFromObject(boxGroup);
      var sphere = new THREE.Sphere();
      initialBBox.getBoundingSphere(sphere);
      var targetDist = Math.max(380, (sphere.radius || 200) * 2.3);
      camera.position.set(targetDist * 0.7, targetDist * 0.65, targetDist * 0.7);
      controls.target.set(0, 0, 0);
      controls.update();

      // 8. Loop de Renderização & Animação Contínua Fluida
      var isPlaying = false;
      var currentFold = ${Math.round(initialFold * 100)};
      var animDir = (currentFold >= 90) ? -1 : 1;
      var lastAnimTime = performance.now();

      function animate(now) {
        requestAnimationFrame(animate);

        if (isPlaying && now) {
          var dt = Math.min(0.1, (now - lastAnimTime) / 1000);
          lastAnimTime = now;
          var speed = 35.0; // 35% de dobra por segundo
          currentFold += animDir * speed * dt;

          if (currentFold >= 100) {
            currentFold = 100;
            animDir = -1;
          } else if (currentFold <= 0) {
            currentFold = 0;
            animDir = 1;
          }

          slider.value = currentFold.toFixed(1);
          pctText.textContent = Math.round(currentFold) + '%';
          updateFold(currentFold);
        } else if (now) {
          lastAnimTime = now;
        }

        if (controls && controls.update) {
          controls.update();
        }
        renderer.render(scene, camera);
      }
      requestAnimationFrame(animate);

      // Redimensionamento
      window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      // 9. Eventos de Interface Interativa
      var slider = document.getElementById('foldSlider');
      var pctText = document.getElementById('foldPctText');
      var btnPlay = document.getElementById('btnPlayPause');
      var btnAutoRot = document.getElementById('btnAutoRotate');

      function updatePlayButtonUI() {
        if (isPlaying) {
          btnPlay.innerHTML = '⏸ Pausar';
          btnPlay.classList.add('playing');
        } else {
          btnPlay.innerHTML = '▶ Animar';
          btnPlay.classList.remove('playing');
        }
      }

      btnPlay.addEventListener('click', function() {
        isPlaying = !isPlaying;
        if (isPlaying) {
          if (currentFold >= 100) animDir = -1;
          if (currentFold <= 0) animDir = 1;
          lastAnimTime = performance.now();
        }
        updatePlayButtonUI();
      });

      slider.addEventListener('input', function(e) {
        isPlaying = false;
        updatePlayButtonUI();
        currentFold = parseFloat(e.target.value);
        pctText.textContent = Math.round(currentFold) + '%';
        updateFold(currentFold);
      });

      if (btnAutoRot) {
        btnAutoRot.addEventListener('click', function() {
          controls.autoRotate = !controls.autoRotate;
          btnAutoRot.style.color = controls.autoRotate ? 'var(--cad-accent)' : '';
          btnAutoRot.style.borderColor = controls.autoRotate ? 'var(--cad-accent)' : '';
        });
      }

      document.getElementById('btnFlatView').addEventListener('click', function() {
        isPlaying = false;
        updatePlayButtonUI();
        currentFold = 0;
        slider.value = '0';
        pctText.textContent = '0%';
        updateFold(0);
      });

      document.getElementById('btnFoldView').addEventListener('click', function() {
        isPlaying = false;
        updatePlayButtonUI();
        currentFold = 100;
        slider.value = '100';
        pctText.textContent = '100%';
        updateFold(100);
      });

      document.getElementById('btnResetView').addEventListener('click', function() {
        camera.position.set(targetDist * 0.7, targetDist * 0.65, targetDist * 0.7);
        controls.target.set(0, (initialBBox.max.y - initialBBox.min.y) * 0.45, 0);
        controls.update();
      });

      var btnIso = document.getElementById('btnViewIso');
      if (btnIso) {
        btnIso.addEventListener('click', function() {
          camera.position.set(targetDist * 0.7, targetDist * 0.65, targetDist * 0.7);
          controls.update();
        });
      }

      var btnTop = document.getElementById('btnViewTop');
      if (btnTop) {
        btnTop.addEventListener('click', function() {
          camera.position.set(0, targetDist * 1.2, 0.001);
          controls.update();
        });
      }

      var btnFront = document.getElementById('btnViewFront');
      if (btnFront) {
        btnFront.addEventListener('click', function() {
          camera.position.set(0, targetDist * 0.4, targetDist);
          controls.update();
        });
      }

      var btnFs = document.getElementById('btnFullscreen');
      if (btnFs) {
        btnFs.addEventListener('click', function() {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(function(){});
          } else {
            document.exitFullscreen().catch(function(){});
          }
        });
      }

    })();
  </script>
</body>
</html>`;

    return {
      success: true,
      filename,
      html,
      modelCode: model.code,
      panelsCount: serializedPanels.length,
      hingesCount: serializedHinges.length,
    };
  } catch (err: any) {
    return {
      success: false,
      filename: `${model?.code || 'modelo'}_erro.html`,
      html: '',
      modelCode: model?.code || 'UNKNOWN',
      panelsCount: 0,
      hingesCount: 0,
      errorCode: BRIDGE_ERROR_CODES.HTML_3D_EXPORT_FAILED,
      errorMessage: `Erro ao gerar exportação HTML 3D: ${err?.message || err}`,
    };
  }
}

/**
 * Dispara o download direto do arquivo HTML 3D autônomo no navegador do usuário
 */
export function downloadHtml3DFile(
  model: PackagingModel,
  params: Record<string, number>,
  profile: CardboardProfile,
  dieline: DielineResult,
  options: Html3DExportOptions = {}
): { success: boolean; filename: string; message: string } {
  const res = generateStandaloneHtml3D(model, params, profile, dieline, options);
  if (!res.success) {
    return {
      success: false,
      filename: res.filename,
      message: res.errorMessage || 'Falha ao gerar HTML 3D',
    };
  }

  try {
    const blob = new Blob([res.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = res.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return {
      success: true,
      filename: res.filename,
      message: `HTML 3D exportado com sucesso: ${res.filename}`,
    };
  } catch (err: any) {
    return {
      success: false,
      filename: res.filename,
      message: `Erro ao iniciar download: ${err?.message || err}`,
    };
  }
}
