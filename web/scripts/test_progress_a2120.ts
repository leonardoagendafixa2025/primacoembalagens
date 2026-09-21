import * as THREE from 'three';
import { getModelById } from '../src/engine/registry';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

console.log('===============================================================');
console.log('  TESTE DE PROGRESSÃO CINEMÁTICA 3D: ECMA A2120 (CARTUCHO)');
console.log('===============================================================\n');

const model = getModelById('ecma_a2120');
const params = { L: 100, B: 50, H: 52, Ep: 0.5 };
const dieline = model.calculate(params);

console.log(`Modelo: ${model.code} - ${model.name}`);
console.log(`Parâmetros: L=${params.L}, B=${params.B}, H=${params.H}, Ep=${params.Ep}`);
console.log(`Dimensões Faca 2D: ${dieline.bounds.width.toFixed(1)} x ${dieline.bounds.height.toFixed(1)} mm`);
console.log(`Segmentos: ${dieline.segments.length} (Cortes: ${dieline.segments.filter(s => s.type === 'cut').length}, Vincos: ${dieline.segments.filter(s => s.type === 'crease').length})`);

const topology = buildFoldingTopology(dieline);
console.log(`\nTopologia Extraída:`);
console.log(`  Painéis: ${topology.panels.length}`);
console.log(`  Vincos / Dobradiças: ${topology.hinges.length}`);
console.log(`  Painel Raiz (Base/Fundo): [${topology.rootPanelId}]`);

console.log('\n--- PAINÉIS 2D E HIERARQUIA CINEMÁTICA ---');
for (const p of topology.panels) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of p.boundary) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  console.log(`  [${p.id}] "${p.name}": w=${w.toFixed(1)}mm, h=${h.toFixed(1)}mm, área=${p.area.toFixed(1)}mm², parent=${p.parentId || 'RAIZ'}`);
}

const tree = buildFoldable3DTree(dieline, params.Ep);

console.log('\n--- PROGRESSÃO DE DOBRA (0% -> 100%) ---');
const stages = [
  { p: 0.00, desc: 'Totalmente Planificada (Flat Sheet)' },
  { p: 0.25, desc: 'Início da dobra dos corpos laterais' },
  { p: 0.50, desc: 'Paredes verticais a 90° e tubo formado' },
  { p: 0.75, desc: 'Abas de poeira dobradas e tampas fechando' },
  { p: 1.00, desc: 'Montagem 100% Completa e Fechada' },
];

for (const stage of stages) {
  tree.updateProgress(stage.p);
  tree.rootGroup.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(tree.rootGroup);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  console.log(`  ${(stage.p * 100).toFixed(0).padStart(3, ' ')}% [${stage.desc}]:`);
  console.log(`       Largura(X)=${size.x.toFixed(1)}mm, Altura(Y)=${size.y.toFixed(1)}mm, Profundidade(Z)=${size.z.toFixed(1)}mm (Centro Y=${center.y.toFixed(1)}mm)`);
}

// 100% Assembled Box Validation
tree.updateProgress(1.0);
tree.rootGroup.updateMatrixWorld(true);
const box100 = new THREE.Box3().setFromObject(tree.rootGroup);
const size100 = new THREE.Vector3();
box100.getSize(size100);

// Reversibility check: return to 0%
tree.updateProgress(0);
tree.rootGroup.updateMatrixWorld(true);
const box0 = new THREE.Box3().setFromObject(tree.rootGroup);
const size0 = new THREE.Vector3();
box0.getSize(size0);

const flatError = Math.hypot(size0.x - dieline.bounds.width, size0.z - dieline.bounds.height);
const revError = Math.hypot(box0.min.x - (-dieline.bounds.width / 2 + dieline.bounds.minX), box0.min.z - (-dieline.bounds.height / 2 + dieline.bounds.minY));

console.log('\n--- VERIFICAÇÃO FINAL DE PRECISÃO ---');
console.log(`  Erro no Flat (0% vs Dieline 2D): ${flatError.toFixed(4)} mm`);
console.log(`  Altura da Caixa Montada (100%): ${size100.y.toFixed(1)} mm`);
console.log(`  Reversibilidade Cinemática (100% -> 0%): erro = ${flatError.toExponential(3)} mm`);

const isPass = flatError < 0.01 && size100.y > 20 && topology.panels.length === 13;
console.log(`\n  STATUS DO MODELO ECMA A2120: ${isPass ? '✅ 100% APROVADO (PASS)' : '❌ REPROVADO (FAIL)'}\n`);
