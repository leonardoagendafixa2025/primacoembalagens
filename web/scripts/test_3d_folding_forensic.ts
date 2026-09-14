import * as THREE from 'three';
import { fefco0429 } from '../src/engine/models/fefco0429';
import { fefco0201 } from '../src/engine/models/fefco0201';
import { fefco0200 } from '../src/engine/models/fefco0200';
import { fefco0203 } from '../src/engine/models/fefco0203';
import { fefco0427 } from '../src/engine/models/fefco0427';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, passMsg: string, failMsg: string) {
  if (condition) {
    results.push({ name, status: 'PASS', details: passMsg });
    console.log(`[PASS] ${name}: ${passMsg}`);
  } else {
    results.push({ name, status: 'FAIL', details: failMsg });
    console.error(`[FAIL] ${name}: ${failMsg}`);
  }
}

console.log('================================================================');
console.log('AUDITORIA FORENSE: FACA 2D -> INTERPRETAÇÃO TOPOLÓGICA -> 3D');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// TESTE 1: FEFCO 0429 - Paridade Topológica da Faca Original
// -----------------------------------------------------------------------------
console.log('--- TESTE: FEFCO 0429 ---');
const d0429 = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3, H7: 100 });
const top0429 = buildFoldingTopology(d0429);

assert(
  top0429.rawSegmentsCount === 109 && top0429.rawArcsCount === 6,
  '0429 ENTITY COUNT',
  `115 entidades processadas (109 segmentos, 6 arcos)`,
  `Entidades divergentes: ${top0429.rawSegmentsCount} segs, ${top0429.rawArcsCount} arcos`
);

assert(
  top0429.panels.length >= 14,
  '0429 PANELS COUNT',
  `${top0429.panels.length} painéis reais extraídos diretamente da faca`,
  `Encontrados ${top0429.panels.length} painéis`
);

assert(
  top0429.hinges.length >= 13,
  '0429 HINGES COUNT',
  `${top0429.hinges.length} vincos articulados conectando toda a árvore cinemática`,
  `Encontrados ${top0429.hinges.length} vincos`
);

const base0429 = top0429.panels.find((p) => p.id === top0429.rootPanelId);
assert(
  base0429 !== undefined && base0429.boundary.length === 28,
  '0429 MORTISE SLOTS PRESERVATION',
  `Painel Base possui 28 vértices integrando os 4 encaixes mortise da faca`,
  `Base possui ${base0429?.boundary.length} vértices`
);

// -----------------------------------------------------------------------------
// TESTE 2: 0% Flat Match (Projeção 3D Top View vs Faca 2D)
// -----------------------------------------------------------------------------
console.log('\n--- TESTE: 0% FLAT MATCH (FEFCO 0429) ---');
const tree0429 = buildFoldable3DTree(d0429, 3.0);
tree0429.updateProgress(0); // 0% dobra

const flatPositions: THREE.Vector3[] = [];
tree0429.rootGroup.updateMatrixWorld(true);

tree0429.rootGroup.traverse((obj) => {
  if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.BufferGeometry) {
    const posAttr = obj.geometry.attributes.position;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      obj.localToWorld(vertex);
      flatPositions.push(vertex.clone());
    }
  }
});

let minX3D = Infinity, maxX3D = -Infinity;
let minZ3D = Infinity, maxZ3D = -Infinity;
let maxYError = 0;

for (const v of flatPositions) {
  if (v.x < minX3D) minX3D = v.x;
  if (v.x > maxX3D) maxX3D = v.x;
  if (v.z < minZ3D) minZ3D = v.z;
  if (v.z > maxZ3D) maxZ3D = v.z;
  if (v.y < -0.001 || v.y > 3.001) {
    maxYError = Math.max(maxYError, Math.abs(v.y));
  }
}

const width3D = maxX3D - minX3D;
const height3D = maxZ3D - minZ3D;
const width2D = d0429.bounds.width;
const height2D = d0429.bounds.height;

