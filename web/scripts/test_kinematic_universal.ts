import * as THREE from 'three';
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const d = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3, H7: 100 });
const top = buildFoldingTopology(d);

console.log('=== TESTE DO ALGORITMO UNIVERSAL DE DOBRAGEM PARA O INTERIOR ===');

// Function to compute the exact signed axis in parent local frame
for (const h of top.hinges) {
  const child = top.panels.find(p => p.id === h.childPanelId)!;
  const parent = top.panels.find(p => p.id === h.parentPanelId)!;

  // In flat sheet:
  // Crease endpoints in XZ plane: (x0, -y0), (x1, -y1)
  const hx0 = h.x0;
  const hz0 = -h.y0;
  const hx1 = h.x1;
  const hz1 = -h.y1;

  const vx = hx1 - hx0;
  const vz = hz1 - hz0;
  const len = Math.hypot(vx, vz);
  const ux = vx / len;
  const uz = vz / len;

  const midX = (hx0 + hx1) / 2;
  const midZ = (hz0 + hz1) / 2;

  const childCentroidX = child.centroid.x;
  const childCentroidZ = -child.centroid.y;

  const dx = childCentroidX - midX;
  const dz = childCentroidZ - midZ;

  // Normal to parent in flat sheet is (0, 1, 0)
  // Cross product (d_child x N_parent) in XZ:
  // (dx, 0, dz) x (0, 1, 0) = (-dz, 0, dx)
  // Dot with crease unit vector (ux, 0, uz):
  const cross = -dz * ux + dx * uz; // = dx * uz - dz * ux

  let sign = 1;
  let ax = ux;
  let az = uz;
  if (cross < 0) {
    sign = -1;
    ax = -ux;
    az = -uz;
  }

  console.log(`Hinge ${h.id.padEnd(16)}: ${parent.id} -> ${child.id.padEnd(8)} | dx=${dx.toFixed(1)}, dz=${dz.toFixed(1)} | cross=${cross.toFixed(1)} | Axis=(${ax.toFixed(2)}, 0, ${az.toFixed(2)}) | TargetAngle = 90°`);
}
