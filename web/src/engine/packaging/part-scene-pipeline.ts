// ============================================================================
// PartScene v2 — montagem usando a Pipeline (Stages 1→8)
// ----------------------------------------------------------------------------
// Substitui o caminho antigo por Pipeline + FoldingPlan. Aqui:
//
//   1. Roda `runPipeline(dieline.segments)` para obter painéis, eixos e plan.
//   2. Para cada `PipelinePanel`, gera um mesh extrudado (mesma UV-scheme da
//      versão legada).
//   3. Anexa cada mesh no group correspondente do `FoldPlayer`.
//   4. Devolve uma interface compatível com `PartScene` para o viewer-3d
//      continuar consumindo (`pivots`, `panelMeshes`, `dispose`, ...).
//
// O que ESTE módulo NÃO faz (intencional):
//   - Não tenta "descobrir" eixos / topologia. Tudo vem da pipeline.
//   - Não usa `dieline.panels` para construir geometria — usa os painéis
//     estruturais da pipeline (IDs estáveis via hash).
//   - Não duplica heurística de hinge: o player monta pivôs a partir do plan.
// ============================================================================
import * as THREE from "three";
import type { Dieline } from "./dieline-types";
import type { ArtAsset } from "./store-types.ts";
import { buildSubstrateMaterials, type SubstrateKind } from "./substrate-textures";
import { dielineToSvgString } from "./render";
import {
  runPipeline,
  buildFoldPlayer,
  buildFoldPlanExecutor,
  type FoldPlayer,
  type FoldPlanExecutor,
  type FoldPlanExecutorStatus,
} from "./pipeline";
import type { PipelinePanel, PipelineResult, PipelineStaticFeature } from "./pipeline";


export interface PipelinePivotEntry {
  panelId: string;
  pivot: THREE.Group;
  axis: THREE.Vector3;
  sign: 1 | -1;
  target: number;
}

export interface PipelinePartScene {
  partId: string;
  group: THREE.Group;
  carrier: THREE.Group;
  root: THREE.Group;
  pivots: PipelinePivotEntry[];
  rootPanelId: string;
  panelMeshes: Map<string, THREE.Mesh>;
  wireOverlays: Map<string, THREE.LineSegments>;
  panelCentroids: Map<string, THREE.Vector3>;
  debugOverlays: THREE.Group;
  width: number;
  height: number;
  thickness: number;
  /** Resultado completo da pipeline (para debug/inspector). */
  pipeline: PipelineResult;
  player: FoldPlayer;
  /**
   * Executor sequencial — ÚNICA autoridade de animação do 3D.
   * Substitui o UnifiedRigidFoldingSolver: sem relaxação global, sem
   * stabilizer; cada step roda em sequência sobre a hierarquia Three.js nativa.
   */
  executor: FoldPlanExecutor;
  /** Último status emitido pelo executor (HUD/debug). */
  lastExecutorStatus: FoldPlanExecutorStatus;
  dispose: () => void;
}


interface BuildOpts {
  partId: string;
  dieline: Dieline;
  art: ArtAsset | null;
  artInside?: ArtAsset | null;
  showArt: boolean;
  selectedPanels: string[];
  thickness: number;
  renderer: THREE.WebGLRenderer;
  partTint?: number;
  substrate?: SubstrateKind;
  /** Override opcional do painel root (ID estável do pipeline). */
  rootPanelId?: string;
}