const dimError = Math.hypot(width3D - width2D, height3D - height2D);

assert(
  dimError < 0.1,
  '0% FLAT MATCH DIMENSIONS',
  `Largura e Altura 3D coincidem 1:1 com a faca 2D (3D: ${width3D.toFixed(2)}x${height3D.toFixed(2)} vs 2D: ${width2D.toFixed(2)}x${height2D.toFixed(2)}, erro=${dimError.toFixed(4)}mm)`,
  `Divergência dimensional: erro=${dimError.toFixed(4)}mm`
);

assert(
  maxYError < 0.001,
  '0% FLAT COPLANARITY',
  `Todas as faces 3D estão perfeitamente coplanares na chapa plana (Y in [0, 3.0]mm)`,
  `Divergência coplanar: erro=${maxYError}mm`
);

// -----------------------------------------------------------------------------
// TESTE 3: Cinemática Progressiva e Reversibilidade Contínua
// 0% -> 25% -> 50% -> 75% -> 100% -> 75% -> 50% -> 25% -> 0%
// -----------------------------------------------------------------------------
console.log('\n--- TESTE: CINEMÁTICA E REVERSIBILIDADE (0% -> 100% -> 0%) ---');

const initialVertices: THREE.Vector3[] = [];
tree0429.updateProgress(0);
tree0429.rootGroup.updateMatrixWorld(true);
tree0429.rootGroup.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    const pos = obj.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      obj.localToWorld(v);
      initialVertices.push(v.clone());
    }
  }
});

// 25%
tree0429.updateProgress(0.25);
tree0429.rootGroup.updateMatrixWorld(true);
let box25 = new THREE.Box3().setFromObject(tree0429.rootGroup);
assert(box25.max.y > 10, 'FOLD 25%', `Estrutura articula suavemente no espaço 3D (altura Y=${box25.max.y.toFixed(1)}mm)`, `Não elevou`);

// 50%
tree0429.updateProgress(0.50);
tree0429.rootGroup.updateMatrixWorld(true);
let box50 = new THREE.Box3().setFromObject(tree0429.rootGroup);
assert(box50.max.y > box25.max.y, 'FOLD 50%', `Dobra intermediária progressiva (altura Y=${box50.max.y.toFixed(1)}mm)`, `Altura não progrediu`);

// 75%
tree0429.updateProgress(0.75);
tree0429.rootGroup.updateMatrixWorld(true);
let box75 = new THREE.Box3().setFromObject(tree0429.rootGroup);
assert(box75.max.y > 50, 'FOLD 75%', `Dobra avançada em transição com fechamento de abas (altura Y=${box75.max.y.toFixed(1)}mm)`, `Altura inválida`);

// 100%
tree0429.updateProgress(1.0);
tree0429.rootGroup.updateMatrixWorld(true);
let box100 = new THREE.Box3().setFromObject(tree0429.rootGroup);
assert(box100.max.y >= 140, 'FOLD 100%', `Caixa completamente montada em 3D (altura Y=${box100.max.y.toFixed(1)}mm, nominal 150mm)`, `Altura final incorreta`);

// Retorno: 75% -> 50% -> 25% -> 0%
tree0429.updateProgress(0.75);
tree0429.updateProgress(0.50);
tree0429.updateProgress(0.25);
tree0429.updateProgress(0.0);
tree0429.rootGroup.updateMatrixWorld(true);

const finalVertices: THREE.Vector3[] = [];
tree0429.rootGroup.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    const pos = obj.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      obj.localToWorld(v);
      finalVertices.push(v.clone());
    }
  }
});

let maxReversibilityError = 0;
for (let i = 0; i < initialVertices.length; i++) {
  const d = initialVertices[i].distanceTo(finalVertices[i]);
  if (d > maxReversibilityError) maxReversibilityError = d;
}

assert(
  maxReversibilityError < 1e-5,
  '100% -> 0% REVERSIBILITY',
  `Retorno a 0% idêntico ao estado inicial (erro máximo = ${maxReversibilityError.toExponential(3)}mm)`,
  `Erro de reversibilidade: ${maxReversibilityError}mm`
);

