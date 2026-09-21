import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { CATALOG, getModelById } from '../src/engine/registry';
import { parseEngViewSvg, setLoadedSvgDieline } from '../src/engine/svgDielineParser';
import { buildFoldingTopology } from '../src/engine/dielineTopology';
import { buildFoldable3DTree } from '../src/engine/foldingEngine';

interface AuditResult {
  index: number;
  id: string;
  code: string;
  category: string;
  isEngView: boolean;
  status2D: 'PASS' | 'FAIL';
  err2D?: string;
  segmentsCount: number;
  cutsCount: number;
  creasesCount: number;
  arcsCount: number;
  topologyStatus: 'PASS' | 'FAIL' | 'NO_CREASES' | 'NOT_TESTED';
  panelsCount: number;
  hingesCount: number;
  treeStatus: 'PASS' | 'FAIL' | 'NOT_TESTED';
  err3D?: string;
  flatDiff?: number;
  revDiff?: number;
  h100?: number;
}

const results: AuditResult[] = [];

console.log(`========================================================================`);
console.log(`  AUDITORIA PROFUNDA DOS ${CATALOG.length} MODELOS (401 DES/DLL/TS + 2213 ENGVIEW)`);
console.log(`========================================================================\n`);

const startTime = Date.now();

for (let i = 0; i < CATALOG.length; i++) {
  const item = CATALOG[i] as any;
  const isEngView = !!item.svgDieline;
  const res: AuditResult = {
    index: i + 1,
    id: item.id,
    code: item.code,
    category: item.category,
    isEngView,
    status2D: 'FAIL',
    segmentsCount: 0,
    cutsCount: 0,
    creasesCount: 0,
    arcsCount: 0,
    topologyStatus: 'NOT_TESTED',
    panelsCount: 0,
    hingesCount: 0,
    treeStatus: 'NOT_TESTED',
  };

  // Se for EngView, pré-carrega o SVG do disco local
  if (isEngView && item.svgDieline) {
    const svgRelPath = item.svgDieline.startsWith('/') ? item.svgDieline.slice(1) : item.svgDieline;
    const svgFullPath = path.join(process.cwd(), 'public', svgRelPath);
    if (fs.existsSync(svgFullPath)) {
      try {
        const svgContent = fs.readFileSync(svgFullPath, 'utf-8');
        const parsedDieline = parseEngViewSvg(svgContent);
        setLoadedSvgDieline(item.id, parsedDieline);
      } catch (errSvg: any) {
        res.err2D = `Falha parser SVG: ${errSvg?.message}`;
        results.push(res);
        continue;
      }
    } else {
      res.err2D = `Arquivo SVG não encontrado no disco: ${svgFullPath}`;
      results.push(res);
      continue;
    }
  }

  try {
    const model = getModelById(item.id);
    const params = model.defaultParams || { L: 300, B: 200, H: 150, Ep: 1.0 };
    const dieline = model.calculate(params);

    if (!dieline || !dieline.segments || dieline.segments.length === 0) {
      res.err2D = 'Segmentos vazios';
      results.push(res);
      continue;
    }

    // Check NaN
    let hasNan = false;
    for (const s of dieline.segments) {
      if (!isFinite(s.x0) || !isFinite(s.y0) || !isFinite(s.x1) || !isFinite(s.y1)) {
        hasNan = true;
        break;
      }
    }
    if (hasNan) {
      res.err2D = 'Coordenadas NaN/Infinito';
      results.push(res);
      continue;
    }

    res.status2D = 'PASS';
    res.segmentsCount = dieline.segments.length;
    res.cutsCount = dieline.segments.filter(s => s.type === 'cut').length;
    res.creasesCount = dieline.segments.filter(s => s.type === 'crease').length;
    res.arcsCount = dieline.arcs?.length || 0;

    if (res.creasesCount === 0) {
      res.topologyStatus = 'NO_CREASES';
      results.push(res);
      continue;
    }

    // Test topology
    try {
      const topo = dieline.customTopology || buildFoldingTopology(dieline);
      res.panelsCount = topo.panels.length;
      res.hingesCount = topo.hinges.length;
      res.topologyStatus = topo.panels.length > 0 ? 'PASS' : 'FAIL';

      if (topo.panels.length > 0) {
        // Test 3D Tree
        try {
          const tree = buildFoldable3DTree(dieline, params.Ep || 1.0);
          tree.updateProgress(0);
          tree.rootGroup.updateMatrixWorld(true);
          const box0 = new THREE.Box3().setFromObject(tree.rootGroup);
          const w0 = box0.max.x - box0.min.x;
          const d0 = box0.max.z - box0.min.z;
          res.flatDiff = Math.hypot(w0 - dieline.bounds.width, d0 - dieline.bounds.height);

          tree.updateProgress(1.0);
          tree.rootGroup.updateMatrixWorld(true);
          const box100 = new THREE.Box3().setFromObject(tree.rootGroup);
          res.h100 = box100.max.y - box100.min.y;

          tree.updateProgress(0);
          tree.rootGroup.updateMatrixWorld(true);
          const boxRev = new THREE.Box3().setFromObject(tree.rootGroup);
          res.revDiff = Math.hypot(boxRev.max.x - box0.max.x, boxRev.max.z - box0.max.z);

          res.treeStatus = 'PASS';
        } catch (err3d: any) {
          res.treeStatus = 'FAIL';
          res.err3D = err3d?.message || String(err3d);
        }
      }
    } catch (errTopo: any) {
      res.topologyStatus = 'FAIL';
      res.err3D = errTopo?.message || String(errTopo);
    }
  } catch (err2d: any) {
    res.err2D = err2d?.message || String(err2d);
  }

  results.push(res);

  if ((i + 1) % 500 === 0 || i + 1 === CATALOG.length) {
    console.log(`  Processados ${i + 1}/${CATALOG.length} modelos... (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
  }
}

// Resumo
const total2dPass = results.filter(r => r.status2D === 'PASS').length;
const total2dFail = results.filter(r => r.status2D === 'FAIL').length;
const totalNoCreases = results.filter(r => r.topologyStatus === 'NO_CREASES').length;
const totalTopoPass = results.filter(r => r.topologyStatus === 'PASS').length;
const totalTopoFail = results.filter(r => r.topologyStatus === 'FAIL').length;
const total3dPass = results.filter(r => r.treeStatus === 'PASS').length;
const total3dFail = results.filter(r => r.treeStatus === 'FAIL').length;

console.log('\n============================================================');
console.log('RESUMO CONSOLIDADO DA AUDITORIA GERAL (TODOS OS MODELOS):');
console.log(`TOTAL DO CATÁLOGO: ${results.length}`);
console.log(`2D VETORIAL PASS: ${total2dPass} | 2D FAIL: ${total2dFail}`);
console.log(`SEM VINCOS (MODELOS PLANOS): ${totalNoCreases}`);
console.log(`TOPOLOGIA EXTRAÍDA PASS: ${totalTopoPass} | TOPOLOGIA FAIL: ${totalTopoFail}`);
console.log(`3D ÁRVORE CINEMÁTICA PASS: ${total3dPass} | 3D FAIL: ${total3dFail}`);
console.log(`TEMPO TOTAL: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
console.log('============================================================\n');

// Detalhes das falhas 2D
const failures2D = results.filter(r => r.status2D === 'FAIL');
if (failures2D.length > 0) {
  console.log(`\n--- FALHAS 2D (${failures2D.length}) ---`);
  for (const f of failures2D.slice(0, 50)) {
    console.log(`[${f.code}] (${f.id}) [EngView: ${f.isEngView}]: ${f.err2D}`);
  }
}

// Detalhes das falhas Topologia
const failuresTopo = results.filter(r => r.topologyStatus === 'FAIL');
if (failuresTopo.length > 0) {
  console.log(`\n--- FALHAS TOPOLOGIA (${failuresTopo.length}) ---`);
  for (const f of failuresTopo.slice(0, 50)) {
    console.log(`[${f.code}] (${f.id}): ${f.err3D || 'Falha ao gerar painéis'}`);
  }
}

// Detalhes das falhas 3D
const failures3D = results.filter(r => r.treeStatus === 'FAIL');
if (failures3D.length > 0) {
  console.log(`\n--- FALHAS 3D TREE (${failures3D.length}) ---`);
  for (const f of failures3D.slice(0, 50)) {
    console.log(`[${f.code}] (${f.id}): ${f.err3D}`);
  }
}

// Falhas de reversibilidade ou flat diff
const flatDiffFails = results.filter(r => r.flatDiff !== undefined && r.flatDiff > 0.1);
console.log(`\nModelos com divergência no Flat 0% (>0.1mm): ${flatDiffFails.length}`);
if (flatDiffFails.length > 0) {
  for (const f of flatDiffFails.slice(0, 10)) {
    console.log(`[${f.code}] (${f.id}): diff = ${f.flatDiff?.toFixed(3)}mm`);
  }
}

const revDiffFails = results.filter(r => r.revDiff !== undefined && r.revDiff > 1e-4);
console.log(`\nModelos com erro de reversibilidade 100%->0% (>1e-4mm): ${revDiffFails.length}`);
if (revDiffFails.length > 0) {
  for (const f of revDiffFails.slice(0, 10)) {
    console.log(`[${f.code}] (${f.id}): rev = ${f.revDiff?.toExponential(3)}mm`);
  }
}
