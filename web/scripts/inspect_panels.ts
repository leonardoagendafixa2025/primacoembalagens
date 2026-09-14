import { getModelById } from '../src/engine/registry';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const testModels = ['ecma_b10', 'ecma_a1075', 'fefco_f201', 'fefco_f427'];

for (const mid of testModels) {
  const model = getModelById(mid);
  const dieline = model.calculate(model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3 });
  const topo = buildFoldingTopology(dieline);
  const cx = (dieline.bounds.minX + dieline.bounds.maxX) / 2;
  const cy = (dieline.bounds.minY + dieline.bounds.maxY) / 2;
  console.log('=== MODEL: ' + mid + ' (Center: ' + cx.toFixed(1) + ', ' + cy.toFixed(1) + ') ===');
  for (const p of topo.panels) {
    const dist = Math.hypot(p.centroid.x - cx, p.centroid.y - cy);
    console.log('  ' + p.id + ': area=' + p.area.toFixed(0) + ', centroid=(' + p.centroid.x.toFixed(1) + ', ' + p.centroid.y.toFixed(1) + '), distToCenter=' + dist.toFixed(1) + ', isRoot=' + p.isRoot);
  }
}
