
import { ecmaA1075 } from '../src/engine/models/ecmaA1075';

function testDimensions(L: number, B: number, H: number) {
  const res = ecmaA1075.calculate({ L, B, H });
  console.log('TEST L=' + L + ', B=' + B + ', H=' + H + ':');
  console.log('  Bounds: ' + res.bounds.width + ' x ' + res.bounds.height + ' mm');

  const s30 = res.segments.find(s => s.id === 'seg-30')!;
  const s31 = res.segments.find(s => s.id === 'seg-31')!;
  const arc = res.arcs.find(a => a.id === 'arc-32')!;

  const deg2rad = Math.PI / 180;
  // Arc point 0: at angleEnd
  const pArc0 = {
    x: arc.cx + arc.r * Math.cos(arc.endAngle * deg2rad),
    y: arc.cy + arc.r * Math.sin(arc.endAngle * deg2rad)
  };
  // Arc point 1: at angleStart
  const pArc1 = {
    x: arc.cx + arc.r * Math.cos(arc.startAngle * deg2rad),
    y: arc.cy + arc.r * Math.sin(arc.startAngle * deg2rad)
  };

  const gap0 = Math.hypot(s30.x1 - pArc0.x, s30.y1 - pArc0.y);
  const gap1 = Math.hypot(s31.x1 - pArc1.x, s31.y1 - pArc1.y);

  console.log('  s30 end: (' + s30.x1.toFixed(3) + ', ' + s30.y1.toFixed(3) + ') vs arc end: (' + pArc0.x.toFixed(3) + ', ' + pArc0.y.toFixed(3) + ') -> GAP 0 = ' + gap0.toFixed(6) + ' mm');
  console.log('  s31 end: (' + s31.x1.toFixed(3) + ', ' + s31.y1.toFixed(3) + ') vs arc start: (' + pArc1.x.toFixed(3) + ', ' + pArc1.y.toFixed(3) + ') -> GAP 1 = ' + gap1.toFixed(6) + ' mm');
  if (gap0 < 0.001 && gap1 < 0.001) {
    console.log('  [PASS] ZERO GAP! TANGENCIA PERFEITA!');
  } else {
    console.log('  [FAIL] GAP DETECTADO!');
  }
}

testDimensions(150, 110, 250);
testDimensions(500, 350, 400);
testDimensions(600, 250, 300);
testDimensions(300, 150, 500);
