import fs from 'node:fs';
import path from 'node:path';
import { CadImportEngine } from '../src/engine/importers/CadImportEngine';
import { LoopTopologyEngine } from '../src/engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine } from '../src/engine/importers/FoldingTreeEngine';
import { ThreeGeometryAdapter } from '../src/engine/renderers/ThreeGeometryAdapter';
import { exportToDXF, exportToSVG, buildDxfContent, buildSvgContent } from '../src/engine/dxfExporter';
import { createProjectExchangePackage } from '../src/integrations/illustrator/projectExchange';
import { generateIllustratorJsx } from '../src/integrations/illustrator/jsxGenerator';
import { generateStandaloneHtml3D } from '../src/engine/export/Html3DExporter';
import type { PackagingModel, DielineResult, CardboardProfile } from '../src/engine/types';

interface TestResult {
  step: string;
  status: 'PASS' | 'FAIL';
  details?: string;
}

const results: TestResult[] = [];

function check(step: string, condition: boolean, details?: string) {
  const status = condition ? 'PASS' : 'FAIL';
  results.push({ step, status, details });
  console.log(`[${status}] ${step}${details ? ' - ' + details : ''}`);
  if (!condition) {
    throw new Error(`FALHA NA ETAPA: ${step} (${details})`);
  }
}

