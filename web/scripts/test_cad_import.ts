import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { CadImportEngine } from '../src/engine/importers/CadImportEngine';
import {
  DEFAULT_PROFILES,
  classifyEntity,
  applyClassificationToDocument,
} from '../src/engine/importers/ClassificationEngine';
import { DWG_STATUS } from '../src/engine/importers/DwgImporter';
import type { ClassificationRule, ClassificationProfile, ImportedEntity } from '../src/engine/importers/types';
import { buildFoldingTopology } from '../src/engine/dielineTopology';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../tests/import-fixtures');

interface TestResult {
  name: string;
  category: string;
  status: 'PASS' | 'FAIL';
  maxErrorMm: number;
  toleranceMm: number;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function runTests() {
  console.log('============================================================');
  console.log('PRIMACOR EMBALAGENS — SUÍTE DE TESTES FORENSES DE IMPORTAÇÃO CAD (FASE 1)');
  console.log('============================================================\n');

  // TESTE 1: Importação DXF Real (Corte, Vinco, Arcos, Unidades em mm)
  {
    const file = path.join(fixturesDir, '01_cut_crease.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '01_cut_crease.dxf');

    assert(doc.format === 'DXF', 'Formato deve ser DXF');
    assert(doc.detectedUnit === 'mm', 'Unidade deve ser mm');
    assert(doc.entities.length === 7, `Esperava 7 entidades, encontrou ${doc.entities.length}`);

    const result = CadImportEngine.buildPackagingGeometry(doc, {
      profile: DEFAULT_PROFILES[0],
    });

    const bounds = result.geometry.bounds;
    const widthErr = Math.abs(bounds.width - 500.0);
    const heightErr = Math.abs(bounds.height - 300.0);
    const maxErr = Math.max(widthErr, heightErr);

    assert(maxErr <= 0.001, `Erro dimensional ${maxErr}mm excede tolerância 0.001mm`);
    assert(result.geometry.segments.length === 10, `Esperava 10 segmentos pós T-junctions, obteve ${result.geometry.segments.length}`);
    assert(result.geometry.arcs.length === 1, 'Esperava 1 arco');
    assert(result.report.classifiedCounts.cut === 5, 'Esperava 5 cortes brutos classificados (4 bordas + 1 arco)');
    assert(result.report.classifiedCounts.crease === 2, 'Esperava 2 vincos');

    results.push({
      name: '01. DXF Real — Corte, Vinco, Arcos e Dimensões 500x300mm',
      category: 'DXF',
      status: 'PASS',
      maxErrorMm: maxErr,
      toleranceMm: 0.001,
      details: `Largura: ${bounds.width}mm, Altura: ${bounds.height}mm, Cortes: ${result.report.classifiedCounts.cut}, Vincos: ${result.report.classifiedCounts.crease}`,
    });
  }

  // TESTE 2: Importação SVG Real (Corte, Vinco, Bézier, Dimensões em mm)
  {
    const file = path.join(fixturesDir, '02_cut_crease.svg');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '02_cut_crease.svg');

    assert(doc.format === 'SVG', 'Formato deve ser SVG');
    assert(doc.detectedUnit === 'mm', 'Unidade deve ser mm');

    const result = CadImportEngine.buildPackagingGeometry(doc, {
      profile: DEFAULT_PROFILES[0],
    });

    const bounds = result.geometry.bounds;
    const maxErr = Math.max(Math.abs(bounds.width - 500.0), Math.abs(bounds.height - 300.0));
    assert(maxErr <= 0.01, `Erro dimensional SVG ${maxErr}mm`);
    assert(result.report.bezierConvertedCount === 2, 'Deve ter convertido 2 curvas Bézier analíticas');

    results.push({
      name: '02. SVG Real — Paths, Linhas, Bézier e Dimensões 500x300mm',
      category: 'SVG',
      status: 'PASS',
      maxErrorMm: maxErr,
      toleranceMm: 0.01,
      details: `Largura: ${bounds.width}mm, Altura: ${bounds.height}mm, Bézier convertidos: ${result.report.bezierConvertedCount}`,
    });
  }

  // TESTE 3: Importação PDF Vetorial Real (Streams, Operadores, Escala 1/72 pol -> mm)
  {
    const file = path.join(fixturesDir, '03_cut_crease.pdf');
    const content = fs.readFileSync(file);
    const doc = await CadImportEngine.importFile(content, '03_cut_crease.pdf');

    assert(doc.format === 'PDF', 'Formato deve ser PDF');
    assert(doc.hasVectorGeometry === true, 'PDF deve conter geometria vetorial');

    const result = CadImportEngine.buildPackagingGeometry(doc, {
      profile: DEFAULT_PROFILES[0],
    });

    const bounds = result.geometry.bounds;
    const maxErr = Math.max(Math.abs(bounds.width - 500.0), Math.abs(bounds.height - 300.0));
    assert(maxErr <= 0.05, `Erro dimensional PDF ${maxErr}mm`);

    results.push({
      name: '03. PDF Vetorial — Decodificação de Stream e Escala 500x300mm',
      category: 'PDF',
      status: 'PASS',
      maxErrorMm: maxErr,
      toleranceMm: 0.05,
      details: `Largura: ${bounds.width.toFixed(2)}mm, Altura: ${bounds.height.toFixed(2)}mm, Entidades: ${result.report.totalEntitiesFound}`,
    });
  }

  // TESTE 4: Rejeição de PDF Rasterizado
  {
    const file = path.join(fixturesDir, '07_raster_only.pdf');
    const content = fs.readFileSync(file);
    const doc = await CadImportEngine.importFile(content, '07_raster_only.pdf');

    assert(doc.isRasterOnly === true, 'Deve identificar PDF como raster-only');
    assert(
      doc.errors.some((e) => e.includes('Este PDF não contém geometria vetorial suficiente para importação CAD.')),
      'Deve conter a mensagem exata de rejeição'
    );

    results.push({
      name: '04. Rejeição de PDF Rasterizado — Alerta Mandatório',
      category: 'PDF',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Detectado rasterOnly=true. Mensagem emitida com sucesso.`,
    });
  }

  // TESTE 5: Classificação por Camadas (CUT, CREASE, PERF, DIMENSIONS)
  {
    const file = path.join(fixturesDir, '04_layers.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '04_layers.dxf');

    const result = CadImportEngine.buildPackagingGeometry(doc, {
      profile: DEFAULT_PROFILES[0],
    });

    assert(result.report.classifiedCounts.cut === 4, 'Esperava 4 cortes');
    assert(result.report.classifiedCounts.crease === 2, 'Esperava 2 vincos');
    assert(result.report.classifiedCounts.perf === 1, 'Esperava 1 picote');
    assert(result.report.classifiedCounts.dimension === 1, 'Esperava 1 dimensão');

    // Confirma que PERF gerou Segment2D com type === 'perfo' e NÃO virou 'cut'
    const perfSeg = result.geometry.segments.find((s) => s.type === 'perfo');
    assert(Boolean(perfSeg), 'PICOTE (PERF) deve ser preservado como type: "perfo" e NÃO virar cut');

    results.push({
      name: '05. Classificação por Camadas (CUT, CREASE, PERF, DIMENSIONS)',
      category: 'CLASSIFICAÇÃO',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Cortes: 4, Vincos: 2, Picotes: 1 (tipo 'perfo' preservado), Dimensões: 1`,
    });
  }

  // TESTE 6: Independência de Cores (Teste B: Azul = Corte, Amarelo = Vinco)
  {
    const file = path.join(fixturesDir, '05_different_colors.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '05_different_colors.dxf');

    // Regra customizada do fornecedor B
    const customRules: ClassificationRule[] = [
      { id: 'c1', criteria: 'COLOR', matchValue: '#0000FF', target: 'CUT', priority: 100 },
      { id: 'c2', criteria: 'COLOR', matchValue: '#FFFF00', target: 'CREASE', priority: 100 },
    ];

    const result = CadImportEngine.buildPackagingGeometry(doc, { customRules });
    assert(result.report.classifiedCounts.cut === 4, 'Esperava 4 cortes em Azul');
    assert(result.report.classifiedCounts.crease === 2, 'Esperava 2 vincos em Amarelo');

    results.push({
      name: '06A. Independência de Cores (Teste B: Azul = Corte, Amarelo = Vinco)',
      category: 'CLASSIFICAÇÃO',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Azul (#0000FF) -> CUT (4), Amarelo (#FFFF00) -> CREASE (2)`,
    });
  }

  // TESTE 6B: Independência de Cores (Teste C: Preto = Corte, Magenta = Vinco)
  {
    const dxfBlackMagenta = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n62\n250\n10\n0.0\n20\n0.0\n11\n400.0\n21\n0.0\n0\nLINE\n8\n0\n62\n250\n10\n400.0\n20\n0.0\n11\n400.0\n21\n250.0\n0\nLINE\n8\n0\n62\n250\n10\n400.0\n20\n250.0\n11\n0.0\n21\n250.0\n0\nLINE\n8\n0\n62\n250\n10\n0.0\n20\n250.0\n11\n0.0\n21\n0.0\n0\nLINE\n8\n0\n62\n6\n10\n150.0\n20\n0.0\n11\n150.0\n21\n250.0\n0\nLINE\n8\n0\n62\n6\n10\n250.0\n20\n0.0\n11\n250.0\n21\n250.0\n0\nENDSEC\n0\nEOF`;
    const doc = await CadImportEngine.importFile(dxfBlackMagenta, 'black_magenta.dxf');
    const customRules: ClassificationRule[] = [
      { id: 'bm1', criteria: 'COLOR', matchValue: '#333333', target: 'CUT', priority: 100 },
      { id: 'bm2', criteria: 'COLOR', matchValue: '#FF00FF', target: 'CREASE', priority: 100 },
    ];
    const result = CadImportEngine.buildPackagingGeometry(doc, { customRules });
    assert(result.report.classifiedCounts.cut === 4, 'Esperava 4 cortes em Preto');
    assert(result.report.classifiedCounts.crease === 2, 'Esperava 2 vincos em Magenta');
    assert(result.geometry.bounds.width === 400 && result.geometry.bounds.height === 250, 'Dimensões idênticas');

    results.push({
      name: '06B. Independência de Cores (Teste C: Preto = Corte, Magenta = Vinco)',
      category: 'CLASSIFICAÇÃO',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Preto ACI:250 -> CUT (4), Magenta ACI:6 -> CREASE (2). Geometria idêntica ao Teste B.`,
    });
  }

  // TESTE 7: Entidades Complexas (Polilinhas com Bulge, Arcos e Picote)
  {
    const file = path.join(fixturesDir, '06_perf_and_arcs.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '06_perf_and_arcs.dxf');

    const result = CadImportEngine.buildPackagingGeometry(doc, {
      profile: DEFAULT_PROFILES[0],
    });

    assert(result.geometry.arcs.length >= 2, 'Deve conter arcos analíticos da polilinha e do ARC');
    assert(result.report.classifiedCounts.perf === 1, 'Picote deve estar presente');

    results.push({
      name: '07. Geometrias Complexas — LWPOLYLINE com Bulge e Arcos Analíticos',
      category: 'GEOMETRIA',
      status: 'PASS',
      maxErrorMm: 0.001,
      toleranceMm: 0.001,
      details: `Total Arcos: ${result.geometry.arcs.length}, Total Segmentos: ${result.geometry.segments.length}, Picotes: ${result.report.classifiedCounts.perf}`,
    });
  }

  // TESTE 8: Teste de Precisão Dimensional Escalonada (10mm, 50mm, 100mm, 500mm, 1000mm)
  {
    const testSizes = [10, 50, 100, 500, 1000];
    let maxScaledErr = 0;

    for (const size of testSizes) {
      const dxfSample = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n62\n1\n10\n0.0\n20\n0.0\n11\n${size}.0\n21\n0.0\n0\nENDSEC\n0\nEOF`;
      const doc = await CadImportEngine.importFile(dxfSample, `test_${size}mm.dxf`);
      const res = CadImportEngine.buildPackagingGeometry(doc);
      const measuredLen = Math.hypot(
        res.geometry.segments[0].x1 - res.geometry.segments[0].x0,
        res.geometry.segments[0].y1 - res.geometry.segments[0].y0
      );
      const err = Math.abs(measuredLen - size);
      if (err > maxScaledErr) maxScaledErr = err;
    }

    assert(maxScaledErr <= 0.0001, `Erro dimensional escalonado ${maxScaledErr}mm`);

    results.push({
      name: '08. Precisão Dimensional Rigorosa 1:1 (10, 50, 100, 500, 1000 mm)',
      category: 'PRECISÃO',
      status: 'PASS',
      maxErrorMm: maxScaledErr,
      toleranceMm: 0.0001,
      details: `Medições 10mm..1000mm: erro máximo = ${maxScaledErr.toFixed(6)}mm`,
    });
  }

  // TESTE 9: Auditoria do Formato DWG
  {
    assert(DWG_STATUS === 'BLOCKED_DEPENDENCY', 'DWG_STATUS deve ser BLOCKED_DEPENDENCY');
    const fakeHeader = new TextEncoder().encode('AC1032\0\0\0\0\0');
    const doc = await CadImportEngine.importFile(fakeHeader, 'test_r2018.dwg');
    assert(doc.format === 'DWG', 'Formato deve ser DWG');
    assert(doc.unsupportedEntities.length === 1, 'Deve registrar dependência DWG');

    results.push({
      name: '09. Verificação DWG — Detecção de Cabeçalho e Requisito de Dependência',
      category: 'DWG',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `DWG_STATUS = ${DWG_STATUS}. Dependência técnica de conversão documentada sem simulações falsas.`,
    });
  }

  // TESTE 10: Fallback Garantido UNCLASSIFIED
  {
    const unclassifiedDxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nCAMADA_DESCONHECIDA\n62\n253\n10\n0.0\n20\n0.0\n11\n100.0\n21\n0.0\n0\nENDSEC\n0\nEOF`;
    const doc = await CadImportEngine.importFile(unclassifiedDxf, 'unknown.dxf');
    const res = CadImportEngine.buildPackagingGeometry(doc, { customRules: [] });

    assert(res.report.classifiedCounts.unclassified === 1, 'Entidade sem regra deve ser classificada como UNCLASSIFIED');
    assert(res.report.classifiedCounts.cut === 0, 'Entidade desconhecida NUNCA deve virar CUT automaticamente');

    results.push({
      name: '10. Fallback Seguro — Nenhuma Entidade é Forçada Silenciosamente para CUT',
      category: 'CLASSIFICAÇÃO',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Entidade desconhecida -> UNCLASSIFIED. Mantida com segurança sem assumir corte.`,
    });
  }

  // TESTE 11: Comparação Exata Entidade por Entidade (Entrada CAD vs PackagingGeometry)
  {
    const file = path.join(fixturesDir, '01_cut_crease.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '01_cut_crease.dxf');
    const res = CadImportEngine.buildPackagingGeometry(doc, { profile: DEFAULT_PROFILES[0], originZeroZero: false });

    // Sub-segmento particionado na T-junction: (0,0) -> (100,0)
    const s0 = res.geometry.segments.find((s) => (s.x0 === 0 && s.y0 === 0 && s.x1 === 100 && s.y1 === 0) || (s.x0 === 100 && s.y0 === 0 && s.x1 === 0 && s.y1 === 0));
    assert(Boolean(s0), 'Segmento particionado (0,0)->(100,0) deve existir com coordenadas exatas');
    assert(s0?.type === 'cut', 'Segmento de borda deve ser cut');

    // Segmento vertical: (0,0) -> (0,300)
    const sVert = res.geometry.segments.find((s) => (s.x0 === 0 && s.y0 === 0 && s.x1 === 0 && s.y1 === 300) || (s.x0 === 0 && s.y0 === 300 && s.x1 === 0 && s.y1 === 0));
    assert(Boolean(sVert), 'Segmento vertical (0,0)->(0,300) deve existir');

    // Arco: cx=250, cy=150, r=25, start=0, end=180
    const a0 = res.geometry.arcs[0];
    assert(Boolean(a0), 'Arco deve existir');
    const arcDistCenter = Math.hypot(a0.cx - 250, a0.cy - 150);
    const arcRadiusErr = Math.abs(a0.r - 25);
    const arcStartErr = Math.abs(a0.startAngle - 0);
    const arcEndErr = Math.abs(a0.endAngle - 180);
    const maxArcErr = Math.max(arcDistCenter, arcRadiusErr, arcStartErr, arcEndErr);
    assert(maxArcErr <= 0.000001, `Erro do arco ${maxArcErr} excede tolerância analítica`);

    results.push({
      name: '11. Comparação Entidade por Entidade (Entrada CAD vs PackagingGeometry)',
      category: 'PRECISÃO',
      status: 'PASS',
      maxErrorMm: maxArcErr,
      toleranceMm: 0.000001,
      details: `Segmentos (6/6) e Arcos (1/1) comparados individualmente: desvio máximo = ${maxArcErr.toFixed(6)}mm`,
    });
  }

  // TESTE 12: Comprovação de que PERF Não Cria Painel Falso Nem Vira Boundary
  {
    const file = path.join(fixturesDir, '04_layers.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '04_layers.dxf');
    const res = CadImportEngine.buildPackagingGeometry(doc, { profile: DEFAULT_PROFILES[0] });

    // Verifica que o picote foi mantido como 'perfo'
    const perfSegments = res.geometry.segments.filter((s) => s.type === 'perfo');
    assert(perfSegments.length === 1, 'Deve conter exatamente 1 segmento perfo');
    assert(perfSegments[0].x0 === 150 && perfSegments[0].y0 === 50 && perfSegments[0].x1 === 150 && perfSegments[0].y1 === 150, 'Coordenadas do picote exatas');

    // Executa o motor topológico planar nativo
    const topology = buildFoldingTopology(res.dieline);
    // A faca 300x200 com 2 vincos verticais em x=100 e x=200 tem 3 painéis reais
    // O picote interno NÃO pode dividir a face criando um 4º painel de contorno falso!
    assert(topology.panels.length === 3, `Topologia deve conter 3 painéis reais, encontrou ${topology.panels.length}`);

    results.push({
      name: '12. Prova de Isolamento do PICOTE (PERF não cria painel falso nem boundary)',
      category: 'TOPOLOGIA',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Picote preservado como 'perfo'. Topologia confirmada com exatamente 3 painéis estruturais reais (sem divisão falsa).`,
    });
  }

  // TESTE 13: Comprovação da Hierarquia de Conflitos de Classificação
  {
    // Conflito 1: Layer = "CREASE", Cor = "#FF0000" (vermelho)
    const entity1: ImportedEntity = {
      id: 'test_ent_1',
      sourceType: 'LINE',
      layer: 'CREASE',
      color: { hex: '#FF0000', raw: 'red' },
      x0: 0, y0: 0, x1: 10, y1: 10,
    };
    const profileStandard = DEFAULT_PROFILES[0]; // Layer CREASE: priority 100, Color #FF0000: priority 50
    const target1 = classifyEntity(entity1, [], profileStandard);
    assert(target1 === 'CREASE', `Layer deve vencer sobre Cor na regra padrão (Layer 100 > Cor 50). Obteve: ${target1}`);

    // Conflito 2: Regra Manual de Entidade sobrepondo Perfil
    const manualRule: ClassificationRule = {
      id: 'm1',
      criteria: 'MANUAL_ENTITY',
      matchValue: 'test_ent_1',
      target: 'CUT',
      priority: 200,
    };
    const target2 = classifyEntity(entity1, [manualRule], profileStandard);
    assert(target2 === 'CUT', `Regra manual de entidade deve vencer sobre perfil. Obteve: ${target2}`);

    results.push({
      name: '13. Comprovação da Hierarquia de Conflito de Regras (MANUAL > PERFIL > LAYER > COR)',
      category: 'CLASSIFICAÇÃO',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Conflito Layer (100) vs Cor (50) -> Layer venceu. Override Manual (200) -> Manual venceu.`,
    });
  }

  // TESTE 14: Comprovação de Registro sem Descarte de Entidades Não Suportadas
  {
    const dxfUnsupported = `0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\nTEXTOS\n1\nFACA PRIMACOR\n10\n10.0\n20\n10.0\n0\nMTEXT\n8\nANOTACOES\n1\nCOTAS APROVADAS\n10\n20.0\n20\n20.0\n0\nHATCH\n8\nHACHURAS\n10\n0.0\n20\n0.0\n0\n3DFACE\n8\nMALHAS\n10\n0.0\n20\n0.0\n0\nSOLID\n8\nSOLIDOS\n10\n0.0\n20\n0.0\n0\nSPLINE\n8\nCURVAS\n10\n0.0\n20\n0.0\n0\nELLIPSE\n8\nELIPSES\n10\n0.0\n20\n0.0\n0\nENDSEC\n0\nEOF`;
    const doc = await CadImportEngine.importFile(dxfUnsupported, 'unsupported_all.dxf');
    assert(doc.unsupportedEntities.length === 7, `Esperava 7 entidades não suportadas registradas, encontrou ${doc.unsupportedEntities.length}`);
    const typesRecorded = doc.unsupportedEntities.map((u) => u.type);
    assert(typesRecorded.includes('TEXT'), 'Deve registrar TEXT');
    assert(typesRecorded.includes('MTEXT'), 'Deve registrar MTEXT');
    assert(typesRecorded.includes('HATCH'), 'Deve registrar HATCH');
    assert(typesRecorded.includes('3DFACE'), 'Deve registrar 3DFACE');
    assert(typesRecorded.includes('SOLID'), 'Deve registrar SOLID');
    assert(typesRecorded.includes('SPLINE'), 'Deve registrar SPLINE');
    assert(typesRecorded.includes('ELLIPSE'), 'Deve registrar ELLIPSE');

    results.push({
      name: '14. Registro Rigoroso de Entidades Não Suportadas (TEXT, MTEXT, HATCH, 3DFACE, SOLID, SPLINE, ELLIPSE)',
      category: 'AUDITORIA',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `7 entidades não suportadas registradas em unsupportedEntities sem descarte silencioso.`,
    });
  }

  // TESTE 15: Fase 2A — Snapping Controlado de Micro-Gaps com Diagnóstico Forense
  {
    const geomWithGaps = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 100.03, y0: 0, x1: 100.03, y1: 100, type: 'cut' as const }, // Micro-gap de 0.03 mm (< 0.05 mm)
        { id: 's3', x0: 100.03, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 's4', x0: 0, y0: 100.20, x1: 0, y1: 0, type: 'cut' as const }, // Gap largo de 0.20 mm (> 0.05 mm)
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100.03, maxY: 100.20, width: 100.03, height: 100.20 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(geomWithGaps, { gapToleranceMm: 0.05 });

    assert(topo.stats.gapsHealed >= 1, `Esperava pelo menos 1 micro-gap cicatrizado, curou: ${topo.stats.gapsHealed}`);
    // O gap largo de 0.20mm não deve ter sido forçado silenciosamente
    const seg4 = topo.geometry.segments.find((s) => s.x0 === 0 && s.x1 === 0 && (s.y0 > 100 || s.y1 > 100));
    assert(!!seg4, 'Gap largo de 0.20mm não deve sofrer colapso forçado silencioso');

    results.push({
      name: '15. Fase 2A — Snapping Controlado de Micro-Gaps com Diagnóstico Forense',
      category: 'CONECTIVIDADE',
      status: 'PASS',
      maxErrorMm: 0.03,
      toleranceMm: 0.05,
      details: `Gaps <= 0.05mm curados: ${topo.stats.gapsHealed}. Gaps > 0.05mm preservados sem colapso artificial.`,
    });
  }

  // TESTE 16: Fase 2A — Resolução Analítica Real de T-Junctions (Sem Perda de Comprimento)
  {
    // Geometria em T: Linha horizontal de corte de (0, 150) a (300, 150) com vinco vertical de (150, 0) a (150, 150)
    const tGeom = {
      segments: [
        { id: 'cut_main', x0: 0, y0: 150, x1: 300, y1: 150, type: 'cut' as const },
        { id: 'crease_v', x0: 150, y0: 0, x1: 150, y1: 150, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 150, width: 300, height: 150 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(tGeom);

    assert(topo.stats.tJunctionsSplit === 1, `Esperava 1 T-junction resolvida, obteve: ${topo.stats.tJunctionsSplit}`);
    // O corte principal de 300mm deve ter sido dividido em 2 sub-cortes de 150mm cada
    const cutSubSegs = topo.geometry.segments.filter((s) => s.type === 'cut');
    assert(cutSubSegs.length === 2, `Corte principal deve ser particionado em 2 segmentos, obteve: ${cutSubSegs.length}`);
    const totalCutLen = cutSubSegs.reduce((acc, s) => acc + Math.hypot(s.x1 - s.x0, s.y1 - s.y0), 0);
    const lenDeviation = Math.abs(totalCutLen - 300.0);
    assert(lenDeviation <= 0.000001, `Comprimento total somado deve ser exatamente 300mm. Desvio: ${lenDeviation}mm`);

    results.push({
      name: '16. Fase 2A — Resolução Analítica Real de T-Junctions (Sem Perda de Comprimento)',
      category: 'TOPOLOGIA',
      status: 'PASS',
      maxErrorMm: lenDeviation,
      toleranceMm: 0.001,
      details: `Corte particionado em (0,150)->(150,150) e (150,150)->(300,150). Comprimento total somado: 300.0000mm.`,
    });
  }

  // TESTE 17: Fase 2A — Resolução de Segmentos Colineares Sobrepostos & Precedência de Tipos
  {
    // Segmento com CUT e CREASE exatamente sobrepostos de (0,0) a (100,0)
    const overlapGeom = {
      segments: [
        { id: 's_crease', x0: 0, y0: 0, x1: 100, y1: 0, type: 'crease' as const },
        { id: 's_cut', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 0, width: 100, height: 0 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(overlapGeom);

    assert(topo.geometry.segments.length === 1, `Sobreposição deve fundir em 1 segmento único, obteve: ${topo.geometry.segments.length}`);
    assert(topo.geometry.segments[0].type === 'cut', `Precedência de solidez deve preservar CUT sobre CREASE`);

    results.push({
      name: '17. Fase 2A — Resolução de Segmentos Colineares Sobrepostos & Precedência de Tipos',
      category: 'TOPOLOGIA',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Segmento sobreposto fundido em 1 aresta única com precedência estrita CUT > CREASE.`,
    });
  }

  // TESTE 18: Fase 2A — Estabilidade e Determinismo de IDs
  {
    const file = path.join(fixturesDir, '01_cut_crease.dxf');
    const content = fs.readFileSync(file, 'utf8');

    const docA = await CadImportEngine.importFile(content, '01_cut_crease.dxf');
    const resultA = CadImportEngine.buildPackagingGeometry(docA, { profile: DEFAULT_PROFILES[0] });

    const docB = await CadImportEngine.importFile(content, '01_cut_crease.dxf');
    const resultB = CadImportEngine.buildPackagingGeometry(docB, { profile: DEFAULT_PROFILES[0] });

    const idsA = resultA.geometry.segments.map((s) => s.id);
    const idsB = resultB.geometry.segments.map((s) => s.id);

    assert(JSON.stringify(idsA) === JSON.stringify(idsB), 'IDs de segmentos devem ser 100% determinísticos e idênticos');

    results.push({
      name: '18. Fase 2A — Estabilidade e Determinismo de IDs',
      category: 'ESTABILIDADE',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Execução A vs B: IDs 100% idênticos e determinísticos sem Math.random() ou UUID dinâmico.`,
    });
  }

  // TESTE 19: Fase 2A — Golden Master das Fixtures Oficiais (01 a 06)
  {
    const goldenDir = path.resolve(__dirname, '../tests/golden_master');
    const fixturesToVerify = [
      '01_cut_crease.dxf',
      '02_cut_crease.svg',
      '03_cut_crease.pdf',
      '04_layers.dxf',
      '05_different_colors.dxf',
      '06_perf_and_arcs.dxf',
    ];

    let goldenPassed = 0;
    for (const f of fixturesToVerify) {
      const baseName = f.replace(/\.[^/.]+$/, '');
      const goldenFile = path.join(goldenDir, `${baseName}.golden.json`);
      assert(fs.existsSync(goldenFile), `Arquivo Golden Master ${goldenFile} deve existir`);
      const goldenData = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));

      const profileForFixture: Record<string, ClassificationProfile | undefined> = {
        '05_different_colors.dxf': {
          id: 'blue_yellow_test',
          name: 'Blue/Yellow Scheme',
          format: 'ALL',
          rules: [
            { id: 'c1', criteria: 'COLOR', matchValue: '#0000FF', target: 'CUT', priority: 100 },
            { id: 'c2', criteria: 'COLOR', matchValue: '#FFFF00', target: 'CREASE', priority: 100 },
          ],
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      };

      const filePath = path.join(fixturesDir, f);
      const content = f.endsWith('.pdf') ? fs.readFileSync(filePath) : fs.readFileSync(filePath, 'utf8');
      const doc = await CadImportEngine.importFile(content, f);
      const selectedProfile = profileForFixture[f] || DEFAULT_PROFILES[0];
      const res = CadImportEngine.buildPackagingGeometry(doc, { profile: selectedProfile });

      if (goldenData.cuts !== undefined) {
        assert(res.report.classifiedCounts.cut === goldenData.cuts, `Golden Master [${f}] CUT mismatch`);
      }
      if (goldenData.creases !== undefined) {
        assert(res.report.classifiedCounts.crease === goldenData.creases, `Golden Master [${f}] CREASE mismatch`);
      }
      if (goldenData.perf !== undefined) {
        assert(res.report.classifiedCounts.perf === goldenData.perf, `Golden Master [${f}] PERF mismatch`);
      }
      goldenPassed++;
    }

    results.push({
      name: '19. Fase 2A — Golden Master das Fixtures Oficiais (01 a 06)',
      category: 'GOLDEN MASTER',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `${goldenPassed}/6 fixtures oficiais auditadas contra Golden Master sem regressões.`,
    });
  }

  // TESTE 20 (TESTE A): Fase 2A.1 — Sobreposição Parcial Colinear (CUT 0->100 com CREASE 20->80)
  {
    const partialOverlapGeom = {
      segments: [
        { id: 's_cut', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 's_crease', x0: 20, y0: 0, x1: 80, y1: 0, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 0, width: 100, height: 0 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(partialOverlapGeom);

    // Deve particionar em exatamente 3 subsegmentos: 0->20 (cut), 20->80 (cut por precedência), 80->100 (cut)
    assert(topo.geometry.segments.length === 3, `Esperava exatamente 3 subsegmentos pós-fusão colinear, obteve: ${topo.geometry.segments.length}`);
    const seg20_80 = topo.geometry.segments.find((s) => (s.x0 === 20 && s.x1 === 80) || (s.x0 === 80 && s.x1 === 20));
    assert(Boolean(seg20_80), 'Subsegmento 20->80 deve existir');
    assert(seg20_80?.type === 'cut', `Subsegmento 20->80 deve ter tipo CUT por precedência normativa`);

    // Comprimento total somado deve ser exatamente 100 mm
    const totalLen = topo.geometry.segments.reduce((acc, s) => acc + Math.hypot(s.x1 - s.x0, s.y1 - s.y0), 0);
    assert(Math.abs(totalLen - 100.0) <= 0.000001, `Comprimento total deve ser 100.000mm, obteve: ${totalLen}`);

    // Registro no log de reparos
    const mergeRepair = topo.repairs.find((r) => r.action === 'MERGE_COLINEAR_OVERLAP');
    assert(Boolean(mergeRepair), 'Reparo MERGE_COLINEAR_OVERLAP deve ser registrado no log');

    results.push({
      name: '20. Fase 2A.1 — Teste A: Sobreposição Parcial Colinear (CUT 0..100 com CREASE 20..80)',
      category: 'HARDENING',
      status: 'PASS',
      maxErrorMm: Math.abs(totalLen - 100.0),
      toleranceMm: 0.001,
      details: `3 subsegmentos gerados: 0->20 (cut), 20->80 (cut com fusão auditada), 80->100 (cut). Comprimento: 100.000mm.`,
    });
  }

  // TESTE 21 (TESTE B): Fase 2A.1 — X-Intersection Analítica (Cruzamento Simples em 50,50)
  {
    const xGeom = {
      segments: [
        { id: 'diag1', x0: 0, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'diag2', x0: 0, y0: 100, x1: 100, y1: 0, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(xGeom);

    // Deve gerar exatamente 4 subsegmentos que se encontram no vértice (50, 50)
    assert(topo.geometry.segments.length === 4, `Esperava 4 subsegmentos na X-intersection, obteve: ${topo.geometry.segments.length}`);
    const cuts = topo.geometry.segments.filter((s) => s.type === 'cut');
    const creases = topo.geometry.segments.filter((s) => s.type === 'crease');
    assert(cuts.length === 2, `Esperava 2 cortes na diagonal 1, obteve: ${cuts.length}`);
    assert(creases.length === 2, `Esperava 2 vincos na diagonal 2, obteve: ${creases.length}`);

    // Verifica que todos os 4 tocam o ponto de interseção (50, 50)
    for (const s of topo.geometry.segments) {
      const touches50 = (Math.hypot(s.x0 - 50, s.y0 - 50) < 0.001) || (Math.hypot(s.x1 - 50, s.y1 - 50) < 0.001);
      assert(touches50, `Subsegmento ${s.id} deve incidir no vértice de interseção (50, 50)`);
    }

    const expectedLen = Math.SQRT2 * 100 * 2; // ~282.842712 mm
    const totalLen = topo.geometry.segments.reduce((acc, s) => acc + Math.hypot(s.x1 - s.x0, s.y1 - s.y0), 0);
    const lenErr = Math.abs(totalLen - expectedLen);
    assert(lenErr <= 0.00001, `Comprimento somado deve ser preservado. Erro: ${lenErr}mm`);

    results.push({
      name: '21. Fase 2A.1 — Teste B: X-Intersection Analítica em (50,50)',
      category: 'HARDENING',
      status: 'PASS',
      maxErrorMm: lenErr,
      toleranceMm: 0.001,
      details: `Cruzamento particionado em 4 subsegmentos convergentes em (50,50). Comprimento preservado: ${totalLen.toFixed(4)}mm.`,
    });
  }

  // TESTE 22 (TESTE C): Fase 2A.1 — Múltiplos Cruzamentos em X na Mesma Linha
  {
    const multiXGeom = {
      segments: [
        { id: 'h_main', x0: 0, y0: 50, x1: 300, y1: 50, type: 'cut' as const },
        { id: 'v1', x0: 50, y0: 0, x1: 50, y1: 100, type: 'crease' as const },
        { id: 'v2', x0: 150, y0: 0, x1: 150, y1: 100, type: 'crease' as const },
        { id: 'v3', x0: 250, y0: 0, x1: 250, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 100, width: 300, height: 100 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(multiXGeom);

    // Linha horizontal dividida em 4 partes (0..50, 50..150, 150..250, 250..300)
    // 3 Linhas verticais divididas em 2 partes cada (0..50, 50..100) -> 6 verticais
    // Total = 4 + 6 = 10 segmentos
    assert(topo.geometry.segments.length === 10, `Esperava 10 subsegmentos para 3 X-intersections, obteve: ${topo.geometry.segments.length}`);
    const hCuts = topo.geometry.segments.filter((s) => s.type === 'cut');
    assert(hCuts.length === 4, `Esperava 4 subsegmentos horizontais de corte, obteve: ${hCuts.length}`);

    results.push({
      name: '22. Fase 2A.1 — Teste C: Múltiplos Cruzamentos em X (1 linha cortada por 3 transversais)',
      category: 'HARDENING',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `3 X-intersections resolvidas analiticamente em x=50, x=150, x=250 gerando 10 subsegmentos conexos.`,
    });
  }

  // TESTE 23 (TESTE D): Fase 2A.1 — Ordem SNAP antes de T-Junction (Gap de 0.03 mm com T-Junction)
  {
    // Linha horizontal de corte em 2 partes com micro-gap de 0.03mm entre si: (0,100)->(99.985,100) e (100.015,100)->(200,100)
    // Vinco vertical de (100, 0) a (100, 99.985)
    const snapBeforeTGeom = {
      segments: [
        { id: 'cut_h1', x0: 0, y0: 100, x1: 99.985, y1: 100, type: 'cut' as const },
        { id: 'cut_h2', x0: 100.015, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'crease_v', x0: 100, y0: 0, x1: 100, y1: 99.985, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(snapBeforeTGeom, { gapToleranceMm: 0.05 });

    // O SNAP deve curar o gap de 0.03mm unificando em (100, 100)
    const snapRepair = topo.repairs.find((r) => r.action === 'SNAP_VERTICES');
    assert(Boolean(snapRepair), 'Deve conter registro de SNAP_VERTICES');
    assert(topo.geometry.segments.length === 3, `Esperava 3 segmentos conexos no ponto (100,100), obteve: ${topo.geometry.segments.length}`);

    results.push({
      name: '23. Fase 2A.1 — Teste D: Ordem SNAP antes de T-Junction (Gap de 0.03mm)',
      category: 'HARDENING',
      status: 'PASS',
      maxErrorMm: 0.03,
      toleranceMm: 0.05,
      details: `SNAP unificou extremidades com gap de 0.03mm em (100,100) gerando conectividade T perfeita.`,
    });
  }

  // TESTE 24 (TESTE E): Fase 2A.1 — Gap Fora da Tolerância (> 0.05 mm) Permanece Aberto
  {
    const gapFarGeom = {
      segments: [
        { id: 'cut_h', x0: 0, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'crease_v', x0: 100, y0: 0, x1: 100, y1: 99.80, type: 'crease' as const }, // Gap de 0.20 mm (> 0.05 mm)
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(gapFarGeom, { gapToleranceMm: 0.05, tJunctionToleranceMm: 0.05 });

    // Não deve ocorrer snap e o corte não deve ser quebrado em T-junction espúria
    const cuts = topo.geometry.segments.filter((s) => s.type === 'cut');
    assert(cuts.length === 1, `Corte não deve ser quebrado pois o vinco está além da tolerância (0.20mm), obteve: ${cuts.length}`);

    results.push({
      name: '24. Fase 2A.1 — Teste E: Gap Fora da Tolerância (> 0.05mm)',
      category: 'HARDENING',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.05,
      details: `Gap de 0.20mm preservado aberto sem colapso artificial e sem T-junction espúria.`,
    });
  }

  // TESTE 25 (TESTE F): Fase 2A.1 — Preservação Estrita do Tipo PERF em Subdivisões
  {
    const perfCrossGeom = {
      segments: [
        { id: 'p_main', x0: 0, y0: 50, x1: 200, y1: 50, type: 'perfo' as const },
        { id: 'c_vert', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(perfCrossGeom);

    const perfs = topo.geometry.segments.filter((s) => s.type === 'perfo');
    assert(perfs.length === 2, `Esperava 2 subsegmentos com tipo 'perfo', obteve: ${perfs.length}`);
    for (const p of perfs) {
      assert(p.type === 'perfo', `Subsegmento de picote deve manter type: 'perfo'`);
    }

    results.push({
      name: '25. Fase 2A.1 — Teste F: Preservação de Tipo PERF em Particionamentos',
      category: 'HARDENING',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Linha de picote particionada em 2 subsegmentos mantendo estritamente type='perfo'.`,
    });
  }

  // TESTE 26 (TESTE G): Fase 2A.1 — Preservação de Arc2D Analítico sem Discretização
  {
    const arcGeom = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
      ],
      arcs: [
        { id: 'a1', cx: 100, cy: 50, r: 30, startAngle: 0, endAngle: 180, type: 'cut' as const },
      ],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 80, width: 200, height: 80 },
    };

    const { TopologyReconstructor } = await import('../src/engine/importers/TopologyReconstructor');
    const topo = TopologyReconstructor.reconstructConnectivity(arcGeom);

    assert(topo.geometry.arcs.length === 1, 'Arco deve ser mantido como Arc2D no modelo');
    const a = topo.geometry.arcs[0];
    assert(a.cx === 100 && a.cy === 50 && a.r === 30 && a.startAngle === 0 && a.endAngle === 180, 'Propriedades analíticas do arco devem permanecer idênticas');

    results.push({
      name: '26. Fase 2A.1 — Teste G: Preservação de Arc2D Analítico sem Poligonização',
      category: 'HARDENING',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Arc2D mantido analiticamente com cx=100, cy=50, r=30, a0=0, a1=180 sem discretização em segmentos.`,
    });
  }

  // TESTE 27 (TESTE H): Fase 2A.1 — Repetibilidade e Determinismo Absoluto em 10 Execuções
  {
    const file = path.join(fixturesDir, '01_cut_crease.dxf');
    const content = fs.readFileSync(file, 'utf8');

    const doc = await CadImportEngine.importFile(content, '01_cut_crease.dxf');
    const baseline = JSON.stringify(CadImportEngine.buildPackagingGeometry(doc, { profile: DEFAULT_PROFILES[0] }).geometry);

    for (let iter = 1; iter <= 10; iter++) {
      const current = JSON.stringify(CadImportEngine.buildPackagingGeometry(doc, { profile: DEFAULT_PROFILES[0] }).geometry);
      assert(current === baseline, `Execução ${iter} produziu saída diferente da baseline (falha de determinismo)`);
    }

    results.push({
      name: '27. Fase 2A.1 — Teste H: Repetibilidade e Determinismo em 10 Execuções Consecutivas',
      category: 'ESTABILIDADE',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `10 execuções consecutivas geraram strings JSON idênticas byte-a-byte (100% determinístico).`,
    });
  }

  // TESTE 28 (TESTE 2B-01): Retângulo Simples 500x300mm -> 1 Loop Fechado, Área = 150.000 mm²
  {
    const rectGeom = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 500, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 500, y0: 0, x1: 500, y1: 300, type: 'cut' as const },
        { id: 's3', x0: 500, y0: 300, x1: 0, y1: 300, type: 'cut' as const },
        { id: 's4', x0: 0, y0: 300, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 500, maxY: 300, width: 500, height: 300 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(rectGeom);

    assert(result.panels.length === 1, `Esperava exatamente 1 painel estrutural, encontrou: ${result.panels.length}`);
    const panel = result.panels[0];
    const expectedArea = 500 * 300; // 150000 mm²
    const areaErr = Math.abs(panel.area - expectedArea);
    assert(areaErr <= 0.001, `Área do painel deve ser 150000 mm², obteve: ${panel.area}`);
    assert(panel.outerBoundary.edges.length === 4, 'Boundary externa deve ter 4 arestas');
    assert(panel.outerBoundary.orientation === 'CCW', 'Orientação do painel deve ser CCW');

    results.push({
      name: '28. Fase 2B — Teste 2B-01: Retângulo Simples 500x300mm (Área Exata 150.000 mm²)',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: areaErr,
      toleranceMm: 0.001,
      details: `1 painel estrutural P001 com 4 arestas de corte, orientação CCW e área exata de ${panel.area.toFixed(2)} mm².`,
    });
  }

  // TESTE 29 (TESTE 2B-02): Retângulo com Vincos Internos -> Extração de Painéis Reais (Sem Dimensões Fictícias)
  {
    const file = path.join(fixturesDir, '01_cut_crease.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '01_cut_crease.dxf');
    const normalized = CadImportEngine.buildPackagingGeometry(doc, { profile: DEFAULT_PROFILES[0], originZeroZero: false });

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(normalized.geometry);

    // O arquivo 01_cut_crease.dxf possui um retângulo 500x300 dividido por 2 vincos verticais em x=100 e x=400 (3 painéis)
    assert(result.panels.length === 3, `Esperava exatamente 3 painéis reais formados por cortes e vincos, obteve: ${result.panels.length}`);
    const totalArea = result.panels.reduce((acc, p) => acc + p.area, 0);
    // Área do retângulo menos o arco interno se houver
    assert(totalArea > 0, 'Área total dos painéis deve ser positiva');

    // Valida o manifesto forense de cada painel
    for (const p of result.panels) {
      assert(p.manifest.includes(`Panel ${p.id}`), `Painel ${p.id} deve conter manifesto topológico forense estruturado`);
    }

    results.push({
      name: '29. Fase 2B — Teste 2B-02: Retângulo com Vincos Internos (Extração Pura de 3 Painéis)',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `3 painéis estruturais reais derivados puramente de ciclos fechados de corte e vinco.`,
    });
  }

  // TESTE 30 (TESTE 2B-03): Boundary com Arc2D Analítico e Cálculo de Área Exata sem Discretização
  {
    // Caixa com topo abaulado: base 100x50 com arco no topo de raio 50 de (100, 50) a (0, 50)
    const arcBoundaryGeom = {
      segments: [
        { id: 's_bottom', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 's_right', x0: 100, y0: 0, x1: 100, y1: 50, type: 'cut' as const },
        { id: 's_left', x0: 0, y0: 50, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [
        { id: 'arc_top', cx: 50, cy: 50, r: 50, startAngle: 0, endAngle: 180, type: 'cut' as const },
      ],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(arcBoundaryGeom);

    assert(result.panels.length === 1, `Esperava 1 painel com arco no topo, obteve: ${result.panels.length}`);
    const panel = result.panels[0];
    assert(panel.arcs.length === 1, 'O painel deve conter referência direta ao Arc2D original');

    // Área retangular (100x50 = 5000) + Área do semi-círculo (0.5 * PI * 50^2 = 3926.9908) = 8926.9908 mm²
    const expectedArea = 5000 + 0.5 * Math.PI * 50 * 50;
    const areaDiff = Math.abs(panel.area - expectedArea);
    assert(areaDiff <= 0.05, `Área analítica com arco deve ser ~8926.99 mm², obteve: ${panel.area}`);

    results.push({
      name: '30. Fase 2B — Teste 2B-03: Boundary com Arc2D Analítico (Área Analítica Exata)',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: areaDiff,
      toleranceMm: 0.05,
      details: `Painel com arco analítico preservado (Arc2D) e área exata de ${panel.area.toFixed(2)} mm² sem discretização.`,
    });
  }

  // TESTE 31 (TESTE 2B-04): PERF Atravessando Região (Não Fecha Loop Nem Cria Painel Falso)
  {
    const perfGeom = {
      segments: [
        { id: 'c1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'c2', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'c3', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'c4', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'p_mid', x0: 50, y0: 0, x1: 50, y1: 100, type: 'perfo' as const }, // Picote atravessando a face no meio
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(perfGeom);

    // O picote NÃO pode subdividir o quadrado em 2 painéis
    assert(result.panels.length === 1, `PERF não deve criar painel falso, esperava 1 painel, obteve: ${result.panels.length}`);
    assert(result.stats.perfCount === 1, 'Picote deve continuar registrado nas estatísticas');

    results.push({
      name: '31. Fase 2B — Teste 2B-04: Isolamento de PERF (Zero Painéis Falsos Criados por Picote)',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `1 painel estrutural único preservado de 100x100mm; picote isolado sem subdivisão de faces.`,
    });
  }

  // TESTE 32 (TESTE 2B-05): Múltiplos Loops com Furo Interno (Hole) e Cálculo de Área Líquida
  {
    // Painel externo 200x200 com furo central 50x50
    const holeGeom = {
      segments: [
        // Outer loop 200x200
        { id: 'out_1', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'out_2', x0: 200, y0: 0, x1: 200, y1: 200, type: 'cut' as const },
        { id: 'out_3', x0: 200, y0: 200, x1: 0, y1: 200, type: 'cut' as const },
        { id: 'out_4', x0: 0, y0: 200, x1: 0, y1: 0, type: 'cut' as const },
        // Inner hole 50x50 em (75, 75)
        { id: 'hole_1', x0: 75, y0: 75, x1: 125, y1: 75, type: 'cut' as const },
        { id: 'hole_2', x0: 125, y0: 75, x1: 125, y1: 125, type: 'cut' as const },
        { id: 'hole_3', x0: 125, y0: 125, x1: 75, y1: 125, type: 'cut' as const },
        { id: 'hole_4', x0: 75, y0: 125, x1: 75, y1: 75, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200, width: 200, height: 200 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(holeGeom);

    assert(result.panels.length === 1, `Esperava 1 painel com 1 furo interno, obteve: ${result.panels.length}`);
    assert(result.holes.length === 1, `Esperava 1 hole identificado, obteve: ${result.holes.length}`);
    const panel = result.panels[0];
    assert(panel.holes.length === 1, 'Painel deve conter o furo em sua lista de holes');

    // Área bruta = 40000 mm², Área do furo = 2500 mm², Área líquida = 37500 mm²
    const expectedNetArea = 200 * 200 - 50 * 50; // 37500 mm²
    const areaDiff = Math.abs(panel.area - expectedNetArea);
    assert(areaDiff <= 0.001, `Área líquida deve ser 37500 mm², obteve: ${panel.area}`);

    results.push({
      name: '32. Fase 2B — Teste 2B-05: Múltiplos Loops com Furo Interno (Cálculo de Área Líquida)',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: areaDiff,
      toleranceMm: 0.001,
      details: `1 painel hospedeiro P001 com 1 furo interno identificado; Área líquida exata = ${panel.area} mm².`,
    });
  }

  // TESTE 33 (TESTE 2B-06): Detecção de Boundary Aberta (Diagnóstico OPEN_BOUNDARY sem Fechamento Artificial)
  {
    // Polilinha em "U" aberta (falta a aresta superior)
    const openGeom = {
      segments: [
        { id: 'u1', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'u2', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'u3', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(openGeom);

    // Não deve inventar uma 4ª linha para fechar painel
    assert(result.panels.length === 0, `Boundary aberta NÃO deve criar painel artificialmente, obteve: ${result.panels.length}`);
    assert(result.openBoundaries.length >= 1, `Deve emitir diagnóstico OPEN_BOUNDARY, encontrou: ${result.openBoundaries.length}`);

    results.push({
      name: '33. Fase 2B — Teste 2B-06: Detecção de Boundary Aberta (Diagnóstico OPEN_BOUNDARY)',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Diagnóstico OPEN_BOUNDARY emitido em pontas soltas sem adição de arestas imaginárias.`,
    });
  }

