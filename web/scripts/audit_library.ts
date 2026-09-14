import { generateAuditMatrix } from '../src/engine/registry';

console.log('============================================================');
console.log('MATRIZ DE AUDITORIA OFICIAL — 472 MODELOS DO CATÁLOGO');
console.log('============================================================\n');

const matrix = generateAuditMatrix();

// Cabeçalho da tabela Markdown
console.log('| # | ID | CODE | NAME | CATEGORY | ORIGINAL_SOURCE | IMPLEMENTATION_TYPE | GENERATOR | PARAMETRIC | 2D | 3D | FOLDABLE | FOLD_0 | FOLD_100 | ROUNDTRIP_100_TO_0 | FALLBACK | ERROR | STATUS |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');

let passCount = 0;
let nonFoldableCount = 0;
let origNoGeomCount = 0;
let docOnlyCount = 0;
let failCount = 0;
let fallbackCount = 0;

matrix.forEach((row) => {
  if (row.fallback !== 'NONE') fallbackCount++;

  switch (row.status) {
    case 'PASS': passCount++; break;
    case 'NON_FOLDABLE': nonFoldableCount++; break;
    case 'ORIGINAL_NO_GEOMETRY': origNoGeomCount++; break;
    case 'DOCUMENT_ONLY': docOnlyCount++; break;
    default: failCount++; break;
  }

  const cleanName = (row.name || '').replace(/\|/g, '-');
  const cleanError = (row.error || 'NONE').replace(/\|/g, '-');

  console.log(`| ${row.index} | ${row.id} | ${row.code} | ${cleanName} | ${row.category} | ${row.originalSource} | ${row.implementationType} | ${row.generator} | ${row.parametric} | ${row.status2D} | ${row.status3D} | ${row.foldable} | ${row.fold0} | ${row.fold100} | ${row.roundtrip100to0} | ${row.fallback} | ${cleanError} | ${row.status} |`);
});

console.log('\n============================================================');
console.log('RESUMO CONSOLIDADO DA BIBLIOTECA');
console.log('============================================================');
console.log(`TOTAL DO CATÁLOGO: ${matrix.length}`);
console.log(`TOTAL DE REGISTRADOS: ${matrix.length}`);
console.log(`TOTAL COM GENERATOR: ${passCount + nonFoldableCount}`);
console.log(`TOTAL 2D OK: ${passCount + nonFoldableCount}`);
console.log(`TOTAL 3D OK: ${passCount}`);
console.log(`TOTAL 3D NÃO APLICÁVEL (MODELO PLANO): ${nonFoldableCount}`);
console.log(`TOTAL SEM GEOMETRIA NO ORIGINAL: ${origNoGeomCount}`);
console.log(`TOTAL APENAS DOCUMENTO PDF: ${docOnlyCount}`);
console.log(`TOTAL FALLBACK: ${fallbackCount} (REGRA ABSOLUTA ZERO FALLBACK)`);
console.log(`TOTAL SEM IMPLEMENTAÇÃO / FAIL: ${failCount}`);
console.log('============================================================');
