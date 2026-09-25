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
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildHtml(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Visualizador 3D — Embalagem</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html,body { margin:0; height:100%; background:#0e1018; color:#e6e8ef;
    font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  #app { display:flex; flex-direction:column; height:100dvh; }
  header { display:flex; align-items:center; gap:8px; padding:8px 14px;
    border-bottom:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); flex-wrap:wrap; }
  header .title { font-weight:600; font-size:14px; }
  header .badge { font:11px/1 ui-monospace,monospace; padding:3px 7px;
    border-radius:999px; background:rgba(255,255,255,.06); color:#aab; }
  .spacer { flex:1; }
  .btn { display:inline-flex; align-items:center; gap:6px; padding:5px 9px;
    border-radius:6px; background:transparent; color:#9aa3b2; border:0; cursor:pointer;
    font:11px/1 system-ui; transition:.15s; }
  .btn:hover { background:rgba(255,255,255,.08); color:#fff; }
  .btn.active { background:rgba(99,102,241,.18); color:#fff; }
  .stage { position:relative; flex:1; overflow:hidden; background:#0e1018; }
  #canvasHolder { position:absolute; inset:0; cursor:grab; }
  #canvasHolder:active { cursor:grabbing; }
  .faces { position:absolute; left:12px; top:12px; display:flex; gap:4px; flex-wrap:wrap;
    background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.08); padding:4px;
    border-radius:8px; backdrop-filter:blur(6px); z-index:5; }
  .faces button { font-size:10px; padding:4px 8px; border-radius:5px; background:transparent;
    color:#9aa3b2; border:0; cursor:pointer; }
  .faces button:hover { background:rgba(255,255,255,.1); color:#fff; }
  .footer { display:flex; align-items:center; gap:12px; padding:10px 16px;
    border-top:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); }
  .footer label { font-size:11px; color:#9aa3b2; min-width:46px; }
  .footer input[type=range] { flex:1; accent-color:#818cf8; }
  .footer .pct { font:11px/1 ui-monospace,monospace; min-width:48px; text-align:right; }
  .credit { font-size:10px; color:#56607a; }
</style>
</head>
<body>
<div id="app">
  <header>
    <span class="title" id="docTitle">Embalagem</span>
    <span class="badge" id="partsBadge">3D</span>
    <span class="spacer"></span>
    <button class="btn" id="btnHome" title="Voltar ao estado inicial">⌂ Inicial</button>
    <button class="btn" id="btnFlat">▭ Plano</button>
    <button class="btn" id="btnClose">▣ Fechar</button>
    <button class="btn" id="btnPlay">▶ Animar</button>
    <button class="btn" id="btnResetRot">↺ Resetar rotação</button>
    <button class="btn" id="btnAuto">⟳ Girar 360°</button>
    <button class="btn" id="btnFit">⛶ Encaixar</button>
  </header>
  <div class="stage">
    <div id="canvasHolder"></div>
    <div class="faces">
      <button data-face="front">Frente</button>
      <button data-face="back">Trás</button>
      <button data-face="left">Esquerda</button>
      <button data-face="right">Direita</button>
      <button data-face="top">Topo</button>
      <button data-face="bottom">Base</button>
    </div>
  </div>
  <div class="footer">
    <label>Dobra</label>
    <input id="foldRange" type="range" min="0" max="100" step="1" value="0" />
    <span class="pct" id="foldPct">0%</span>
    <span class="credit">Visualização exportada</span>
  </div>
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
document.getElementById("docTitle").textContent = DATA.title || "Embalagem";
document.getElementById("partsBadge").textContent = DATA.parts.length > 1 ? (DATA.parts.length + " peças") : "3D";

const INITIAL_CAM_DIR = new THREE.Vector3(0.6, 0.5, 1).normalize();

async function svgToTexture(svg, w, h, renderer) {
  const maxTex = renderer?.capabilities?.maxTextureSize ?? 4096;
  const targetLong = Math.min(maxTex, 8192);
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
    tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
  } finally { URL.revokeObjectURL(url); }
}

function recenterCarrier(group, carrier, subject) {
  group.updateMatrixWorld(true); subject.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(subject);
  if (!isFinite(box.min.x)) return;
  const center = box.getCenter(new THREE.Vector3());
  const local = group.worldToLocal(center.clone());
  carrier.position.sub(local);
  carrier.updateMatrixWorld(true);
}

const holder = document.getElementById("canvasHolder");
const W0 = holder.clientWidth, H0 = holder.clientHeight;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1018);
const camera = new THREE.PerspectiveCamera(38, W0 / H0, 1, 20000);

const totalSize = DATA.parts.reduce((acc, p) => Math.max(acc, p.width, p.height), 0);
const baseDist = Math.max(totalSize, 100) * 1.6 * Math.max(1, Math.sqrt(DATA.parts.length));
camera.position.set(baseDist*.6, baseDist*.5, baseDist);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(W0, H0);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
holder.appendChild(renderer.domElement);

scene.add(new THREE.DirectionalLight(0xffffff, 0.7).translateX(1).translateY(1.4).translateZ(1));
scene.add(new THREE.DirectionalLight(0xffffff, 0.35).translateX(-1.2).translateY(0.6).translateZ(0.4));
scene.add(new THREE.DirectionalLight(0xffffff, 0.3).translateY(-0.5).translateZ(-1));
scene.add(new THREE.AmbientLight(0xffffff, 0.6));

// pivot global (rotação de mouse) → contém todas as peças.
const pivot = new THREE.Group(); scene.add(pivot);
const world = new THREE.Group(); pivot.add(world);

const PART_TINTS = [0xe8e2d6, 0xf0d9c8, 0xd9e8de, 0xe0d9ee, 0xeee0d0];
const builtParts = []; // { data, group, carrier, root, pivots }

async function buildPart(partData, idx) {
  const tint = PART_TINTS[idx % PART_TINTS.length];
  const group = new THREE.Group();
  // Pose final da montagem (mm + rad).
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
  const thickness = partData.thickness ?? 0.4;
  const backMat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95, metalness: 0 });
  const pivots = [];

  function buildPanelMesh(panelId, polygon, holes) {
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].y);
    for (let i=1;i<polygon.length;i++) shape.lineTo(polygon[i].x, polygon[i].y);
    shape.closePath();
    const polyArea = (poly) => { let a=0; for (let i=0;i<poly.length;i++){const j=(i+1)%poly.length; a+=poly[i].x*poly[j].y - poly[j].x*poly[i].y;} return a/2; };
    if (holes && holes.length) {
      const outerSigned = polyArea(polygon);
      for (const ring of holes) {
        const ringSigned = polyArea(ring);
        const oriented = (outerSigned > 0) === (ringSigned > 0) ? ring.slice().reverse() : ring;
        const hole = new THREE.Path();
        hole.moveTo(oriented[0].x, oriented[0].y);
        for (let i=1;i<oriented.length;i++) hole.lineTo(oriented[i].x, oriented[i].y);
        hole.closePath();
        shape.holes.push(hole);
      }
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count*2);
    for (let i=0;i<pos.count;i++) {
      // Mesma convenção do viewer 3D do app: UV direta do dieline 2D, sem
      // espelhar. A face SUPERIOR (z > thickness/2) recebe a arte externa.
      uv[i*2] = pos.getX(i)/partData.width;
      uv[i*2+1] = pos.getY(i)/partData.height;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const idx = geo.index;
    const getIdx = (i) => idx ? idx.getX(i) : i;
    const newGroups = [];
    for (const g of geo.groups) {
      if (g.materialIndex !== 0) { newGroups.push({start:g.start,count:g.count,materialIndex:1}); continue; }
      let runStart=g.start, runMat=-1, runCount=0;
      const flush = () => { if (runCount>0) newGroups.push({start:runStart,count:runCount,materialIndex:runMat}); };
      for (let t=0;t<g.count;t+=3) {
        const a=getIdx(g.start+t), b=getIdx(g.start+t+1), c=getIdx(g.start+t+2);
        const z = (pos.getZ(a)+pos.getZ(b)+pos.getZ(c))/3;
        // TOPO (z > thickness/2) = face externa = arte (mat 0). Inferior = mat 1.
        const mi = z > thickness*0.5 ? 0 : 1;
        if (mi !== runMat) { flush(); runStart=g.start+t; runMat=mi; runCount=3; } else runCount+=3;
      }
      flush();
    }
    geo.groups.length = 0;
    for (const g of newGroups) geo.addGroup(g.start, g.count, g.materialIndex);
    const frontMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, toneMapped: false });
    return new THREE.Mesh(geo, [frontMat, backMat]);
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

  builtParts.push({ data: partData, group, carrier, root, pivots });
}

for (let i=0; i<DATA.parts.length; i++) {
  await buildPart(DATA.parts[i], i);
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
      // Mesmo sentido do FoldPlayer usado no viewer do sistema: a face externa
      // é o topo da extrusão, então o ângulo alvo é invertido aqui também.
      const target = -p.target * p.sign;
      // Override manual (graus): sem clamp; positivo segue o sentido do alvo,
      // negativo dobra para o lado oposto, igual ao viewer 3D interno.
      const manual = ov !== undefined ? (ov * Math.PI / 180) / (Math.abs(target) || 1e-6) : undefined;
      const angle = target * (manual ?? weights[p.panelId] ?? 0);
      p.pivot.quaternion.setFromAxisAngle(p.axis, angle);
    }
  }
}

