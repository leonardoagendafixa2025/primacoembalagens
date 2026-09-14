import * as THREE from 'three';
import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const d = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3, H7: 100 });
const top = buildFoldingTopology(d);

function createMesh(boundary: { x: number; y: number }[], holes: { x: number; y: number }[][], Ep: number) {
  const shape = new THREE.Shape();
  if (boundary.length > 0) {
    shape.moveTo(boundary[0].x, boundary[0].y);
    for (let i = 1; i < boundary.length; i++) {
      shape.lineTo(boundary[i].x, boundary[i].y);
    }
    shape.closePath();
  }
  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h[0].x, h[0].y);
    for (let i = 1; i < h.length; i++) p.lineTo(h[i].x, h[i].y);
    p.closePath();
    shape.holes.push(p);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Ep, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
}

function runSimulation(axisSignOverrides: Record<string, number>, angleOverrides: Record<string, number>) {
  const rootGroup = new THREE.Group();
  const rootPanel = top.panels.find(p => p.isRoot)!;

  interface NodeItem {
    panel: typeof top.panels[0];
    pivotGroup: THREE.Group;
    mesh: THREE.Mesh;
    hingeAxis: THREE.Vector3;
    angleRad: number;
  }

  const items = new Map<string, NodeItem>();

  for (const p of top.panels) {
    const mesh = createMesh(p.boundary, p.holes, 3.0);
    mesh.name = p.id;
    const pivotGroup = new THREE.Group();
    pivotGroup.name = `pivot_${p.id}`;

    let hingeAxis = new THREE.Vector3(1, 0, 0);
    let angleRad = 0;

    if (p.hingeToParent) {
      const h = p.hingeToParent;
      const sign = axisSignOverrides[h.id] ?? 1;
      hingeAxis = new THREE.Vector3(h.axis.x * sign, h.axis.y * sign, h.axis.z * sign).normalize();
      const deg = angleOverrides[h.id] ?? 90;
      angleRad = (deg * Math.PI) / 180;
    }

    items.set(p.id, { panel: p, pivotGroup, mesh, hingeAxis, angleRad });
  }

  const rootItem = items.get(rootPanel.id)!;
  rootItem.pivotGroup.add(rootItem.mesh);
  rootGroup.add(rootItem.pivotGroup);

  for (const p of top.panels) {
    if (p.id === rootPanel.id) continue;
    const item = items.get(p.id)!;
    const parentItem = items.get(p.parentId!)!;
    const h = p.hingeToParent!;

    const childOrigin = new THREE.Vector3(h.origin.x, h.origin.y, h.origin.z);
    item.mesh.position.set(-childOrigin.x, -childOrigin.y, -childOrigin.z);
    item.pivotGroup.add(item.mesh);

    if (parentItem.panel.hingeToParent) {
      const parentOrigin = parentItem.panel.hingeToParent.origin;
      item.pivotGroup.position.set(
        childOrigin.x - parentOrigin.x,
        childOrigin.y - parentOrigin.y,
        childOrigin.z - parentOrigin.z
      );
    } else {
      item.pivotGroup.position.copy(childOrigin);
    }

    parentItem.pivotGroup.add(item.pivotGroup);
  }

  // Apply fold rotation
  for (const [id, item] of items.entries()) {
    if (id === rootPanel.id) continue;
    const q = new THREE.Quaternion().setFromAxisAngle(item.hingeAxis, item.angleRad);
    item.pivotGroup.quaternion.copy(q);
  }

  rootGroup.updateMatrixWorld(true);

  // Measure bounds of key panels
  const panelBounds: Record<string, { min: THREE.Vector3; max: THREE.Vector3 }> = {};
  for (const p of top.panels) {
    const mesh = items.get(p.id)!.mesh;
    const bbox = new THREE.Box3().setFromObject(mesh);
    panelBounds[p.id] = { min: bbox.min, max: bbox.max };
  }

  return { rootGroup, panelBounds };
}

// First test with default signs and 90 degrees everywhere
const test1 = runSimulation({}, {});
console.log('--- TEST 1: All angles 90° with current axes ---');
for (const [id, b] of Object.entries(test1.panelBounds)) {
  const w = b.max.x - b.min.x;
  const h = b.max.y - b.min.y;
  const d = b.max.z - b.min.z;
  console.log(`Panel ${id.padEnd(8)}: X=[${b.min.x.toFixed(1)}, ${b.max.x.toFixed(1)}] | Y=[${b.min.y.toFixed(1)}, ${b.max.y.toFixed(1)}] | Z=[${b.min.z.toFixed(1)}, ${b.max.z.toFixed(1)}]`);
}
