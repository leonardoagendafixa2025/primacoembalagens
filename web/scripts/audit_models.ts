import * as fs from 'fs';
import * as path from 'path';
import { CATALOG, getModelById } from '../src/engine/registry';
import { parseEngViewSvg, setLoadedSvgDieline } from '../src/engine/svgDielineParser';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

console.log('============================================================');
console.log(`AUDITORIA AUTOMÁTICA OFICIAL DOS ${CATALOG.length} MODELOS DO CATÁLOGO`);
console.log('============================================================\n');

let pass2D = 0;
let fail2D = 0;
let pass3D = 0;
let flatPadCount = 0;

const startTime = Date.now();

CATALOG.forEach((item, idx) => {
  const modelIndex = String(idx + 1).padStart(4, '0');
  const catalogItem = item as any;

  // Pré-carrega SVG local quando for modelo EngView
  if (catalogItem.svgDieline) {
    const svgRel = catalogItem.svgDieline.startsWith('/') ? catalogItem.svgDieline.slice(1) : catalogItem.svgDieline;
    const svgPath = path.join(process.cwd(), 'public', svgRel);
    if (fs.existsSync(svgPath)) {
      try {
        const content = fs.readFileSync(svgPath, 'utf-8');
        const parsed = parseEngViewSvg(content);
        setLoadedSvgDieline(item.id, parsed);
      } catch (err: any) {
        fail2D++;
        console.log(`MODEL ${modelIndex} — FAIL [SVG PARSE]: ${item.code} (${err?.message})`);
        return;
      }
    }
  }

  const model = getModelById(item.id);

  try {
    const params = model.defaultParams || { L: 300, B: 200, H: 150, Ep: 1.5 };
    const dieline = model.calculate(params);

    if (!dieline || !dieline.segments || dieline.segments.length === 0) {
      fail2D++;
      console.log(`MODEL ${modelIndex} — FAIL [EMPTY GEOMETRY]: ${model.code} (${model.id})`);
      return;
    }

    // Valida NaN e Infinity
    let hasNan = false;
    for (const s of dieline.segments) {
      if (!isFinite(s.x0) || !isFinite(s.y0) || !isFinite(s.x1) || !isFinite(s.y1)) {
        hasNan = true;
        break;
      }
    }
    if (hasNan) {
      fail2D++;
      console.log(`MODEL ${modelIndex} — FAIL [NaN/Infinity]: ${model.code} (${model.id})`);
      return;
    }

    pass2D++;

    // Verifica se possui vincos
    const creases = dieline.segments.filter((s) => s.type === 'crease');
    if (creases.length === 0) {
      flatPadCount++;
      return;
    }

    // Topologia e 3D
    const topo = dieline.customTopology || buildFoldingTopology(dieline);
    if (topo.panels.length > 0) {
      const tree = buildFoldable3DTree(dieline, params.Ep || 1.5);
      tree.updateProgress(0);
      tree.updateProgress(1.0);
      tree.updateProgress(0);
      pass3D++;
    }
  } catch (err: any) {
    fail2D++;
    console.log(`MODEL ${modelIndex} — FAIL [EXCEPTION]: ${model.code} (${err?.message || err})`);
  }
});

console.log('\n============================================================');
console.log(`AUDITORIA FINALIZADA COM SUCESSO:`);
console.log(`TOTAL AUDITADO NO CATÁLOGO: ${CATALOG.length}`);
console.log(`2D VETORIAL PASS: ${pass2D} / ${CATALOG.length} (${((pass2D / CATALOG.length) * 100).toFixed(1)}%)`);
console.log(`2D FAIL: ${fail2D}`);
console.log(`MODELOS PLANOS (CHAPA/SEM VINCO): ${flatPadCount}`);
console.log(`3D CINEMÁTICA PASS: ${pass3D} / ${CATALOG.length - flatPadCount} (${((pass3D / (CATALOG.length - flatPadCount)) * 100).toFixed(1)}%)`);
console.log(`TEMPO TOTAL: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
console.log('============================================================\n');