// Recentra o conteudo de world dentro de pivot para que o centro da BASE
// (menor Y, centro X/Z) coincida com a origem local do pivot. Assim a rotacao
// acontece pelo centro da base — igual ao viewer 3D interno do sistema.
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
}

let fold = 0; applyFold(0); recenterPivotOnBase();

const controls = new OrbitControls(camera, holder);
controls.enableDamping = false; controls.enableRotate = false;
controls.enablePan = false; controls.enableZoom = true;
controls.zoomSpeed = 1.0;
controls.minDistance = 50; controls.maxDistance = 20000;
controls.target.set(0,0,0);

let camDist = baseDist;
let autoFit = true;
camera.position.copy(controls.target).addScaledVector(INITIAL_CAM_DIR, camDist);
controls.update();

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
  const vfov = camera.fov*Math.PI/180;
  const hfov = 2*Math.atan(Math.tan(vfov/2)*camera.aspect);
  const d = Math.max(size.y/2/Math.tan(vfov/2), Math.max(size.x,size.z)/2/Math.tan(hfov/2), 1)*1.45;
  camDist = d;
  const basePoint = new THREE.Vector3();
  pivot.getWorldPosition(basePoint);
  controls.target.copy(basePoint);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  if (dir.lengthSq() < 1e-6) dir.copy(INITIAL_CAM_DIR);
  camera.position.copy(controls.target).addScaledVector(dir, d);
  controls.update();
}

