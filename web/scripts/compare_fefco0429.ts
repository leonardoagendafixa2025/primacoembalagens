import { fefco0429 } from '../src/engine/models/fefco0429';

function testCase(label: string, L: number, B: number, H: number, Ep: number) {
  console.log('\n============================================================');
  console.log('EVALUATING WEB RUNTIME: ' + label);
  console.log('============================================================');
  const res = fefco0429.calculate({ L, B, H, Ep, H7: Math.min(H, 100) });
  const segs = res.segments || [];
  const arcs = res.arcs || [];
  const cutSegs = segs.filter(s => s.type === 'cut').length;
  const creaseSegs = segs.filter(s => s.type === 'crease').length;
  const cutArcs = arcs.filter(a => a.type === 'cut').length;
  const creaseArcs = arcs.filter(a => a.type === 'crease').length;
  console.log('Total Entities: ' + (segs.length + arcs.length));
  console.log('Segments: ' + segs.length + ' (Cut: ' + cutSegs + ', Crease: ' + creaseSegs + ')');
  console.log('Arcs: ' + arcs.length + ' (Cut: ' + cutArcs + ', Crease: ' + creaseArcs + ')');
  console.log('Arc Radii: ' + arcs.map(a => a.r).join(', '));
  return { segs, arcs };
}

testCase('STANDARD (L=300, B=200, H=150, Ep=3.0)', 300, 200, 150, 3.0);
testCase('CASO A (L=100, B=80, H=50, Ep=3.0)', 100, 80, 50, 3.0);
testCase('CASO B (L=200, B=120, H=80, Ep=3.0)', 200, 120, 80, 3.0);
testCase('CASO C (L=300, B=200, H=100, Ep=3.0)', 300, 200, 100, 3.0);
