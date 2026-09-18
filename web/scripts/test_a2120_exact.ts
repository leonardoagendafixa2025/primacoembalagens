import { getModelById } from '../src/engine/registry';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

const model = getModelById('ecma_a2120');
console.log('Model found:', model.id, model.code, model.name);

// Parâmetros idênticos aos da imagem:
const params = { L: 100, B: 50, H: 52, Ep: 0.5 };
const dieline = model.calculate(params);

console.log('Dieline Segments:', dieline.segments.length);
console.log('Cuts:', dieline.segments.filter(s => s.type === 'cut').length);
console.log('Creases:', dieline.segments.filter(s => s.type === 'crease').length);

const topology = buildFoldingTopology(dieline);
console.log('\n--- TOPOLOGY ---');
console.log('Panels count:', topology.panels.length);
console.log('Root panel ID:', topology.rootPanelId);
console.log('Hinges count:', topology.hinges.length);

for (let i = 0; i < topology.panels.length; i++) {
  const p = topology.panels[i];
  console.log(`Panel ${i} [${p.id}]: area=${p.area.toFixed(1)}, center=(${p.centroid.x.toFixed(1)}, ${p.centroid.y.toFixed(1)}), vertices=${p.boundary.length}`);
}

console.log('\nHinges:');
for (const h of topology.hinges) {
  console.log(`Hinge [${h.id}]: parent=${h.parentPanelId} <-> child=${h.childPanelId}, len=${h.length.toFixed(1)}, angle=${h.targetAngleDeg}`);
}

const tree = buildFoldable3DTree(dieline, 0.5);
console.log('\n--- 3D TREE ---');
console.log('Panels in tree:', tree.panelsCount);
const infoList = tree.getHingeInfoList();
console.log('Hinge info count:', infoList.length);
for (const c of infoList) {
  console.log(`Hinge: ${c.panelId} (${c.panelName}) -> parent=${c.parentId} (${c.parentName}), angle=${c.nominalAngleDeg}`);
}