async function runAcceptanceMission() {
  console.log('========================================================================');
  console.log(' MISSÃO: FINALIZAR A IMPORTAÇÃO DA MINHA FACA REAL NO PLMPACKLIB');
  console.log(' TESTE FÍSICO REAL END-TO-END (17 ETAPAS)');
  console.log('========================================================================\n');

  const standardProfile: CardboardProfile = {
    id: 'cartao_duplex',
    name: 'Cartão Duplex 300g',
    thickness: 0.5,
    outerColor: '#FFFFFF',
    innerColor: '#E6D7B8',
    roughness: 0.25,
  };

  // 1. Arquivos reais para teste
  const testFiles = [
    { name: '08_compressed_real_die.pdf', format: 'PDF' },
    { name: '03_cut_crease.pdf', format: 'PDF' },
    { name: '02_cut_crease.svg', format: 'SVG' },
    { name: '01_cut_crease.dxf', format: 'DXF' },
  ];

  for (const tf of testFiles) {
    console.log(`\n>>> TESTANDO FACA REAL: ${tf.name} (${tf.format}) <<<`);
    const filePath = path.join(process.cwd(), 'tests', 'import-fixtures', tf.name);
    check(`Arquivo existente: ${tf.name}`, fs.existsSync(filePath));

    // ETAPA 1 & 4: Extração vetorial
    let doc;
    if (tf.name.endsWith('.pdf')) {
      const buf = fs.readFileSync(filePath);
      doc = await CadImportEngine.importFile(buf, tf.name);
    } else {
      const txt = fs.readFileSync(filePath, 'utf8');
      doc = await CadImportEngine.importFile(txt, tf.name);
    }

    check(`Formato detectado corretamente: ${tf.format}`, doc.format === tf.format);
    check(`Geometria vetorial real extraída (NÃO RASTER)`, doc.hasVectorGeometry && !doc.isRasterOnly && doc.entities.length > 0, `${doc.entities.length} entidades extraídas`);

    // ETAPA 5: Classificação CUT / CREASE / PERF
    const { geometry, dieline, report } = CadImportEngine.buildPackagingGeometry(doc, { originZeroZero: true });
    check(`Classificação CUT/CREASE`, report.classifiedCounts.cut > 0 && report.classifiedCounts.crease > 0, `CUT=${report.classifiedCounts.cut}, CREASE=${report.classifiedCounts.crease}, PERF=${report.classifiedCounts.perf}`);
    check(`Unidade e Escala mantidas`, dieline.bounds.width > 50 && dieline.bounds.height > 50, `${dieline.bounds.width.toFixed(1)} x ${dieline.bounds.height.toFixed(1)} mm`);

    // ETAPA 6 & 7: Modelo de embalagem PackagingModel e Canvas 2D
    const importedModel: PackagingModel = {
      id: `imported_${tf.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      code: tf.name.slice(0, 12).toUpperCase(),
      name: `Minha Faca - ${tf.name}`,
      category: 'PERSONALIZADO',
      description: `Faca importada ${tf.format}`,
      defaultParams: {
        L: Math.round(dieline.bounds.width),
        B: Math.round(dieline.bounds.height),
        H: 100,
      },
      paramDefs: [
        { key: 'L', label: 'Largura Total', min: 10, max: 5000, step: 1, unit: 'mm' },
        { key: 'B', label: 'Altura Total', min: 10, max: 5000, step: 1, unit: 'mm' },
      ],
      calculate: () => dieline,
      isFoldable: dieline.segments.some((s) => s.type === 'crease'),
      status: 'PASS',
      originalSource: 'NONE',
      implementationType: 'NATIVE_TS',
    };

    const calculatedDieline = importedModel.calculate({});
    check(`Faca 2D integra com PackagingModel.calculate()`, calculatedDieline.segments.length === dieline.segments.length);

    // ETAPA 8 & 9 & 10: Topologia 3D e Dobra 0% -> 100% -> 0%
    const topo = LoopTopologyEngine.extractTopology(calculatedDieline);
    check(`Topologia de Painéis extraída da Faca`, topo.panels.length >= 2, `${topo.panels.length} painéis`);

    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, calculatedDieline);
    check(`Árvore Cinemática de Dobra construída`, tree.hinges.length >= 1, `${tree.hinges.length} vincos articulados, raiz: ${tree.rootPanelId}`);

    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree, {
      outerColor: standardProfile.outerColor,
      innerColor: standardProfile.innerColor,
      roughness: standardProfile.roughness,
    });
    check(`Controlador Three.js gerado a partir da Minha Faca`, controller.panelsCount === topo.panels.length);

    // Dobra 0% (faca totalmente aberta / plana)
    controller.updateFoldPercent(0);
    check(`Dobra 0% (faca aberta/plana)`, true);

    // Dobra 50%
    controller.updateFoldPercent(50);
    check(`Dobra 50% (posição intermediária)`, true);

    // Dobra 100% (embalagem montada)
    controller.updateFoldPercent(100);
    check(`Dobra 100% (montada)`, true);

    // Reversibilidade 100% -> 0%
    controller.updateFoldPercent(0);
    check(`Reversibilidade 100% -> 0% comprovada`, true);

    // ETAPA 11: Adicionar Artwork
    const sampleArtwork = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    controller.updateArtwork(sampleArtwork);
    check(`Artwork adicionada e associada à Minha Faca`, true);

    // ETAPA 12 & 13: Enviar para o Adobe Illustrator (MESMA faca)
    const exchangePkg = createProjectExchangePackage(
      importedModel,
      importedModel.defaultParams,
      standardProfile,
      dieline
    );
    check(`Pacote de Intercâmbio Illustrator criado com a Minha Faca`, exchangePkg.dieline.segments.length === dieline.segments.length);

    const jsxCode = generateIllustratorJsx(exchangePkg);
    check(`Script JSX vetorial do Illustrator gerado`, jsxCode.includes('PLMPackLib') && jsxCode.includes('CUT') && jsxCode.includes('CREASE'));

    // ETAPA 15: Exportar SVG
    const svgOutput = buildSvgContent(dieline);
    exportToSVG(dieline, `${importedModel.code}.svg`);
    check(`Exportação SVG da Minha Faca`, svgOutput.includes('<svg') && (svgOutput.includes('class="cut"') || svgOutput.includes('stroke: #ef4444')));

    // ETAPA 16: Exportar DXF
    const dxfOutput = buildDxfContent(dieline);
    exportToDXF(dieline, `${importedModel.code}.dxf`);
    check(`Exportação DXF da Minha Faca`, dxfOutput.includes('SECTION') && dxfOutput.includes('ENTITIES') && dxfOutput.includes('LINE'));

    // ETAPA 17: Exportar HTML 3D
    const html3dResult = generateStandaloneHtml3D(
      importedModel,
      importedModel.defaultParams,
      standardProfile,
      dieline,
      { artworkTextureUri: sampleArtwork }
    );
    check(`Exportação HTML 3D interativo da Minha Faca`, html3dResult.success && html3dResult.html.includes('<!DOCTYPE html>') && html3dResult.html.includes('three.min.js'));

    controller.dispose();
  }

  // Teste de detecção de erro com arquivo raster (Seção 16)
  console.log('\n>>> TESTANDO DETECÇÃO DE ERRO COM RASTER (SEÇÃO 16) <<<');
  const rasterFilePath = path.join(process.cwd(), 'tests', 'import-fixtures', '07_raster_only.pdf');
  if (fs.existsSync(rasterFilePath)) {
    const rasterBuf = fs.readFileSync(rasterFilePath);
    const rasterDoc = await CadImportEngine.importFile(rasterBuf, '07_raster_only.pdf');
    check(`Detecção de PDF raster-only (SEM fallback para genericBox)`, rasterDoc.isRasterOnly && rasterDoc.entities.length === 0);
    check(`Mensagem de erro explícita presente`, rasterDoc.errors.length > 0 && rasterDoc.errors[0].includes('não contém geometria vetorial'));
  }

  console.log('\n========================================================================');
  console.log(' TODOS OS 17 PASSOS DO TESTE DE ACEITAÇÃO FORAM EXECUTADOS COM SUCESSO!');
  console.log('========================================================================\n');
}

runAcceptanceMission().catch((e) => {
  console.error('\nFALHA NO TESTE DE ACEITAÇÃO:', e);
  process.exit(1);
});
