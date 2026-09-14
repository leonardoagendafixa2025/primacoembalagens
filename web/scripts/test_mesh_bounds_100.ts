
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';
import * as THREE from 'three';

const dieline = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3 });
const tree = buildFoldable3DTree(dieline, 3);
tree.updateProgress(1.0);
tree.rootGroup.updateMatrixWorld(true);

console.log('INDIVIDUAL MESH WORLD BOUNDS AT 100%:');
for (const p of tree.topology.panels) {
  const pivot = tree.rootGroup.getObjectByName('pivot_' + p.id);
  if (pivot) {
    const mesh = pivot.children.find(c => c instanceof THREE.Mesh);
    if (mesh) {
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      console.log(
        p.id.padEnd(9),
        p.name.padEnd(16),
        'X: [' + box.min.x.toFixed(1).padStart(6) + ', ' + box.max.x.toFixed(1).padStart(6) + ']',
        'Y: [' + box.min.y.toFixed(1).padStart(6) + ', ' + box.max.y.toFixed(1).padStart(6) + ']',
        'Z: [' + box.min.z.toFixed(1).padStart(6) + ', ' + box.max.z.toFixed(1).padStart(6) + ']'
      );
    }
  }
}