async function svgToTexture(
  svg: string,
  w: number,
  h: number,
  renderer: THREE.WebGLRenderer,
): Promise<THREE.Texture> {
  const maxTex = renderer.capabilities?.maxTextureSize ?? 4096;
  const targetLong = Math.min(maxTex, 8192);
  const longSide = Math.max(w, h);
  const renderScale = Math.max(4, targetLong / longSide);
  const rw = Math.max(64, Math.round(w * renderScale));
  const rh = Math.max(64, Math.round(h * renderScale));

  let sized = svg;
  if (/<svg\b[^>]*>/i.test(sized)) {
    sized = sized.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
      let a = String(attrs)
        .replace(/\swidth="[^"]*"/i, "")
        .replace(/\sheight="[^"]*"/i, "");
      if (!/viewBox=/i.test(a)) a += ` viewBox="0 0 ${w} ${h}"`;
      return `<svg${a} width="${rw}" height="${rh}">`;
    });
  }
  const blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = (e) => reject(e);
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rw, rh);
    ctx.drawImage(img, 0, 0, rw, rh);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() ?? 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function polyArea(poly: { x: number; y: number }[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return a / 2;
}

export async function buildPartScenePipeline(opts: BuildOpts): Promise<PipelinePartScene> {
  const {
    partId, dieline, art, artInside, showArt, thickness, renderer,
    partTint, substrate, rootPanelId,
  } = opts;

  // ---- Pipeline (Stages 1→7) ----
  const pipeline = runPipeline(dieline.segments, { rootPanelId });

  // ---- Scene-graph base ----
  const group = new THREE.Group();
  group.userData.partId = partId;
  const carrier = new THREE.Group();
  group.add(carrier);
  const root = new THREE.Group();
  root.position.set(-dieline.width / 2, 0, dieline.height / 2);
  root.rotation.x = -Math.PI / 2;
  carrier.add(root);

  // ---- Texturas (mesma fonte SVG do legado) ----
  const hasOutside = !!(showArt && art);
  const hasInside = !!(showArt && artInside);
  const svgOut = dielineToSvgString(dieline, {
    showPanels: false, showBleed: false, textureMode: true,
    art: hasOutside ? art : null, selectedIds: [],
  });
  const texOut = await svgToTexture(svgOut, dieline.width, dieline.height, renderer);
  let texIn: THREE.Texture | null = null;
  if (hasInside) {
    const svgIn = dielineToSvgString(dieline, {
      showPanels: false, showBleed: false, textureMode: true,
      art: artInside, selectedIds: [],
    });
    texIn = await svgToTexture(svgIn, dieline.width, dieline.height, renderer);
  }



  const subMats = buildSubstrateMaterials(substrate ?? "duplex", partTint);
  const backMat = subMats.back;
  const sideStdMat = subMats.side;

  // ---- Player (Stage 8) ----
  const effectivePlan3D = pipeline.model3D.effectivePlan;
  const player = buildFoldPlayer(pipeline.panels, pipeline.foldAxes, effectivePlan3D);
  root.add(player.root);

  const panelMeshes = new Map<string, THREE.Mesh>();
  const wireOverlays = new Map<string, THREE.LineSegments>();
  const panelCentroids = new Map<string, THREE.Vector3>();
  const debugOverlays = new THREE.Group();
  debugOverlays.name = "structural-debug-overlays";
  debugOverlays.visible = false;
  root.add(debugOverlays);

  const buildPanelMesh = (panel: Pick<PipelinePanel, "id" | "polygon" | "holes"> | PipelineStaticFeature) => {
    const polygon = panel.polygon;
    if (polygon.length < 3) return null;
    const shape = new THREE.Shape();
    shape.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) shape.lineTo(polygon[i].x, polygon[i].y);
    shape.closePath();

    if (panel.holes && panel.holes.length) {
      const outerSigned = polyArea(polygon);
      for (const ring of panel.holes) {
        if (ring.length < 3) continue;
        const ringSigned = polyArea(ring);
        const oriented = (outerSigned > 0) === (ringSigned > 0) ? ring.slice().reverse() : ring;
        const hole = new THREE.Path();
        hole.moveTo(oriented[0].x, oriented[0].y);
        for (let i = 1; i < oriented.length; i++) hole.lineTo(oriented[i].x, oriented[i].y);
        hole.closePath();
        shape.holes.push(hole);
      }
    }

    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });

    // UV: mesma convenção em ambas as faces — a arte é mapeada direto do dieline 2D.
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      uv[i * 2] = x / dieline.width;
      uv[i * 2 + 1] = pos.getY(i) / dieline.height;
    }

    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    // Reescreve grupos: a face SUPERIOR da extrusão (z=thickness) é a que fica
    // virada para fora depois das dobras → recebe a arte externa (materialIndex 0).
    // A face inferior (z=0) fica no interior da caixa → recebe a arte interna
    // (materialIndex 1). Laterais → materialIndex 2.
    const idx = geo.index;
    const getIdx = (i: number) => (idx ? idx.getX(i) : i);
    const newGroups: { start: number; count: number; materialIndex: number }[] = [];
    for (const g of geo.groups) {
      if (g.materialIndex !== 0) {
        newGroups.push({ start: g.start, count: g.count, materialIndex: 2 });
        continue;
      }
      let runStart = g.start, runMat = -1, runCount = 0;
      const flush = () => {
        if (runCount > 0) newGroups.push({ start: runStart, count: runCount, materialIndex: runMat });
      };
      for (let t = 0; t < g.count; t += 3) {
        const a = getIdx(g.start + t), b = getIdx(g.start + t + 1), c = getIdx(g.start + t + 2);
        const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
        const mi = z > thickness * 0.5 ? 0 : 1;

        if (mi !== runMat) { flush(); runStart = g.start + t; runMat = mi; runCount = 3; }
        else runCount += 3;
      }
      flush();
    }
    geo.groups.length = 0;
    for (const g of newGroups) geo.addGroup(g.start, g.count, g.materialIndex);

    const outsideMat = new THREE.MeshBasicMaterial({ map: texOut, side: THREE.FrontSide, toneMapped: false });
    const insideMat = texIn
      ? new THREE.MeshBasicMaterial({ map: texIn, side: THREE.FrontSide, toneMapped: false })
      : backMat;
    const mesh = new THREE.Mesh(geo, [outsideMat, insideMat, sideStdMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.panelId = panel.id;
    mesh.userData.partId = partId;
    panelMeshes.set(panel.id, mesh);

    // Aramado para modo wire.
    const wirePts: THREE.Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      wirePts.push(new THREE.Vector3(a.x, a.y, thickness + 0.01));
      wirePts.push(new THREE.Vector3(b.x, b.y, thickness + 0.01));
      wirePts.push(new THREE.Vector3(a.x, a.y, -0.01));
      wirePts.push(new THREE.Vector3(b.x, b.y, -0.01));
      wirePts.push(new THREE.Vector3(a.x, a.y, -0.01));
      wirePts.push(new THREE.Vector3(a.x, a.y, thickness + 0.01));
    }
    const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
    const wire = new THREE.LineSegments(
      wireGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
    );
    wire.visible = false;
    wire.userData.panelId = panel.id;
    mesh.add(wire);
    wireOverlays.set(panel.id, wire);

    let cx = 0, cy = 0;
    for (const p of polygon) { cx += p.x; cy += p.y; }
    cx /= polygon.length; cy /= polygon.length;
    panelCentroids.set(panel.id, new THREE.Vector3(cx, cy, thickness / 2));
    return mesh;
  };

  // Anexa cada mesh ao group do painel correspondente do player.
  for (const panel of pipeline.panels) {
    const mesh = buildPanelMesh(panel);
    if (!mesh) continue;
    const g = player.panelGroups.get(panel.id);
    if (g) g.add(mesh);
    else root.add(mesh); // painéis sem hinge (root + ilhas) ficam direto.
  }

  // Features rejeitadas pelo classificador estrutural continuam visíveis, mas
  // coladas ao painel hospedeiro e sem pivot próprio (não dobram sozinhas).
  for (const feature of pipeline.staticFeatures) {
    const mesh = buildPanelMesh(feature);
    if (!mesh) continue;
    mesh.userData.staticFeature = true;
    const hostGroup = player.panelGroups.get(feature.parentPanelId);
    if (hostGroup) hostGroup.add(mesh);
    else root.add(mesh);
  }

  const addDebugLine = (a: { x: number; y: number }, b: { x: number; y: number }, color: number, opacity = 0.95) => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a.x, a.y, thickness + 1.2),
      new THREE.Vector3(b.x, b.y, thickness + 1.2),
    ]);
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    debugOverlays.add(line);
  };
  const addDebugPolygon = (poly: Array<{ x: number; y: number }>, color: number, opacity: number, z = thickness + 0.9) => {
    if (poly.length < 3) return;
    const shape = new THREE.Shape();
    shape.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i].x, poly[i].y);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = z;
    debugOverlays.add(mesh);
  };
  for (const panel of pipeline.structuralPanels) {
    for (let i = 0; i < panel.polygon.length; i++) addDebugLine(panel.polygon[i], panel.polygon[(i + 1) % panel.polygon.length], 0xffffff, 0.75);
  }
  for (const axis of pipeline.foldAxes.filter((axis) => axis.role === "structural_fold_axis")) addDebugLine(axis.span.a, axis.span.b, 0x38bdf8, 1);
  for (const feature of pipeline.absorbedFeatures) addDebugPolygon(feature.polygon, 0xa855f7, 0.24);

  // Pivots no formato compatível com o viewer.
  const pivots: PipelinePivotEntry[] = player.pivots.map((p) => ({
    panelId: p.panelId,
    pivot: p.pivot,
    axis: p.axis,
    sign: (p.targetAngle >= 0 ? 1 : -1) as 1 | -1,
    target: Math.abs(p.targetAngle),
  }));

  const dispose = () => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else if (mat) mat.dispose();
    });
    texOut.dispose();
    
    if (texIn) texIn.dispose();
    player.dispose();
  };

  // ---- FoldPlanExecutor: única autoridade de animação do 3D ----
  // Consome o FoldPlanV2 derivado da árvore canônica (model3D.foldTree) e
  // executa as operações em SEQUÊNCIA sobre a hierarquia Three.js nativa
  // (panel → pivot → child), sem relaxação global.
  const executor = buildFoldPlanExecutor(pipeline.foldPlanV2);
  const initialStatus = executor.apply(player, 0);

  return {
    partId,
    group,
    carrier,
    root,
    pivots,
    rootPanelId: effectivePlan3D.rootPanelId,
    panelMeshes,
    wireOverlays,
    panelCentroids,
    debugOverlays,
    width: dieline.width,
    height: dieline.height,
    thickness,
    pipeline,
    player,
    executor,
    lastExecutorStatus: initialStatus,
    dispose,
  };
}