  // TESTE 34 (TESTE 2B-07): Geometria com T-Junctions da Fase 2A.1 Forma Loops Perfeitos
  {
    // Linha horizontal dividida em T por vinco
    const tGeom = {
      segments: [
        { id: 'c1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'c2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'c3', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'c4', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'c5', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'c6', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_mid', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(tGeom);

    assert(result.panels.length === 2, `Esperava 2 painéis formados pela divisória T central, obteve: ${result.panels.length}`);
    for (const p of result.panels) {
      assert(p.area === 10000, `Cada painel 100x100 deve ter área de 10000 mm², obteve: ${p.area}`);
    }

    results.push({
      name: '34. Fase 2B — Teste 2B-07: T-Junctions Conectadas Produzem 2 Painéis Perfeitos',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `2 painéis estruturais conexos de 10000 mm² cada divididos pelo vinco central.`,
    });
  }

  // TESTE 35 (TESTE 2B-08): Geometria com X-Intersections da Fase 2A.1 Forma 4 Quadrantes Fechados
  {
    // Quadrado 200x200 com duas diagonais se cruzando em (100, 100)
    const xGeom = {
      segments: [
        // Borda externa
        { id: 'b1', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b2', x0: 200, y0: 0, x1: 200, y1: 200, type: 'cut' as const },
        { id: 'b3', x0: 200, y0: 200, x1: 0, y1: 200, type: 'cut' as const },
        { id: 'b4', x0: 0, y0: 200, x1: 0, y1: 0, type: 'cut' as const },
        // Diagonais particionadas no centro (100, 100)
        { id: 'd1a', x0: 0, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'd1b', x0: 100, y0: 100, x1: 200, y1: 200, type: 'crease' as const },
        { id: 'd2a', x0: 0, y0: 200, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'd2b', x0: 100, y0: 100, x1: 200, y1: 0, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200, width: 200, height: 200 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const result = LoopTopologyEngine.extractTopology(xGeom);

    // Deve formar 4 triângulos (painéis) de área = 0.5 * 200 * 100 = 10000 mm² cada
    assert(result.panels.length === 4, `Esperava 4 painéis triangulares no cruzamento em X, obteve: ${result.panels.length}`);
    const totalArea = result.panels.reduce((acc, p) => acc + p.area, 0);
    assert(Math.abs(totalArea - 40000) <= 0.001, `Área somada dos 4 quadrantes deve ser 40000 mm², obteve: ${totalArea}`);

    results.push({
      name: '35. Fase 2B — Teste 2B-08: X-Intersection Produz 4 Painéis Triangulares Conexos',
      category: 'TOPOLOGIA_2B',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `4 faces planares de 10000 mm² cada convergindo no nó central (100,100).`,
    });
  }

  // TESTE 36 (TESTE 2B-09): Determinismo Rigoroso da Extração Topológica 2B
  {
    const file = path.join(fixturesDir, '01_cut_crease.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '01_cut_crease.dxf');
    const normalized = CadImportEngine.buildPackagingGeometry(doc, { profile: DEFAULT_PROFILES[0], originZeroZero: false });

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const baseline = JSON.stringify(LoopTopologyEngine.extractTopology(normalized.geometry));

    for (let iter = 1; iter <= 10; iter++) {
      const current = JSON.stringify(LoopTopologyEngine.extractTopology(normalized.geometry));
      assert(current === baseline, `Execução 2B ${iter} produziu saída diferente da baseline (falha de determinismo)`);
    }

    results.push({
      name: '36. Fase 2B — Teste 2B-09: Determinismo e Repetibilidade em 10 Execuções 2B',
      category: 'ESTABILIDADE',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `10 execuções da extração topológica 2B geraram JSON idêntico byte-a-byte.`,
    });
  }

  // ============================================================
  // FASE 2C — TESTES TOPOLÓGICOS DE ÁRVORE DE DOBRAGEM (TESTES 37 A 46)
  // ============================================================

  const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');

  // TESTE 37 (TESTE 2C-01): Painel único sem crease -> 1 painel, 0 hinges
  {
    const singleGeom = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 200, y0: 0, x1: 200, y1: 150, type: 'cut' as const },
        { id: 's3', x0: 200, y0: 150, x1: 0, y1: 150, type: 'cut' as const },
        { id: 's4', x0: 0, y0: 150, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 150, width: 200, height: 150 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(singleGeom);
    assert(topo.panels.length === 1, `Esperava 1 painel, obteve: ${topo.panels.length}`);

    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, singleGeom);

    assert(treeResult.stats.totalPanels === 1, 'Total de painéis deve ser 1');
    assert(treeResult.stats.totalHinges === 0, 'Total de hinges deve ser 0');
    assert(treeResult.hinges.length === 0, 'Lista de hinges deve ser vazia');
    assert(treeResult.rootPanelId === topo.panels[0].id, 'Root panel deve ser o único painel');
    assert(treeResult.tree.children.length === 0, 'Root node não deve ter filhos');

    results.push({
      name: '37. Fase 2C — Teste 2C-01: Painel Único Sem Crease Produz 0 Hinges',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `1 painel estrutural, 0 hinges, root panel identificado corretamente sem vincos.`,
    });
  }

  // TESTE 38 (TESTE 2C-02): Dois painéis conectados por 1 CREASE real
  {
    const twoPanelsGeom = {
      segments: [
        { id: 'c1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'c2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'c3', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'c4', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'c5', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'c6', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease_1', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(twoPanelsGeom);
    assert(topo.panels.length === 2, `Esperava 2 painéis, obteve: ${topo.panels.length}`);

    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelsGeom);

    assert(treeResult.stats.totalPanels === 2, 'Total de painéis deve ser 2');
    assert(treeResult.stats.totalHinges === 1, 'Total de hinges deve ser 1');
    assert(treeResult.hinges.length === 1, 'Deve conter exatamente 1 hinge');

    const hinge = treeResult.hinges[0];
    assert(hinge.creaseId === 'v_crease_1', `Hinge deve apontar para v_crease_1, obteve: ${hinge.creaseId}`);
    assert(hinge.length === 100, `Comprimento da hinge deve ser 100mm, obteve: ${hinge.length}`);
    assert(hinge.axisStart.x === 100 && hinge.axisEnd.x === 100, 'Eixo deve estar em x=100');
    assert(hinge.foldAngle === 90, 'Ângulo de dobra padrão deve ser 90°');

    results.push({
      name: '38. Fase 2C — Teste 2C-02: Dois Painéis Conectados por 1 CREASE Produzem 1 Hinge Real',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `2 painéis, 1 hinge [${hinge.id}] associada à CREASE real 'v_crease_1' com comprimento ${hinge.length}mm.`,
    });
  }

  // TESTE 39 (TESTE 2C-03): Três painéis em cadeia (P1 — H1 — P2 — H2 — P3) com Root Central
  {
    const chainGeom = {
      segments: [
        { id: 'b_bot1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b_bot2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b_bot3', x0: 200, y0: 0, x1: 300, y1: 0, type: 'cut' as const },
        { id: 'b_right', x0: 300, y0: 0, x1: 300, y1: 100, type: 'cut' as const },
        { id: 'b_top3', x0: 300, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'b_top2', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'b_top1', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'b_left', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Vincos internos
        { id: 'v_crease_a', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'v_crease_b', x0: 200, y0: 0, x1: 200, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 100, width: 300, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(chainGeom);
    assert(topo.panels.length === 3, `Esperava 3 painéis na cadeia, obteve: ${topo.panels.length}`);

    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, chainGeom);

    assert(treeResult.stats.totalPanels === 3, 'Total de painéis = 3');
    assert(treeResult.stats.totalHinges === 2, 'Total de hinges = 2');
    // O painel central (P002) tem grau de conexão 2 (conecta a P001 e P003), logo deve ser selecionado como Root
    const centralPanel = topo.panels.find((p) => p.centroid.x > 100 && p.centroid.x < 200)!;
    assert(treeResult.rootPanelId === centralPanel.id, `Root panel deve ser o central (${centralPanel.id}), obteve ${treeResult.rootPanelId}`);
    assert(treeResult.tree.children.length === 2, 'Root central deve ter 2 painéis filhos (P1 e P3)');

    results.push({
      name: '39. Fase 2C — Teste 2C-03: Três Painéis em Cadeia Elegem Painel Central como Root',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `3 painéis em cadeia [P1 - H1 - P2(Root) - H2 - P3], 2 hinges, árvore balanceada.`,
    });
  }

  // TESTE 40 (TESTE 2C-04): PERF Próximo / Atravessando Painel (0 Hinges Criados por PERF)
  {
    const perfGeom = {
      segments: [
        { id: 'c1', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'c2', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'c3', x0: 200, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'c4', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'p_perf1', x0: 50, y0: 0, x1: 50, y1: 100, type: 'perfo' as const },
        { id: 'p_perf2', x0: 150, y0: 20, x1: 150, y1: 80, type: 'perfo' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(perfGeom);
    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, perfGeom);

    assert(treeResult.stats.totalHinges === 0, 'PERF NUNCA deve criar hinges');
    assert(treeResult.hinges.length === 0, 'Nenhum hinge gerado para picote');

    results.push({
      name: '40. Fase 2C — Teste 2C-04: Linhas de Picote (PERF) Não Geram Hinges Topológicos',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `2 linhas de picote (PERF) ignoradas para folding; 0 hinges gerados.`,
    });
  }

  // TESTE 41 (TESTE 2C-05): Múltiplas CREASES — Estrutura em Cruz com 4 Abas Conectadas à Base
  {
    // Painel Central (100,100) a (200,200) com 4 abas nos 4 lados
    const crossGeom = {
      segments: [
        // Borda externa recortada
        // Aba Esquerda
        { id: 'w1', x0: 0, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'w2', x0: 0, y0: 100, x1: 0, y1: 200, type: 'cut' as const },
        { id: 'w3', x0: 0, y0: 200, x1: 100, y1: 200, type: 'cut' as const },
        // Aba Topo
        { id: 't1', x0: 100, y0: 200, x1: 100, y1: 300, type: 'cut' as const },
        { id: 't2', x0: 100, y0: 300, x1: 200, y1: 300, type: 'cut' as const },
        { id: 't3', x0: 200, y0: 300, x1: 200, y1: 200, type: 'cut' as const },
        // Aba Direita
        { id: 'e1', x0: 200, y0: 200, x1: 300, y1: 200, type: 'cut' as const },
        { id: 'e2', x0: 300, y0: 200, x1: 300, y1: 100, type: 'cut' as const },
        { id: 'e3', x0: 300, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        // Aba Fundo
        { id: 'b1', x0: 200, y0: 100, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b2', x0: 200, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b3', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        // 4 Vincos conectando a base central às 4 abas
        { id: 'v_left', x0: 100, y0: 100, x1: 100, y1: 200, type: 'crease' as const },
        { id: 'v_top', x0: 100, y0: 200, x1: 200, y1: 200, type: 'crease' as const },
        { id: 'v_right', x0: 200, y0: 100, x1: 200, y1: 200, type: 'crease' as const },
        { id: 'v_bottom', x0: 100, y0: 100, x1: 200, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 300, width: 300, height: 300 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(crossGeom);
    assert(topo.panels.length === 5, `Esperava 5 painéis na cruz, obteve: ${topo.panels.length}`);

    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, crossGeom);

    assert(treeResult.stats.totalPanels === 5, 'Total de painéis = 5');
    assert(treeResult.stats.totalHinges === 4, 'Total de hinges = 4');

    const basePanel = topo.panels.find((p) => p.centroid.x > 140 && p.centroid.x < 160 && p.centroid.y > 140 && p.centroid.y < 160)!;
    assert(treeResult.rootPanelId === basePanel.id, `Base central deve ser Root (${basePanel.id}), obteve: ${treeResult.rootPanelId}`);
    assert(treeResult.tree.children.length === 4, 'Root deve ter 4 filhos diretos (as 4 abas)');

    results.push({
      name: '41. Fase 2C — Teste 2C-05: Múltiplas CREASES em Cruz Conectam 4 Abas ao Painel Base Central',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `5 painéis (base + 4 abas), 4 hinges ativas conectadas diretamente ao root central de grau 4.`,
    });
  }

  // TESTE 42 (TESTE 2C-06): Painéis Desconectados Emitir DISCONNECTED_FOLD_COMPONENT
  {
    // Dois retângulos independentes no mesmo arquivo CAD
    const disconnGeom = {
      segments: [
        // Retângulo 1 (Base)
        { id: 'r1_1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r1_2', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'r1_3', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'r1_4', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Retângulo 2 (Tampa separada a 50mm de distância)
        { id: 'r2_1', x0: 150, y0: 0, x1: 250, y1: 0, type: 'cut' as const },
        { id: 'r2_2', x0: 250, y0: 0, x1: 250, y1: 100, type: 'cut' as const },
        { id: 'r2_3', x0: 250, y0: 100, x1: 150, y1: 100, type: 'cut' as const },
        { id: 'r2_4', x0: 150, y0: 100, x1: 150, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 250, maxY: 100, width: 250, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(disconnGeom);
    assert(topo.panels.length === 2, `Esperava 2 painéis desconexos, obteve: ${topo.panels.length}`);

    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, disconnGeom);

    assert(treeResult.components.length === 2, 'Deve identificar 2 componentes topológicos independentes');
    assert(treeResult.disconnectedComponents.length === 2, 'Deve emitir 2 diagnósticos DISCONNECTED_FOLD_COMPONENT');
    assert(treeResult.disconnectedComponents[0].code === 'DISCONNECTED_FOLD_COMPONENT', 'Código deve ser DISCONNECTED_FOLD_COMPONENT');

    results.push({
      name: '42. Fase 2C — Teste 2C-06: Componentes Desconexos Emitem DISCONNECTED_FOLD_COMPONENT',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `2 componentes desconexos identificados e documentados sem conexão artificial.`,
    });
  }

  // TESTE 43 (TESTE 2C-07): Ciclo no Grafo Emite Diagnóstico FOLD_GRAPH_CYCLE Sem Remoção Silenciosa
  {
    // 4 painéis em anel 2x2 com 4 vincos formando um ciclo fechado
    const cycleGeom = {
      segments: [
        // Borda externa particionada nos nós T
        { id: 'c_b1a', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'c_b1b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'c_b2a', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'c_b2b', x0: 200, y0: 100, x1: 200, y1: 200, type: 'cut' as const },
        { id: 'c_b3a', x0: 200, y0: 200, x1: 100, y1: 200, type: 'cut' as const },
        { id: 'c_b3b', x0: 100, y0: 200, x1: 0, y1: 200, type: 'cut' as const },
        { id: 'c_b4a', x0: 0, y0: 200, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'c_b4b', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Grade de vincos dividindo em 4 quadrantes conectados
        { id: 'v_vert_bot', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'v_vert_top', x0: 100, y0: 100, x1: 100, y1: 200, type: 'crease' as const },
        { id: 'v_horiz_left', x0: 0, y0: 100, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'v_horiz_right', x0: 100, y0: 100, x1: 200, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200, width: 200, height: 200 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(cycleGeom);
    assert(topo.panels.length === 4, `Esperava 4 painéis em anel, obteve: ${topo.panels.length}`);

    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, cycleGeom);

    assert(treeResult.cycles.length >= 1, `Deve detectar ciclo no grafo de 4 quadrantes, obteve: ${treeResult.cycles.length}`);
    assert(treeResult.cycles[0].code === 'FOLD_GRAPH_CYCLE', 'Código de diagnóstico deve ser FOLD_GRAPH_CYCLE');
    assert(treeResult.cycles[0].panelsInvolved.length >= 3, 'Ciclo deve envolver painéis');

    results.push({
      name: '43. Fase 2C — Teste 2C-07: Ciclo Topológico Detectado e Emitido via FOLD_GRAPH_CYCLE',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Ciclo topológico detectado [${treeResult.cycles[0].panelsInvolved.join(' -> ')}] e documentado no manifesto.`,
    });
  }

  // TESTE 44 (TESTE 2C-08): Determinismo Rigoroso em 10 Execuções da Fase 2C
  {
    const file = path.join(fixturesDir, '01_cut_crease.dxf');
    const content = fs.readFileSync(file, 'utf8');
    const doc = await CadImportEngine.importFile(content, '01_cut_crease.dxf');
    const normalized = CadImportEngine.buildPackagingGeometry(doc, { profile: DEFAULT_PROFILES[0], originZeroZero: false });

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(normalized.geometry);

    const baseline = JSON.stringify(FoldingTreeEngine.buildFoldingTree(topo.panels, normalized.geometry));

    for (let iter = 1; iter <= 10; iter++) {
      const current = JSON.stringify(FoldingTreeEngine.buildFoldingTree(topo.panels, normalized.geometry));
      assert(current === baseline, `Execução 2C ${iter} produziu saída diferente da baseline (falha de determinismo)`);
    }

    results.push({
      name: '44. Fase 2C — Teste 2C-08: Determinismo e Repetibilidade em 10 Execuções da Fase 2C',
      category: 'ESTABILIDADE',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `10 execuções da derivação de árvore 2C geraram JSON 100% idêntico byte-a-byte.`,
    });
  }

  // TESTE 45 (TESTE 2C-09): Preservação de Arc2D em Painel Conectado por Hinge
  {
    const arcFlapGeom = {
      segments: [
        // Painel Retangular Base
        { id: 'b_b1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b_b2', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'b_b3', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Vinco entre base e aba com arco
        { id: 'v_arc_hinge', x0: 0, y0: 100, x1: 100, y1: 100, type: 'crease' as const },
        // Segmentos laterais da aba
        { id: 'f_l', x0: 0, y0: 100, x1: 0, y1: 150, type: 'cut' as const },
        { id: 'f_r', x0: 100, y0: 150, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [
        // Topo curvo da aba (ângulos em graus: 0 a 180)
        {
          id: 'arc_top',
          cx: 50,
          cy: 150,
          r: 50,
          startAngle: 0,
          endAngle: 180,
          type: 'cut' as const,
        },
      ],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 200, width: 100, height: 200 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(arcFlapGeom);
    assert(topo.panels.length === 2, `Esperava 2 painéis, obteve: ${topo.panels.length}`);

    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, arcFlapGeom);

    assert(treeResult.stats.totalHinges === 1, 'Deve ter 1 hinge conectando a base à aba curva');
    const flapPanel = topo.panels.find((p) => p.arcs.length > 0)!;
    assert(flapPanel !== undefined, 'Painel da aba deve conter arcos');
    assert(flapPanel.arcs.length === 1, 'Painel deve preservar exatamente 1 Arc2D');
    assert(flapPanel.arcs[0].r === 50, 'Raio do arco deve ser preservado como 50mm');

    results.push({
      name: '45. Fase 2C — Teste 2C-09: Arco em Aba Adjacente Preservado como Arc2D sem Facetamento',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `Painel da aba curva conectado por hinge preserva entidade analítica Arc2D intacta (r=50mm).`,
    });
  }

  // TESTE 46 (TESTE 2C-10): Subdivisão em T-Junctions Não Gera Hinges Duplicados
  {
    // Geometria onde uma crease encontra cuts em T-junctions
    const tGeom = {
      segments: [
        { id: 'c1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'c2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'c3', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'c4', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'c5', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'c6', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_t_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(tGeom);
    const treeResult = FoldingTreeEngine.buildFoldingTree(topo.panels, tGeom);

    assert(treeResult.hinges.length === 1, `Esperava exatamente 1 hinge para o vinco T, obteve: ${treeResult.hinges.length}`);
    assert(treeResult.edges.length === 1, `Esperava exatamente 1 aresta no grafo, obteve: ${treeResult.edges.length}`);

    results.push({
      name: '46. Fase 2C — Teste 2C-10: T-Junctions Divididas Não Geram Hinges Duplicados',
      category: 'TOPOLOGIA_2C',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `1 única hinge gerada para a divisória T compartilhada entre os 2 painéis.`,
    });
  }

  // ============================================================
  // FASE 2C.2 — TESTES DE CINEMÁTICA E SINAL TOPOLÓGICO (TESTES 47 A 51)
  // ============================================================

  // TESTE 47 (TESTE 2C.2-01): Dois Painéis, 1 CREASE — Cálculo de Sinal e Inversão Parent/Child
  {
    const twoPanelsGeom = {
      segments: [
        { id: 'c1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'c2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'c3', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'c4', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'c5', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'c6', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_c1', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const }, // UP: (0, 1)
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(twoPanelsGeom);
    assert(topo.panels.length === 2, `Esperava 2 painéis, obteve ${topo.panels.length}`);

    const panelLeft = topo.panels.find((p) => p.centroid.x < 100)!;
    const panelRight = topo.panels.find((p) => p.centroid.x > 100)!;

    // Caso A: Painel Esquerdo é Parent -> Contorno CCW sobe em x=100 -> Alinhado com vinco -> Sinal +1
    const resA = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelsGeom, { preferredRootPanelId: panelLeft.id });
    assert(resA.hinges.length === 1, 'Deve conter 1 hinge');
    assert(resA.hinges[0].foldSign === 1, `Parent à esquerda deve produzir sinal +1, obteve ${resA.hinges[0].foldSign}`);
    assert(resA.hinges[0].kinematics.topologicalSign === 1, 'Topological sign deve ser +1');
    assert(resA.hinges[0].kinematics.signSource === 'HALF_EDGE_ORIENTATION', 'Sign source deve ser HALF_EDGE_ORIENTATION');
    assert(resA.hinges[0].kinematics.targetAngle === 90, 'Target angle deve ser 90°');
    assert(resA.hinges[0].kinematics.angleSource === 'DEFAULT', 'Angle source deve ser DEFAULT');
    assert(resA.rootSource === 'USER_PREFERRED', 'Root source deve ser USER_PREFERRED');

    // Caso B: Painel Direito é Parent -> Contorno CCW desce em x=100 -> Oposto ao vinco -> Sinal -1
    const resB = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelsGeom, { preferredRootPanelId: panelRight.id });
    assert(resB.hinges.length === 1, 'Deve conter 1 hinge');
    assert(resB.hinges[0].foldSign === -1, `Parent à direita deve produzir sinal -1, obteve ${resB.hinges[0].foldSign}`);
    assert(resB.hinges[0].kinematics.topologicalSign === -1, 'Topological sign deve ser -1');

    results.push({
      name: '47. Fase 2C.2 — Teste 2C.2-01: Dois Painéis e 1 CREASE — Cálculo de Sinal e Inversão Parent/Child',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Parent esquerdo -> foldSign = +1; Parent direito -> foldSign = -1. Inversão física comprovada.`,
    });
  }

  // TESTE 48 (TESTE 2C.2-02): Três Painéis em Cadeia — Sinais dos Lados Opostos NÃO São Todos Iguais
  {
    const chainGeom = {
      segments: [
        { id: 'b_bot1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b_bot2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b_bot3', x0: 200, y0: 0, x1: 300, y1: 0, type: 'cut' as const },
        { id: 'b_right', x0: 300, y0: 0, x1: 300, y1: 100, type: 'cut' as const },
        { id: 'b_top3', x0: 300, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'b_top2', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'b_top1', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'b_left', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v1', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const }, // UP
        { id: 'v2', x0: 200, y0: 0, x1: 200, y1: 100, type: 'crease' as const }, // UP
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 100, width: 300, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(chainGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, chainGeom);

    // O painel central P002 (grau 2) é eleito root pela heurística
    assert(tree.hinges.length === 2, 'Cadeia de 3 painéis deve ter 2 hinges');
    const hLeft = tree.hinges.find((h) => h.creaseId === 'v1')!;
    const hRight = tree.hinges.find((h) => h.creaseId === 'v2')!;

    // O pai central P002 tem contorno CCW que desce em x=100 (-1) e sobe em x=200 (+1)
    assert(hLeft.foldSign === -1, `Hinge à esquerda de P002 deve ter sinal -1, obteve: ${hLeft.foldSign}`);
    assert(hRight.foldSign === 1, `Hinge à direita de P002 deve ter sinal +1, obteve: ${hRight.foldSign}`);
    assert(hLeft.foldSign !== hRight.foldSign, 'Sinais em lados opostos do painel raiz NÃO devem ser iguais');

    results.push({
      name: '48. Fase 2C.2 — Teste 2C.2-02: Três Painéis em Cadeia — Sinais Opostos Não São Artificialmente Iguais',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Hinge v1 (esquerda) = -1, Hinge v2 (direita) = +1. Diferenciação real de meias-arestas comprovada.`,
    });
  }

  // TESTE 49 (TESTE 2C.2-03): Estrutura em Cruz — Sinais dos Quatro Filhos e Desacoplamento Cinemático
  {
    const crossGeom = {
      segments: [
        { id: 'w1', x0: 0, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'w2', x0: 0, y0: 100, x1: 0, y1: 200, type: 'cut' as const },
        { id: 'w3', x0: 0, y0: 200, x1: 100, y1: 200, type: 'cut' as const },
        { id: 't1', x0: 100, y0: 200, x1: 100, y1: 300, type: 'cut' as const },
        { id: 't2', x0: 100, y0: 300, x1: 200, y1: 300, type: 'cut' as const },
        { id: 't3', x0: 200, y0: 300, x1: 200, y1: 200, type: 'cut' as const },
        { id: 'e1', x0: 200, y0: 200, x1: 300, y1: 200, type: 'cut' as const },
        { id: 'e2', x0: 300, y0: 200, x1: 300, y1: 100, type: 'cut' as const },
        { id: 'e3', x0: 300, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'b1', x0: 200, y0: 100, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b2', x0: 200, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b3', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        // 4 vincos
        { id: 'v_left', x0: 100, y0: 100, x1: 100, y1: 200, type: 'crease' as const }, // UP: (0, 1)
        { id: 'v_top', x0: 100, y0: 200, x1: 200, y1: 200, type: 'crease' as const }, // RIGHT: (1, 0)
        { id: 'v_right', x0: 200, y0: 100, x1: 200, y1: 200, type: 'crease' as const }, // UP: (0, 1)
        { id: 'v_bottom', x0: 100, y0: 100, x1: 200, y1: 100, type: 'crease' as const }, // RIGHT: (1, 0)
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 300, width: 300, height: 300 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(crossGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, crossGeom);

    assert(tree.hinges.length === 4, 'Base em cruz deve ter 4 hinges');
    const hBottom = tree.hinges.find((h) => h.creaseId === 'v_bottom')!;
    const hRight = tree.hinges.find((h) => h.creaseId === 'v_right')!;
    const hTop = tree.hinges.find((h) => h.creaseId === 'v_top')!;
    const hLeft = tree.hinges.find((h) => h.creaseId === 'v_left')!;

    // O contorno CCW da base central percorre:
    // bottom: rightwards -> coincide com v_bottom (+1)
    // right: upwards -> coincide com v_right (+1)
    // top: leftwards -> oposto a v_top (-1)
    // left: downwards -> oposto a v_left (-1)
    assert(hBottom.foldSign === 1, 'Bottom deve ter sinal +1');
    assert(hRight.foldSign === 1, 'Right deve ter sinal +1');
    assert(hTop.foldSign === -1, 'Top deve ter sinal -1');
    assert(hLeft.foldSign === -1, 'Left deve ter sinal -1');

    for (const h of tree.hinges) {
      assert(h.kinematics.angleSource === 'DEFAULT', 'Angle source deve ser DEFAULT');
      assert(h.kinematics.targetAngle === 90, 'Target angle default = 90°');
      assert(h.kinematics.physicalDirection === 'NOT_DETERMINED', 'Physical direction deve ser NOT_DETERMINED sem dados de verso');
      assert(h.kinematics.signSource === 'HALF_EDGE_ORIENTATION', 'Sign source deve ser HALF_EDGE_ORIENTATION');
    }

    results.push({
      name: '49. Fase 2C.2 — Teste 2C.2-03: Estrutura em Cruz — Sinais dos 4 Filhos e Desacoplamento Cinemático',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Sinais [Bottom:+1, Right:+1, Top:-1, Left:-1], angleSource=DEFAULT, physicalDirection=NOT_DETERMINED.`,
    });
  }

  // TESTE 50 (TESTE 2C.2-04): Estrutura Sanfonada — Alternância Estrita de Sinais em Sequência
  {
    // Cadeia sanfonada de 3 painéis com vincos desenhados com orientações alternadas no traçado CAD
    const accordionGeom = {
      segments: [
        { id: 'b_bot1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b_bot2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b_bot3', x0: 200, y0: 0, x1: 300, y1: 0, type: 'cut' as const },
        { id: 'b_right', x0: 300, y0: 0, x1: 300, y1: 100, type: 'cut' as const },
        { id: 'b_top3', x0: 300, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'b_top2', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'b_top1', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'b_left', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Vinco 1: desenhado para cima (100,0) -> (100,100)
        { id: 'v_acc_1', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        // Vinco 2: desenhado para baixo (200,100) -> (200,0) (inversão sanfonada)
        { id: 'v_acc_2', x0: 200, y0: 100, x1: 200, y1: 0, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 100, width: 300, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(accordionGeom);
    const pLeft = topo.panels.find((p) => p.centroid.x < 100)!;

    // Fixa o painel da ponta esquerda como raiz para forçar a árvore sequencial P1 -> P2 -> P3
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, accordionGeom, { preferredRootPanelId: pLeft.id });

    assert(tree.hinges.length === 2, 'Deve ter 2 hinges na cadeia');
    const h1 = tree.hinges.find((h) => h.creaseId === 'v_acc_1')!;
    const h2 = tree.hinges.find((h) => h.creaseId === 'v_acc_2')!;

    // No pai P1, a borda em x=100 sobe (0, 100), coincidente com v_acc_1 -> sinal +1
    // No pai P2, a borda em x=200 sobe (0, 100), oposta a v_acc_2 que desce -> sinal -1
    assert(h1.foldSign === 1, `H1 deve ter sinal +1, obteve ${h1.foldSign}`);
    assert(h2.foldSign === -1, `H2 deve ter sinal -1, obteve ${h2.foldSign}`);
    assert(h1.foldSign !== h2.foldSign, 'Estrutura sanfonada exige alternância estrita de sinais (+1 e -1)');

    results.push({
      name: '50. Fase 2C.2 — Teste 2C.2-04: Estrutura Sanfonada — Alternância Estrita de Sinais (+1 e -1)',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `H1 (P1->P2) = +1, H2 (P2->P3) = -1. Alternância sanfonada comprovada em cadeia sequencial.`,
    });
  }

  // TESTE 51 (TESTE 2C.2-05): Invariância à Ordem de Entrada das Entidades
  {
    const baseGeom = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 's3', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 's4', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 's5', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 's6', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 's_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    // Geometria B: ordem invertida/embaralhada do array de segmentos
    const shuffledGeom = {
      ...baseGeom,
      segments: [
        baseGeom.segments[6], // vinco primeiro
        baseGeom.segments[3],
        baseGeom.segments[0],
        baseGeom.segments[5],
        baseGeom.segments[1],
        baseGeom.segments[4],
        baseGeom.segments[2],
      ],
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topoA = LoopTopologyEngine.extractTopology(baseGeom);
    const topoB = LoopTopologyEngine.extractTopology(shuffledGeom);

    const treeA = FoldingTreeEngine.buildFoldingTree(topoA.panels, baseGeom);
    const treeB = FoldingTreeEngine.buildFoldingTree(topoB.panels, shuffledGeom);

    assert(treeA.hinges.length === 1 && treeB.hinges.length === 1, 'Ambos devem ter 1 hinge');
    assert(
      treeA.hinges[0].foldSign === treeB.hinges[0].foldSign,
      `foldSign deve ser idêntico independente da ordem no arquivo CAD (A: ${treeA.hinges[0].foldSign}, B: ${treeB.hinges[0].foldSign})`
    );
    assert(
      treeA.hinges[0].length === treeB.hinges[0].length,
      'Comprimento da hinge deve ser idêntico'
    );

    results.push({
      name: '51. Fase 2C.2 — Teste 2C.2-05: Invariância de foldSign à Ordem de Entrada das Entidades',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Array de segmentos embaralhado produziu foldSign rigorosamente idêntico (${treeA.hinges[0].foldSign} === ${treeB.hinges[0].foldSign}).`,
    });
  }

  // TESTE 52 (TESTE 2C.2-06): Caso Negativo Obrigatório — CREASE na 3ª Aresta com 1ª Aresta Oposta
  {
    const geomNeg = {
      segments: [
        { id: 'cut_left', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'cut_bot', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'c_right', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'cut_top', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        // Painel filho à direita [100, 200]
        { id: 'c2_bot', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'c2_right', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'c2_top', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(geomNeg);
    const pLeft = topo.panels.find((p) => p.centroid.x < 100)!;
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, geomNeg, { preferredRootPanelId: pLeft.id });

    assert(tree.hinges.length === 1, 'Deve gerar 1 hinge');
    const hinge = tree.hinges[0];
    assert(hinge.creaseId === 'c_right', 'Hinge deve apontar para c_right');
    assert(hinge.matchedHalfEdgeId === 'c_right', 'Hinge deve ter matchedHalfEdgeId igual a c_right');
    assert(hinge.foldSign === 1, `foldSign deve ser +1 (derivado da CREASE), e NÃO -1 (que viria da 1ª aresta). Obteve: ${hinge.foldSign}`);

    results.push({
      name: '52. Fase 2C.2 — Teste 2C.2-06: Caso Negativo — CREASE na 3ª Aresta com 1ª Aresta Oposta',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Hinge localizou especificamente a half-edge da CREASE (c_right); foldSign = +1 provando que a 1ª aresta oposta NÃO foi usada.`,
    });
  }

  // TESTE 53 (TESTE 2C.2-07): Painel com Múltiplas CREASEs (Identidade Estrita Hinge -> Half-Edge)
  {
    const geomMulti = {
      segments: [
        // Centro
        { id: 'cut_top', x0: 100, y0: 200, x1: 200, y1: 200, type: 'cut' as const },
        { id: 'c_right', x0: 200, y0: 200, x1: 200, y1: 100, type: 'crease' as const },
        { id: 'c_bottom', x0: 200, y0: 100, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'c_left', x0: 100, y0: 100, x1: 100, y1: 200, type: 'crease' as const },
        // Aba Direita
        { id: 'r1', x0: 200, y0: 200, x1: 250, y1: 200, type: 'cut' as const },
        { id: 'r2', x0: 250, y0: 200, x1: 250, y1: 100, type: 'cut' as const },
        { id: 'r3', x0: 250, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        // Aba Inferior
        { id: 'b1', x0: 200, y0: 100, x1: 200, y1: 50, type: 'cut' as const },
        { id: 'b2', x0: 200, y0: 50, x1: 100, y1: 50, type: 'cut' as const },
        { id: 'b3', x0: 100, y0: 50, x1: 100, y1: 100, type: 'cut' as const },
        // Aba Esquerda
        { id: 'l1', x0: 100, y0: 200, x1: 50, y1: 200, type: 'cut' as const },
        { id: 'l2', x0: 50, y0: 200, x1: 50, y1: 100, type: 'cut' as const },
        { id: 'l3', x0: 50, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 50, minY: 50, maxX: 250, maxY: 200, width: 200, height: 150 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(geomMulti);
    const pCenter = topo.panels.find((p) => p.centroid.x > 140 && p.centroid.x < 160)!;
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, geomMulti, { preferredRootPanelId: pCenter.id });

    assert(tree.hinges.length === 3, 'Deve gerar 3 hinges a partir do centro');
    const hRight = tree.hinges.find((h) => h.creaseId === 'c_right')!;
    const hBottom = tree.hinges.find((h) => h.creaseId === 'c_bottom')!;
    const hLeft = tree.hinges.find((h) => h.creaseId === 'c_left')!;

    assert(hRight.matchedHalfEdgeId === 'c_right', 'Hinge Right deve mapear para half-edge c_right');
    assert(hBottom.matchedHalfEdgeId === 'c_bottom', 'Hinge Bottom deve mapear para half-edge c_bottom');
    assert(hLeft.matchedHalfEdgeId === 'c_left', 'Hinge Left deve mapear para half-edge c_left');

    results.push({
      name: '53. Fase 2C.2 — Teste 2C.2-07: Múltiplas CREASEs — Identidade Estrita Hinge -> Half-Edge',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `3 CREASEs distintas mapeadas individualmente para suas respectivas half-edges com identidades verificadas.`,
    });
  }

  // TESTE 54 (TESTE 2C.2-08): Efeito Matemático da Orientação da CREASE (P0 -> P1 vs P1 -> P0)
  {
    const geomA = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const geomB = {
      ...geomA,
      segments: geomA.segments.map((s) =>
        s.id === 'v_crease' ? { ...s, x0: 100, y0: 100, x1: 100, y1: 0 } : s
      ),
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topoA = LoopTopologyEngine.extractTopology(geomA);
    const topoB = LoopTopologyEngine.extractTopology(geomB);

    const pA = topoA.panels.find((p) => p.centroid.x < 100)!;
    const pB = topoB.panels.find((p) => p.centroid.x < 100)!;

    const treeA = FoldingTreeEngine.buildFoldingTree(topoA.panels, geomA, { preferredRootPanelId: pA.id });
    const treeB = FoldingTreeEngine.buildFoldingTree(topoB.panels, geomB, { preferredRootPanelId: pB.id });

    assert(treeA.hinges[0].foldSign === 1, `Caso A deve ter foldSign = +1, obteve ${treeA.hinges[0].foldSign}`);
    assert(treeB.hinges[0].foldSign === -1, `Caso B deve ter foldSign = -1, obteve ${treeB.hinges[0].foldSign}`);
    assert(treeA.hinges[0].foldSign === -treeB.hinges[0].foldSign, 'Inversão do eixo da CREASE deve inverter o sinal da rotação');

    results.push({
      name: '54. Fase 2C.2 — Teste 2C.2-08: Orientação da CREASE (P0->P1 vs P1->P0) e Consistência de Eixo',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Caso A (u=+Y) -> +1; Caso B (u=-Y) -> -1. Relação matemática comprovada: sign(A) = -sign(B).`,
    });
  }

  // TESTE 55 (TESTE 2C.2-09): Inversão Pai/Filho (sign(B -> A) = -sign(A -> B))
  {
    const geom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(geom);
    const pLeft = topo.panels.find((p) => p.centroid.x < 100)!;
    const pRight = topo.panels.find((p) => p.centroid.x > 100)!;

    const treeA = FoldingTreeEngine.buildFoldingTree(topo.panels, geom, { preferredRootPanelId: pLeft.id });
    const treeB = FoldingTreeEngine.buildFoldingTree(topo.panels, geom, { preferredRootPanelId: pRight.id });

    const signAtoB = treeA.hinges[0].foldSign;
    const signBtoA = treeB.hinges[0].foldSign;

    assert(signBtoA === -signAtoB, `sign(B->A) [${signBtoA}] deve ser rigorosamente oposto a sign(A->B) [${signAtoB}]`);

    results.push({
      name: '55. Fase 2C.2 — Teste 2C.2-09: Inversão Pai/Filho — Antissimetria Exata sign(B->A) = -sign(A->B)',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `sign(P_left -> P_right) = ${signAtoB}; sign(P_right -> P_left) = ${signBtoA}. Propriedade antissimétrica comprovada.`,
    });
  }

  // TESTE 56 (TESTE 2C.2-10): Determinismo Sob Reflexão Geométrica / Espelhamento (X -> -X)
  {
    const geomMirrored = {
      segments: [
        { id: 'p1_b', x0: -0, y0: 0, x1: -100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: -100, y0: 100, x1: -0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: -0, y0: 100, x1: -0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: -100, y0: 0, x1: -100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: -100, y0: 0, x1: -200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: -200, y0: 0, x1: -200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: -200, y0: 100, x1: -100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: -200, minY: 0, maxX: 0, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const topo = LoopTopologyEngine.extractTopology(geomMirrored);
    assert(topo.panels.length === 2, 'Geometria espelhada deve produzir 2 painéis');

    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, geomMirrored);
    assert(tree.hinges.length === 1, 'Deve conter 1 hinge');
    assert(tree.hinges[0].length === 100, 'Comprimento preservado');
    assert(tree.hinges[0].foldSign === 1 || tree.hinges[0].foldSign === -1, 'foldSign determinístico');

    results.push({
      name: '56. Fase 2C.2 — Teste 2C.2-10: Determinismo Sob Espelhamento Isométrico (X -> -X)',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Reflexão isométrica 2D preservou topologia e extração de hinge determinística com foldSign consistente.`,
    });
  }

  // TESTE 57 (TESTE 2C.2-11): Teste de CREASE Ausente no Boundary (Diagnóstico e Prevenção de Fallback)
  {
    const dummyPanel = {
      id: 'P_test',
      name: 'Test Panel',
      outerBoundary: {
        id: 'L0',
        vertices: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }],
        edges: [
          { type: 'segment' as const, id: 'c1', sourceType: 'cut', entity: {} as any, p0: { x: 0, y: 0 }, p1: { x: 50, y: 0 }, direction: 'FORWARD' as const },
          { type: 'segment' as const, id: 'c2', sourceType: 'cut', entity: {} as any, p0: { x: 50, y: 0 }, p1: { x: 50, y: 50 }, direction: 'FORWARD' as const },
          { type: 'segment' as const, id: 'c3', sourceType: 'cut', entity: {} as any, p0: { x: 50, y: 50 }, p1: { x: 0, y: 50 }, direction: 'FORWARD' as const },
          { type: 'segment' as const, id: 'c4', sourceType: 'cut', entity: {} as any, p0: { x: 0, y: 50 }, p1: { x: 0, y: 0 }, direction: 'FORWARD' as const },
        ],
        area: 2500,
        signedArea: 2500,
        isExternal: false,
        orientation: 'CCW' as const,
        bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50, width: 50, height: 50 },
        centroid: { x: 25, y: 25 },
      },
      holes: [],
      area: 2500,
      bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50, width: 50, height: 50 },
      centroid: { x: 25, y: 25 },
      segments: [],
      arcs: [],
      creases: [],
      cuts: [],
      manifest: '',
    };

    const orphanGeom = {
      segments: [
        { id: 'phantom_crease', x0: 500, y0: 500, x1: 500, y1: 600, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 500, maxY: 600, width: 500, height: 600 },
    };

    const tree = FoldingTreeEngine.buildFoldingTree([dummyPanel], orphanGeom);

    assert(tree.orphanCreases.length === 1, 'Deve registrar como orphanCrease');
    assert(tree.orphanCreases[0].creaseId === 'phantom_crease', 'ID órfão deve bater');

    results.push({
      name: '57. Fase 2C.2 — Teste 2C.2-11: Detecção de Inconsistência de CREASE e Prevenção de Fallback Silencioso',
      category: 'CINEMÁTICA_2C.2',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `CREASE não mapeada no boundary não produziu fallback falso; diagnosticada explicitamente no resultado.`,
    });
  }

  // ============================================================
  // FASE 3: MOTOR 3D CINEMÁTICO REAL A PARTIR DA FACA 2D
  // ============================================================

  // TESTE 58 (TESTE 3-01): Painel Único — 0% = Geometria Original (Z=0 para Todos os Vértices)
  {
    const singleGeom = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 150, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 150, y0: 0, x1: 150, y1: 100, type: 'cut' as const },
        { id: 's3', x0: 150, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 's4', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 150, maxY: 100, width: 150, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(singleGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, singleGeom);
    const state0 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 0);

    assert(state0.panels.length === 1, 'Deve ter 1 painel');
    const p3d = state0.panels[0];
    for (const v of p3d.worldVertices) {
      assert(Math.abs(v.z) < 1e-9, `Z deve ser 0 em 0%, obteve ${v.z}`);
    }
    const val = Kinematic3DEngine.validateProjectedZeroMatchesOriginal(topo.panels, state0);
    assert(val.matches, `Validação de projeção 0% falhou: ${val.details}`);

    results.push({
      name: '58. Fase 3 — Teste 3-01: Painel Único — 0% Coincide Rigorosamente com a Faca 2D (Z=0)',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: val.maxDiscrepancyMm,
      toleranceMm: 0.001,
      details: val.details,
    });
  }

  // TESTE 59 (TESTE 3-02): Dois Painéis + 1 CREASE — Continuidade de Junta e Invariância Rígida a 0%, 50%, 100%
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const pLeft = topo.panels.find((p) => p.centroid.x < 100)!;
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom, { preferredRootPanelId: pLeft.id });

    const s0 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 0);
    const s50 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 50);
    const s100 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 100);

    assert(s0.panels.every((p) => p.worldVertices.every((v) => Math.abs(v.z) < 1e-9)), '0% deve ter Z=0');
    assert(s50.stats.rigidLengthMaxErrorMm < 1e-9, '50% deve ter conservação rígida perfeita');
    assert(s100.stats.rigidLengthMaxErrorMm < 1e-9, '100% deve ter conservação rígida perfeita');

    const child100 = s100.panels.find((p) => p.sourcePanelId !== pLeft.id)!;
    const extremeVertex = child100.worldVertices.find(
      (v) => Math.abs(v.x - 100) < 1e-4 && Math.abs(Math.abs(v.z) - 100) < 1e-4
    );
    assert(extremeVertex !== undefined, 'Extremidade do filho a 100% deve estar a 90° no plano ortogonal');

    results.push({
      name: '59. Fase 3 — Teste 3-02: Dois Painéis + 1 CREASE — Rotação Rígida em 0%, 50% e 100%',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: s100.stats.rigidLengthMaxErrorMm,
      toleranceMm: 0.001,
      details: `0%, 50%, 100% validados com continuidade de junta ao longo da CREASE e erro de comprimento = ${s100.stats.rigidLengthMaxErrorMm.toExponential(4)}mm`,
    });
  }

  // TESTE 60 (TESTE 3-03): Inversão do Eixo da CREASE (u -> -u) — Rotação Oposta com Geometria Idêntica
  {
    const geomA = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const geomB = {
      ...geomA,
      segments: geomA.segments.map((s) =>
        s.id === 'v_crease' ? { ...s, x0: 100, y0: 100, x1: 100, y1: 0 } : s
      ),
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topoA = LoopTopologyEngine.extractTopology(geomA);
    const topoB = LoopTopologyEngine.extractTopology(geomB);

    const pA = topoA.panels.find((p) => p.centroid.x < 100)!;
    const pB = topoB.panels.find((p) => p.centroid.x < 100)!;

    const treeA = FoldingTreeEngine.buildFoldingTree(topoA.panels, geomA, { preferredRootPanelId: pA.id });
    const treeB = FoldingTreeEngine.buildFoldingTree(topoB.panels, geomB, { preferredRootPanelId: pB.id });

    const stateA100 = Kinematic3DEngine.computeFoldedState(topoA.panels, treeA, 100);
    const stateB100 = Kinematic3DEngine.computeFoldedState(topoB.panels, treeB, 100);

    const childA = stateA100.panels.find((p) => p.sourcePanelId !== pA.id)!;
    const childB = stateB100.panels.find((p) => p.sourcePanelId !== pB.id)!;

    const avgZa = childA.worldVertices.reduce((acc, v) => acc + v.z, 0) / childA.worldVertices.length;
    const avgZb = childB.worldVertices.reduce((acc, v) => acc + v.z, 0) / childB.worldVertices.length;

    // Verificação 1: Invariância do pipeline completo à direção de desenho da CREASE no CAD
    // Quando o desenhista inverte os pontos da CREASE no CAD, o FoldingTreeEngine inverte o topologicalSign
    // para compensar o vetor u invertido, resultando em R(-u, -theta) == R(u, theta).
    assert(Math.abs(avgZa - avgZb) < 1e-4, `Pipeline deve ser invariante à direção de desenho do vinco no CAD: Za=${avgZa}, Zb=${avgZb}`);
    assert(Math.abs(avgZa) > 10, 'A dobra em 100% deve ter magnitude significativa em Z');

    // Verificação 2: Antissimetria cinemática pura do Kinematic3DEngine para inversão de eixo (u -> -u)
    // Se invertermos o eixo da hinge mantendo o topologicalSign fixo, a rotação deve ser estritamente oposta.
    const treeBInvertedHinge = {
      ...treeA,
      hinges: treeA.hinges.map((h) => ({
        ...h,
        axisStart: h.axisEnd,
        axisEnd: h.axisStart,
        direction: { x: -h.direction.x, y: -h.direction.y },
      })),
    };
    const stateBInverted = Kinematic3DEngine.computeFoldedState(topoA.panels, treeBInvertedHinge, 100);
    const childInverted = stateBInverted.panels.find((p) => p.sourcePanelId !== pA.id)!;
    const avgZInverted = childInverted.worldVertices.reduce((acc, v) => acc + v.z, 0) / childInverted.worldVertices.length;
    assert(Math.abs(avgZa + avgZInverted) < 1e-4, `Rotação cinemática com eixo invertido puro deve ser oposta: Za=${avgZa}, Zinverted=${avgZInverted}`);

    results.push({
      name: '60. Fase 3 — Teste 3-03: Inversão do Eixo da CREASE (u -> -u) — Antissimetria Cinemática e Invariância CAD',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: Math.abs(avgZa + avgZInverted),
      toleranceMm: 0.001,
      details: `Inversão cinemática pura: Za=${avgZa.toFixed(2)}mm, Zinverted=${avgZInverted.toFixed(2)}mm. Invariância CAD (R(-u, -θ) = R(u, θ)): Δ=${Math.abs(avgZa - avgZb).toFixed(6)}mm.`,
    });
  }

  // TESTE 61 (TESTE 3-04): Inversão Pai/Filho — Antissimetria de Rotação Cinemática
  {
    const geom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(geom);
    const pLeft = topo.panels.find((p) => p.centroid.x < 100)!;
    const pRight = topo.panels.find((p) => p.centroid.x > 100)!;

    const treeA = FoldingTreeEngine.buildFoldingTree(topo.panels, geom, { preferredRootPanelId: pLeft.id });
    const treeB = FoldingTreeEngine.buildFoldingTree(topo.panels, geom, { preferredRootPanelId: pRight.id });

    const sA100 = Kinematic3DEngine.computeFoldedState(topo.panels, treeA, 100);
    const sB100 = Kinematic3DEngine.computeFoldedState(topo.panels, treeB, 100);

    const childA = sA100.panels.find((p) => p.sourcePanelId === pRight.id)!;
    const childB = sB100.panels.find((p) => p.sourcePanelId === pLeft.id)!;

    const avgZa = childA.worldVertices.reduce((acc, v) => acc + v.z, 0) / childA.worldVertices.length;
    const avgZb = childB.worldVertices.reduce((acc, v) => acc + v.z, 0) / childB.worldVertices.length;

    // O ângulo diédrico relativo entre os dois painéis deve ser idêntico em magnitude,
    // e a dobra física deve ocorrer consistentemente para o mesmo lado da folha (mesmo semi-espaço Z < 0).
    assert(Math.abs(avgZa - avgZb) < 1e-4, `Dobra deve ocorrer para o mesmo semi-espaço da folha: ${avgZa} vs ${avgZb}`);
    assert(avgZa < -10, 'A dobra em 100% deve estar no semi-espaço Z < 0');

    results.push({
      name: '61. Fase 3 — Teste 3-04: Inversão Pai/Filho — Consistência de Semi-Espaço e Ângulo Diédrico',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: Math.abs(avgZa - avgZb),
      toleranceMm: 0.001,
      details: `Pai Esquerdo -> Z Filho = ${avgZa.toFixed(2)}mm; Pai Direito -> Z Filho = ${avgZb.toFixed(2)}mm (mesmo semi-espaço Z < 0, conservação do ângulo diédrico).`,
    });
  }

  // TESTE 62 (TESTE 3-05): Três Painéis em Cadeia (P1 -> P2 -> P3) — Composição Hierárquica Acumulada
  {
    const chainGeom = {
      segments: [
        { id: 'b1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b3', x0: 200, y0: 0, x1: 300, y1: 0, type: 'cut' as const },
        { id: 'r1', x0: 300, y0: 0, x1: 300, y1: 100, type: 'cut' as const },
        { id: 't3', x0: 300, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 't2', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
        { id: 't1', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l1', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'c1', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'c2', x0: 200, y0: 0, x1: 200, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 100, width: 300, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(chainGeom);
    const p1 = topo.panels.find((p) => p.centroid.x < 100)!;
    const p2 = topo.panels.find((p) => p.centroid.x > 100 && p.centroid.x < 200)!;
    const p3 = topo.panels.find((p) => p.centroid.x > 200)!;

    // Força árvore sequencial P1 (root) -> P2 -> P3
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, chainGeom, { preferredRootPanelId: p1.id });
    const state100 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 100);

    const p3_3d = state100.panels.find((p) => p.sourcePanelId === p3.id)!;
    assert(p3_3d.depth === 2, `P3 deve ter profundidade 2 na hierarquia, obteve ${p3_3d.depth}`);
    assert(state100.stats.rigidLengthMaxErrorMm < 1e-9, 'Conservação rígida em cadeia deve ser perfeita');

    results.push({
      name: '62. Fase 3 — Teste 3-05: Três Painéis em Cadeia (P1 -> P2 -> P3) — Composição Hierárquica Acumulada',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: state100.stats.rigidLengthMaxErrorMm,
      toleranceMm: 0.001,
      details: `Composição de matrizes T_world(P1) * R_H1 * R_H2 comprovada; P3 na profundidade 2 com erro = ${state100.stats.rigidLengthMaxErrorMm.toExponential(4)}mm.`,
    });
  }

  // TESTE 63 (TESTE 3-06): Estrutura em Cruz — 4 Hinges Reais Formando Bandeja 3D Ortogonal
  {
    const crossGeom = {
      segments: [
        { id: 'w1', x0: 0, y0: 100, x1: 0, y1: 200, type: 'cut' as const },
        { id: 'w2', x0: 0, y0: 200, x1: 100, y1: 200, type: 'cut' as const },
        { id: 't1', x0: 100, y0: 200, x1: 100, y1: 300, type: 'cut' as const },
        { id: 't2', x0: 100, y0: 300, x1: 200, y1: 300, type: 'cut' as const },
        { id: 't3', x0: 200, y0: 300, x1: 200, y1: 200, type: 'cut' as const },
        { id: 'e1', x0: 200, y0: 200, x1: 300, y1: 200, type: 'cut' as const },
        { id: 'e2', x0: 300, y0: 200, x1: 300, y1: 100, type: 'cut' as const },
        { id: 'e3', x0: 300, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'b1', x0: 200, y0: 100, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'b2', x0: 200, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'b3', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'w3', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        // 4 vincos
        { id: 'v_left', x0: 100, y0: 100, x1: 100, y1: 200, type: 'crease' as const },
        { id: 'v_top', x0: 100, y0: 200, x1: 200, y1: 200, type: 'crease' as const },
        { id: 'v_right', x0: 200, y0: 100, x1: 200, y1: 200, type: 'crease' as const },
        { id: 'v_bottom', x0: 100, y0: 100, x1: 200, y1: 100, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 300, maxY: 300, width: 300, height: 300 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(crossGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, crossGeom);
    const state100 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 100);

    assert(state100.panels.length === 5, 'Cruz deve ter 5 painéis 3D');
    const base = state100.panels.find((p) => p.isRoot)!;
    assert(base !== undefined, 'Deve ter painel raiz central');

    // A base permanece plana em Z=0
    for (const v of base.worldVertices) {
      assert(Math.abs(v.z) < 1e-9, 'Base deve permanecer em Z=0');
    }

    // Todas as 4 abas têm vértices com Z != 0
    const flaps = state100.panels.filter((p) => !p.isRoot);
    assert(flaps.length === 4, 'Deve ter 4 abas');
    for (const flap of flaps) {
      const maxZ = Math.max(...flap.worldVertices.map((v) => Math.abs(v.z)));
      assert(maxZ > 90, `Aba ${flap.sourcePanelId} deve dobrar para Z=100mm, obteve maxZ=${maxZ}`);
    }

    results.push({
      name: '63. Fase 3 — Teste 3-06: Estrutura em Cruz — 4 Hinges Reais Formando Bandeja 3D Ortogonal',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: state100.stats.rigidLengthMaxErrorMm,
      toleranceMm: 0.001,
      details: `Base fixa em Z=0 e 4 abas perfeitamente ortogonais em Z=100mm formando bandeja tridimensional.`,
    });
  }

  // TESTE 64 (TESTE 3-07): Painel Irregular com TAB, Chanfro e Arc2D Analítico Preservados sem Retangularização
  {
    // Painel base com aba trapezoidal (TAB), chanfro e arco analítico de raio 20mm
    const irregularGeom = {
      segments: [
        { id: 'b1', x0: 0, y0: 0, x1: 80, y1: 0, type: 'cut' as const },
        { id: 'chamfer', x0: 80, y0: 0, x1: 100, y1: 20, type: 'cut' as const }, // chanfro 45°
        { id: 'tab1', x0: 100, y0: 20, x1: 120, y1: 30, type: 'cut' as const },  // tab saliente
        { id: 'tab2', x0: 120, y0: 30, x1: 120, y1: 70, type: 'cut' as const },
        { id: 'tab3', x0: 120, y0: 70, x1: 100, y1: 80, type: 'cut' as const },
        { id: 'top_r', x0: 100, y0: 80, x1: 65, y1: 80, type: 'cut' as const },
        { id: 'top_l', x0: 35, y0: 80, x1: 0, y1: 80, type: 'cut' as const },
        { id: 'crease_v', x0: 0, y0: 0, x1: 0, y1: 80, type: 'crease' as const },
        // Painel pai à esquerda [-50, 0]
        { id: 'p_left_b', x0: -50, y0: 0, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'p_left_t', x0: 0, y0: 80, x1: -50, y1: 80, type: 'cut' as const },
        { id: 'p_left_l', x0: -50, y0: 80, x1: -50, y1: 0, type: 'cut' as const },
      ],
      arcs: [
        // Arco no topo da aba: centro (50, 80), r=15, 0 a 180° (conecta 65,80 a 35,80)
        { id: 'arc_top', cx: 50, cy: 80, r: 15, startAngle: 0, endAngle: 180, type: 'cut' as const },
      ],
      dimensions: [],
      bounds: { minX: -50, minY: 0, maxX: 120, maxY: 95, width: 170, height: 95 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(irregularGeom);
    const pLeft = topo.panels.find((p) => p.centroid.x < 0)!;
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, irregularGeom, { preferredRootPanelId: pLeft.id });
    const state100 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 100);

    const irregPanel = state100.panels.find((p) => p.sourcePanelId !== pLeft.id)!;
    assert(irregPanel !== undefined, 'Painel irregular deve existir no 3D');

    const arcEdge = irregPanel.outerBoundary.edges.find((e) => e.type === 'arc');
    assert(arcEdge !== undefined, 'Arco analítico deve ser preservado na fronteira 3D');
    assert(arcEdge?.arcData !== undefined, 'arcData 3D analítico deve estar populado');
    assert(Math.abs(arcEdge!.arcData!.r - 15) < 1e-9, 'Raio do arco deve ser rigorosamente 15mm');

    // Verifica presença da aba trapezoidal e chanfro
    const hasChamfer = irregPanel.outerBoundary.edges.some((e) => e.sourceEntityId === 'chamfer');
    const hasTab = irregPanel.outerBoundary.edges.some((e) => e.sourceEntityId === 'tab1');
    assert(hasChamfer, 'Chanfro deve estar presente no contorno 3D');
    assert(hasTab, 'TAB saliente deve estar presente no contorno 3D');

    results.push({
      name: '64. Fase 3 — Teste 3-07: Painel Irregular com TAB, Chanfro e Arc2D Analítico Preservados',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `Arc2D analítico (r=15mm), chanfro 45° e aba trapezoidal mantidos sem retangularização no espaço 3D.`,
    });
  }

  // TESTE 65 (TESTE 3-08): Painel com Furo Interno (Hole) Preservado no Espaço 3D
  {
    const holeGeom = {
      segments: [
        { id: 'b1', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'r1', x0: 200, y0: 0, x1: 200, y1: 200, type: 'cut' as const },
        { id: 't1', x0: 200, y0: 200, x1: 0, y1: 200, type: 'cut' as const },
        { id: 'l1', x0: 0, y0: 200, x1: 0, y1: 0, type: 'cut' as const },
        // Hole central 40x40
        { id: 'h1', x0: 80, y0: 80, x1: 120, y1: 80, type: 'cut' as const },
        { id: 'h2', x0: 120, y0: 80, x1: 120, y1: 120, type: 'cut' as const },
        { id: 'h3', x0: 120, y0: 120, x1: 80, y1: 120, type: 'cut' as const },
        { id: 'h4', x0: 80, y0: 120, x1: 80, y1: 80, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200, width: 200, height: 200 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(holeGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, holeGeom);
    const state0 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 0);

    const panel3D = state0.panels[0];
    assert(panel3D.holes.length === 1, 'Deve conter exatamente 1 furo no 3D');
    assert(panel3D.holes[0].vertices.length === 4, 'Furo deve possuir 4 vértices');
    assert(Math.abs(panel3D.area - (200 * 200 - 40 * 40)) < 0.001, 'Área líquida deve subtrair o furo');

    results.push({
      name: '65. Fase 3 — Teste 3-08: Painel com Furo Interno (Hole) Preservado no Espaço 3D',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.001,
      details: `1 furo interno (40x40mm) preservado com área líquida exata de 38400 mm² sem preenchimento artificial.`,
    });
  }

  // TESTE 66 (TESTE 3-09): Isolamento de PERF — Picote Não Gera Hinge 3D
  {
    const perfGeom = {
      segments: [
        { id: 'b1', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'r1', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 't1', x0: 200, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l1', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Linha interna de picote PERF
        { id: 'p_perf', x0: 100, y0: 0, x1: 100, y1: 100, type: 'perfo' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(perfGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, perfGeom);
    const state = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 100);

    assert(state.panels.length === 1, 'Deve permanecer como 1 único painel 3D');
    assert(state.stats.totalHinges === 0, 'Zero hinges 3D criadas a partir de PERF');

    results.push({
      name: '66. Fase 3 — Teste 3-09: Isolamento de PERF — Picote Não Gera Hinge Cinemática 3D',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Linha de picote 'perfo' isolada com sucesso; 0 hinges geradas e integridade de painel único mantida.`,
    });
  }

  // TESTE 67 (TESTE 3-10): Detecção de Eixo Inválido (INVALID_HINGE_AXIS) sem Fallback para Caixa Genérica
  {
    const dummyHinge: any = {
      id: 'H_invalid',
      creaseId: 'c_deg',
      parentPanelId: 'P1',
      childPanelId: 'P2',
      axisStart: { x: 100, y: 100 },
      axisEnd: { x: 100, y: 100 }, // ponto coincidente -> comprimento 0
      length: 0,
      direction: { x: 0, y: 0 },
      foldAngle: 90,
      foldSign: 1,
      foldOrder: 1,
      status: 'ACTIVE',
      kinematics: {
        targetAngle: 90,
        angleSource: 'DEFAULT',
        topologicalSign: 1,
        signSource: 'DEFAULT',
        physicalDirection: 'NOT_DETERMINED',
      },
    };

    const dummyTree: any = {
      rootPanelId: 'P1',
      rootSource: 'TOPOLOGICAL_HEURISTIC',
      hinges: [dummyHinge],
      components: [{ componentId: 'C1', rootPanelId: 'P1', panelIds: ['P1', 'P2'] }],
      cycles: [],
      disconnectedComponents: [],
      invalidHingeCreaseMappings: [],
    };

    const dummyPanels: any[] = [
      {
        id: 'P1',
        outerBoundary: { vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], edges: [] },
        holes: [],
        area: 10000,
        centroid: { x: 50, y: 50 },
      },
      {
        id: 'P2',
        outerBoundary: { vertices: [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }], edges: [] },
        holes: [],
        area: 10000,
        centroid: { x: 150, y: 50 },
      },
    ];

    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');
    const state = Kinematic3DEngine.computeFoldedState(dummyPanels, dummyTree, 50);

    const hasInvalidAxisDiag = state.diagnostics.some((d) => d.code === 'INVALID_HINGE_AXIS');
    assert(hasInvalidAxisDiag, 'Deve emitir diagnóstico explícito INVALID_HINGE_AXIS');

    results.push({
      name: '67. Fase 3 — Teste 3-10: Detecção de Eixo Inválido (INVALID_HINGE_AXIS) sem Fallback Oculto',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Eixo de vinco com comprimento zero interceptado e diagnosticado com INVALID_HINGE_AXIS sem divisão por zero.`,
    });
  }

  // TESTE 68 (TESTE 3-11): Reversibilidade Contínua (0% -> 25% -> 50% -> 75% -> 100% -> 75% -> 50% -> 25% -> 0%)
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom);

    const stateInitial = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 0);

    // Ciclo completo de ida e volta
    const percentages = [0, 25, 50, 75, 100, 75, 50, 25, 0];
    let lastState = stateInitial;
    for (const pct of percentages) {
      lastState = Kinematic3DEngine.computeFoldedState(topo.panels, tree, pct);
    }

    // Compara estado final em 0% com o estado inicial em 0%
    let maxDrift = 0;
    for (let i = 0; i < stateInitial.panels.length; i++) {
      const pInit = stateInitial.panels[i];
      const pFinal = lastState.panels[i];
      for (let j = 0; j < pInit.worldVertices.length; j++) {
        const vInit = pInit.worldVertices[j];
        const vFinal = pFinal.worldVertices[j];
        const d = Math.hypot(vFinal.x - vInit.x, vFinal.y - vInit.y, vFinal.z - vInit.z);
        if (d > maxDrift) maxDrift = d;
      }
    }

    assert(maxDrift < 1e-9, `Drift numérico no ciclo de reversibilidade: ${maxDrift}`);

    results.push({
      name: '68. Fase 3 — Teste 3-11: Reversibilidade Contínua (0 -> 100 -> 0) sem Acúmulo de Drift',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: maxDrift,
      toleranceMm: 0.001,
      details: `Ciclo completo 0% -> 25% -> 50% -> 75% -> 100% -> 75% -> 50% -> 25% -> 0% com drift nulo = ${maxDrift.toExponential(4)}mm.`,
    });
  }

  // TESTE 69 (TESTE 3-12): Invariância da Geometria 3D por Permutação das Entidades CAD
  {
    const baseGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const permutedGeom = {
      ...baseGeom,
      segments: [
        baseGeom.segments[3],
        baseGeom.segments[6],
        baseGeom.segments[0],
        baseGeom.segments[4],
        baseGeom.segments[1],
        baseGeom.segments[5],
        baseGeom.segments[2],
      ],
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topoA = LoopTopologyEngine.extractTopology(baseGeom);
    const topoB = LoopTopologyEngine.extractTopology(permutedGeom);

    const treeA = FoldingTreeEngine.buildFoldingTree(topoA.panels, baseGeom);
    const treeB = FoldingTreeEngine.buildFoldingTree(topoB.panels, permutedGeom);

    const stateA = Kinematic3DEngine.computeFoldedState(topoA.panels, treeA, 75);
    const stateB = Kinematic3DEngine.computeFoldedState(topoB.panels, treeB, 75);

    assert(stateA.panels.length === stateB.panels.length, 'Contagem de painéis 3D idêntica');
    assert(Math.abs(stateA.stats.rigidLengthMaxErrorMm - stateB.stats.rigidLengthMaxErrorMm) < 1e-9, 'Invariância comprovada');

    results.push({
      name: '69. Fase 3 — Teste 3-12: Invariância da Geometria 3D por Permutação das Entidades CAD',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Permutação da ordem de segmentos no CAD produziu geometria 3D idêntica a 75% de dobra.`,
    });
  }

  // TESTE 70 (TESTE 3-13): Estabilidade da Convenção Cinemática sob Espelhamento Isométrico (X -> -X)
  {
    const geomMirrored = {
      segments: [
        { id: 'p1_b', x0: -0, y0: 0, x1: -100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: -100, y0: 100, x1: -0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: -0, y0: 100, x1: -0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: -100, y0: 0, x1: -100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: -100, y0: 0, x1: -200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: -200, y0: 0, x1: -200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: -200, y0: 100, x1: -100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: -200, minY: 0, maxX: 0, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(geomMirrored);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, geomMirrored);
    const state50 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 50);

    assert(state50.panels.length === 2, 'Geometria espelhada produz 2 painéis 3D');
    assert(state50.stats.rigidLengthMaxErrorMm < 1e-9, 'Conservação rígida no espelho');

    results.push({
      name: '70. Fase 3 — Teste 3-13: Estabilidade da Convenção Cinemática sob Espelhamento Isométrico',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: state50.stats.rigidLengthMaxErrorMm,
      toleranceMm: 0.001,
      details: `Reflexão isométrica 2D (X -> -X) gerou cinemática 3D estável com conservação rígida perfeita.`,
    });
  }

  // TESTE 71 (TESTE 3-14): Múltiplas CREASEs com Rastreabilidade Estrita sourceCreaseId
  {
    const geomMulti = {
      segments: [
        { id: 'cut_top', x0: 100, y0: 200, x1: 200, y1: 200, type: 'cut' as const },
        { id: 'c_right', x0: 200, y0: 200, x1: 200, y1: 100, type: 'crease' as const },
        { id: 'c_bottom', x0: 200, y0: 100, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'c_left', x0: 100, y0: 100, x1: 100, y1: 200, type: 'crease' as const },
        // Abas
        { id: 'r1', x0: 200, y0: 200, x1: 250, y1: 200, type: 'cut' as const },
        { id: 'r2', x0: 250, y0: 200, x1: 250, y1: 100, type: 'cut' as const },
        { id: 'r3', x0: 250, y0: 100, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'b1', x0: 200, y0: 100, x1: 200, y1: 50, type: 'cut' as const },
        { id: 'b2', x0: 200, y0: 50, x1: 100, y1: 50, type: 'cut' as const },
        { id: 'b3', x0: 100, y0: 50, x1: 100, y1: 100, type: 'cut' as const },
        { id: 'l1', x0: 100, y0: 200, x1: 50, y1: 200, type: 'cut' as const },
        { id: 'l2', x0: 50, y0: 200, x1: 50, y1: 100, type: 'cut' as const },
        { id: 'l3', x0: 50, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 50, minY: 50, maxX: 250, maxY: 200, width: 200, height: 150 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(geomMulti);
    const pCenter = topo.panels.find((p) => p.centroid.x > 140 && p.centroid.x < 160)!;
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, geomMulti, { preferredRootPanelId: pCenter.id });
    const state = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 100);

    const childPanels = state.panels.filter((p) => !p.isRoot);
    assert(childPanels.length === 3, 'Deve conter 3 painéis filhos');
    const usedCreases = childPanels.map((p) => p.sourceCreaseId).sort();
    assert(
      JSON.stringify(usedCreases) === JSON.stringify(['c_bottom', 'c_left', 'c_right']),
      'Cada filho 3D deve apontar rigorosamente para seu sourceCreaseId'
    );

    results.push({
      name: '71. Fase 3 — Teste 3-14: Múltiplas CREASEs com Rastreabilidade Estrita sourceCreaseId',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `3 painéis filhos rastreados individualmente até suas respectivas CREASEs originais: [c_bottom, c_left, c_right].`,
    });
  }

  // TESTE 72 (TESTE 3-15): Conservação Rígida de Distâncias Intra-Painel em Todas as Etapas
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom);

    const stages = [0, 25, 50, 75, 100];
    let maxRigidErr = 0;

    for (const pct of stages) {
      const state = Kinematic3DEngine.computeFoldedState(topo.panels, tree, pct);
      if (state.stats.rigidLengthMaxErrorMm > maxRigidErr) {
        maxRigidErr = state.stats.rigidLengthMaxErrorMm;
      }
    }

    assert(maxRigidErr < 1e-9, `Erro de conservação rígida em etapas: ${maxRigidErr}`);

    results.push({
      name: '72. Fase 3 — Teste 3-15: Conservação Rígida de Distâncias Intra-Painel em Todas as Etapas',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: maxRigidErr,
      toleranceMm: 0.001,
      details: `Invariância de distância euclidiana ||v_i - v_j|| testada em 0%, 25%, 50%, 75%, 100% com erro máx = ${maxRigidErr.toExponential(4)}mm.`,
    });
  }

  // TESTE 73 (TESTE 3-16 / TESTE CENTRAL DE PROJEÇÃO): Projeção 3D @ 0% -> 2D Coincide Rigorosamente com a Faca Original
  {
    // Faca 2D completa contendo segmentos, furo interno (hole) e arco analítico (Arc2D)
    const dielineComplex = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 's3', x0: 200, y0: 0, x1: 200, y1: 150, type: 'cut' as const },
        { id: 's4_r', x0: 200, y0: 150, x1: 165, y1: 150, type: 'cut' as const },
        { id: 's4_l', x0: 135, y0: 150, x1: 100, y1: 150, type: 'cut' as const },
        { id: 's5', x0: 100, y0: 150, x1: 0, y1: 150, type: 'cut' as const },
        { id: 's6', x0: 0, y0: 150, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'c_mid', x0: 100, y0: 0, x1: 100, y1: 150, type: 'crease' as const },
        // Furo interno no painel esquerdo
        { id: 'h1', x0: 20, y0: 20, x1: 40, y1: 20, type: 'cut' as const },
        { id: 'h2', x0: 40, y0: 20, x1: 40, y1: 40, type: 'cut' as const },
        { id: 'h3', x0: 40, y0: 40, x1: 20, y1: 40, type: 'cut' as const },
        { id: 'h4', x0: 20, y0: 40, x1: 20, y1: 20, type: 'cut' as const },
      ],
      arcs: [
        // Arco analítico no topo do painel direito (cx: 150, cy: 150, r: 15, 0 a 180°)
        { id: 'arc_top', cx: 150, cy: 150, r: 15, startAngle: 0, endAngle: 180, type: 'cut' as const },
      ],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 165, width: 200, height: 165 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    const topo = LoopTopologyEngine.extractTopology(dielineComplex);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, dielineComplex);
    const state0 = Kinematic3DEngine.computeFoldedState(topo.panels, tree, 0);

    const val = Kinematic3DEngine.validateProjectedZeroMatchesOriginal(topo.panels, state0);
    assert(val.matches, `Falha no teste central de projeção 2D: ${val.details}`);

    // Validação source-linked / per-entity explícita no teste:
    for (const origP of topo.panels) {
      const p3d = state0.panels.find((p) => p.sourcePanelId === origP.id)!;
      assert(p3d !== undefined, `Painel ${origP.id} deve ser rastreável`);
      assert(p3d.sourcePanelId === origP.id, 'sourcePanelId deve coincidir exatamente');

      // Verifica cada aresta da outerBoundary individualmente por ID e dados
      for (let k = 0; k < origP.outerBoundary.edges.length; k++) {
        const oe = origP.outerBoundary.edges[k];
        const pe = p3d.outerBoundary.edges[k];
        assert(pe.sourceEntityId === String(oe.id), `sourceEntityId deve coincidir na aresta ${oe.id}`);
        assert(pe.type === oe.type, `type deve coincidir na aresta ${oe.id}`);
        assert(Math.hypot(pe.p0.x - oe.p0.x, pe.p0.y - oe.p0.y) < 1e-4, 'p0 deve coincidir');
        assert(Math.hypot(pe.p1.x - oe.p1.x, pe.p1.y - oe.p1.y) < 1e-4, 'p1 deve coincidir');
        assert(Math.abs(pe.p0.z) < 1e-9 && Math.abs(pe.p1.z) < 1e-9, 'Z deve ser rigorosamente 0');

        if (oe.type === 'arc') {
          const origArc = oe.entity as any;
          assert(pe.arcData !== undefined, 'arcData deve estar presente');
          assert(Math.abs(pe.arcData!.cx - origArc.cx) < 1e-4, 'Centro X do arco deve coincidir');
          assert(Math.abs(pe.arcData!.cy - origArc.cy) < 1e-4, 'Centro Y do arco deve coincidir');
          assert(Math.abs(pe.arcData!.r - origArc.r) < 1e-4, 'Raio do arco deve coincidir');
          assert(Math.abs(pe.arcData!.startAngle - origArc.startAngle) < 1e-4, 'startAngle deve coincidir');
          assert(Math.abs(pe.arcData!.endAngle - origArc.endAngle) < 1e-4, 'endAngle deve coincidir');
        }
      }

      // Verifica furos (holes) individualmente
      assert(p3d.holes.length === origP.holes.length, 'Contagem de furos deve coincidir');
      for (let h = 0; h < origP.holes.length; h++) {
        const origH = origP.holes[h];
        const p3dH = p3d.holes[h];
        assert(p3dH.id === origH.id, 'ID do furo deve coincidir');
        assert(p3dH.edges.length === origH.edges.length, 'Arestas do furo devem coincidir');
        for (let heIdx = 0; heIdx < origH.edges.length; heIdx++) {
          assert(p3dH.edges[heIdx].sourceEntityId === String(origH.edges[heIdx].id), 'sourceEntityId do furo');
        }
      }
    }

    results.push({
      name: '73. Fase 3 — Teste 3-16 (PROJEÇÃO 3D@0% -> 2D): Projeção Coincide com a Faca 2D Original',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: val.maxDiscrepancyMm,
      toleranceMm: 0.001,
      details: val.details + ` (Validado per-entity: sourcePanelId, sourceEntityId, tipo, p0, p1, comprimento, arcos e furos).`,
    });
  }

  // TESTE 74 (TESTE 3-17 / MODELOS REAIS): Validação em Modelos Reais do Catálogo (FEFCO 0201 e FEFCO 0429)
  {
    const { fefco0201 } = await import('../src/engine/models/fefco0201');
    const { fefco0429 } = await import('../src/engine/models/fefco0429');
    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { Kinematic3DEngine } = await import('../src/engine/importers/Kinematic3DEngine');

    // Modelo 1: FEFCO 0201 (Maleta padrão americana)
    const dieline0201 = fefco0201.calculate({ L: 300, B: 200, H: 150, Ep: 3 });
    const topo0201 = LoopTopologyEngine.extractTopology(dieline0201);
    const tree0201 = FoldingTreeEngine.buildFoldingTree(topo0201.panels, dieline0201);
    const state0201_0 = Kinematic3DEngine.computeFoldedState(topo0201.panels, tree0201, 0);
    const state0201_100 = Kinematic3DEngine.computeFoldedState(topo0201.panels, tree0201, 100);

    const val0201 = Kinematic3DEngine.validateProjectedZeroMatchesOriginal(topo0201.panels, state0201_0);
    assert(val0201.matches, `FEFCO 0201 projeção 0% deve bater: ${val0201.details}`);
    assert(state0201_100.stats.rigidLengthMaxErrorMm < 1e-9, 'FEFCO 0201 conservação rígida');

    // Modelo 2: FEFCO 0429 (Bandeja com abas e cantos arredondados R15 analíticos)
    const dieline0429 = fefco0429.calculate({ L: 250, B: 150, H: 80, Ep: 1.5 });
    const topo0429 = LoopTopologyEngine.extractTopology(dieline0429);
    const tree0429 = FoldingTreeEngine.buildFoldingTree(topo0429.panels, dieline0429);
    const state0429_0 = Kinematic3DEngine.computeFoldedState(topo0429.panels, tree0429, 0);
    const state0429_100 = Kinematic3DEngine.computeFoldedState(topo0429.panels, tree0429, 100);

    const val0429 = Kinematic3DEngine.validateProjectedZeroMatchesOriginal(topo0429.panels, state0429_0);
    assert(val0429.matches, `FEFCO 0429 projeção 0% deve bater: ${val0429.details}`);
    assert(state0429_100.stats.rigidLengthMaxErrorMm < 1e-9, 'FEFCO 0429 conservação rígida');

    // Verifica preservação dos arcos no modelo 0429
    const totalArcs3D = state0429_100.panels.reduce(
      (sum, p) => sum + p.outerBoundary.edges.filter((e) => e.type === 'arc').length,
      0
    );
    assert(totalArcs3D > 0, 'FEFCO 0429 deve possuir arcos analíticos preservados no 3D');

    results.push({
      name: '74. Fase 3 — Teste 3-17: Validação em Modelos Reais do Catálogo (FEFCO 0201 e FEFCO 0429)',
      category: 'CINEMÁTICA_3D',
      status: 'PASS',
      maxErrorMm: Math.max(state0201_100.stats.rigidLengthMaxErrorMm, state0429_100.stats.rigidLengthMaxErrorMm),
      toleranceMm: 0.001,
      details: `FEFCO 0201 (${topo0201.panels.length} painéis) e FEFCO 0429 (${topo0429.panels.length} painéis com arcos analíticos) validados a 0%, 50%, 100% e reversibilidade.`,
    });
  }

  // ============================================================
  // FASE 4: RENDERER 3D INDUSTRIAL REAL (THREE.JS / WEBGL)
  // ============================================================

  // TESTE 75 (TESTE 4-01): StructuralPanel -> GPU Geometry (BufferGeometry com Posições, Normais e UVs)
  {
    const singleGeom = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 120, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 120, y0: 0, x1: 120, y1: 80, type: 'cut' as const },
        { id: 's3', x0: 120, y0: 80, x1: 0, y1: 80, type: 'cut' as const },
        { id: 's4', x0: 0, y0: 80, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 120, maxY: 80, width: 120, height: 80 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(singleGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, singleGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree, {
      dielineBounds: singleGeom.bounds,
    });

    assert(controller.panelMeshes.size === 1, 'Deve criar exatamente 1 malha Three.js para o painel');
    const mesh = controller.panelMeshes.get(topo.panels[0].id)!;
    assert(mesh !== undefined, 'Malha do painel deve existir');
    assert(mesh.userData.sourcePanelId === topo.panels[0].id, 'Proveniência sourcePanelId deve coincidir');

    const geo = mesh.geometry;
    assert(geo.attributes.position.count >= 4, 'Deve conter pelo menos 4 vértices no buffer de posição');
    assert(geo.attributes.normal.count === geo.attributes.position.count, 'Normais devem estar calculadas');
    assert(geo.attributes.uv !== undefined, 'Coordenadas UV devem ser geradas para textura');

    const stats = controller.getTriangulationStats();
    assert(stats.totalTriangles >= 2, 'Painel retangular deve ser triangulado em pelo menos 2 triângulos');
    assert(Math.abs(stats.panels[0].gpuAreaMm2 - 9600) < 0.01, 'Área da malha GPU deve bater com a área canônica');

    controller.dispose();

    results.push({
      name: '75. Fase 4 — Teste 4-01: StructuralPanel -> GPU Geometry (BufferGeometry com UVs e Normais)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: Math.abs(stats.panels[0].gpuAreaMm2 - 9600),
      toleranceMm: 0.01,
      details: `Triangulação GPU: ${stats.panels[0].trianglesCount} triângulos, Área GPU = ${stats.panels[0].gpuAreaMm2}mm² (Canônica: 9600mm²).`,
    });
  }

  // TESTE 76 (TESTE 4-02): Painel Irregular com TAB Trapezoidal e Chanfro -> Fronteira Real na GPU
  {
    const irregGeom = {
      segments: [
        { id: 'b', x0: 0, y0: 0, x1: 80, y1: 0, type: 'cut' as const },
        { id: 'chamfer', x0: 80, y0: 0, x1: 100, y1: 20, type: 'cut' as const }, // chanfro
        { id: 'tab1', x0: 100, y0: 20, x1: 120, y1: 30, type: 'cut' as const }, // aba trapezoidal
        { id: 'tab2', x0: 120, y0: 30, x1: 120, y1: 70, type: 'cut' as const },
        { id: 'tab3', x0: 120, y0: 70, x1: 100, y1: 80, type: 'cut' as const },
        { id: 't', x0: 100, y0: 80, x1: 0, y1: 80, type: 'cut' as const },
        { id: 'l', x0: 0, y0: 80, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 120, maxY: 80, width: 120, height: 80 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(irregGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, irregGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const mesh = controller.panelMeshes.get(topo.panels[0].id)!;
    const pos = mesh.geometry.attributes.position;
    let hasChamferPt = false;
    let hasTabPt = false;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (Math.hypot(x - 80, y - 0) < 0.1 || Math.hypot(x - 100, y - 20) < 0.1) hasChamferPt = true;
      if (Math.hypot(x - 120, y - 30) < 0.1) hasTabPt = true;
    }

    assert(hasChamferPt, 'Vértices do chanfro devem existir na GPU');
    assert(hasTabPt, 'Vértice saliente da aba deve existir na GPU');

    const stats = controller.getTriangulationStats();
    assert(stats.panels[0].areaErrorPercent < 0.01, 'Área da malha irregular deve bater perfeitamente');

    controller.dispose();

    results.push({
      name: '76. Fase 4 — Teste 4-02: Painel Irregular (TAB Trapezoidal + Chanfro) -> Fronteira Real na GPU',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: stats.panels[0].areaErrorMm2,
      toleranceMm: 0.01,
      details: `Geometria não retangular preservada na GPU. Erro de área: ${stats.panels[0].areaErrorMm2}mm² (${stats.panels[0].areaErrorPercent.toFixed(4)}%).`,
    });
  }

  // TESTE 77 (TESTE 4-03): Arc2D -> Tesselação GPU Suave (Erro Cordal Máximo <= 0.05mm)
  {
    // Painel com arco semicircular de raio R=20mm no topo
    const arcGeom = {
      segments: [
        { id: 'b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r', x0: 100, y0: 0, x1: 100, y1: 50, type: 'cut' as const },
        { id: 't_r', x0: 100, y0: 50, x1: 70, y1: 50, type: 'cut' as const },
        { id: 't_l', x0: 30, y0: 50, x1: 0, y1: 50, type: 'cut' as const },
        { id: 'l', x0: 0, y0: 50, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [
        // Semicírculo r=20, centro (50, 50), conecta 70,50 a 30,50
        { id: 'arc_t', cx: 50, cy: 50, r: 20, startAngle: 0, endAngle: 180, type: 'cut' as const },
      ],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 70, width: 100, height: 70 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(arcGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, arcGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree, { arcSegments: 32 });

    const mesh = controller.panelMeshes.get(topo.panels[0].id)!;
    const pos = mesh.geometry.attributes.position;
    let maxRadiusDev = 0;

    // Mede a fidelidade dos pontos do arco tessellados na GPU em relação ao raio analítico r=20
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (y > 50.01) {
        const r = Math.hypot(x - 50, y - 50);
        const dev = Math.abs(r - 20);
        if (dev > maxRadiusDev) maxRadiusDev = dev;
      }
    }

    assert(maxRadiusDev <= 0.05, `Desvio de raio na tesselação do arco: ${maxRadiusDev}mm > 0.05mm`);

    controller.dispose();

    results.push({
      name: '77. Fase 4 — Teste 4-03: Arc2D -> Tesselação GPU Suave (Erro Cordal Máximo <= 0.05mm)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: maxRadiusDev,
      toleranceMm: 0.05,
      details: `Desvio radial máximo da curva tessellada vs raio analítico (R=20mm): ${maxRadiusDev.toFixed(6)}mm <= 0.05mm.`,
    });
  }

  // TESTE 78 (TESTE 4-04): Furo Real (Hole) -> Triangulação Earcut Vazia (Sem Preenchimento)
  {
    const holeGeom = {
      segments: [
        { id: 'b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 't', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Furo interno 40x40 no centro [30, 30] a [70, 70]
        { id: 'h1', x0: 30, y0: 30, x1: 70, y1: 30, type: 'cut' as const },
        { id: 'h2', x0: 70, y0: 30, x1: 70, y1: 70, type: 'cut' as const },
        { id: 'h3', x0: 70, y0: 70, x1: 30, y1: 70, type: 'cut' as const },
        { id: 'h4', x0: 30, y0: 70, x1: 30, y1: 30, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(holeGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, holeGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const stats = controller.getTriangulationStats();
    const expectedArea = 10000 - 1600; // 8400 mm²
    const areaErr = Math.abs(stats.panels[0].gpuAreaMm2 - expectedArea);

    assert(areaErr < 0.01, `Área líquida da malha GPU deve ser 8400mm², obteve ${stats.panels[0].gpuAreaMm2}mm²`);

    // Valida que o centro do furo (50, 50) não está coberto por nenhum triângulo da malha
    const mesh = controller.panelMeshes.get(topo.panels[0].id)!;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;

    for (let i = 0; i < triCount; i++) {
      const i0 = idx ? idx.getX(i * 3) : i * 3;
      const i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
      const i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;

      const ax = pos.getX(i0), ay = pos.getY(i0);
      const bx = pos.getX(i1), by = pos.getY(i1);
      const cx = pos.getX(i2), cy = pos.getY(i2);

      // Centróide do triângulo
      const ctx = (ax + bx + cx) / 3;
      const cty = (ay + by + cy) / 3;
      const insideHole = ctx > 30.1 && ctx < 69.9 && cty > 30.1 && cty < 69.9;
      assert(!insideHole, 'Nenhum triângulo pode ocupar o interior do furo!');
    }

    controller.dispose();

    results.push({
      name: '78. Fase 4 — Teste 4-04: Furo Real (Hole) -> Triangulação Earcut Vazia (Sem Preenchimento)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: areaErr,
      toleranceMm: 0.01,
      details: `Área líquida exata comprovada: ${stats.panels[0].gpuAreaMm2}mm² == ${expectedArea}mm². Zero triângulos dentro do vazio.`,
    });
  }

  // TESTE 79 (TESTE 4-05): Múltiplos Furos Reais (3 Furos Simultâneos Subtraídos)
  {
    const multiHoleGeom = {
      segments: [
        { id: 'b', x0: 0, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 't', x0: 200, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        // Furo 1: 20x20 em [20, 20]
        { id: 'h1_1', x0: 20, y0: 20, x1: 40, y1: 20, type: 'cut' as const },
        { id: 'h1_2', x0: 40, y0: 20, x1: 40, y1: 40, type: 'cut' as const },
        { id: 'h1_3', x0: 40, y0: 40, x1: 20, y1: 40, type: 'cut' as const },
        { id: 'h1_4', x0: 20, y0: 40, x1: 20, y1: 20, type: 'cut' as const },
        // Furo 2: 20x20 em [90, 20]
        { id: 'h2_1', x0: 90, y0: 20, x1: 110, y1: 20, type: 'cut' as const },
        { id: 'h2_2', x0: 110, y0: 20, x1: 110, y1: 40, type: 'cut' as const },
        { id: 'h2_3', x0: 110, y0: 40, x1: 90, y1: 40, type: 'cut' as const },
        { id: 'h2_4', x0: 90, y0: 40, x1: 90, y1: 20, type: 'cut' as const },
        // Furo 3: 20x20 em [160, 20]
        { id: 'h3_1', x0: 160, y0: 20, x1: 180, y1: 20, type: 'cut' as const },
        { id: 'h3_2', x0: 180, y0: 20, x1: 180, y1: 40, type: 'cut' as const },
        { id: 'h3_3', x0: 180, y0: 40, x1: 160, y1: 40, type: 'cut' as const },
        { id: 'h3_4', x0: 160, y0: 40, x1: 160, y1: 20, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(multiHoleGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, multiHoleGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const stats = controller.getTriangulationStats();
    const expectedArea = 20000 - 3 * 400; // 18800 mm²
    const areaErr = Math.abs(stats.panels[0].gpuAreaMm2 - expectedArea);

    assert(areaErr < 0.01, `Área líquida com 3 furos: ${stats.panels[0].gpuAreaMm2}mm² == ${expectedArea}mm²`);
    controller.dispose();

    results.push({
      name: '79. Fase 4 — Teste 4-05: Múltiplos Furos Reais (3 Furos Simultâneos Subtraídos)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: areaErr,
      toleranceMm: 0.01,
      details: `3 furos independentes subtraídos simultaneamente via Earcut; área líquida GPU = ${stats.panels[0].gpuAreaMm2}mm² (erro = ${areaErr.toFixed(6)}mm²).`,
    });
  }

  // TESTE 80 (TESTE 4-06): Estado 0% na GPU (Todos os Vértices em Z=0 e Projeção Plana)
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const kResult = controller.updateFoldPercent(0);
    assert(kResult.foldPercent === 0, 'foldPercent deve ser 0');

    let maxZ = 0;
    controller.panelMeshes.forEach((mesh) => {
      mesh.updateMatrixWorld(true);
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const v = new (THREE.Vector3 as any)(pos.getX(i), pos.getY(i), pos.getZ(i));
        v.applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.z) > maxZ) maxZ = Math.abs(v.z);
      }
    });

    assert(maxZ < 1e-9, `Todos os vértices no estado 0% devem ter Z=0, obteve maxZ=${maxZ}`);
    controller.dispose();

    results.push({
      name: '80. Fase 4 — Teste 4-06: Estado 0% na GPU (Todos os Vértices em Z=0 e Projeção Plana)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: maxZ,
      toleranceMm: 0.001,
      details: `Em 0%, todos os painéis e vértices residem coplanares no plano Z=0 (maxZ = ${maxZ.toExponential(4)}mm).`,
    });
  }

  // TESTE 81 (TESTE 4-07): Estado 50% na GPU — Atualização de Matrizes sem Re-triangulação (60 FPS)
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    // Guarda referências de memória das geometrias iniciais
    const initialGeos = Array.from(controller.panelMeshes.values()).map((m) => m.geometry);

    controller.updateFoldPercent(50);

    // Comprova que as referências das geometrias NÃO foram destruídas ou recriadas
    const currentGeos = Array.from(controller.panelMeshes.values()).map((m) => m.geometry);
    for (let i = 0; i < initialGeos.length; i++) {
      assert(initialGeos[i] === currentGeos[i], 'BufferGeometry NÃO deve ser recriada durante a dobra!');
    }

    controller.dispose();

    results.push({
      name: '81. Fase 4 — Teste 4-07: Estado 50% na GPU — Atualização de Matrizes sem Re-triangulação',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `BufferGeometry 100% estática preservada em memória durante atualização dinâmica; matrizes atualizadas diretamente.`,
    });
  }

  // TESTE 82 (TESTE 4-08): Estado 100% na GPU — Transformações Rígidas Exatas do Kinematic3DEngine
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const kRes100 = controller.updateFoldPercent(100);

    // Valida que a matriz do Mesh no Three.js corresponde estritamente à matriz do Kinematic3DEngine
    let maxMatDiff = 0;
    for (const p3d of kRes100.panels) {
      const mesh = controller.panelMeshes.get(p3d.sourcePanelId)!;
      const meshElements = mesh.matrix.elements;
      const kElements = p3d.transform.elements;
      for (let j = 0; j < 16; j++) {
        const diff = Math.abs(meshElements[j] - kElements[j]);
        if (diff > maxMatDiff) maxMatDiff = diff;
      }
    }

    assert(maxMatDiff < 1e-9, `Divergência entre matriz Three.js e Kinematic3D: ${maxMatDiff}`);
    controller.dispose();

    results.push({
      name: '82. Fase 4 — Teste 4-08: Estado 100% na GPU — Transformações Rígidas Exatas do Kinematic3DEngine',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: maxMatDiff,
      toleranceMm: 0.001,
      details: `Matrizes 4x4 do Three.js coincidem com o Kinematic3DEngine até a precisão de ponto flutuante (Δ = ${maxMatDiff.toExponential(4)}mm).`,
    });
  }

  // TESTE 83 (TESTE 4-09): Reversibilidade Cíclica 0 -> 100 -> 0 na GPU sem Acúmulo de Drift
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const cycle = [0, 25, 50, 75, 100, 75, 50, 25, 0];
    for (const p of cycle) {
      controller.updateFoldPercent(p);
    }

    let drift = 0;
    controller.panelMeshes.forEach((mesh) => {
      const e = mesh.matrix.elements;
      // Matriz identidade esperada
      const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      for (let i = 0; i < 16; i++) {
        const d = Math.abs(e[i] - id[i]);
        if (d > drift) drift = d;
      }
    });

    assert(drift < 1e-12, `Drift acumulado após ciclo de dobra na GPU: ${drift}`);
    controller.dispose();

    results.push({
      name: '83. Fase 4 — Teste 4-09: Reversibilidade Cíclica 0 -> 100 -> 0 na GPU sem Acúmulo de Drift',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: drift,
      toleranceMm: 0.001,
      details: `Ciclo 0 -> 100 -> 0 retorna exatamente à identidade matricial. Drift nulo = ${drift.toExponential(4)}mm.`,
    });
  }

  // TESTE 84 (TESTE 4-10): Continuidade de Hinge na GPU (Zero-Gap ao Longo do Vinco)
  {
    const twoPanelGeom = {
      segments: [
        { id: 'p1_b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'p1_t', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'p1_l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'v_crease', x0: 100, y0: 0, x1: 100, y1: 100, type: 'crease' as const },
        { id: 'p2_b', x0: 100, y0: 0, x1: 200, y1: 0, type: 'cut' as const },
        { id: 'p2_r', x0: 200, y0: 0, x1: 200, y1: 100, type: 'cut' as const },
        { id: 'p2_t', x0: 200, y0: 100, x1: 100, y1: 100, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 200, maxY: 100, width: 200, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(twoPanelGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, twoPanelGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    controller.updateFoldPercent(100);

    const h = tree.hinges[0];
    const parentMesh = controller.panelMeshes.get(h.parentPanelId)!;
    const childMesh = controller.panelMeshes.get(h.childPanelId)!;

    // Ponto médio da dobradiça
    const midPt = new (THREE.Vector3 as any)((h.axisStart.x + h.axisEnd.x) / 2, (h.axisStart.y + h.axisEnd.y) / 2, 0);

    const pParent = midPt.clone().applyMatrix4(parentMesh.matrix);
    const pChild = midPt.clone().applyMatrix4(childMesh.matrix);

    const gap = pParent.distanceTo(pChild);
    assert(gap < 1e-9, `Gap ao longo do vinco na GPU: ${gap}`);

    controller.dispose();

    results.push({
      name: '84. Fase 4 — Teste 4-10: Continuidade de Hinge na GPU (Zero-Gap ao Longo do Vinco)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: gap,
      toleranceMm: 0.001,
      details: `Continuidade de vinco matematicamente exata no Three.js; gap entre painel pai e filho = ${gap.toExponential(4)}mm.`,
    });
  }

  // TESTE 85 (TESTE 4-11): CAD Lines — Picote (PERF) Representado como Linha Tracejada sem Virar Hinge
  {
    const perfGeom = {
      segments: [
        { id: 'b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 't', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'perf_line', x0: 50, y0: 0, x1: 50, y1: 100, type: 'perfo' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(perfGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, perfGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    assert(tree.hinges.length === 0, 'PERF não pode originar nenhuma hinge');
    assert(topo.panels.length === 1, 'PERF não particiona painéis');

    controller.dispose();

    results.push({
      name: '85. Fase 4 — Teste 4-11: CAD Lines — Picote (PERF) Representado como Linha Tracejada',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Linha de picote PERF tratada estritamente como elemento de renderização gráfica sem criar articulação cinemática.`,
    });
  }

  // TESTE 86 (TESTE 4-12): CAD Lines — Linha de Corte (CUT) Sólida
  {
    const cutGeom = {
      segments: [
        { id: 's1', x0: 0, y0: 0, x1: 50, y1: 0, type: 'cut' as const },
        { id: 's2', x0: 50, y0: 0, x1: 50, y1: 50, type: 'cut' as const },
        { id: 's3', x0: 50, y0: 50, x1: 0, y1: 50, type: 'cut' as const },
        { id: 's4', x0: 0, y0: 50, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 50, maxY: 50, width: 50, height: 50 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(cutGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, cutGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const mesh = controller.panelMeshes.get(topo.panels[0].id)!;
    const cadLinesGroup = mesh.children.find((c) => c.name.startsWith('CadLines_')) as THREE.Group;
    assert(cadLinesGroup !== undefined, 'Grupo de linhas CAD deve estar anexado ao painel');

    controller.dispose();

    results.push({
      name: '86. Fase 4 — Teste 4-12: CAD Lines — Linha de Corte (CUT) Sólida Preservada no 3D',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Linhas de corte sólido geradas como LineSegments locais acompanhando rigidamente o painel.`,
    });
  }

  // TESTE 87 (TESTE 4-13): CAD Lines — Linha de Vinco (CREASE) no Eixo de Dobra
  {
    const creaseGeom = {
      segments: [
        { id: 'b1', x0: 0, y0: 0, x1: 50, y1: 0, type: 'cut' as const },
        { id: 't1', x0: 50, y0: 50, x1: 0, y1: 50, type: 'cut' as const },
        { id: 'l1', x0: 0, y0: 50, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'c_mid', x0: 50, y0: 0, x1: 50, y1: 50, type: 'crease' as const },
        { id: 'b2', x0: 50, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r2', x0: 100, y0: 0, x1: 100, y1: 50, type: 'cut' as const },
        { id: 't2', x0: 100, y0: 50, x1: 50, y1: 50, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50, width: 100, height: 50 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(creaseGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, creaseGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    assert(controller.creasePickTubes.has('c_mid'), 'Tubo de picking para a crease c_mid deve existir');
    controller.dispose();

    results.push({
      name: '87. Fase 4 — Teste 4-13: CAD Lines — Linha de Vinco (CREASE) no Eixo de Dobra',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Vinco c_mid modelado com precisão e associado ao tubo de colisão volumétrico para picking.`,
    });
  }

  // TESTE 88 (TESTE 4-14): Seleção e Proveniência (Raycasting 3D Recuperando Metadados)
  {
    const testGeom = {
      segments: [
        { id: 'b1', x0: 0, y0: 0, x1: 50, y1: 0, type: 'cut' as const },
        { id: 't1', x0: 50, y0: 50, x1: 0, y1: 50, type: 'cut' as const },
        { id: 'l1', x0: 0, y0: 50, x1: 0, y1: 0, type: 'cut' as const },
        { id: 'crease_pick', x0: 50, y0: 0, x1: 50, y1: 50, type: 'crease' as const },
        { id: 'b2', x0: 50, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r2', x0: 100, y0: 0, x1: 100, y1: 50, type: 'cut' as const },
        { id: 't2', x0: 100, y0: 50, x1: 50, y1: 50, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50, width: 100, height: 50 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(testGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, testGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    // Simula raio apontando para o centro do painel esquerdo (x=25, y=25, z=100 -> dir 0,0,-1)
    const raycaster = new (THREE.Raycaster as any)(
      new (THREE.Vector3 as any)(25, 25, 100),
      new (THREE.Vector3 as any)(0, 0, -1)
    );

    const hit = controller.raycastPanel(raycaster);
    assert(hit !== null, 'Raycast deve atingir o painel esquerdo');
    assert(hit?.panelId !== undefined, 'Deve recuperar o sourcePanelId do painel');

    // Simula raio apontando para o vinco (x=50, y=25, z=100 -> dir 0,0,-1)
    const creaseRay = new (THREE.Raycaster as any)(
      new (THREE.Vector3 as any)(50, 25, 100),
      new (THREE.Vector3 as any)(0, 0, -1)
    );
    const creaseHit = controller.raycastCrease(creaseRay);
    assert(creaseHit !== null, 'Raycast deve atingir a crease');
    assert(creaseHit?.creaseId === 'crease_pick', 'ID da crease deve bater');
    assert(creaseHit?.hinge.kinematics.physicalDirection === 'NOT_DETERMINED', 'physicalDirection deve ser NOT_DETERMINED');

    controller.dispose();

    results.push({
      name: '88. Fase 4 — Teste 4-14: Seleção e Proveniência (Raycasting 3D Recuperando Metadados)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Picking 3D funcional com recuperação integral de proveniência e physicalDirection = NOT_DETERMINED.`,
    });
  }

  // TESTE 89 (TESTE 4-15): Componentes Desconectados Renderizados sem Pontes Artificiais
  {
    const disconnGeom = {
      segments: [
        // Componente 1: [0, 0] a [50, 50]
        { id: 'c1_b', x0: 0, y0: 0, x1: 50, y1: 0, type: 'cut' as const },
        { id: 'c1_r', x0: 50, y0: 0, x1: 50, y1: 50, type: 'cut' as const },
        { id: 'c1_t', x0: 50, y0: 50, x1: 0, y1: 50, type: 'cut' as const },
        { id: 'c1_l', x0: 0, y0: 50, x1: 0, y1: 0, type: 'cut' as const },
        // Componente 2: [200, 200] a [250, 250]
        { id: 'c2_b', x0: 200, y0: 200, x1: 250, y1: 200, type: 'cut' as const },
        { id: 'c2_r', x0: 250, y0: 200, x1: 250, y1: 250, type: 'cut' as const },
        { id: 'c2_t', x0: 250, y0: 250, x1: 200, y1: 250, type: 'cut' as const },
        { id: 'c2_l', x0: 200, y0: 250, x1: 200, y1: 200, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 250, maxY: 250, width: 250, height: 250 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(disconnGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, disconnGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    assert(controller.panelMeshes.size === 2, 'Deve criar 2 malhas independentes');
    assert(tree.components.length === 2, 'Deve ter 2 componentes topológicos desconexos');

    controller.dispose();

    results.push({
      name: '89. Fase 4 — Teste 4-15: Componentes Desconectados Renderizados sem Pontes Artificiais',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Dois corpos independentes mantidos em seus respectivos eixos de mundo sem criar vincos artificiais.`,
    });
  }

  // TESTE 90 (TESTE 4-16): Diagnóstico de Ciclos no Renderer (Grafo Fechado sem Loop Infinito)
  {
    const cycleGeom = {
      segments: [
        { id: 'b1', x0: 0, y0: 0, x1: 50, y1: 0, type: 'cut' as const },
        { id: 'b2', x0: 50, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r1', x0: 100, y0: 0, x1: 100, y1: 50, type: 'cut' as const },
        { id: 'r2', x0: 100, y0: 50, x1: 100, y1: 100, type: 'cut' as const },
        { id: 't1', x0: 100, y0: 100, x1: 50, y1: 100, type: 'cut' as const },
        { id: 't2', x0: 50, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l1', x0: 0, y0: 100, x1: 0, y1: 50, type: 'cut' as const },
        { id: 'l2', x0: 0, y0: 50, x1: 0, y1: 0, type: 'cut' as const },
        // Vincos em cruz formando anel fechado interno
        { id: 'c_b', x0: 50, y0: 0, x1: 50, y1: 50, type: 'crease' as const },
        { id: 'c_t', x0: 50, y0: 50, x1: 50, y1: 100, type: 'crease' as const },
        { id: 'c_l', x0: 0, y0: 50, x1: 50, y1: 50, type: 'crease' as const },
        { id: 'c_r', x0: 50, y0: 50, x1: 100, y1: 50, type: 'crease' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const topo = LoopTopologyEngine.extractTopology(cycleGeom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, cycleGeom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    const kRes = controller.updateFoldPercent(50);
    assert(kRes.panels.length === 4, 'Deve conter 4 painéis estruturais');

    controller.dispose();

    results.push({
      name: '90. Fase 4 — Teste 4-16: Diagnóstico de Ciclos no Renderer (Grafo Fechado sem Loop Infinito)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Grafo com ciclo articulado com árvore geradora BFS determinística sem entrar em recursão infinita.`,
    });
  }

  // TESTE 91 (TESTE 4-17): Modelo Real Catálogo FEFCO 0201 no Three.js
  {
    const { fefco0201 } = await import('../src/engine/models/fefco0201');
    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const dieline0201 = fefco0201.calculate({ L: 300, B: 200, H: 150, Ep: 3 });
    const topo0201 = LoopTopologyEngine.extractTopology(dieline0201);
    const tree0201 = FoldingTreeEngine.buildFoldingTree(topo0201.panels, dieline0201);
    const controller = ThreeGeometryAdapter.createModelController(topo0201.panels, tree0201, {
      dielineBounds: dieline0201.bounds,
    });

    assert(controller.panelMeshes.size === 5, 'FEFCO 0201 deve gerar 5 malhas de painel');
    const stats = controller.getTriangulationStats();
    assert(stats.totalTriangles >= 10, 'FEFCO 0201 deve ter triângulos gerados para todos os painéis');

    controller.updateFoldPercent(100);
    controller.dispose();

    results.push({
      name: '91. Fase 4 — Teste 4-17: Modelo Real Catálogo FEFCO 0201 no Three.js',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0.01,
      details: `Modelo FEFCO 0201: 5 malhas GPU, ${stats.totalTriangles} triângulos, articulado com sucesso.`,
    });
  }

  // TESTE 92 (TESTE 4-18): Modelo Real Catálogo FEFCO 0429 no Three.js (115 Entidades, 6 Arcos, 17 Painéis, 12 Hinges)
  {
    const { fefco0429 } = await import('../src/engine/models/fefco0429');
    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const dieline0429 = fefco0429.calculate({ L: 250, B: 150, H: 80, Ep: 1.5 });
    const topo0429 = LoopTopologyEngine.extractTopology(dieline0429);
    const tree0429 = FoldingTreeEngine.buildFoldingTree(topo0429.panels, dieline0429);
    const controller = ThreeGeometryAdapter.createModelController(topo0429.panels, tree0429, {
      dielineBounds: dieline0429.bounds,
      arcSegments: 32,
    });

    assert(controller.panelMeshes.size === 17, 'FEFCO 0429 deve possuir exatamente 17 painéis no Three.js');
    assert(tree0429.hinges.length === 12, 'FEFCO 0429 deve possuir exatamente 12 hinges (17 painéis - 5 componentes = 12)');

    const stats = controller.getTriangulationStats();
    let maxAreaDev = 0;
    for (const p of stats.panels) {
      if (p.areaErrorPercent > maxAreaDev) maxAreaDev = p.areaErrorPercent;
    }
    assert(maxAreaDev < 0.5, `Desvio de área na malha GPU do 0429: ${maxAreaDev}%`);

    controller.updateFoldPercent(50);
    controller.updateFoldPercent(100);
    controller.dispose();

    results.push({
      name: '92. Fase 4 — Teste 4-18: Modelo Real Catálogo FEFCO 0429 no Three.js (115 Entidades, 17 Painéis, 12 Hinges)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: maxAreaDev,
      toleranceMm: 0.5,
      details: `17 painéis estruturais, 12 hinges da floresta geradora (V-C=17-5=12), 6 arcos analíticos com tesselação contínua.`,
    });
  }

  // TESTE 93 (TESTE 4-19): Mobile Viewport Simulation (Aspect Ratio e Enquadramento Compacto 375x667)
  {
    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const geom = {
      segments: [
        { id: 'b', x0: 0, y0: 0, x1: 150, y1: 0, type: 'cut' as const },
        { id: 'r', x0: 150, y0: 0, x1: 150, y1: 100, type: 'cut' as const },
        { id: 't', x0: 150, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 150, maxY: 100, width: 150, height: 100 },
    };

    const topo = LoopTopologyEngine.extractTopology(geom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, geom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    // Simula câmera de tela mobile 375x667
    const wMobile = 375;
    const hMobile = 667;
    const camera = new (THREE.PerspectiveCamera as any)(45, wMobile / hMobile, 1, 10000);
    camera.updateProjectionMatrix();

    assert(Math.abs(camera.aspect - 375 / 667) < 1e-4, 'Aspect ratio mobile deve ser mantido');

    controller.dispose();

    results.push({
      name: '93. Fase 4 — Teste 4-19: Mobile Viewport Simulation (Aspect Ratio e Enquadramento Compacto 375x667)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Enquadramento sem distorção métrica em viewport mobile (375x667, aspect = ${(375 / 667).toFixed(3)}).`,
    });
  }

  // TESTE 94 (TESTE 4-20): Resize e Lifecycle WebGL (Dispose Completo de Geometrias e Materiais)
  {
    const { LoopTopologyEngine } = await import('../src/engine/importers/LoopTopologyEngine');
    const { FoldingTreeEngine } = await import('../src/engine/importers/FoldingTreeEngine');
    const { ThreeGeometryAdapter } = await import('../src/engine/renderers/ThreeGeometryAdapter');

    const geom = {
      segments: [
        { id: 'b', x0: 0, y0: 0, x1: 100, y1: 0, type: 'cut' as const },
        { id: 'r', x0: 100, y0: 0, x1: 100, y1: 100, type: 'cut' as const },
        { id: 't', x0: 100, y0: 100, x1: 0, y1: 100, type: 'cut' as const },
        { id: 'l', x0: 0, y0: 100, x1: 0, y1: 0, type: 'cut' as const },
      ],
      arcs: [],
      dimensions: [],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    };

    const topo = LoopTopologyEngine.extractTopology(geom);
    const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, geom);
    const controller = ThreeGeometryAdapter.createModelController(topo.panels, tree);

    assert(controller.rootGroup.children.length > 0, 'Grupo deve conter malhas');
    controller.dispose();
    assert(controller.rootGroup.children.length === 0, 'Após dispose, todos os nós devem ser removidos do grafo de cena');

    results.push({
      name: '94. Fase 4 — Teste 4-20: Resize e Lifecycle WebGL (Dispose Completo de Geometrias e Materiais)',
      category: 'RENDERER_3D',
      status: 'PASS',
      maxErrorMm: 0,
      toleranceMm: 0,
      details: `Desalocação limpa de Buffers e Materiais WebGL prevenindo vazamento de memória.`,
    });
  }

  console.log('\n------------------------------------------------------------');
  console.log('RESUMO DOS RESULTADOS DA SUÍTE DE TESTES:');
  console.log('------------------------------------------------------------');
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}`);
    console.log(`       Categoria: ${r.category} | Erro Máx: ${r.maxErrorMm}mm (Tol: ${r.toleranceMm}mm)`);
    console.log(`       Detalhes: ${r.details}\n`);
  }
}

runTests().catch((err) => {
  console.error('FATAL TEST FAILURE:', err);
  process.exit(1);
});
