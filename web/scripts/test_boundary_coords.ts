
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const dieline = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3 });
const topo = buildFoldingTopology(dieline);

for (const p of topo.panels) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of p.boundary) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  console.log(p.id, p.name, 'X: [' + minX.toFixed(1) + ', ' + maxX.toFixed(1) + ']', 'Y: [' + minY.toFixed(1) + ', ' + maxY.toFixed(1) + ']');
}
