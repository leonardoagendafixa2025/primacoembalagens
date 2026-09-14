import { getModelById } from '../src/engine/registry';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const testModels = ['fefco_0429', 'fefco_f427', 'fefco_f201', 'fefco_f200', 'ecma_b10', 'ecma_a1075', 'ecma_c3055'];

for (const mid of testModels) {
  try {
    const model = getModelById(mid);
    const dieline = model.calculate(model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3 });
    const topo = buildFoldingTopology(dieline);
    const root = topo.panels.find(p => p.isRoot);
    const cx = (dieline.bounds.minX + dieline.bounds.maxX) / 2;
    const cy = (dieline.bounds.minY + dieline.bounds.maxY) / 2;
    console.log(`Model ${mid}: Center=(${cx.toFixed(1)}, ${cy.toFixed(1)}) -> Root=${root?.id} at (${root?.centroid.x.toFixed(1)}, ${root?.centroid.y.toFixed(1)}) area=${root?.area.toFixed(0)}`);
  } catch (err: any) {
    console.error(`Error in ${mid}:`, err.message);
  }
}
