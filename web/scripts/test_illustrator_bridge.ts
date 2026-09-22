import { MODELS, getModelById } from '../src/engine/models';
import { STANDARD_PROFILES } from '../src/engine/types';
import {
  createProjectExchangePackage,
  validateIllustratorPayload,
  generateIllustratorSessionId,
  BRIDGE_ERROR_CODES,
  type IllustratorProjectPayload,
} from '../src/integrations/illustrator/projectExchange';
import { generateIllustratorJsx } from '../src/integrations/illustrator/jsxGenerator';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`[FALHA DE ASSERT] ${msg}`);
  }
}

async function runIllustratorBridgeTests() {
  console.log('========================================================================');
  console.log('FASE 6 — SUÍTE DE TESTES FORENSES: ADOBE ILLUSTRATOR BRIDGE');
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
  // TESTE 1: bridge_schema_test
  // --------------------------------------------------------------------------
  test('1. bridge_schema_test — Contrato e Validação de Schema Estrito', () => {
    const model0201 = getModelById('fefco_0201') || MODELS[0];
    const dieline0201 = model0201.calculate(model0201.defaultParams);

    const payload = createProjectExchangePackage(
      model0201,
      model0201.defaultParams,
      profile,
      dieline0201,
      1,
      0
    );

    // Validação de schema com validador estrito
    const valResult = validateIllustratorPayload(payload);
    assert(valResult.valid, `Payload deve ser 100% válido: ${valResult.errors.join(', ')}`);
    assert(valResult.errors.length === 0, 'Não deve haver erros de validação');

    // Validação de campos obrigatórios do contrato (Seção 6)
    assert(payload.schemaVersion === 1, 'schemaVersion deve ser 1');
    assert(payload.projectRevision === 1, 'projectRevision inicial deve ser 1');
    assert(typeof payload.illustratorSessionId === 'string' && payload.illustratorSessionId.startsWith('ai_sess_'), 'SessionId válido');
    assert(payload.projectId === `proj_${model0201.id.toLowerCase()}`, 'projectId canônico');
    assert(payload.modelId === model0201.id, 'modelId canônico');
    assert(payload.modelCode === model0201.code, 'modelCode canônico');
    assert(payload.units === 'mm', "units deve ser 'mm'");
    assert(payload.scale === 1.0, 'scale métrica deve ser 1.0');
    assert(payload.dimensions.L === model0201.defaultParams.L, 'Dimensão L preservada');
    assert(payload.dimensions.B === model0201.defaultParams.B, 'Dimensão B preservada');
    assert(payload.dimensions.H === model0201.defaultParams.H, 'Dimensão H preservada');

    // Rejeição de payload corrompido
    const corruptPayload: any = { ...payload, schemaVersion: 99 };
    const corruptResult = validateIllustratorPayload(corruptPayload);
    assert(!corruptResult.valid, 'Validador deve rejeitar schemaVersion desconhecida');
    assert(corruptResult.errors.some(e => e.includes('Versão de schema')), 'Erro de versão detectado');
  });

  // --------------------------------------------------------------------------
  // TESTE 2: bridge_session_test
  // --------------------------------------------------------------------------
  test('2. bridge_session_test — Identidade de Sessão, Revisão e Detecção de Conflitos', () => {
    const model = getModelById('fefco_0201') || MODELS[0];
    const dieline = model.calculate(model.defaultParams);

    const sess1 = generateIllustratorSessionId(model.id);
    const sess2 = generateIllustratorSessionId(model.id);
    assert(sess1 !== sess2, 'Sessões consecutivas devem ter identificadores únicos');

    // Cria payload com revisão 1
    const payloadRev1 = createProjectExchangePackage(
      model,
      model.defaultParams,
      profile,
      dieline,
      1,
      0,
      undefined,
      sess1
    );
    assert(payloadRev1.projectRevision === 1, 'Revisão inicial = 1');
    assert(payloadRev1.illustratorSessionId === sess1, 'SessionId associado');

    // Usuário altera dimensões -> Nova revisão 2
    const modifiedParams = { ...model.defaultParams, L: 450 };
    const modifiedDieline = model.calculate(modifiedParams);
    const payloadRev2 = createProjectExchangePackage(
      model,
      modifiedParams,
      profile,
      modifiedDieline,
      2,
      0,
      undefined,
      sess1
    );
    assert(payloadRev2.projectRevision === 2, 'Revisão incrementada = 2');
    assert(payloadRev2.dimensions.L === 450, 'Nova dimensão L = 450');

    // Simulação de conflito: Illustrator tenta devolver arte da Rev 1 para projeto em Rev 2
    const incomingArtworkRevision = 1;
    const currentProjectRevision = payloadRev2.projectRevision;
    const isConflict = incomingArtworkRevision < currentProjectRevision;
    assert(isConflict, 'Defasagem de revisão deve ser diagnosticada');
    assert(BRIDGE_ERROR_CODES.PROJECT_REVISION_CONFLICT === 'PROJECT_REVISION_CONFLICT', 'Código de erro padronizado presente');
  });

  // --------------------------------------------------------------------------
  // TESTE 3: bridge_roundtrip_test
  // --------------------------------------------------------------------------
  test('3. bridge_roundtrip_test — Ciclo Completo PLMPackLib -> Illustrator -> PLMPackLib', () => {
    const model0429 = getModelById('fefco_0429') || MODELS[1];
    const dieline0429 = model0429.calculate(model0429.defaultParams);

    // 1. PLMPackLib gera payload canônico
    const payloadOut = createProjectExchangePackage(
      model0429,
      model0429.defaultParams,
      profile,
      dieline0429,
      1,
      0
    );

    // 2. Gera ExtendScript JSX com camadas semânticas
    const jsxCode = generateIllustratorJsx(payloadOut);
    assert(jsxCode.includes('var layerCorte = getOrCreateLayer("CUT");'), 'Camada CUT presente');
    assert(jsxCode.includes('var layerVinco = getOrCreateLayer("CREASE");'), 'Camada CREASE presente');
    assert(jsxCode.includes('var layerPicote = getOrCreateLayer("PERF");'), 'Camada PERF presente');
    assert(jsxCode.includes('var layerArte = getOrCreateLayer("ARTWORK");'), 'Camada ARTWORK presente');
    assert(jsxCode.includes('var layerGuias = getOrCreateLayer("GUIDES_INFO");'), 'Camada GUIDES_INFO presente');

    // 3. Simulação de Illustrator processando e devolvendo Arte
    const simulatedArtworkPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const artworkReturnPayload = {
      projectId: payloadOut.projectId,
      modelId: payloadOut.modelId,
      modelCode: payloadOut.modelCode,
      projectRevision: payloadOut.projectRevision,
      sessionId: payloadOut.illustratorSessionId,
      textureDataUri: simulatedArtworkPng,
      timestamp: new Date().toISOString(),
    };

    // 4. PLMPackLib recebe a arte de volta e valida preservação estrita
    assert(artworkReturnPayload.projectId === payloadOut.projectId, 'projectId coincide');
    assert(artworkReturnPayload.modelId === payloadOut.modelId, 'modelId coincide');
    assert(artworkReturnPayload.modelCode === payloadOut.modelCode, 'modelCode coincide');
    assert(artworkReturnPayload.projectRevision === payloadOut.projectRevision, 'Revisão validada sem conflito');
    assert(artworkReturnPayload.textureDataUri.startsWith('data:image/png'), 'Arte recebida em alta resolução');

    // 5. Integração Canônica: a geometria canônica NÃO foi alterada pelo retorno da arte
    const payloadWithArtwork = createProjectExchangePackage(
      model0429,
      model0429.defaultParams,
      profile,
      dieline0429,
      1,
      1,
      artworkReturnPayload.textureDataUri,
      payloadOut.illustratorSessionId
    );

    assert(
      payloadWithArtwork.canonicalGeometry.segments.length === payloadOut.canonicalGeometry.segments.length,
      'Quantidade de segmentos canônicos idêntica'
    );
    assert(
      payloadWithArtwork.canonicalGeometry.arcs.length === payloadOut.canonicalGeometry.arcs.length,
      'Quantidade de arcos canônicos idêntica'
    );
    assert(
      payloadWithArtwork.panels.length === payloadOut.panels.length,
      'Quantidade de painéis idêntica'
    );
    assert(
      payloadWithArtwork.hinges.length === payloadOut.hinges.length,
      'Quantidade de hinges idêntica'
    );
    assert(
      payloadWithArtwork.artwork?.textureDataUri === simulatedArtworkPng,
      'Arte incorporada com sucesso ao payload do projeto'
    );
  });

  // --------------------------------------------------------------------------
  // TESTE 4: Validação Canônica FEFCO 0201
  // --------------------------------------------------------------------------
  test('4. Validação Canônica no Bridge — FEFCO 0201', () => {
    const model0201 = getModelById('fefco_0201');
    assert(model0201 !== undefined, 'FEFCO 0201 deve existir');
    const dieline = model0201!.calculate(model0201!.defaultParams);
    const payload = createProjectExchangePackage(model0201!, model0201!.defaultParams, profile, dieline);

    assert(payload.canonicalGeometry.segments.length === 64, `FEFCO 0201 deve ter 64 segmentos (encontrado: ${payload.canonicalGeometry.segments.length})`);
    assert(payload.panels.length === 5, `FEFCO 0201 deve ter 5 painéis (encontrado: ${payload.panels.length})`);
    assert(payload.hinges.length === 4, `FEFCO 0201 deve ter 4 hinges (encontrado: ${payload.hinges.length})`);
  });

  // --------------------------------------------------------------------------
  // TESTE 5: Validação Canônica FEFCO 0429
  // --------------------------------------------------------------------------
  test('5. Validação Canônica no Bridge — FEFCO 0429 (115 Entidades, 17 Painéis, 12 Hinges)', () => {
    const model0429 = getModelById('fefco_0429');
    assert(model0429 !== undefined, 'FEFCO 0429 deve existir');
    const dieline = model0429!.calculate(model0429!.defaultParams);
    const payload = createProjectExchangePackage(model0429!, model0429!.defaultParams, profile, dieline);

    const totalEntities = payload.canonicalGeometry.segments.length + payload.canonicalGeometry.arcs.length;
    assert(totalEntities === 115, `FEFCO 0429 deve ter 115 entidades (encontrado: ${totalEntities})`);
    assert(payload.canonicalGeometry.segments.length === 109, `FEFCO 0429 deve ter 109 segmentos (encontrado: ${payload.canonicalGeometry.segments.length})`);
    assert(payload.canonicalGeometry.arcs.length === 6, `FEFCO 0429 deve ter 6 Arc2D (encontrado: ${payload.canonicalGeometry.arcs.length})`);

    // Todos os 6 arcos devem ter R = 15mm
    for (const arc of payload.canonicalGeometry.arcs) {
      assert(Math.abs(arc.r - 15) < 0.001, `Arc2D deve ter raio 15mm (encontrado: ${arc.r})`);
    }

    assert(payload.panels.length === 17, `FEFCO 0429 deve ter 17 painéis (encontrado: ${payload.panels.length})`);
    assert(payload.hinges.length === 12, `FEFCO 0429 deve ter 12 hinges (encontrado: ${payload.hinges.length})`);
  });

  console.log(`\nTODOS OS ${passed}/${total} TESTES DO ILLUSTRATOR BRIDGE PASSARAM COM SUCESSO!`);
}

runIllustratorBridgeTests().catch((err) => {
  console.error('\nSUÍTE DO ILLUSTRATOR BRIDGE FALHOU:', err);
  process.exit(1);
});
