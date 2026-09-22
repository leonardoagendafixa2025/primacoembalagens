import type { DielineResult, PackagingModel, CardboardProfile } from '../types';
import { LoopTopologyEngine } from '../importers/LoopTopologyEngine';
import { FoldingTreeEngine } from '../importers/FoldingTreeEngine';
import { Kinematic3DEngine } from '../importers/Kinematic3DEngine';
import { BRIDGE_ERROR_CODES } from '../../integrations/illustrator/projectExchange';

export interface Html3DExportOptions {
  title?: string;
  foldPercent?: number;
  outerColor?: string;
  innerColor?: string;
  artworkTextureUri?: string | null;
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
 * Exportador Oficial de HTML 3D Autônomo (Fase 6 — Seções 17 a 24)
 * Gera um arquivo HTML autossuficiente com Three.js real, OrbitControls e cinemática rígida.
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
    const topo = LoopTopologyEngine.extractTopology(dieline);
    const foldingTree = FoldingTreeEngine.buildFoldingTree(topo.panels, dieline);

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

    // Calcula cinemática canônica a 100% (foldPercent = 100) para registrar matrizes rígidas
    const kin100 = Kinematic3DEngine.computeFoldedState(topo.panels, foldingTree, 100);

    const outerColor = options.outerColor || profile.outerColor || '#FFFFFF';
    const innerColor = options.innerColor || profile.innerColor || '#F5F5F0';
    const thickness = profile.thickness || 0.6;
    const initialFold = options.foldPercent !== undefined ? options.foldPercent : 1.0;

    // 2. Serialização dos Painéis com Geometria Exata (Pontos e Furos)
    const serializedPanels = topo.panels.map((p) => {
      const boundary = p.outerBoundary.vertices.map((pt) => ({ x: pt.x, y: pt.y }));
      const holes = (p.holes || []).map((hole) => hole.vertices.map((pt) => ({ x: pt.x, y: pt.y })));
      const fp = kin100.panels.find((panel3d) => panel3d.sourcePanelId === p.id);
      const isRoot = fp ? fp.isRoot : foldingTree.rootPanelId === p.id;

      return {
        id: p.id,
        name: p.name || p.id,
        isRoot: Boolean(isRoot),
        boundary,
        holes,
        areaMm2: p.area,
        rigidTransform100: fp?.transform.elements || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      };
    });

