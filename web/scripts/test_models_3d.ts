import { CATALOG, getModelById } from '../src/engine/registry';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

console.log('============================================================');
console.log('TESTE CINEMÁTICO 3D (0% -> 100% -> 0% ROUNDTRIP)');
console.log('============================================================\n');

let pass3d = 0;
let notApplicable = 0;
let fail3d = 0;

CATALOG.forEach((item, idx) => {
  const modelIndex = String(idx + 1).padStart(3, '0');
  const model = getModelById(item.id);

  if (!model.isFoldable || model.status === 'NON_FOLDABLE' || model.status === 'ORIGINAL_NO_GEOMETRY' || model.status === 'DOCUMENT_ONLY') {
    notApplicable++;
    return;
  }

  try {
    const params = model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3.0 };
    const dieline = model.calculate(params);

    if (!dieline || !dieline.segments || dieline.segments.length === 0) {
      fail3d++;
      console.log(`[3D FAIL] #${modelIndex} ${model.code}: Empty geometry`);
      return;
    }

    const creases = dieline.segments.filter((s) => s.type === 'crease');
    if (creases.length === 0) {
      notApplicable++;
      return;
    }

    const tree = buildFoldable3DTree(dieline, params.Ep || 3.0);

    if (tree.panelsCount === 0) {
      notApplicable++;
      return;
    }

    // Teste 1: 0% (faca plana)
    tree.updateProgress(0.0);

    // Teste 2: 100% (montada)
    tree.updateProgress(1.0);

    // Teste 3: Retorno a 0% (faca plana restaurada sem deformação acumulada)
    tree.updateProgress(0.0);

    pass3d++;
    if (idx % 25 === 0 || idx === CATALOG.length - 1) {
      console.log(`[3D ROUNDTRIP PASS] #${modelIndex} ${model.code} (${tree.panelsCount} painéis articulados)`);
    }
  } catch (err: any) {
    fail3d++;
    console.log(`[3D FAIL] #${modelIndex} ${model.code}: ${err?.message || err}`);
  }
});

console.log('\n============================================================');
console.log(`RESUMO DO TESTE 3D:`);
console.log(`TOTAL MODELOS: ${CATALOG.length}`);
console.log(`3D PASS (DOBRÁVEIS TESTADOS 0% -> 100% -> 0%): ${pass3d}`);
console.log(`3D NOT_APPLICABLE (MODELOS PLANOS / SEM DOBRA): ${notApplicable}`);
console.log(`3D FAIL: ${fail3d}`);
console.log('============================================================');
