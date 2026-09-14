import { getModelById } from '../src/engine/registry';

const model = getModelById('ecma_c3055');
console.log('Model:', model.code, model.name);
const geom = model.calculate(model.defaultParams || { L: 300, B: 200, H: 150, Ep: 3 });
console.log('Segments count:', geom.segments.length);
console.log('Arcs count:', geom.arcs?.length);

let maxSweep = 0;
let minSweep = 360;

for (const a of (geom.arcs || [])) {
  const sweep = a.endAngle - a.startAngle;
  if (sweep > maxSweep) maxSweep = sweep;
  if (sweep < minSweep) minSweep = sweep;
  console.log('  Arc: center=(' + a.cx + ', ' + a.cy + ') r=' + a.r + ' s=' + a.startAngle + ' e=' + a.endAngle + ' -> sweep=' + sweep.toFixed(2) + ' deg');
}

console.log('Summary: Min Sweep = ' + minSweep.toFixed(2) + ' deg, Max Sweep = ' + maxSweep.toFixed(2) + ' deg');
if (maxSweep <= 180 && minSweep > 0) {
  console.log('>>> [PASS] TODOS OS ARCOS SAO CONVEXOS/CONCAVOS PERFEITOS! NENHUM LOOP PAC-MAN! <<<');
} else {
  console.log('>>> [FAIL] Existem arcos com sweep inesperado! <<<');
}