export function applyFoldToPipelineScene(
  scene: PipelinePartScene,
  t: number,
  overrides: Record<string, number> = {},
) {
  // Animation Safety Layer: foldProgress clampado em [0..1].
  const clamped = Math.max(0, Math.min(1, t));

  // Converte overrides (em GRAUS, como vêm da UI) em razão sinalizada
  // relativa ao ângulo alvo (em radianos) de cada pivô. A razão pode
  // ultrapassar 1 (ângulo maior que o alvo) e ser negativa (direção oposta).
  const manualWeights: Record<string, number> = {};
  for (const p of scene.pivots) {
    const ov = overrides[p.panelId];
    if (ov === undefined) continue;
    const ovRad = (ov * Math.PI) / 180;
    const targetAbs = Math.abs(p.target) || 1e-6;
    // Preserva o sinal do target no denominador para que ângulos positivos
    // na UI sempre dobrem "para dentro" (sentido do alvo), e negativos o
    // oposto — independentemente do sinal interno do pivô.
    const sign = p.target < 0 ? -1 : 1;
    manualWeights[p.panelId] = (ovRad * sign) / targetAbs;
  }



  // ÚNICA fonte de transformação 3D: FoldPlanExecutor sequencial.
  const status = scene.executor.apply(scene.player, clamped, manualWeights);
  scene.lastExecutorStatus = status;
}


export function recenterPipelineScene(scene: PipelinePartScene) {
  scene.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene.root);
  if (!isFinite(box.min.x)) return;
  const center = box.getCenter(new THREE.Vector3());
  const localCenter = scene.group.worldToLocal(center.clone());
  scene.carrier.position.sub(localCenter);
  scene.carrier.updateMatrixWorld(true);
}
