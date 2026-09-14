import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const d = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3, H7: 100 });
const top = buildFoldingTopology(d);

console.log('=== ETAPA 1: FEFCO 0429 ENTITIES ===');
console.log('Total segments:', d.segments.length);
console.log('Total arcs:', d.arcs.length);
console.log('Bounds:', d.bounds);

console.log('\n=== ETAPA 2: PANELS FOUND ===');
for (const p of top.panels) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of p.boundary) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  console.log(`Panel ${p.id.padEnd(10)} | Centroid: (${p.centroid.x.toFixed(1).padStart(6)}, ${p.centroid.y.toFixed(1).padStart(6)}) | Area: ${p.area.toFixed(0).padStart(6)} | X: [${minX.toFixed(1).padStart(6)}, ${maxX.toFixed(1).padStart(6)}] | Y: [${minY.toFixed(1).padStart(6)}, ${maxY.toFixed(1).padStart(6)}] | Parent: ${p.parentId || 'ROOT'}`);
}

console.log('\n=== ETAPA 3, 4 & 5: HINGES, TREE, AXES & ANGLES ===');
for (const h of top.hinges) {
  console.log(`Hinge: ${h.id}`);
  console.log(`  Parent: ${h.parentPanelId} -> Child: ${h.childPanelId}`);
  console.log(`  Crease 2D: (${h.x0.toFixed(1)}, ${h.y0.toFixed(1)}) -> (${h.x1.toFixed(1)}, ${h.y1.toFixed(1)}) len=${h.length.toFixed(1)}`);
  console.log(`  3D Axis: (${h.axis.x.toFixed(3)}, ${h.axis.y.toFixed(3)}, ${h.axis.z.toFixed(3)})`);
  console.log(`  Target Angle: ${h.targetAngleDeg}° | Fold Order: ${h.foldOrder}`);
}
