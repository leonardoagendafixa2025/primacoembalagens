// Resolve poses (posição/rotação) de cada peça com base nas juntas configuradas
// e no estado de "encaixe" (assembly t ∈ [0,1]).
//
// Algoritmo:
// - Peça raiz fica em sua pose manual (sem alterações de junta).
// - Para cada junta resolvível (partA já posicionada): pega centróide+normal do
//   painel-âncora de A em coords-mundo, e do âncora de B em coords-locais de B
//   (com B em identidade). Calcula quaternion que leva normalB → -normalA, e
//   translação que faz centróides coincidirem (com gap ao longo de normalA).
// - assembly < 1: interpola entre "explodida" (afastada por explodeDist*nA) e
//   "encaixada" (pose calculada).
// - Pose manual (part.pose) é somada por cima.
import * as THREE from "three";
import type { AnyPartScene } from "./part-scene-types";
import type { Joint, Part } from "./store-types.ts";

interface SolveCtx {
  parts: Part[];
  scenes: Map<string, AnyPartScene>;
  joints: Joint[];
  /** 0 = explodida, 1 = encaixada. */
  assembly: number;
}

function panelWorldFrame(scene: AnyPartScene, panelId: string): { center: THREE.Vector3; normal: THREE.Vector3 } | null {
  const mesh = scene.panelMeshes.get(panelId);
  const local = scene.panelCentroids.get(panelId);
  if (!mesh || !local) return null;
  mesh.updateMatrixWorld(true);
  const center = local.clone().applyMatrix4(mesh.matrixWorld);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld).normalize();
  return { center, normal };
}

export function solveAssembly(ctx: SolveCtx) {
  const { parts, scenes, joints, assembly } = ctx;
  const placed = new Set<string>();

  // 1) Aplica pose manual em todas (será sobrescrita para as não-raiz pelas juntas).
  for (const p of parts) {
    const sc = scenes.get(p.id);
    if (!sc) continue;
    sc.group.position.set(p.pose.position.x, p.pose.position.y, p.pose.position.z);
    sc.group.rotation.set(p.pose.rotation.x, p.pose.rotation.y, p.pose.rotation.z);
    sc.group.updateMatrixWorld(true);
  }

  // Conjunto raiz: peças não usadas como partB de nenhuma junta válida.
  const isPartB = new Set<string>();
  for (const j of joints) if (j.anchorPanelA && j.anchorPanelB && scenes.has(j.partA) && scenes.has(j.partB)) isPartB.add(j.partB);
  for (const p of parts) if (!isPartB.has(p.id)) placed.add(p.id);

  // 2) Resolve juntas em passes (pode ter cadeias A→B→C).
  for (let pass = 0; pass < 6; pass++) {
    let progress = false;
    for (const j of joints) {
      if (placed.has(j.partB) || !placed.has(j.partA)) continue;
      if (!j.anchorPanelA || !j.anchorPanelB) continue;
      const sa = scenes.get(j.partA);
      const sb = scenes.get(j.partB);
      if (!sa || !sb) continue;
      const partB = parts.find((p) => p.id === j.partB);
      if (!partB) continue;

      // Frame do âncora A no mundo.
      const fa = panelWorldFrame(sa, j.anchorPanelA);
      if (!fa) continue;

      // Para o frame de B em local: zera a pose, recompute world, mede.
      sb.group.position.set(0, 0, 0);
      sb.group.quaternion.identity();
      sb.group.updateMatrixWorld(true);
      const fb = panelWorldFrame(sb, j.anchorPanelB);
      if (!fb) continue;

      // Quaternion que rotaciona normalB → -normalA.
      const targetN = fa.normal.clone().negate();
      const q = new THREE.Quaternion().setFromUnitVectors(fb.normal.clone().normalize(), targetN);

      // Rotação adicional ao redor da normalA (rotationOffset).
      if (j.rotationOffset) {
        const qOff = new THREE.Quaternion().setFromAxisAngle(fa.normal, (j.rotationOffset * Math.PI) / 180);
        q.premultiply(qOff);
      }

      // Após aplicar q, posição mundial do centróide B = q * fb.center.
      const cbRot = fb.center.clone().applyQuaternion(q);
      // Queremos: cbRot + T = fa.center + gap * fa.normal.
      const T = fa.center.clone().addScaledVector(fa.normal, j.gap).sub(cbRot);

      // Pose "encaixada".
      const fitPos = T.clone();
      const fitQuat = q.clone();

      // Pose "explodida": afasta por uma distância grande ao longo de fa.normal.
      const explodeDist = Math.max(50, sb.width * 0.6);
      const explPos = fitPos.clone().addScaledVector(fa.normal, explodeDist);

      // Interpola.
      // Progresso por-junta tem prioridade; cai no global se não definido.
      const t = Math.max(0, Math.min(1, j.progress ?? assembly));
      const finalPos = new THREE.Vector3().lerpVectors(explPos, fitPos, t);
      const finalQuat = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), fitQuat, t);

      // Soma pose manual de B por cima (em coordenadas locais do mundo).
      sb.group.position.copy(finalPos).add(
        new THREE.Vector3(partB.pose.position.x, partB.pose.position.y, partB.pose.position.z),
      );
      const manQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(partB.pose.rotation.x, partB.pose.rotation.y, partB.pose.rotation.z),
      );
      sb.group.quaternion.copy(finalQuat).multiply(manQ);
      sb.group.updateMatrixWorld(true);

      placed.add(j.partB);
      progress = true;
    }
    if (!progress) break;
  }
}
