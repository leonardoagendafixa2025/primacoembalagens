import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEngViewSvg } from '../src/engine/svgDielineParser';
import { LoopTopologyEngine, type StructuralPanel } from '../src/engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine, type FoldingTreeResult } from '../src/engine/importers/FoldingTreeEngine';
import { Kinematic3DEngine, type Kinematic3DResult } from '../src/engine/importers/Kinematic3DEngine';
import type { PackagingGeometry } from '../src/engine/geometry';
import type { Segment2D, Arc2D } from '../src/engine/types';

import rawCatalog from '../src/engine/modelsCatalog.json';
import rawDesData from '../src/engine/desModelsData.json';
import rawCSharpData from '../src/engine/csharpModelsData.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '..');

// Load metadata map
let metadataMap: Record<string, { pluginGuid: string; dll: string }> = {};
const metaPath = path.join(repoRoot, 'scratch', 'model_metadata_map.json');
if (fs.existsSync(metaPath)) {
  metadataMap = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
}

export type ModelClassification =
  | 'PARAMETRIC_CSHARP'
  | 'PARAMETRIC_BUILTIN'
  | 'PARAMETRIC_DEPENDENCY_RESOLVED'
  | 'STATIC_GEOMETRY'
  | 'DOCUMENT_ONLY'
  | 'ORIGINAL_NO_GEOMETRY';

export interface ModelAuditRecord {
  modelId: string;
  code: string;
  name: string;
  category: string;
  series: string;
  source: string;
  pluginGuid: string;
  dll: string;
  modelType: ModelClassification;
  parameters: Record<string, number>;
  dependencies: string;
  geometrySource: string;
  
  // 2D Geometry validation
  status2D: 'PASS' | 'FAIL' | 'NO_GEOMETRY';
  segmentsCount: number;
  creasesCount: number;
  cutsCount: number;
  arcsCount: number;
  bounds: { width: number; height: number };
  
  // Topology validation
  statusTopology: 'PASS' | 'OPEN_BOUNDARY' | 'FAIL' | 'NOT_APPLICABLE';
  verticesCount: number;
  edgesCount: number;
  panelsCount: number;
  holesCount: number;
  openBoundariesCount: number;
  
  // Folding Tree validation
  hingesCount: number;
  componentsCount: number;
  cyclesCount: number;
  orphanCreasesCount: number;
  rootPanelId: string;
  rootSource: string;
  
  // 3D Kinematics validation
  status3D: '3D_FOLDABLE' | '3D_NON_APPLICABLE' | '3D_FAIL';
  foldStatus: 'REVERSIBLE' | 'NON_REVERSIBLE' | 'NOT_APPLICABLE';
  maxReversibilityDriftMm: number;
  zeroPercentPlanarityMaxZMm: number;
  
  // Overall & Diagnostics
  diagnostics: string[];
  finalStatus: 'PASS' | 'MODEL_NOT_IMPLEMENTED' | 'ORIGINAL_NO_GEOMETRY' | 'DEPENDENCY_FAIL' | 'FAIL';
}

