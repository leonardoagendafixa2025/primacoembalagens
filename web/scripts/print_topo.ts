
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';
import * as THREE from 'three';

const dieline = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3 });
const topo = buildFoldingTopology(dieline);
const tree = buildFoldable3DTree(dieline, 3);

console.log('PANELS COUNT:', topo.panels.length);
console.log('HINGES COUNT:', topo.hinges.length);
for (const p of topo.panels) {
  console.log(p.id, p.name, 'area=' + Math.round(p.area), 'cx=' + p.centroid.x.toFixed(1), 'cy=' + p.centroid.y.toFixed(1), 'parent=' + p.parentId);
}

// Check at 0%
tree.updateProgress(0);
tree.rootGroup.updateMatrixWorld(true);

console.log('\nWORLD POSITIONS AT 0%:');
for (const p of topo.panels) {
  const pivot = tree.rootGroup.getObjectByName('pivot_' + p.id);
  if (pivot) {
    const wp = new THREE.Vector3();
    pivot.getWorldPosition(wp);
    const box = new THREE.Box3().setFromObject(pivot);
    console.log(p.id, 'pivot world pos:', wp.x.toFixed(1), wp.y.toFixed(1), wp.z.toFixed(1), 'bbox X: [' + box.min.x.toFixed(1) + ', ' + box.max.x.toFixed(1) + '], Z: [' + box.min.z.toFixed(1) + ', ' + box.max.z.toFixed(1) + ']');
  }
}
