import { CATALOG, getModelById } from '../src/engine/registry';

console.log('============================================================');
console.log('TESTE DO PIPELINE 2D DE PONTA A PONTA (CATÁLOGO -> 2D CAD)');
console.log('============================================================\n');

let pass2d = 0;
let fail2d = 0;
let nonGeom = 0;

CATALOG.forEach((item, idx) => {
  const modelIndex = String(idx + 1).padStart(3, '0');
  
  // Pipeline: 1. Seleção no catálogo
  const selectedId = item.id;
  
  // 2. Resolução no Registry
  const model = getModelById(selectedId);

  // 3. Verificação de status
  if (model.status === 'ORIGINAL_NO_GEOMETRY' || model.status === 'DOCUMENT_ONLY') {
    nonGeom++;
    return;
  }

  // 4. Execução de cálculo CAD
  try {
    const params = model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3.0 };
    const dieline = model.calculate(params);

    if (dieline && dieline.segments && dieline.segments.length > 0) {
      pass2d++;
      if (idx % 25 === 0 || idx === CATALOG.length - 1) {
        console.log(`[PIPELINE 2D OK] #${modelIndex} ${model.code} -> ${dieline.segments.length} segs, ${dieline.arcs?.length || 0} arcs`);
      }
    } else {
      fail2d++;
      console.log(`[PIPELINE 2D FAIL] #${modelIndex} ${model.code}: Empty geometry`);
    }
  } catch (err: any) {
    fail2d++;
    console.log(`[PIPELINE 2D ERROR] #${modelIndex} ${model.code}: ${err?.message || err}`);
  }
});

console.log('\n============================================================');
console.log(`RESUMO DO TESTE 2D:`);
console.log(`TOTAL TESTADOS: ${CATALOG.length}`);
console.log(`2D PASS: ${pass2d}`);
console.log(`2D SEM GEOMETRIA NO ORIGINAL: ${nonGeom}`);
console.log(`2D FAIL: ${fail2d}`);
console.log('============================================================');
