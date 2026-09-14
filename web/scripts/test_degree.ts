import { getModelById } from '../src/engine/registry';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const testModels = ['fefco_0429', 'fefco_f427', 'fefco_f201', 'fefco_f200', 'ecma_b10', 'ecma_a1075'];

for (const mid of testModels) {
  try {
    const model = getModelById(mid);
    const dieline = model.calculate(model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3 });
    const topo = buildFoldingTopology(dieline);
    const cx = (dieline.bounds.minX + dieline.bounds.maxX) / 2;
    const cy = (dieline.bounds.minY + dieline.bounds.maxY) / 2;

    console.log('=== ' + mid + ' (Center: ' + cx.toFixed(1) + ', ' + cy.toFixed(1) + ') ===');
    for (const p of topo.panels) {
      const dist = Math.hypot(p.centroid.x - cx, p.centroid.y - cy);
      const nHinges = topo.hinges.filter(h => h.panelAId === p.id || h.panelBId === p.id).length;
      console.log('  ' + p.id + ': deg=' + nHinges + ', area=' + p.area.toFixed(0) + ', dist=' + dist.toFixed(1) + ', currRoot=' + p.isRoot);
    }
  } catch (e) {
    console.error('Error in ' + mid);
  }
}
