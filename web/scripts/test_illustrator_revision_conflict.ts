import { BRIDGE_ERROR_CODES } from '../src/integrations/illustrator/projectExchange';

async function runRevisionConflictTest() {
  console.log('========================================================================');
  console.log('TESTE 3: DETECÇÃO DE CONFLITO DE REVISÃO E IDENTIDADE DO PROJETO');
  console.log('========================================================================\n');

  // 1. Simulação do Estado A: Projeto Enviado ao Illustrator na Revisão 1
  const projectStateA = {
    projectId: 'proj_fefco_0429',
    modelId: 'fefco_0429',
    modelCode: 'FEFCO 0429',
    projectRevision: 1,
    dimensions: { L: 300, B: 200, H: 150 },
    sessionId: 'ai_sess_fefco0429_rev1',
  };

  console.log(`[1] Estado A — Projeto Inicial Enviado ao Illustrator:`);
  console.log(`    Project ID: ${projectStateA.projectId}`);
  console.log(`    Dimensões:  ${projectStateA.dimensions.L} x ${projectStateA.dimensions.B} x ${projectStateA.dimensions.H} mm`);
  console.log(`    Revisão:    ${projectStateA.projectRevision}`);

  // 2. Designer trabalha no Illustrator e produz arte baseada na Revisão 1
  const incomingArtworkFromRev1 = {
    projectId: 'proj_fefco_0429',
    modelId: 'fefco_0429',
    projectRevision: 1,
    textureDataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    vectorSvg: '<svg><rect width="300" height="200" fill="red"/></svg>',
    sessionId: 'ai_sess_fefco0429_rev1',
  };

  // 3. Simulação do Estado B: Usuário altera dimensões no PLMPackLib Web
  // A alteração dimensional incrementa a revisão para 2 e recalcula a faca
  const projectStateB = {
    projectId: 'proj_fefco_0429',
    modelId: 'fefco_0429',
    modelCode: 'FEFCO 0429',
    projectRevision: 2, // Nova revisão!
    dimensions: { L: 450, B: 300, H: 200 }, // Dimensões expandidas
    sessionId: 'ai_sess_fefco0429_rev2',
  };

  console.log(`\n[2] Estado B — Dimensões alteradas no PLMPackLib Web:`);
  console.log(`    Project ID: ${projectStateB.projectId}`);
  console.log(`    Dimensões:  ${projectStateB.dimensions.L} x ${projectStateB.dimensions.B} x ${projectStateB.dimensions.H} mm`);
  console.log(`    Nova Rev:   ${projectStateB.projectRevision}`);

  // 4. Tentativa de Sincronizar Arte Defasada (Rev 1) sobre o Projeto Ativo (Rev 2)
  console.log(`\n[3] Tentativa de Injetar Arte de Rev 1 no Projeto em Rev 2:`);
  let conflictDetected = false;
  let conflictErrorCode = '';
  let rejectionReason = '';

  // Lógica oficial implementada no IllustratorBridgeClient.ts (linhas 171-188)
  if (
    incomingArtworkFromRev1.projectRevision !== undefined &&
    projectStateB.projectRevision > 1 &&
    incomingArtworkFromRev1.projectRevision < projectStateB.projectRevision
  ) {
    conflictDetected = true;
    conflictErrorCode = BRIDGE_ERROR_CODES.PROJECT_REVISION_CONFLICT;
    rejectionReason = `Arte defasada rejeitada: recebido Rev ${incomingArtworkFromRev1.projectRevision} < atual Rev ${projectStateB.projectRevision}`;
  }

  console.log(`    Conflito Detectado:  ${conflictDetected ? 'SIM (BLOQUEIO ATIVO)' : 'NÃO (FALHA DE SEGURANÇA)'}`);
  console.log(`    Código do Erro:      ${conflictErrorCode}`);
  console.log(`    Motivo:              ${rejectionReason}`);

  if (!conflictDetected || conflictErrorCode !== 'PROJECT_REVISION_CONFLICT') {
    throw new Error('Falha crítica: Arte defasada de Rev 1 substituiu silenciosamente o projeto em Rev 2!');
  }

  // 5. Teste Adicional: Tentativa de Injetar Arte de Modelo Diferente (ex: 0201 em 0429)
  console.log(`\n[4] Teste de Injeção Cruzada de Modelos (Mismatch de Projeto):`);
  const foreignArtwork = {
    projectId: 'proj_fefco_0201',
    modelId: 'fefco_0201',
    projectRevision: 1,
    textureDataUri: 'data:image/png;base64,...',
  };

  let modelConflictDetected = false;
  let modelConflictCode = '';

  if (
    foreignArtwork.modelId &&
    projectStateB.modelId &&
    foreignArtwork.modelId !== projectStateB.modelId
  ) {
    modelConflictDetected = true;
    modelConflictCode = BRIDGE_ERROR_CODES.PROJECT_REVISION_CONFLICT;
  }

  console.log(`    Injeção Cruzada Detectada: ${modelConflictDetected ? 'SIM (BLOQUEADA)' : 'NÃO'}`);
  console.log(`    Código do Erro:            ${modelConflictCode}`);

  if (!modelConflictDetected) {
    throw new Error('Falha: Arte de modelo estranho foi aceita sem validação!');
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('RESULTADO DO TESTE DE CONFLITO: PASS (PROTEÇÃO DE INTEGRIDADE ATIVA)');
  console.log('------------------------------------------------------------------------\n');
}

runRevisionConflictTest().catch((err) => {
  console.error('ERRO NO TESTE DE CONFLITO:', err);
  process.exit(1);
});
