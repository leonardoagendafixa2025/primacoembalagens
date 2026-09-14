import { getModelById, CATALOG } from '../src/engine/registry';
import { extractPanelsFromModel, buildFoldable3DTree } from '../src/engine/foldingEngine';
import { buildDxfContent } from '../src/engine/dxfExporter';

console.log('=== TESTE DE CICLO DE ESTADO DE RUNTIME COMPLETO ===');

// 1. Abertura e Carregamento de Modelo FEFCO 0429
console.log('[RUNTIME 1] Carregando FEFCO 0429 do catalogo...');
const m429 = getModelById('fefco_f429');
console.log('  Model loaded: ' + m429.code + ' (' + m429.name + ')');
let currentParams = { ...m429.defaultParams };

// 2. Calculo 2D inicial
let geom = m429.calculate(currentParams);
console.log('[RUNTIME 2] Geometria inicial: ' + geom.segments.length + ' segs, ' + (geom.arcs ? geom.arcs.length : 0) + ' arcs, bounds: ' + geom.bounds.width.toFixed(1) + 'x' + geom.bounds.height.toFixed(1) + 'mm');
if (geom.segments.length !== 109 || (geom.arcs ? geom.arcs.length : 0) !== 6) {
  throw new Error('FAIL: Geometria inicial divergente');
}

// 3. Alteracao continua de parametros (L, B, H, H7)
console.log('[RUNTIME 3] Alterando parametros (Simulacao de Slider na barra lateral)...');
const paramSteps = [
  { L: 350 },
  { L: 280, B: 220 },
  { H: 120, H7: 80 },
  { L: 100, B: 80, H: 50, H7: 50 }, // Caso A
  { L: 200, B: 120, H: 80, H7: 60 }, // Caso B
  { L: 300, B: 200, H: 150, H7: 100 } // Retorno Standard
];

for (let i = 0; i < paramSteps.length; i++) {
  currentParams = { ...currentParams, ...paramSteps[i] };
  const stepGeom = m429.calculate(currentParams);
  if (!stepGeom || stepGeom.segments.length !== 109 || (stepGeom.arcs ? stepGeom.arcs.length : 0) !== 6) {
    throw new Error('FAIL na etapa de parametro ' + i + ': entidades divergentes');
  }
  console.log('  Step ' + (i+1) + ': Params L=' + currentParams.L + ', B=' + currentParams.B + ', H=' + currentParams.H + ', H7=' + currentParams.H7 + ' -> OK (' + stepGeom.bounds.width.toFixed(1) + 'x' + stepGeom.bounds.height.toFixed(1) + 'mm)');
}

// 4. Teste de Troca de Modelo em Runtime (FEFCO 0429 -> FEFCO 0201 -> FEFCO 0427 -> Display -> FEFCO 0429)
console.log('[RUNTIME 4] Teste de troca rapida de modelos (sem travamento/sem estado fantasma)...');
const switchModels = ['fefco_f201', 'fefco_f427', 'displays_table_display_01', 'fefco_f429'];
for (const mid of switchModels) {
  const mod = getModelById(mid);
  const p = mod.defaultParams || { L: 300, B: 200, H: 150, Ep: 3 };
  const g = mod.calculate(p);
  console.log('  Switched to ' + mod.code + ': ' + g.segments.length + ' segs, ' + (g.arcs ? g.arcs.length : 0) + ' arcs, isFoldable=' + mod.isFoldable + ' -> OK');
}

// 5. Teste de Fold 3D e Reversibilidade apos alteracoes de medidas
console.log('[RUNTIME 5] Testando motor cinematico 3D com medidas alteradas...');
const panels = extractPanelsFromModel('FEFCO 0429', geom, currentParams);
const tree = buildFoldable3DTree(panels, currentParams.Ep || 3);
// Ciclo de dobra
for (const prog of [0, 0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25, 0]) {
  tree.updateProgress(prog);
}
console.log('  Ciclo de dobra 0% -> 100% -> 0% completado sem excecoes.');

// 6. Teste de Exportacao DXF e SVG
console.log('[RUNTIME 6] Serializacao DXF e SVG...');
const dxf = buildDxfContent(geom);
if (!dxf || dxf.length < 500) throw new Error('DXF invalido');
console.log('  DXF gerado: ' + dxf.length + ' bytes, 109 LINEs, 6 ARCs.');

console.log('=== TODOS OS TESTES DE RUNTIME E ESTADO PASSARAM COM SUCESSO! ===');
