import fs from 'node:fs';
import path from 'node:path';
import { CadImportEngine } from '../src/engine/importers/CadImportEngine';
import { DEFAULT_PROFILES } from '../src/engine/importers/ClassificationEngine';
import { LoopTopologyEngine } from '../src/engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine } from '../src/engine/importers/FoldingTreeEngine';

async function run() {
  const fixtures = [
    '01_cut_crease.dxf',
    '02_cut_crease.svg',
    '03_cut_crease.pdf',
    '04_layers.dxf',
    '05_different_colors.dxf',
    '06_perf_and_arcs.dxf',
    '07_raster_only.pdf',
  ];

  console.log('=== TESTE DE IMPORTADORES CAD ===');
  for (const f of fixtures) {
    const filePath = path.join(process.cwd(), 'tests', 'import-fixtures', f);
    if (!fs.existsSync(filePath)) {
      console.log(`[SKIP] Arquivo não encontrado: ${f}`);
      continue;
    }

    try {
      let doc;
      if (f.endsWith('.pdf')) {
        const buf = fs.readFileSync(filePath);
        doc = await CadImportEngine.importFile(buf, f);
      } else {
        const text = fs.readFileSync(filePath, 'utf8');
        doc = await CadImportEngine.importFile(text, f);
      }

      console.log(`\n--- ${f} (${doc.format}) ---`);
      console.log(`Entidades: ${doc.entities.length}, RasterOnly: ${doc.isRasterOnly}, Unidades: ${doc.detectedUnit}`);
      if (doc.errors.length > 0) {
        console.log(`Erros esperados/detectados: ${doc.errors.join('; ')}`);
      }

      if (doc.entities.length > 0) {
        const { dieline, report } = CadImportEngine.buildPackagingGeometry(doc, {
          profile: DEFAULT_PROFILES[0],
          originZeroZero: true,
        });

        console.log(`Classificação: CUT=${report.classifiedCounts.cut}, CREASE=${report.classifiedCounts.crease}, PERF=${report.classifiedCounts.perf}, UNCLASSIFIED=${report.classifiedCounts.unclassified}`);
        console.log(`Dieline: ${dieline.segments.length} segs, ${dieline.arcs.length} arcs. Dimensões: ${dieline.bounds.width.toFixed(1)} x ${dieline.bounds.height.toFixed(1)} mm`);

        try {
          const topo = LoopTopologyEngine.extractTopology(dieline);
          const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, dieline);
          console.log(`Topologia 3D: ${topo.panels.length} painéis, ${tree.hinges.length} vincos articulados`);
        } catch (topoErr: any) {
          console.log(`Topologia erro: ${topoErr.message}`);
        }
      }
    } catch (err: any) {
      console.error(`Erro ao importar ${f}:`, err.message);
    }
  }
}

run();
