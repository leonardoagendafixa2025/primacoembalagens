
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';
import * as THREE from 'three';

const dieline = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3 });
const tree = buildFoldable3DTree(dieline, 3);

// Look at rootPanel:
const rootPanel = tree.topology.panels.find(p => p.isRoot)!;
console.log('Root panel ID:', rootPanel.id, 'centroid:', rootPanel.centroid);

// At 0%:
tree.updateProgress(0);
tree.rootGroup.updateMatrixWorld(true);
const baseMesh = tree.rootGroup.getObjectByName('pivot_' + rootPanel.id)!;
const baseBox0 = new THREE.Box3().setFromObject(baseMesh);
const baseCenter0 = new THREE.Vector3();
baseBox0.getCenter(baseCenter0);
console.log('Base center at 0%:', baseCenter0);

// At 100%:
tree.updateProgress(1);
tree.rootGroup.updateMatrixWorld(true);
const baseBox100 = new THREE.Box3().setFromObject(baseMesh);
const baseCenter100 = new THREE.Vector3();
baseBox100.getCenter(baseCenter100);
console.log('Base center at 100%:', baseCenter100);

const fullBox100 = new THREE.Box3().setFromObject(tree.rootGroup);
const fullCenter100 = new THREE.Vector3();
fullBox100.getCenter(fullCenter100);
console.log('Full box center at 100%:', fullCenter100);
