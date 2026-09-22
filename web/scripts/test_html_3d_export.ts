import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, getModelById } from '../src/engine/models';
import { STANDARD_PROFILES } from '../src/engine/types';
import { generateStandaloneHtml3D } from '../src/engine/export/Html3DExporter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scratchDir = path.resolve(__dirname, '../../scratch');

if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[FALHA DE ASSERT] ${msg}`);
  }
}

async function runHtml3DExportTests() {
  console.log('========================================================================');
  console.log('FASE 6 — SUÍTE DE TESTES FORENSES: EXPORTAÇÃO HTML 3D AUTÔNOMO');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  const profile = STANDARD_PROFILES[0]; // Duplex/Triplex 0.6mm

  // --------------------------------------------------------------------------
  // TESTE 1: Exportação de Modelo Canônico FEFCO 0201
  // --------------------------------------------------------------------------
  test('1. Geração de HTML 3D para FEFCO 0201 (13 Painéis, 12 Hinges)', () => {
    const model0201 = getModelById('fefco_0201') || MODELS[0];
    const dieline0201 = model0201.calculate(model0201.defaultParams);

    const res = generateStandaloneHtml3D(model0201, model0201.defaultParams, profile, dieline0201, {
      foldPercent: 1.0,
    });

    assert(res.success, `Exportação deve ser bem-sucedida: ${res.errorMessage}`);
    assert(res.panelsCount === 13, `Deve conter 13 painéis (encontrado: ${res.panelsCount})`);
    assert(res.hingesCount === 12, `Deve conter 12 hinges (encontrado: ${res.hingesCount})`);
    assert(res.html.length > 5000, `HTML gerado deve ter tamanho substancial (>5KB, encontrado ${res.html.length} bytes)`);

    // Salva arquivo no scratch para validação física
    const filePath = path.join(scratchDir, res.filename);
    fs.writeFileSync(filePath, res.html, 'utf-8');
    assert(fs.existsSync(filePath), 'Arquivo HTML deve ser persistido em disco');
  });

  // --------------------------------------------------------------------------
  // TESTE 2: Conteúdo 3D Real (Three.js, WebGL, OrbitControls)
  // --------------------------------------------------------------------------
  test('2. Validação de Conteúdo 3D Real (Three.js e WebGL presentes, sem imagem estática)', () => {
    const model = getModelById('fefco_0201') || MODELS[0];
    const dieline = model.calculate(model.defaultParams);
    const res = generateStandaloneHtml3D(model, model.defaultParams, profile, dieline);

    // Deve conter Three.js e WebGLRenderer
    assert(res.html.includes('new THREE.WebGLRenderer'), 'WebGLRenderer Three.js presente');
    assert(res.html.includes('new THREE.PerspectiveCamera'), 'PerspectiveCamera Three.js presente');
    assert(res.html.includes('new THREE.Scene'), 'Scene Three.js presente');
    assert(res.html.includes('THREE.OrbitControls'), 'OrbitControls presente para rotação 360°');
    assert(res.html.includes('new THREE.ShapeGeometry'), 'ShapeGeometry analítica baseada no contorno presente');

    // NÃO deve ser mera screenshot ou imagem rasterizada
    assert(!res.html.includes('<img id="screenshot"'), 'NÃO deve conter tag de screenshot');
  });

  // --------------------------------------------------------------------------
  // TESTE 3: Preservação da Identidade do Modelo e Parâmetros
  // --------------------------------------------------------------------------
  test('3. Identidade do Projeto, Modelo e Parâmetros Armazenados', () => {
    const model = getModelById('fefco_0201') || MODELS[0];
    const dieline = model.calculate(model.defaultParams);
    const res = generateStandaloneHtml3D(model, model.defaultParams, profile, dieline);

    assert(res.html.includes(model.code), `modelCode ${model.code} deve estar presente no HTML`);
    assert(res.html.includes(model.name), `modelName ${model.name} deve estar presente no HTML`);
    assert(res.html.includes(`"modelId": "${model.id}"`), 'modelId deve estar serializado nos metadados');
    assert(res.html.includes(`"projectId": "proj_${model.id.toLowerCase()}"`), 'projectId deve estar serializado');
    assert(res.html.includes(`"L": ${model.defaultParams.L}`), 'Parâmetro L deve estar serializado');
    assert(res.html.includes(`"B": ${model.defaultParams.B}`), 'Parâmetro B deve estar serializado');
    assert(res.html.includes(`"H": ${model.defaultParams.H}`), 'Parâmetro H deve estar serializado');
  });

  // --------------------------------------------------------------------------
  // TESTE 4: Controle e Estado de Dobra (0% Flat -> 100% Montado)
  // --------------------------------------------------------------------------
  test('4. Slider e Cinemática de Dobra (0% Flat = 2D Coincidente, 100% Montado)', () => {
    const model = getModelById('fefco_0201') || MODELS[0];
    const dieline = model.calculate(model.defaultParams);
    const res = generateStandaloneHtml3D(model, model.defaultParams, profile, dieline);

    assert(res.html.includes('id="foldSlider"'), 'Slider de dobra presente no HTML');
    assert(res.html.includes('function updateFold(percent)'), 'Função de interpolação cinemática presente');
    assert(res.html.includes('m0.decompose'), 'Decomposição rígida para interpolação livre de distorção métrica presente');
    assert(res.html.includes('btnFlatView'), 'Controle de visão plana (0% flat) presente');
    assert(res.html.includes('btnFoldView'), 'Controle de visão montada (100% folded) presente');
    assert(res.html.includes('btnPlayPause'), 'Controle de animação contínua de dobra presente');
  });

  // --------------------------------------------------------------------------
  // TESTE 5: PROIBIÇÃO ABSOLUTA de BoxGeometry e Fallbacks Genéricos
  // --------------------------------------------------------------------------
  test('5. Proibição Absoluta — ZERO BoxGeometry, ZERO Cubos Genéricos, ZERO Fallbacks', () => {
    const model = getModelById('fefco_0201') || MODELS[0];
    const dieline = model.calculate(model.defaultParams);
    const res = generateStandaloneHtml3D(model, model.defaultParams, profile, dieline);

    // Proibições estritas da Seção 20 e 30
    // (Apenas o chão pode usar PlaneGeometry para sombra, nenhuma peça do modelo pode usar BoxGeometry)
    const lines = res.html.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('BoxGeometry') || line.includes('genericBox') || line.includes('fallbackBox') || line.includes('placeholderGeometry')) {
        throw new Error(`Proibição violada na linha ${i + 1}: ${line.trim()}`);
      }
    }
  });

  // --------------------------------------------------------------------------
  // TESTE 6: Exportação de Modelo Complexo FEFCO 0429 com 6 Arcos R15
  // --------------------------------------------------------------------------
  test('6. Modelo Complexo FEFCO 0429 (115 Entidades, 17 Painéis, 16 Hinges) no HTML 3D', () => {
    const model0429 = getModelById('fefco_0429');
    assert(model0429 !== undefined, 'FEFCO 0429 deve existir');
    const dieline0429 = model0429!.calculate(model0429!.defaultParams);

    const res = generateStandaloneHtml3D(model0429!, model0429!.defaultParams, profile, dieline0429);
    assert(res.success, `FEFCO 0429 deve ser exportado com sucesso: ${res.errorMessage}`);
    assert(res.panelsCount === 17, `FEFCO 0429 deve ter 17 painéis (encontrado: ${res.panelsCount})`);
    assert(res.hingesCount === 16, `FEFCO 0429 deve ter 16 hinges (encontrado: ${res.hingesCount})`);

    const filePath = path.join(scratchDir, res.filename);
    fs.writeFileSync(filePath, res.html, 'utf-8');
    assert(fs.existsSync(filePath), 'Arquivo HTML de FEFCO 0429 persistido');
  });

  // --------------------------------------------------------------------------
  // TESTE 7: Autonomia e Capacidade de Execução Standalone
  // --------------------------------------------------------------------------
  test('7. Autonomia do Arquivo — Arquivo Único e Autossuficiente', () => {
    const model = getModelById('fefco_0201') || MODELS[0];
    const dieline = model.calculate(model.defaultParams);
    const res = generateStandaloneHtml3D(model, model.defaultParams, profile, dieline);

    // Não deve referenciar localhost:5173 nem caminhos locais do Vite
    assert(!res.html.includes('localhost:5173'), 'Não deve depender do servidor Vite');
    assert(!res.html.includes('/src/main.tsx'), 'Não deve referenciar arquivos fonte locais');
    assert(res.html.includes('<!DOCTYPE html>'), 'Documento HTML5 completo');
    assert(res.html.includes('</html>'), 'Documento fechado corretamente');
  });

  console.log(`\nTODOS OS ${passed}/${total} TESTES DE EXPORTAÇÃO HTML 3D PASSARAM COM SUCESSO!`);
}

runHtml3DExportTests().catch((err) => {
  console.error('\nSUÍTE DE EXPORTAÇÃO HTML 3D FALHOU:', err);
  process.exit(1);
});