controls.addEventListener("change", () => {
  camDist = camera.position.distanceTo(controls.target);
  if (autoFit) { autoFit = false; document.getElementById("btnFit").classList.remove("active"); }
});

const DEG = Math.PI/180; const SENS = 0.5;
let dragging=false, pending=false, multitouchLock=false, downX=0, downY=0, prevX=0, prevY=0;
const activePointers = new Set();
const DRAG_THRESHOLD = 2;
const tmpAxis = new THREE.Vector3(); const tmpQuat = new THREE.Quaternion(); const camRight = new THREE.Vector3();
holder.addEventListener("pointerdown", (e) => {
  activePointers.add(e.pointerId);
  if (activePointers.size > 1) {
    dragging = false; pending = false; multitouchLock = true;
    return;
  }
  if (multitouchLock) return;
  if (e.button !== 0 && e.pointerType === "mouse") return;
  pending = true; dragging = false;
  downX = prevX = e.clientX; downY = prevY = e.clientY;
  try { holder.setPointerCapture(e.pointerId); } catch {}
});
holder.addEventListener("pointermove", (e) => {
  if (activePointers.size > 1 || multitouchLock) return;
  if (pending) {
    if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < DRAG_THRESHOLD) return;
    pending = false; dragging = true;
    prevX = downX; prevY = downY;
  }
  if (!dragging) return;
  const dx = e.clientX - prevX, dy = e.clientY - prevY;
  prevX = e.clientX; prevY = e.clientY;
  tmpAxis.set(0,1,0); tmpQuat.setFromAxisAngle(tmpAxis, dx*SENS*DEG); pivot.quaternion.premultiply(tmpQuat);
  camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  tmpQuat.setFromAxisAngle(camRight, dy*SENS*DEG); pivot.quaternion.premultiply(tmpQuat);
});
const stop = (e) => {
  activePointers.delete(e.pointerId);
  if (activePointers.size === 0) multitouchLock = false;
  dragging = false; pending = false;
  try { holder.releasePointerCapture(e.pointerId); } catch {}
};
holder.addEventListener("pointerup", stop);
holder.addEventListener("pointercancel", stop);

