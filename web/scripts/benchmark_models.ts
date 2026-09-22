import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEngViewSvg } from '../src/engine/svgDielineParser';
import { LoopTopologyEngine } from '../src/engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine } from '../src/engine/importers/FoldingTreeEngine';
import { Kinematic3DEngine } from '../src/engine/importers/Kinematic3DEngine';
import rawCatalog from '../src/engine/modelsCatalog.json';
import rawDesData from '../src/engine/desModelsData.json';
import rawCSharpData from '../src/engine/csharpModelsData.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

console.log('Testing benchmark on first 50 models with computeFoldedState...');
const start = Date.now();
let tested = 0;
let errors = 0;

for (const item of rawCatalog.slice(0, 50)) {
  let dieline: any = null;
  if (item.svgDieline) {
    const fullSvg = path.join(repoRoot, 'public', item.svgDieline.replace(/^\//, ''));
    if (fs.existsSync(fullSvg)) {
      const text = fs.readFileSync(fullSvg, 'utf8');
      dieline = parseEngViewSvg(text);
    }
  } else if ((rawCSharpData as any)[item.id]) {
    dieline = (rawCSharpData as any)[item.id].geometry;
  } else if ((rawDesData as any)[item.id]) {
    dieline = (rawDesData as any)[item.id].geometry;
  }

  if (dieline && dieline.segments && dieline.segments.length > 0) {
    if (!dieline.bounds) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const s of dieline.segments) {
        minX = Math.min(minX, s.x0, s.x1);
        minY = Math.min(minY, s.y0, s.y1);
        maxX = Math.max(maxX, s.x0, s.x1);
        maxY = Math.max(maxY, s.y0, s.y1);
      }
      dieline.bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    try {
      const topo = LoopTopologyEngine.extractTopology(dieline);
      const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, dieline);
      if (tree.hinges.length > 0) {
        const kin = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 100);
      }
      tested++;
    } catch (e: any) {
      errors++;
      console.log(`Diagnostic on ${item.id}:`, e.message);
    }
  }
}

const elapsed = Date.now() - start;
console.log(`Success: ${tested}, Errors/Diagnostics: ${errors} in ${elapsed}ms (${(elapsed / 50).toFixed(1)}ms per model).`);
