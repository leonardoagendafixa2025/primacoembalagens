import * as THREE from 'three';
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const d = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3, H7: 100 });
const top = buildFoldingTopology(d);

console.log('=== TESTE DE CADA DOBRADIÇA INDIVIDUAL (0° -> 90°) ===');

for (const h of top.hinges) {
  const child = top.panels.find(p => p.id === h.childPanelId)!;
  const parent = top.panels.find(p => p.id === h.parentPanelId)!;

  console.log(`\n--- HINGE ${h.id} ---`);
  console.log(`  Parent: ${parent.id} (${parent.name}) -> Child: ${child.id} (${child.name})`);
  console.log(`  Crease: (${h.x0.toFixed(1)}, ${h.y0.toFixed(1)}) -> (${h.x1.toFixed(1)}, ${h.y1.toFixed(1)})`);
  console.log(`  Axis: (${h.axis.x.toFixed(2)}, ${h.axis.y.toFixed(2)}, ${h.axis.z.toFixed(2)})`);
  console.log(`  Current Target Angle: ${h.targetAngleDeg}° | Order: ${h.foldOrder}`);

  // Test rotation of child around hinge axis
  // Child centroid in flat 3D: (x, 0, -y)
  const childFlat = new THREE.Vector3(child.centroid.x, 0, -child.centroid.y);
  const hingeOrigin = new THREE.Vector3(h.origin.x, 0, h.origin.z);
  const relChild = childFlat.clone().sub(hingeOrigin);

  const axis = new THREE.Vector3(h.axis.x, h.axis.y, h.axis.z).normalize();
  
  // Apply +90 deg rotation
  const rotPos = relChild.clone().applyAxisAngle(axis, Math.PI / 2).add(hingeOrigin);
  // Apply -90 deg rotation
  const rotNeg = relChild.clone().applyAxisAngle(axis, -Math.PI / 2).add(hingeOrigin);

  console.log(`  Flat child pos: (${childFlat.x.toFixed(1)}, ${childFlat.y.toFixed(1)}, ${childFlat.z.toFixed(1)})`);
  console.log(`  Rot +90° pos:   (${rotPos.x.toFixed(1)}, ${rotPos.y.toFixed(1)}, ${rotPos.z.toFixed(1)}) -> Y = ${rotPos.y.toFixed(1)}`);
  console.log(`  Rot -90° pos:   (${rotNeg.x.toFixed(1)}, ${rotNeg.y.toFixed(1)}, ${rotNeg.z.toFixed(1)}) -> Y = ${rotNeg.y.toFixed(1)}`);
}
