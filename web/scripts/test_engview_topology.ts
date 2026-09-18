import * as fs from 'fs';
import * as path from 'path';
import { parseEngViewSvg } from '../src/engine/svgDielineParser';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

const engviewDir = path.resolve(__dirname, '../public/dielines/engview');
const files = fs.readdirSync(engviewDir).filter(f => f.endsWith('.svg')).slice(0, 15);

console.log(`Testando ${files.length} arquivos SVG do EngView...`);

for (const file of files) {
  const filePath = path.join(engviewDir, file);
  const svgText = fs.readFileSync(filePath, 'utf-8');
  try {
    const dieline = parseEngViewSvg(svgText);
    const cuts = dieline.segments.filter(s => s.type === 'cut').length;
    const creases = dieline.segments.filter(s => s.type === 'crease').length;
    
    console.log(`\n========================================`);
    console.log(`Arquivo: ${file}`);
    console.log(`Bounds: ${dieline.bounds.width.toFixed(1)} x ${dieline.bounds.height.toFixed(1)}`);
    console.log(`Segmentos: ${dieline.segments.length} (Cortes: ${cuts}, Vincos: ${creases})`);
    
    const topology = buildFoldingTopology(dieline);
    console.log(`Topologia -> Painéis: ${topology.panels.length}, Vincos (hinges): ${topology.hinges.length}, Root: ${topology.rootPanelId}`);
    
    if (topology.panels.length === 0) {
      console.warn(`[AVISO] Zero painéis gerados!`);
    } else {
      const tree = buildFoldable3DTree(dieline, 2.0);
      console.log(`Árvore 3D -> Painéis na árvore: ${tree.panelsCount}`);
      // Test fold progress
      tree.updateProgress(0);
      tree.updateProgress(0.5);
      tree.updateProgress(1.0);
      console.log(`[SUCESSO] Dobra 0% -> 50% -> 100% calculada.`);
    }
  } catch (err: any) {
    console.error(`[ERRO] Falha ao processar ${file}:`, err.message);
  }
}