    // 3. Serialização da Árvore de Dobra e Eixos de Hinge
    const serializedHinges = (foldingTree.hinges || []).map((h) => ({
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

    // Metadados do Projeto para Reconstrução Forense
    const metadata = {
      generator: 'PLMPackLib Web CAD Pro v2.4 (Fase 6)',
      schemaVersion: 1,
      projectId: `proj_${model.id.toLowerCase()}`,
      modelId: model.id,
      modelCode: model.code,
      modelName: model.name,
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

    // 4. Montagem do Documento HTML 3D Autônomo
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${model.code} — ${model.name} | PLMPackLib 3D Viewer</title>
  <style>
    :root {
      --bg-app: #0B0F17;
      --bg-panel: rgba(18, 24, 38, 0.88);
      --border-color: rgba(255, 255, 255, 0.12);
      --accent: #2563EB;
      --accent-hover: #1D4ED8;
      --text-main: #F1F5F9;
      --text-muted: #94A3B8;
      --success: #10B981;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
    }
    body {
      background: var(--bg-app);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #header {
      height: 52px;
      background: var(--bg-panel);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 20;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-badge {
      background: rgba(37, 99, 235, 0.2);
      border: 1px solid var(--accent);
      color: #60A5FA;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: 0.5px;
    }
    .model-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-main);
    }
    .model-subtitle {
      font-size: 11px;
      color: var(--text-muted);
    }
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
    }
    #controls-card {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-panel);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      z-index: 20;
      max-width: 90vw;
    }
    .slider-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .slider-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      min-width: 48px;
    }
    .slider-pct {
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
      min-width: 42px;
      text-align: right;
    }
    input[type=range] {
      -webkit-appearance: none;
      appearance: none;
      width: 160px;
      height: 6px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      outline: none;
      cursor: pointer;
    }
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--accent);
      border: 2px solid #FFFFFF;
      box-shadow: 0 0 8px rgba(37, 99, 235, 0.6);
      cursor: pointer;
      transition: transform 0.1s ease;
    }
    input[type=range]::-webkit-slider-thumb:hover {
      transform: scale(1.15);
    }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn:hover {
      background: rgba(255, 255, 255, 0.16);
      border-color: rgba(255, 255, 255, 0.25);
    }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent-hover);
      color: #FFFFFF;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    #info-card {
      position: absolute;
      top: 16px;
      left: 16px;
      background: var(--bg-panel);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 11px;
      line-height: 1.5;
      z-index: 10;
      max-width: 260px;
      pointer-events: none;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .info-label {
      color: var(--text-muted);
    }
    .info-val {
      font-weight: 600;
      color: var(--text-main);
    }
    @media (max-width: 768px) {
      #controls-card {
        padding: 8px 12px;
        gap: 8px;
        width: 95vw;
      }
      input[type=range] {
        width: 100px;
      }
      .hide-mobile {
        display: none !important;
      }
    }
  </style>

  <!-- Biblioteca Three.js e OrbitControls Oficiais via CDN -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
  <div id="header">
    <div class="brand-section">
      <span class="brand-badge">${model.code}</span>
      <div>
        <div class="model-title">${model.name}</div>
        <div class="model-subtitle">L: ${params.L || 300}mm · B: ${params.B || 200}mm · H: ${params.H || 150}mm · Esp: ${thickness}mm</div>
      </div>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="btn hide-mobile" id="btnFlatView">Faca Aberta (0%)</button>
      <button class="btn hide-mobile" id="btnFoldView">Montado (100%)</button>
      <button class="btn" id="btnResetView">Resetar Câmera</button>
    </div>
  </div>

  <div id="viewport">
    <div id="info-card">
      <div class="info-row"><span class="info-label">Painéis:</span><span class="info-val">${serializedPanels.length}</span></div>
      <div class="info-row"><span class="info-label">Vincos Articulados:</span><span class="info-val">${serializedHinges.length}</span></div>
      <div class="info-row"><span class="info-label">Substrato:</span><span class="info-val">${profile.name} (${thickness}mm)</span></div>
      <div class="info-row"><span class="info-label">Render:</span><span class="info-val">Cinemática Rígida 3D</span></div>
    </div>

    <div id="controls-card">
      <button class="btn btn-primary" id="btnPlayPause">▶ Animar</button>
      <div class="slider-group">
        <span class="slider-label">Dobra:</span>
        <input type="range" id="foldSlider" min="0" max="100" value="${Math.round(initialFold * 100)}" />
        <span class="slider-pct" id="foldPctText">${Math.round(initialFold * 100)}%</span>
      </div>
    </div>
  </div>

  <!-- Metadados Canônicos Serializados para Auditoria Forense -->
  <script id="plmpack-metadata" type="application/json">
    ${JSON.stringify(metadata, null, 2)}
  </script>

  <script>
    (function() {
      // 1. Dados Canônicos
      var panelsData = ${JSON.stringify(serializedPanels)};
      var hingesData = ${JSON.stringify(serializedHinges)};
      var outerColorHex = '${outerColor}';
      var innerColorHex = '${innerColor}';
      var cardboardThickness = ${thickness};

      // 2. Setup Three.js
      var container = document.getElementById('viewport');
      var scene = new THREE.Scene();
      scene.background = new THREE.Color('#0B0F17');

      var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
      camera.position.set(500, 450, 550);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.id = 'canvas3d';
      container.appendChild(renderer.domElement);

      var controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.minDistance = 60;
      controls.maxDistance = 5000;
      controls.target.set(0, 40, 0);

      // 3. Luzes de Estúdio
      var ambient = new THREE.AmbientLight(0xFFFFFF, 0.95);
      scene.add(ambient);

      var mainLight = new THREE.DirectionalLight(0xFFFFFF, 1.3);
      mainLight.position.set(450, 800, 500);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 2048;
      mainLight.shadow.mapSize.height = 2048;
      scene.add(mainLight);

      var fillLight = new THREE.DirectionalLight(0xE2E8F0, 0.7);
      fillLight.position.set(-400, 300, -350);
      scene.add(fillLight);

      // Chão com sombra suave
      var ground = new THREE.Mesh(
        new THREE.PlaneGeometry(3000, 3000),
        new THREE.ShadowMaterial({ opacity: 0.25 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.5;
      ground.receiveShadow = true;
      scene.add(ground);

      // 4. Construção das Geometrias Canônicas dos Painéis
      var modelGroup = new THREE.Group();
      scene.add(modelGroup);

      var panelNodes = new Map();
      var panelMeshes = new Map();

      // Materiais com dupla face (externo e interno do papelão)
      var frontMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(outerColorHex),
        roughness: 0.35,
        metalness: 0.05,
        side: THREE.FrontSide
      });
      var backMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(innerColorHex),
        roughness: 0.45,
        metalness: 0.02,
        side: THREE.BackSide
      });

      // Cria nó e mesh para cada painel
      panelsData.forEach(function(p) {
        var shape = new THREE.Shape();
        if (p.boundary && p.boundary.length > 0) {
          shape.moveTo(p.boundary[0].x, p.boundary[0].y);
          for (var i = 1; i < p.boundary.length; i++) {
            shape.lineTo(p.boundary[i].x, p.boundary[i].y);
          }
          shape.closePath();
        }

        // Furos reais
        if (p.holes && p.holes.length > 0) {
          p.holes.forEach(function(h) {
            if (h.length > 2) {
              var holePath = new THREE.Path();
              holePath.moveTo(h[0].x, h[0].y);
              for (var j = 1; j < h.length; j++) {
                holePath.lineTo(h[j].x, h[j].y);
              }
              holePath.closePath();
              shape.holes.push(holePath);
            }
          });
        }

        var geom = new THREE.ShapeGeometry(shape);
        var group = new THREE.Group();
        group.name = 'panel_' + p.id;

        var meshFront = new THREE.Mesh(geom, frontMat);
        meshFront.castShadow = true;
        meshFront.receiveShadow = true;
        group.add(meshFront);

        var meshBack = new THREE.Mesh(geom, backMat);
        meshBack.castShadow = true;
        meshBack.receiveShadow = true;
        group.add(meshBack);

        // Contorno da faca no painel
        var edges = new THREE.EdgesGeometry(geom);
        var line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x1E293B, linewidth: 1 }));
        group.add(line);

        modelGroup.add(group);
        panelNodes.set(p.id, group);
        panelMeshes.set(p.id, group);
      });

      // Centraliza a embalagem no chão 3D
      var bbox = new THREE.Box3().setFromObject(modelGroup);
      var center = new THREE.Vector3();
      bbox.getCenter(center);
      modelGroup.position.set(-center.x, 0, -center.z);

      // 5. Motor Cinemático Rígido Instantâneo
      function updateFold(percent) {
        var t = Math.max(0, Math.min(1, percent));

        // Interpolação analítica rígida:
        // A 0%: Matriz Identidade em Z=0 (100% Plano / Faca Aberta Coincidente com 2D)
        // A 100%: Matriz Rígida Exata calculada pelo Kinematic3DEngine
        panelsData.forEach(function(p) {
          var node = panelNodes.get(p.id);
          if (!node) return;

          if (p.isRoot || !p.rigidTransform100) {
            node.matrix.identity();
            node.matrixAutoUpdate = false;
            return;
          }

          var m100 = new THREE.Matrix4().fromArray(p.rigidTransform100);
          var m0 = new THREE.Matrix4().identity();

          var pos0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), s0 = new THREE.Vector3();
          var pos1 = new THREE.Vector3(), q1 = new THREE.Quaternion(), s1 = new THREE.Vector3();

          m0.decompose(pos0, q0, s0);
          m100.decompose(pos1, q1, s1);

          var curPos = new THREE.Vector3().lerpVectors(pos0, pos1, t);
          var curQ = new THREE.Quaternion().slerpQuaternions(q0, q1, t);
          var curScale = new THREE.Vector3(1, 1, 1);

          node.matrix.compose(curPos, curQ, curScale);
          node.matrixAutoUpdate = false;
        });
      }

      // Inicializa na dobra configurada
      updateFold(${initialFold});

      // 6. Loop de Renderização e Controles
      function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // Redimensionamento
      window.addEventListener('resize', function() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });

      // 7. Eventos de UI
      var slider = document.getElementById('foldSlider');
      var pctText = document.getElementById('foldPctText');
      var btnPlay = document.getElementById('btnPlayPause');
      var isPlaying = false;
      var animDir = 1;
      var animSpeed = 0.4;

      slider.addEventListener('input', function(e) {
        var val = parseFloat(e.target.value);
        pctText.textContent = Math.round(val) + '%';
        updateFold(val / 100.0);
      });

      var animInterval = null;
      btnPlay.addEventListener('click', function() {
        isPlaying = !isPlaying;
        btnPlay.textContent = isPlaying ? '⏸ Pausar' : '▶ Animar';
        btnPlay.className = isPlaying ? 'btn btn-primary' : 'btn';

        if (isPlaying) {
          animInterval = setInterval(function() {
            var cur = parseFloat(slider.value);
            cur += animDir * animSpeed;
            if (cur >= 100) {
              cur = 100;
              animDir = -1;
            } else if (cur <= 0) {
              cur = 0;
              animDir = 1;
            }
            slider.value = cur;
            pctText.textContent = Math.round(cur) + '%';
            updateFold(cur / 100.0);
          }, 16);
        } else {
          clearInterval(animInterval);
        }
      });

      document.getElementById('btnFlatView').addEventListener('click', function() {
        slider.value = 0;
        pctText.textContent = '0%';
        updateFold(0);
      });

      document.getElementById('btnFoldView').addEventListener('click', function() {
        slider.value = 100;
        pctText.textContent = '100%';
        updateFold(1.0);
      });

      document.getElementById('btnResetView').addEventListener('click', function() {
        camera.position.set(500, 450, 550);
        controls.target.set(0, 40, 0);
        controls.update();
      });

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