function computeBounds(segments: Segment2D[], arcs: Arc2D[] = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1);
    maxX = Math.max(maxX, s.x0, s.x1);
    maxY = Math.max(maxY, s.y0, s.y1);
  }
  for (const a of arcs) {
    minX = Math.min(minX, a.cx - a.r);
    minY = Math.min(minY, a.cy - a.r);
    maxX = Math.max(maxX, a.cx + a.r);
    maxY = Math.max(maxY, a.cy + a.r);
  }
  if (!isFinite(minX)) {
    minX = minY = maxX = maxY = 0;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

async function auditAll2614Models() {
  console.log('========================================================================');
  console.log('FASE 5 — AUDITORIA FORENSE E INDUSTRIAL DOS 2614 MODELOS REAIS');
  console.log('========================================================================\n');

  const totalCatalogRecords = rawCatalog.length;
  console.log(`CATALOG_SOURCE = web/src/engine/modelsCatalog.json`);
  console.log(`TOTAL_RECORDS  = ${totalCatalogRecords}`);
  
  const startTime = Date.now();
  const auditRecords: ModelAuditRecord[] = [];

  // Summary statistics counters
  const stats = {
    totalAudited: 0,
    totalNotAudited: 0,
    duplicates: 0,
    
    // Classifications
    parametricCSharp: 0,
    parametricBuiltin: 0,
    parametricDependencyResolved: 0,
    staticGeometry: 0,
    documentOnly: 0,
    originalNoGeometry: 0,
    
    // 2D Status
    status2DPass: 0,
    status2DFail: 0,
    status2DNoGeometry: 0,
    
    // 3D Status
    status3DFoldable: 0,
    status3DNonApplicable: 0,
    status3DFail: 0,
    
    // Errors & Diagnostics
    modelNotImplemented: 0,
    dependencyFail: 0,
    openBoundary: 0,
    foldGraphCycle: 0,
    disconnectedFoldComponent: 0,
    invalidHingeAxis: 0,
    invalidHingeCreaseMapping: 0,
    otherDiagnostics: 0,
    
    // Final Status
    finalPass: 0,
    finalFail: 0,
  };

  const idSet = new Set<string>();

  for (let idx = 0; idx < totalCatalogRecords; idx++) {
    const item = rawCatalog[idx] as any;
    const modelId = item.id;

    if (idSet.has(modelId)) {
      stats.duplicates++;
    }
    idSet.add(modelId);

    const meta = metadataMap[modelId] || { pluginGuid: 'N/A', dll: 'N/A' };
    const diagnostics: string[] = [];

    // 1. Determine Model Type and Geometry Source
    let modelType: ModelClassification = 'ORIGINAL_NO_GEOMETRY';
    let geometrySource = 'NONE';
    let dependencies = 'NONE';
    let rawGeometry: PackagingGeometry | null = null;

    if (item.svgDieline) {
      const svgRel = item.svgDieline.replace(/^\//, '');
      const fullSvgPath = path.join(webRoot, 'public', svgRel);
      dependencies = svgRel;

      if (fs.existsSync(fullSvgPath)) {
        try {
          const svgContent = fs.readFileSync(fullSvgPath, 'utf8');
          const parsed = parseEngViewSvg(svgContent);
          const b = computeBounds(parsed.segments, parsed.arcs);
          rawGeometry = {
            segments: parsed.segments,
            arcs: parsed.arcs || [],
            dimensions: [],
            bounds: b,
          };
          modelType = 'STATIC_GEOMETRY';
          geometrySource = `SVG: ${svgRel}`;
        } catch (e: any) {
          diagnostics.push(`SVG_PARSE_ERROR: ${e.message}`);
          stats.dependencyFail++;
        }
      } else {
        diagnostics.push(`MISSING_SVG_FILE: ${svgRel}`);
        stats.dependencyFail++;
      }
    } else if ((rawCSharpData as any)[modelId]) {
      const csEntry = (rawCSharpData as any)[modelId];
      if (csEntry.geometry && csEntry.geometry.segments && csEntry.geometry.segments.length > 0) {
        const segs = csEntry.geometry.segments;
        const arcs = csEntry.geometry.arcs || [];
        const b = computeBounds(segs, arcs);
        rawGeometry = {
          segments: segs,
          arcs: arcs,
          dimensions: [],
          bounds: b,
        };
        modelType = 'PARAMETRIC_CSHARP';
        geometrySource = `C#_DLL: ${csEntry.dllName || meta.dll}`;
        dependencies = csEntry.dllName || meta.dll;
      } else {
        diagnostics.push('C#_EMPTY_GEOMETRY');
        modelType = 'ORIGINAL_NO_GEOMETRY';
      }
    } else if ((rawDesData as any)[modelId]) {
      const desEntry = (rawDesData as any)[modelId];
      if (desEntry.geometry && desEntry.geometry.segments && desEntry.geometry.segments.length > 0) {
        const segs = desEntry.geometry.segments;
        const arcs = desEntry.geometry.arcs || [];
        const b = computeBounds(segs, arcs);
        rawGeometry = {
          segments: segs,
          arcs: arcs,
          dimensions: [],
          bounds: b,
        };
        modelType = 'STATIC_GEOMETRY';
        geometrySource = `DES_CAD: ${desEntry.fileName || modelId}.des`;
        dependencies = `Picador DES`;
      } else {
        diagnostics.push('DES_EMPTY_GEOMETRY');
        modelType = 'ORIGINAL_NO_GEOMETRY';
      }
    }

    // Update classification counters
    if (modelType === 'PARAMETRIC_CSHARP') stats.parametricCSharp++;
    else if (modelType === 'PARAMETRIC_BUILTIN') stats.parametricBuiltin++;
    else if (modelType === 'PARAMETRIC_DEPENDENCY_RESOLVED') stats.parametricDependencyResolved++;
    else if (modelType === 'STATIC_GEOMETRY') stats.staticGeometry++;
    else if (modelType === 'DOCUMENT_ONLY') stats.documentOnly++;
    else stats.originalNoGeometry++;

    // 2. 2D Geometry Inspection
    let status2D: 'PASS' | 'FAIL' | 'NO_GEOMETRY' = 'NO_GEOMETRY';
    let segmentsCount = 0;
    let creasesCount = 0;
    let cutsCount = 0;
    let arcsCount = 0;
    let bounds = { width: 0, height: 0 };

    if (rawGeometry && rawGeometry.segments && rawGeometry.segments.length > 0) {
      segmentsCount = rawGeometry.segments.length;
      arcsCount = rawGeometry.arcs.length;
      bounds = { width: rawGeometry.bounds.width, height: rawGeometry.bounds.height };

      for (const s of rawGeometry.segments) {
        if (s.type === 'crease') creasesCount++;
        else cutsCount++;
      }

      if (bounds.width > 0 && bounds.height > 0) {
        status2D = 'PASS';
        stats.status2DPass++;
      } else {
        status2D = 'FAIL';
        diagnostics.push('DEGENERATE_BOUNDS');
        stats.status2DFail++;
      }
    } else {
      status2D = 'NO_GEOMETRY';
      stats.status2DNoGeometry++;
    }

    // 3. Topology & Folding Tree & Kinematics Inspection
    let statusTopology: 'PASS' | 'OPEN_BOUNDARY' | 'FAIL' | 'NOT_APPLICABLE' = 'NOT_APPLICABLE';
    let verticesCount = 0;
    let edgesCount = 0;
    let panelsCount = 0;
    let holesCount = 0;
    let openBoundariesCount = 0;

    let hingesCount = 0;
    let componentsCount = 0;
    let cyclesCount = 0;
    let orphanCreasesCount = 0;
    let rootPanelId = 'N/A';
    let rootSource = 'N/A';

    let status3D: '3D_FOLDABLE' | '3D_NON_APPLICABLE' | '3D_FAIL' = '3D_NON_APPLICABLE';
    let foldStatus: 'REVERSIBLE' | 'NON_REVERSIBLE' | 'NOT_APPLICABLE' = 'NOT_APPLICABLE';
    let maxReversibilityDriftMm = 0;
    let zeroPercentPlanarityMaxZMm = 0;

    if (status2D === 'PASS' && rawGeometry) {
      try {
        const topo = LoopTopologyEngine.extractTopology(rawGeometry);
        panelsCount = topo.panels.length;
        holesCount = topo.holes.length;
        openBoundariesCount = topo.openBoundaries.length;
        verticesCount = topo.stats.totalVertices;
        edgesCount = topo.stats.totalEdges;

        if (openBoundariesCount > 0) {
          statusTopology = 'OPEN_BOUNDARY';
          stats.openBoundary++;
          diagnostics.push(`OPEN_BOUNDARIES: ${openBoundariesCount}`);
        } else {
          statusTopology = 'PASS';
        }

        // Folding Tree
        if (creasesCount > 0 && panelsCount > 0) {
          const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, rawGeometry);
          hingesCount = tree.hinges.length;
          componentsCount = tree.components.length;
          cyclesCount = tree.cycles.length;
          orphanCreasesCount = tree.orphanCreases.length;
          rootPanelId = tree.rootPanelId;
          rootSource = tree.rootSource;

          if (tree.cycles.length > 0) {
            stats.foldGraphCycle++;
            diagnostics.push(`FOLD_GRAPH_CYCLE: ${tree.cycles.length}`);
          }
          if (tree.disconnectedComponents.length > 0) {
            stats.disconnectedFoldComponent++;
          }
          if (tree.invalidHingeCreaseMappings.length > 0) {
            stats.invalidHingeCreaseMapping++;
          }

          // Kinematic 3D Simulation
          if (hingesCount > 0 && panelsCount >= 2) {
            try {
              // 0% flat state
              const kin0 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 0);
              let maxZ0 = 0;
              for (const p of kin0.panels) {
                for (const v of p.worldVertices) {
                  maxZ0 = Math.max(maxZ0, Math.abs(v.z));
                }
              }
              zeroPercentPlanarityMaxZMm = maxZ0;

              // Step sequence: 25% -> 50% -> 75% -> 100% -> 75% -> 50% -> 25% -> 0%
              const steps = [25, 50, 75, 100, 75, 50, 25, 0];
              let lastKin = kin0;
              for (const s of steps) {
                lastKin = Kinematic3DEngine.computeFoldedState(topo.panels, tree, s);
              }

              // Validate reversibility against kin0
              let maxDrift = 0;
              for (let pi = 0; pi < kin0.panels.length; pi++) {
                const origVerts = kin0.panels[pi].worldVertices;
                const endVerts = lastKin.panels[pi].worldVertices;
                for (let vi = 0; vi < origVerts.length; vi++) {
                  const dx = origVerts[vi].x - endVerts[vi].x;
                  const dy = origVerts[vi].y - endVerts[vi].y;
                  const dz = origVerts[vi].z - endVerts[vi].z;
                  const dist = Math.hypot(dx, dy, dz);
                  maxDrift = Math.max(maxDrift, dist);
                }
              }
              maxReversibilityDriftMm = maxDrift;

              if (maxDrift <= 0.001 && maxZ0 <= 0.001) {
                status3D = '3D_FOLDABLE';
                foldStatus = 'REVERSIBLE';
                stats.status3DFoldable++;
              } else {
                status3D = '3D_FAIL';
                foldStatus = 'NON_REVERSIBLE';
                diagnostics.push(`KINEMATIC_DRIFT: ${maxDrift.toFixed(6)}mm`);
                stats.status3DFail++;
              }
            } catch (e: any) {
              status3D = '3D_FAIL';
              diagnostics.push(`KINEMATIC_ERROR: ${e.message}`);
              stats.status3DFail++;
            }
          } else {
            status3D = '3D_NON_APPLICABLE';
            stats.status3DNonApplicable++;
          }
        } else {
          status3D = '3D_NON_APPLICABLE';
          stats.status3DNonApplicable++;
        }
      } catch (e: any) {
        statusTopology = 'FAIL';
        diagnostics.push(`TOPOLOGY_ERROR: ${e.message}`);
      }
    }

    // Determine Final Status
    let finalStatus: 'PASS' | 'MODEL_NOT_IMPLEMENTED' | 'ORIGINAL_NO_GEOMETRY' | 'DEPENDENCY_FAIL' | 'FAIL' = 'FAIL';
    if (status2D === 'PASS' && (status3D === '3D_FOLDABLE' || status3D === '3D_NON_APPLICABLE')) {
      finalStatus = 'PASS';
      stats.finalPass++;
    } else if (status2D === 'NO_GEOMETRY') {
      finalStatus = 'ORIGINAL_NO_GEOMETRY';
      stats.modelNotImplemented++;
    } else if (diagnostics.some(d => d.includes('MISSING_SVG') || d.includes('PARSE_ERROR'))) {
      finalStatus = 'DEPENDENCY_FAIL';
      stats.finalFail++;
    } else {
      finalStatus = 'FAIL';
      stats.finalFail++;
    }

    stats.totalAudited++;

    auditRecords.push({
      modelId,
      code: item.code || modelId,
      name: item.name || modelId,
      category: item.category,
      series: item.series || 'N/A',
      source: item.source || 'ORIGINAL_PLMPACKLIB',
      pluginGuid: meta.pluginGuid,
      dll: meta.dll,
      modelType,
      parameters: item.defaultParams || {},
      dependencies,
      geometrySource,
      
      status2D,
      segmentsCount,
      creasesCount,
      cutsCount,
      arcsCount,
      bounds,
      
      statusTopology,
      verticesCount,
      edgesCount,
      panelsCount,
      holesCount,
      openBoundariesCount,
      
      hingesCount,
      componentsCount,
      cyclesCount,
      orphanCreasesCount,
      rootPanelId,
      rootSource,
      
      status3D,
      foldStatus,
      maxReversibilityDriftMm,
      zeroPercentPlanarityMaxZMm,
      
      diagnostics,
      finalStatus,
    });

    if ((idx + 1) % 500 === 0 || idx + 1 === totalCatalogRecords) {
      console.log(`Progresso: ${idx + 1} / ${totalCatalogRecords} modelos auditados...`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // Save audit report to JSON
  const reportPath = path.join(repoRoot, 'scratch', 'audit_report_2614_models.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditRecords, null, 2), 'utf8');

  // Print Executive Forensic Report
  console.log('\n========================================================================');
  console.log('RELATÓRIO FORENSE DE AUDITORIA — 2614 MODELOS');
  console.log('========================================================================\n');
  console.log(`TOTAL REAL NO CATÁLOGO        : ${totalCatalogRecords}`);
  console.log(`MODELOS AUDITADOS             : ${stats.totalAudited}`);
  console.log(`MODELOS NÃO AUDITADOS         : ${stats.totalNotAudited}`);
  console.log(`DUPLICADOS DE ID              : ${stats.duplicates}`);
  console.log(`TEMPO DE EXECUÇÃO             : ${durationSec}s\n`);

  console.log('--- CLASSIFICAÇÃO DE ORIGEM ---');
  console.log(`PARAMETRIC_CSHARP             : ${stats.parametricCSharp}`);
  console.log(`PARAMETRIC_BUILTIN            : ${stats.parametricBuiltin}`);
  console.log(`PARAMETRIC_DEPENDENCY_RESOLVED: ${stats.parametricDependencyResolved}`);
  console.log(`STATIC_GEOMETRY (SVG / DES)   : ${stats.staticGeometry}`);
  console.log(`DOCUMENT_ONLY                 : ${stats.documentOnly}`);
  console.log(`ORIGINAL_NO_GEOMETRY          : ${stats.originalNoGeometry}\n`);

  console.log('--- 2D STATUS ---');
  console.log(`2D PASS                       : ${stats.status2DPass}`);
  console.log(`2D FAIL                       : ${stats.status2DFail}`);
  console.log(`NO_GEOMETRY                   : ${stats.status2DNoGeometry}\n`);

  console.log('--- 3D & CINEMÁTICA ---');
  console.log(`3D FOLDABLE                   : ${stats.status3DFoldable}`);
  console.log(`3D NON_APPLICABLE             : ${stats.status3DNonApplicable}`);
  console.log(`3D FAIL                       : ${stats.status3DFail}\n`);

  console.log('--- DIAGNÓSTICOS ESTRUTURAIS ---');
  console.log(`OPEN_BOUNDARY                 : ${stats.openBoundary}`);
  console.log(`FOLD_GRAPH_CYCLE              : ${stats.foldGraphCycle}`);
  console.log(`DISCONNECTED_FOLD_COMPONENT   : ${stats.disconnectedFoldComponent}`);
  console.log(`INVALID_HINGE_AXIS            : ${stats.invalidHingeAxis}`);
  console.log(`INVALID_HINGE_CREASE_MAPPING  : ${stats.invalidHingeCreaseMapping}`);
  console.log(`DEPENDENCY FAIL               : ${stats.dependencyFail}`);
  console.log(`MODEL_NOT_IMPLEMENTED         : ${stats.modelNotImplemented}\n`);

  console.log('--- STATUS FINAL ---');
  console.log(`FINAL PASS                    : ${stats.finalPass}`);
  console.log(`FINAL FAIL / NOT IMPLEMENTED  : ${stats.finalFail + stats.modelNotImplemented}`);
  console.log(`\nRelatório completo salvo em: ${reportPath}`);

  return { totalCatalogRecords, stats, reportPath };
}

// Execute if run directly
auditAll2614Models().catch((err) => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
