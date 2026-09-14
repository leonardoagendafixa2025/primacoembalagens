import { fefco0429 } from '../src/engine/models/fefco0429';
import * as fs from 'fs';
import * as path from 'path';

const scratchDir = 'C:/Users/Preimpressao-Primaco/.gemini/antigravity-ide/scratch';

const cases = [
  { name: 'standard', L: 300, B: 200, H: 150, Ep: 3.0, H7: 100 },
  { name: 'caseA', L: 100, B: 80, H: 50, Ep: 3.0, H7: 50 },
  { name: 'caseB', L: 200, B: 120, H: 80, Ep: 3.0, H7: 80 },
  { name: 'caseC', L: 300, B: 200, H: 100, Ep: 3.0, H7: 100 },
];

for (const c of cases) {
  const res = fefco0429.calculate({ L: c.L, B: c.B, H: c.H, Ep: c.Ep, H7: c.H7 });
  const outPath = path.join(scratchDir, 'web_f429_' + c.name + '.json');
  fs.writeFileSync(outPath, JSON.stringify({
    segments: res.segments || [],
    arcs: res.arcs || []
  }, null, 2));
  console.log('DUMPED ' + c.name + ': ' + res.segments.length + ' segs, ' + (res.arcs ? res.arcs.length : 0) + ' arcs');
}