let autoRot = false;
const autoAxis = new THREE.Vector3(0,1,0); const autoQuat = new THREE.Quaternion();
function animate() {
  controls.update();
  if (autoRot) { autoQuat.setFromAxisAngle(autoAxis, 0.005); pivot.quaternion.premultiply(autoQuat); }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener("resize", () => {
  const W = holder.clientWidth, H = holder.clientHeight;
  camera.aspect = W/H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
  if (autoFit) fitToScreen();
});

const foldRange = document.getElementById("foldRange");
const foldPct = document.getElementById("foldPct");
function setFold(v) {
  fold = Math.max(0, Math.min(1, v));
  applyFold(fold);
  recenterPivotOnBase();
  foldRange.value = String(Math.round(fold*100));
  foldPct.textContent = Math.round(fold*100) + "%";
  if (autoFit) requestAnimationFrame(fitToScreen);
}
foldRange.addEventListener("input", (e) => setFold(Number(e.target.value)/100));

let playRaf = 0, playing = false, playState = null;
const easeIO = (x) => x<.5 ? 2*x*x : 1 - Math.pow(-2*x+2,2)/2;
function playTick(now) {
  if (!playing) return;
  const st = playState;
  const target = st.dir === 1 ? 1 : 0;
  const span = Math.abs(target - st.from) || 1;
  const k = Math.min(1, ((now - st.t0) / 1800) * (1/span));
  setFold(st.from + (target - st.from) * easeIO(k));
  if (k >= 1) { st.dir = -st.dir; st.from = target; st.t0 = now; }
  playRaf = requestAnimationFrame(playTick);
}
function togglePlay() {
  playing = !playing;
  document.getElementById("btnPlay").classList.toggle("active", playing);
  document.getElementById("btnPlay").textContent = playing ? "⏸ Pausar" : "▶ Animar";
  if (playing) {
    playState = { dir: fold >= 1 ? -1 : 1, t0: performance.now(), from: fold };
    playRaf = requestAnimationFrame(playTick);
  } else cancelAnimationFrame(playRaf);
}

function viewFace(dir) {
  setFold(1); autoRot = false; autoFit = false;
  document.getElementById("btnAuto").classList.remove("active");
  document.getElementById("btnFit").classList.remove("active");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    pivot.quaternion.identity();
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(world);
    if (!isFinite(box.min.x)) return;
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    const vfov = camera.fov*Math.PI/180;
    const hfov = 2*Math.atan(Math.tan(vfov/2)*camera.aspect);
    const cfg = {
      front:  { axis:new THREE.Vector3(0,0,1), w:size.x, h:size.y, up:new THREE.Vector3(0,1,0) },
      back:   { axis:new THREE.Vector3(0,0,-1),w:size.x, h:size.y, up:new THREE.Vector3(0,1,0) },
      right:  { axis:new THREE.Vector3(1,0,0), w:size.z, h:size.y, up:new THREE.Vector3(0,1,0) },
      left:   { axis:new THREE.Vector3(-1,0,0),w:size.z, h:size.y, up:new THREE.Vector3(0,1,0) },
      top:    { axis:new THREE.Vector3(0,1,0), w:size.x, h:size.z, up:new THREE.Vector3(0,0,-1) },
      bottom: { axis:new THREE.Vector3(0,-1,0),w:size.x, h:size.z, up:new THREE.Vector3(0,0,1) },
    }[dir];
    const d = Math.max(cfg.h/2/Math.tan(vfov/2), cfg.w/2/Math.tan(hfov/2), 1)*1.45;
    controls.target.copy(center);
    camera.up.copy(cfg.up);
    camera.position.copy(center).addScaledVector(cfg.axis, d);
    camDist = d; controls.update();
  }));
}

document.getElementById("btnHome").onclick = () => { if (playing) togglePlay(); autoRot=false; viewFace("front"); };
document.getElementById("btnFlat").onclick = () => { if (playing) togglePlay(); setFold(0); };
document.getElementById("btnClose").onclick = () => { if (playing) togglePlay(); setFold(1); };
document.getElementById("btnPlay").onclick = togglePlay;
document.getElementById("btnResetRot").onclick = () => {
  pivot.quaternion.identity();
  controls.target.set(0,0,0);
  camera.up.set(0,1,0);
  camera.position.copy(controls.target).addScaledVector(INITIAL_CAM_DIR, camDist);
  controls.update();
  autoRot = false; document.getElementById("btnAuto").classList.remove("active");
};
document.getElementById("btnAuto").onclick = () => {
  autoRot = !autoRot;
  document.getElementById("btnAuto").classList.toggle("active", autoRot);
};
document.getElementById("btnFit").onclick = () => {
  autoFit = true; document.getElementById("btnFit").classList.add("active"); fitToScreen();
};
document.querySelectorAll(".faces button").forEach(b => {
  b.onclick = () => viewFace(b.dataset.face);
});

requestAnimationFrame(() => requestAnimationFrame(() => { if (autoFit) fitToScreen(); }));
document.getElementById("btnFit").classList.add("active");
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

