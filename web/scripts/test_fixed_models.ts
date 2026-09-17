import { getModelById } from '../src/engine/registry';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

const modelsToTest = [
  'ecma_a2220',
  'ecma_a2120',
  'ecma_a2320',
  'ecma_a2420',
  'ecma_a5520',
  'ecma_a6020',
  'ecma_a0115',
  'fefco_f210',
  'fefco_f211',
  'fefco_f314',
  'fefco_f421',
  'fefco_f422',
  'fefco_f423',
  'fefco_f425',
  'fefco_f427',
];

console.log(`=== AUDIT OF ${modelsToTest.length} FIXED MODELS (2D & 3D) ===`);
let passCount = 0;

for (const id of modelsToTest) {
  try {
    const model = getModelById(id);
    const dieline = model.calculate({ L: 150, B: 100, H: 80, Ep: 0.4 });
    
    // Verify 2D
    if (!dieline.segments || dieline.segments.length < 5) {
      throw new Error(`Invalid segments count: ${dieline.segments?.length}`);
    }

    // Verify 3D topology
    const tree = buildFoldable3DTree(dieline, 0.4);
    if (tree.panelsCount < 1) {
      throw new Error(`Zero panels detected in 3D tree`);
    }

    // Test fold progress update
    tree.updateProgress(0.0);
    tree.updateProgress(1.0);

    console.log(`[PASS] ${id}: 2D segs=${dieline.segments.length}, 3D panels=${tree.panelsCount}`);
    passCount++;
  } catch (err: any) {
    console.error(`[FAIL] ${id}:`, err.message);
  }
}

console.log(`\nRESULT: ${passCount} / ${modelsToTest.length} models passed.`);
if (passCount !== modelsToTest.length) {
  process.exit(1);
}
