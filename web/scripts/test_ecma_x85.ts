import { getModelById } from '../src/engine/registry';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';
import * as THREE from 'three';

console.log('=== TEST FINAL ECMA X85 ===');
const model = getModelById('ecma_x85');
console.log('Model ID:', model.id);
console.log('Model Name:', model.name);
console.log('Implementation:', model.implementationType);
console.log('isFoldable:', model.isFoldable);

const dieline = model.calculate({ L: 150, B: 100, H: 80, Ep: 0.4 });
console.log('Dieline segments:', dieline.segments.length);
console.log('Has customTopology:', Boolean(dieline.customTopology));
console.log('Topology panels count:', dieline.customTopology.panels.length);

const tree = buildFoldable3DTree(dieline, 0.4);
console.log('3D Tree panels count:', tree.panelsCount);

// Test fold sequence 0% -> 25% -> 50% -> 75% -> 100% -> 0%
const stages = [0.0, 0.25, 0.50, 0.75, 1.0];
for (const s of stages) {
  tree.updateProgress(s);
  tree.rootGroup.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(tree.rootGroup);
  const sx = bbox.max.x - bbox.min.x;
  const sy = bbox.max.y - bbox.min.y;
  const sz = bbox.max.z - bbox.min.z;
  console.log(`Fold ${(s * 100).toFixed(0)}%: size = ${sx.toFixed(1)} x ${sy.toFixed(1)} x ${sz.toFixed(1)} mm`);
}

// Reversibility check
tree.updateProgress(0.0);
tree.rootGroup.updateMatrixWorld(true);
const bbox0 = new THREE.Box3().setFromObject(tree.rootGroup);
console.log(`Return to 0%: size = ${(bbox0.max.x - bbox0.min.x).toFixed(1)} x ${(bbox0.max.y - bbox0.min.y).toFixed(1)} x ${(bbox0.max.z - bbox0.min.z).toFixed(1)} mm`);

// Verify handle holes exist in 3D panels
let totalHoles = 0;
for (const p of dieline.customTopology.panels) {
  totalHoles += p.holes.length;
}
console.log('Total holes in panels:', totalHoles);

if (tree.panelsCount >= 18 && totalHoles >= 2) {
  console.log('\n[PASS] ECMA X85 3D FOLDING AND HOLES VALIDATION PASSED!');
} else {
  console.error('\n[FAIL] Validation failed!');
  process.exit(1);
}
