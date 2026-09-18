import * as THREE from 'three';
import { fefco0200 } from '../src/engine/models/fefco0200';
import { fefco0201 } from '../src/engine/models/fefco0201';
import { fefco0203 } from '../src/engine/models/fefco0203';
import { fefco0427 } from '../src/engine/models/fefco0427';
import { fefco0429 } from '../src/engine/models/fefco0429';
import { getModelById } from '../src/engine/registry';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

const models = [
  { name: 'ECMA A2120', model: getModelById('ecma_a2120'), params: { L: 100, B: 50, H: 52, Ep: 0.5 } },
  { name: 'FEFCO 0429', model: fefco0429, params: { L: 300, B: 200, H: 150, Ep: 3 } },
  { name: 'FEFCO 0201', model: fefco0201, params: { L: 300, B: 200, H: 150, Ep: 3 } },
  { name: 'FEFCO 0200', model: fefco0200, params: { L: 300, B: 200, H: 150, Ep: 3 } },
  { name: 'FEFCO 0203', model: fefco0203, params: { L: 300, B: 200, H: 150, Ep: 3 } },
];

console.log('=== TESTE DE MONTAGEM E FECHAMENTO 3D EM TODOS OS MODELOS ===');

for (const m of models) {
  const d = m.model.calculate(m.params);
  const tree = buildFoldable3DTree(d, m.params.Ep || 1.0);

  // 0% Flat
  tree.updateProgress(0);
  tree.rootGroup.updateMatrixWorld(true);
  const box0 = new THREE.Box3().setFromObject(tree.rootGroup);
  const w0 = box0.max.x - box0.min.x;
  const h0 = box0.max.z - box0.min.z;
  const flatDiff = Math.hypot(w0 - d.bounds.width, h0 - d.bounds.height);

  // 100% Assembled
  tree.updateProgress(1.0);
  tree.rootGroup.updateMatrixWorld(true);
  const box100 = new THREE.Box3().setFromObject(tree.rootGroup);
  const w100 = box100.max.x - box100.min.x;
  const h100 = box100.max.y - box100.min.y;
  const d100 = box100.max.z - box100.min.z;

  // Return to 0%
  tree.updateProgress(0);
  tree.rootGroup.updateMatrixWorld(true);
  const boxReturn = new THREE.Box3().setFromObject(tree.rootGroup);
  const revDiff = Math.hypot(boxReturn.max.x - box0.max.x, boxReturn.max.z - box0.max.z);

  console.log(`\n${m.name}:`);
  console.log(`  Painéis: ${tree.panelsCount} | Vincos: ${tree.topology.hinges.length}`);
  console.log(`  0% Flat Match: erro = ${flatDiff.toFixed(4)}mm (Faca 2D: ${d.bounds.width}x${d.bounds.height}mm)`);
  console.log(`  100% Montada: Largura=${w100.toFixed(1)}mm, Altura(Y)=${h100.toFixed(1)}mm, Profundidade=${d100.toFixed(1)}mm`);
  console.log(`  Reversibilidade 100% -> 0%: erro = ${revDiff.toExponential(3)}mm`);

  const ok = flatDiff < 0.01 && h100 > 100 && revDiff < 1e-5;
  console.log(`  Status: ${ok ? '✅ PASS' : '❌ FAIL'}`);
}
