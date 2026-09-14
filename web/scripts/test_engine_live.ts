import * as THREE from 'three';
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

const d = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3, H7: 100 });
const tree = buildFoldable3DTree(d, 3.0);

console.log('=== TESTE EM TEMPO REAL DO MOTOR 3D REFINADO ===');

function measure(stage: string, progress: number) {
  tree.updateProgress(progress);
  tree.rootGroup.updateMatrixWorld(true);

  console.log(`\n--- ESTÁGIO: ${stage} (${(progress * 100).toFixed(0)}%) ---`);
  
  const box = new THREE.Box3().setFromObject(tree.rootGroup);
  console.log(`  Dimensões Totais: Largura=${(box.max.x - box.min.x).toFixed(1)}mm, Altura=${(box.max.y - box.min.y).toFixed(1)}mm, Profundidade=${(box.max.z - box.min.z).toFixed(1)}mm`);
  console.log(`  Extensão Y: [${box.min.y.toFixed(1)}, ${box.max.y.toFixed(1)}]`);

  // Log specific key panels
  for (const p of tree.topology.panels) {
    if (['panel_2', 'panel_1', 'panel_18', 'panel_20', 'panel_5'].includes(p.id)) {
      let min = new THREE.Vector3(Infinity, Infinity, Infinity);
      let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

      tree.rootGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.name === p.name) {
          const bbox = new THREE.Box3().setFromObject(obj);
          min = bbox.min;
          max = bbox.max;
        }
      });
      console.log(`    ${p.name.padEnd(20)}: X=[${min.x.toFixed(1)}, ${max.x.toFixed(1)}] | Y=[${min.y.toFixed(1)}, ${max.y.toFixed(1)}] | Z=[${min.z.toFixed(1)}, ${max.z.toFixed(1)}]`);
    }
  }
}

measure('0% (Plana)', 0.0);
measure('25%', 0.25);
measure('50%', 0.50);
measure('75%', 0.75);
measure('100% (Montada)', 1.0);
measure('Retorno a 0%', 0.0);
