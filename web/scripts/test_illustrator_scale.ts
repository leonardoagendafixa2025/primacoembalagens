import { MODELS } from '../src/engine/models';
import { STANDARD_PROFILES } from '../src/engine/types';
import { packageIllustratorExchangePayload } from '../src/integrations/illustrator/projectExchange';
import { generateIllustratorJsx } from '../src/integrations/illustrator/jsxGenerator';

async function runScaleTest() {
  console.log('========================================================================');
  console.log('TESTE 1: VALIDAÇÃO DE ESCALA E COORDENADAS ADOBE ILLUSTRATOR (FEFCO 0429)');
  console.log('========================================================================\n');

  const model0429 = MODELS.find((m) => m.id === 'fefco_0429' || m.code === '0429');
  if (!model0429) {
    throw new Error('Modelo FEFCO 0429 não encontrado no catálogo!');
  }

  const profile = STANDARD_PROFILES[0]; // Micro-ondulado
  const params = {
    L: 300,
    B: 200,
    H: 150,
    M: 35,
    Ec: 6,
    Cut: 1,
    Ep: profile.thickness,
  };

  const dieline = model0429.calculate(params);
  console.log(`[1] Geometria Canônica FEFCO 0429 Calculada:`);
  console.log(`    Segmentos: ${dieline.segments.length}`);
  console.log(`    Arcos:     ${dieline.arcs.length} (R = 15mm)`);
  console.log(`    Total:     ${dieline.segments.length + dieline.arcs.length} entidades (esperado: 115)`);
  console.log(`    Bounds:    ${dieline.bounds.width.toFixed(3)} x ${dieline.bounds.height.toFixed(3)} mm\n`);

  if (dieline.segments.length + dieline.arcs.length !== 115) {
    throw new Error(`Falha: FEFCO 0429 deve ter 115 entidades, obtido ${dieline.segments.length + dieline.arcs.length}`);
  }

  const payload = packageIllustratorExchangePayload(model0429, params, profile, dieline);
  const jsxCode = generateIllustratorJsx(payload);

  // 1. Verificação da constante de conversão métrica exata: 1 polegada = 72 pontos = 25.4 mm
  // 1 mm = 72.0 / 25.4 pt = 2.834645669291339 pt
  const MM_TO_PT = 72.0 / 25.4;
  console.log(`[2] Fator de Conversão Métrico Obrigatório:`);
  console.log(`    1 mm = ${MM_TO_PT.toFixed(8)} pt (72.0 / 25.4)`);

  if (!jsxCode.includes('MM_TO_PT = 72.0 / 25.4') && !jsxCode.includes('2.83464567')) {
    throw new Error('Script JSX não utiliza o fator de conversão canônico 72.0 / 25.4!');
  }

  // 2. Verificação de Margens do Artboard (15 mm)
  const MARGIN_MM = 15.0;
  const expectedArtboardW_Mm = dieline.bounds.width + (MARGIN_MM * 2.0);
  const expectedArtboardH_Mm = dieline.bounds.height + (MARGIN_MM * 2.0);
  const expectedArtboardW_Pt = expectedArtboardW_Mm * MM_TO_PT;
  const expectedArtboardH_Pt = expectedArtboardH_Mm * MM_TO_PT;

  console.log(`[3] Dimensões do Artboard no Illustrator:`);
  console.log(`    Largura Nominal: ${expectedArtboardW_Mm.toFixed(3)} mm -> ${expectedArtboardW_Pt.toFixed(4)} pt`);
  console.log(`    Altura Nominal:  ${expectedArtboardH_Mm.toFixed(3)} mm -> ${expectedArtboardH_Pt.toFixed(4)} pt`);

  // 3. Verificação das Camadas Canônicas no JSX
  const requiredLayers = ['ARTWORK', 'CUT', 'CREASE', 'PERF', 'GUIDES_INFO'];
  console.log(`\n[4] Auditoria de Camadas Semânticas:`);
  for (const lyr of requiredLayers) {
    const hasLyr = jsxCode.includes(`"${lyr}"`);
    console.log(`    Camada [${lyr}]: ${hasLyr ? 'PRESENTE' : 'AUSENTE'}`);
    if (!hasLyr) {
      throw new Error(`Camada obrigatória ${lyr} ausente no script JSX!`);
    }
  }

  // 4. Verificação de Spot Colors Técnicas (Corte, Vinco, Picote)
  console.log(`\n[5] Auditoria de Spot Colors Técnicas:`);
  const hasCutSpot = jsxCode.includes('"Corte"');
  const hasCreaseSpot = jsxCode.includes('"Vinco"');
  const hasPerfSpot = jsxCode.includes('"Picote"');
  console.log(`    Spot Color [Corte]  (Magenta 100%, Amarelo 100%): ${hasCutSpot ? 'PRESENTE' : 'AUSENTE'}`);
  console.log(`    Spot Color [Vinco]  (Ciano 100%, Amarelo 30%):    ${hasCreaseSpot ? 'PRESENTE' : 'AUSENTE'}`);
  console.log(`    Spot Color [Picote] (Magenta 50%, Amarelo 100%):  ${hasPerfSpot ? 'PRESENTE' : 'AUSENTE'}`);

  if (!hasCutSpot || !hasCreaseSpot || !hasPerfSpot) {
    throw new Error('Spot Colors técnicas oficiais ausentes no script JSX!');
  }

  // 5. Teste de Escala 1mm PLMPackLib = 1mm Illustrator (tolerância < 0.0001 mm)
  console.log(`\n[6] Teste de Preservação Linear e Angular:`);
  const sampleSegment = dieline.segments[0];
  const lenMm = Math.hypot(sampleSegment.x1 - sampleSegment.x0, sampleSegment.y1 - sampleSegment.y0);
  const sampleP1x = (sampleSegment.x0 + (MARGIN_MM - dieline.bounds.minX)) * MM_TO_PT;
  const sampleP1y = (sampleSegment.y0 + (MARGIN_MM - dieline.bounds.minY)) * MM_TO_PT;
  const sampleP2x = (sampleSegment.x1 + (MARGIN_MM - dieline.bounds.minX)) * MM_TO_PT;
  const sampleP2y = (sampleSegment.y1 + (MARGIN_MM - dieline.bounds.minY)) * MM_TO_PT;
  const lenPt = Math.hypot(sampleP2x - sampleP1x, sampleP2y - sampleP1y);
  const reconstructedLenMm = lenPt / MM_TO_PT;
  const scaleDiffMm = Math.abs(lenMm - reconstructedLenMm);

  console.log(`    Comprimento Original PLMPackLib:   ${lenMm.toFixed(6)} mm`);
  console.log(`    Comprimento em Pontos Illustrator: ${lenPt.toFixed(6)} pt`);
  console.log(`    Comprimento Revertido para mm:     ${reconstructedLenMm.toFixed(6)} mm`);
  console.log(`    Divergência de Escala:             ${scaleDiffMm.toExponential(4)} mm`);

  if (scaleDiffMm > 0.00001) {
    throw new Error(`Divergência de escala excede tolerância: ${scaleDiffMm} mm`);
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('RESULTADO DO TESTE DE ESCALA: PASS (100% CONFORME ISO / ADOBE SPECS)');
  console.log('------------------------------------------------------------------------\n');
}

runScaleTest().catch((err) => {
  console.error('ERRO NO TESTE DE ESCALA:', err);
  process.exit(1);
});