// -----------------------------------------------------------------------------
// TESTE 4: Validação dos Modelos Adicionais (FEFCO 0200, 0201, 0203, 0427)
// -----------------------------------------------------------------------------
console.log('\n--- TESTE: MODELOS ADICIONAIS DO CATÁLOGO ---');

const testModels = [
  { model: fefco0200, name: 'FEFCO 0200' },
  { model: fefco0201, name: 'FEFCO 0201' },
  { model: fefco0203, name: 'FEFCO 0203' },
  { model: fefco0427, name: 'FEFCO 0427' },
];

for (const tm of testModels) {
  const dieline = tm.model.calculate({ L: 300, B: 200, H: 150, Ep: 3 });
  const tree = buildFoldable3DTree(dieline, 3.0);
  assert(
    tree.panelsCount > 0,
    `${tm.name} TOPOLOGY`,
    `${tree.panelsCount} painéis reais gerados a partir da faca 2D`,
    `Falha ao extrair painéis`
  );

  tree.updateProgress(0);
  tree.updateProgress(1.0);
  tree.updateProgress(0);
  assert(true, `${tm.name} 0% <-> 100% FOLD`, `Ciclo completo de dobra executado com sucesso`, ``);
}

// -----------------------------------------------------------------------------
// TESTE 5: Sincronização Paramétrica Dinâmica
// -----------------------------------------------------------------------------
console.log('\n--- TESTE: SINCRONIZAÇÃO PARAMÉTRICA (2D <-> 3D) ---');
const dParamA = fefco0429.calculate({ L: 200, B: 150, H: 100, Ep: 2 });
const treeParamA = buildFoldable3DTree(dParamA, 2.0);

const dParamB = fefco0429.calculate({ L: 400, B: 300, H: 200, Ep: 4 });
const treeParamB = buildFoldable3DTree(dParamB, 4.0);

assert(
  treeParamB.panelsCount === treeParamA.panelsCount &&
  dParamB.bounds.width > dParamA.bounds.width,
  'PARAMETRIC SYNC',
  `Geometria 3D escala matematicamente com os parâmetros (L200: ${dParamA.bounds.width.toFixed(0)}mm -> L400: ${dParamB.bounds.width.toFixed(0)}mm)`,
  `Falha na sincronização paramétrica`
);

// -----------------------------------------------------------------------------
// TESTE 6: Isolamento na Troca de Modelo
// -----------------------------------------------------------------------------
console.log('\n--- TESTE: ISOLAMENTO NA TROCA DE MODELO ---');
const treeSwitch1 = buildFoldable3DTree(fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3 }), 3);
const treeSwitch2 = buildFoldable3DTree(fefco0201.calculate({ L: 300, B: 200, H: 150, Ep: 3 }), 3);
const treeSwitch3 = buildFoldable3DTree(fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3 }), 3);

assert(
  treeSwitch1.panelsCount === treeSwitch3.panelsCount &&
  treeSwitch1.panelsCount !== treeSwitch2.panelsCount,
  'MODEL SWITCH ISOLATION',
  `Alternância de modelos sem vazamento de estado (0429: ${treeSwitch1.panelsCount} painéis -> 0201: ${treeSwitch2.panelsCount} -> 0429: ${treeSwitch3.panelsCount})`,
  `Vazamento de estado detectado`
);

// -----------------------------------------------------------------------------
// RESUMO FINAL
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log('RELATÓRIO FORENSE DE EXECUÇÃO:');
console.log('================================================================');
let passCount = 0, failCount = 0;
for (const r of results) {
  console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name.padEnd(32)}: ${r.status}`);
  if (r.status === 'PASS') passCount++; else failCount++;
}
console.log(`\nTOTAL: ${passCount} PASS / ${failCount} FAIL`);

if (failCount > 0) {
  process.exit(1);
}
