import * as THREE from 'three';
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

const d = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3, H7: 100 });
const tree = buildFoldable3DTree(d, 3.0);
tree.updateProgress(1.0); // 100% fold
tree.rootGroup.updateMatrixWorld(true);

console.log('=== AUDITORIA DE CADA PAINEL EM 100% FOLD ===');

for (const p of tree.topology.panels) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  tree.rootGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name === p.name) {
      const pos = obj.geometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        obj.localToWorld(v);
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
      }
    }
  });

  const w = maxX - minX;
  const h = maxY - minY;
  const d = maxZ - minZ;

  console.log(`Panel ${p.id.padEnd(10)} (${p.name.padEnd(16)}): X=[${minX.toFixed(1)}, ${maxX.toFixed(1)}] (${w.toFixed(1)}) | Y=[${minY.toFixed(1)}, ${maxY.toFixed(1)}] (${h.toFixed(1)}) | Z=[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}] (${d.toFixed(1)})`);
}
