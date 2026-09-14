import { fefco0429 } from '../src/engine/models/fefco0429';
import { extractPanelsFromModel, buildFoldable3DTree } from '../src/engine/foldingEngine';
import * as THREE from 'three';

console.log('=== TESTE FORENSE 2D -> 3D (FEFCO 0429) ===');

const params = { L: 300, B: 200, H: 150, Ep: 3.0, H7: 100 };
const dieline = fefco0429.calculate(params);
const panels = extractPanelsFromModel('FEFCO 0429', dieline, params);

console.log('Paineis extraidos: ' + panels.length);
for (const p of panels) {
  const hDeg = p.hinge ? p.hinge.targetAngleDeg + ' deg' : 'none';
  console.log('  - Painel: ' + p.id + ' (' + p.name + '), parent: ' + (p.parentId || 'ROOT') + ', pts: ' + p.points.length + ', hinge: ' + hDeg);
}

const res = buildFoldable3DTree(panels, params.Ep);
const rootGroup = res.rootGroup;
const updateProgress = res.updateProgress;

// 1. TESTE 0% DE DOBRA (Flat State)
updateProgress(0);
rootGroup.updateMatrixWorld(true);

let flatPass = true;
let maxZDeviation = 0;

rootGroup.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    const posAttr = obj.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      v.applyMatrix4(obj.matrixWorld);
      if (v.y < -params.Ep - 0.001 || v.y > 0.001) {
        flatPass = false;
        maxZDeviation = Math.max(maxZDeviation, Math.abs(v.y));
      }
    }
  }
});

console.log('[TESTE 0% FLAT] Coplanaridade: ' + (flatPass ? 'PASS' : 'FAIL (max dev: ' + maxZDeviation + ')'));

// 2. TESTE 100% DE DOBRA
updateProgress(1.0);
rootGroup.updateMatrixWorld(true);

let bbox100 = new THREE.Box3().setFromObject(rootGroup);
let size100 = new THREE.Vector3();
bbox100.getSize(size100);
console.log('[TESTE 100% FOLD] Dimensoes 3D dobradas: X=' + size100.x.toFixed(1) + ', Y=' + size100.y.toFixed(1) + ', Z=' + size100.z.toFixed(1));

if (size100.y < params.H * 0.5) {
  console.log('[TESTE 100% FOLD] FAIL: Altura 3D insuficiente');
} else {
  console.log('[TESTE 100% FOLD] PASS: Estrutura montada volumetrica confirmada');
}

// 3. TESTE DE REVERSIBILIDADE
const cycle = [0, 0.25, 0.5, 0.75, 1.0, 0.75, 0.5, 0.25, 0];
updateProgress(0);
rootGroup.updateMatrixWorld(true);
const initialVerts: number[] = [];
rootGroup.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    const posAttr = obj.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      v.applyMatrix4(obj.matrixWorld);
      initialVerts.push(v.x, v.y, v.z);
    }
  }
});

for (const t of cycle) {
  updateProgress(t);
  rootGroup.updateMatrixWorld(true);
}

let reversiblePass = true;
let maxRevErr = 0;
let vertIdx = 0;
rootGroup.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    const posAttr = obj.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      v.applyMatrix4(obj.matrixWorld);
      const x0 = initialVerts[vertIdx++];
      const y0 = initialVerts[vertIdx++];
      const z0 = initialVerts[vertIdx++];
      const err = Math.max(Math.abs(v.x - x0), Math.abs(v.y - y0), Math.abs(v.z - z0));
      if (err > 0.0001) {
        reversiblePass = false;
        maxRevErr = Math.max(maxRevErr, err);
      }
    }
  }
});

console.log('[TESTE REVERSIBILIDADE] ' + (reversiblePass ? 'PASS' : 'FAIL') + ' (Erro max: ' + maxRevErr.toFixed(6) + ' mm)');
