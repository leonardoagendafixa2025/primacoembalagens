import { CATALOG, getModelById } from '../src/engine/registry';

console.log('============================================================');
console.log('AUDITORIA AUTOMÁTICA DOS 472 MODELOS DO CATÁLOGO');
console.log('============================================================\n');

let passCount = 0;
let failCount = 0;
let noGeomCount = 0;
let docOnlyCount = 0;

CATALOG.forEach((item, idx) => {
  const modelIndex = String(idx + 1).padStart(3, '0');
  const model = getModelById(item.id);

  if (model.status === 'ORIGINAL_NO_GEOMETRY') {
    noGeomCount++;
    console.log(`MODEL ${modelIndex} — ORIGINAL_NO_GEOMETRY`);
    console.log(`  ID: ${model.id}`);
    console.log(`  CODE: ${model.code}`);
    console.log(`  GENERATOR: NONE`);
    console.log(`  ERROR: ${model.error}\n`);
    return;
  }

  if (model.status === 'DOCUMENT_ONLY') {
    docOnlyCount++;
    console.log(`MODEL ${modelIndex} — DOCUMENT_ONLY`);
    console.log(`  ID: ${model.id}`);
    console.log(`  CODE: ${model.code}`);
    console.log(`  GENERATOR: NONE`);
    console.log(`  ERROR: ${model.error}\n`);
    return;
  }

  if (model.status === 'FAIL' || model.generator === 'MISSING') {
    failCount++;
    console.log(`MODEL ${modelIndex} — FAIL`);
    console.log(`  ID: ${model.id}`);
    console.log(`  CODE: ${model.code}`);
    console.log(`  GENERATOR: MISSING`);
    console.log(`  ERROR: ${model.error || 'MODEL_NOT_IMPLEMENTED'}\n`);
    return;
  }

  try {
    const params = model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3.0 };
    const dieline = model.calculate(params);

    if (!dieline || !dieline.segments || dieline.segments.length === 0) {
      failCount++;
      console.log(`MODEL ${modelIndex} — FAIL (EMPTY GEOMETRY)`);
      console.log(`  ID: ${model.id}`);
      console.log(`  CODE: ${model.code}`);
      console.log(`  GENERATOR: ${model.generator}\n`);
      return;
    }

    // Valida NaN e Infinity
    let hasNan = false;
    for (const s of dieline.segments) {
      if (isNaN(s.x0) || isNaN(s.y0) || isNaN(s.x1) || isNaN(s.y1) ||
          !isFinite(s.x0) || !isFinite(s.y0) || !isFinite(s.x1) || !isFinite(s.y1)) {
        hasNan = true;
        break;
      }
    }
    if (dieline.arcs) {
      for (const a of dieline.arcs) {
        if (isNaN(a.cx) || isNaN(a.cy) || isNaN(a.r) ||
            !isFinite(a.cx) || !isFinite(a.cy) || !isFinite(a.r)) {
          hasNan = true;
          break;
        }
      }
    }

    if (hasNan) {
      failCount++;
      console.log(`MODEL ${modelIndex} — FAIL (NaN/Infinity DETECTED)`);
      console.log(`  ID: ${model.id}`);
      console.log(`  CODE: ${model.code}\n`);
      return;
    }

    passCount++;
    console.log(`MODEL ${modelIndex} — PASS [${model.code}] (segs: ${dieline.segments.length}, arcs: ${dieline.arcs?.length || 0})`);
  } catch (err: any) {
    failCount++;
    console.log(`MODEL ${modelIndex} — FAIL`);
    console.log(`  ID: ${model.id}`);
    console.log(`  CODE: ${model.code}`);
    console.log(`  GENERATOR: ${model.generator}`);
    console.log(`  ERROR: ${err?.message || err}\n`);
  }
});

console.log('\n============================================================');
console.log(`AUDITORIA FINALIZADA:`);
console.log(`TOTAL AUDITADO: ${CATALOG.length}`);
console.log(`MODELOS PASS: ${passCount}`);
console.log(`ORIGINAL SEM GEOMETRIA: ${noGeomCount}`);
console.log(`APENAS DOCUMENTO PDF: ${docOnlyCount}`);
console.log(`NÃO IMPLEMENTADO / FAIL: ${failCount}`);
console.log('============================================================');
