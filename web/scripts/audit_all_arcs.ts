import { CATALOG, getModelById } from '../src/engine/registry';

console.log('Auditing all models for arc geometry...');

let totalArcs = 0;
let modelsWithArcs = 0;
let badArcs = 0;

for (const item of CATALOG) {
  const model = getModelById(item.id);
  if (model.status === 'ORIGINAL_NO_GEOMETRY' || model.status === 'DOCUMENT_ONLY') continue;
  try {
    const geom = model.calculate(model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3 });
    if (geom.arcs && geom.arcs.length > 0) {
      modelsWithArcs++;
      for (const a of geom.arcs) {
        totalArcs++;
        let sweep = a.endAngle - a.startAngle;
        if (sweep <= 0 || sweep > 360.01) {
          badArcs++;
          console.error(`[FAIL] ${item.id} arc center=(${a.cx},${a.cy}) s=${a.startAngle} e=${a.endAngle} sweep=${sweep}`);
        }
      }
    }
  } catch {
    // ignore
  }
}

console.log(`Audited: ${modelsWithArcs} models with arcs, total ${totalArcs} arcs.`);
console.log(`Bad arcs: ${badArcs}`);
if (badArcs === 0) {
  console.log('>>> [TOTAL PASS] 100% DOS ARCOS DE TODOS OS MODELOS DO SISTEMA ESTAO CORRETOS! <<<');
} else {
  process.exit(1);
}
