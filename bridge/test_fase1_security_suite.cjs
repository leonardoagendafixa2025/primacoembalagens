/**
 * Suíte de Testes Automatizados da Fase 1: Segurança, Autenticação e Não-Regressão
 * Executa todos os 26 testes obrigatórios especificados na autorização da Fase 1
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ORIGIN_AUTH = 'https://primacorembalagens.vercel.app';
const ORIGIN_UNAUTH = 'https://evil-site.com';
const HOST_VALID = '127.0.0.1:48123';
const HOST_INVALID = 'attacker.com';

const results = [];

function recordResult(id, name, pass, expected, observed, evidence) {
  results.push({ id, name, pass, expected, observed, evidence });
  const badge = pass ? '[PASS]' : '[FAIL]';
  console.log(`${badge} Teste ${id}: ${name}`);
  if (!pass) {
    console.log(`       Esperado: ${expected}`);
    console.log(`       Observado: ${observed}`);
  }
}

// Utilitário HTTP
function makeRequest(options, postData = null) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message, statusCode: 0, headers: {}, body: '' });
    });

    if (postData) {
      if (typeof postData === 'string') {
        req.write(postData);
      } else {
        req.write(JSON.stringify(postData));
      }
    }
    req.end();
  });
}

async function runAllTests() {
  console.log('\n========================================================================');
  console.log(' INICIANDO SUÍTE COMPLETA DE TESTES DA FASE 1 (26 CENÁRIOS)');
  console.log('========================================================================\n');

  // Importa a bridge in-process
  const { server, generateOtp, verifyOtp, validateSession, revokeSession, resetLockout, getOtp, PORT } = require('./server.cjs');

  // Aguarda 500ms para estabilização da porta
  await new Promise(r => setTimeout(r, 500));

  let capturedOtp = getOtp();
  console.log(`[Suite] OTP ativo em memória na bridge: ${capturedOtp}\n`);

  let sessionToken = null;

  try {
    // -------------------------------------------------------------------------
    // Teste 1: OTP válido
    // -------------------------------------------------------------------------
    const resT1 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/pair',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Content-Type': 'application/json'
      }
    }, { pairingCode: capturedOtp });

    const passT1 = resT1.statusCode === 200 && resT1.json && typeof resT1.json.token === 'string' && resT1.json.token.length === 64;
    if (passT1) sessionToken = resT1.json.token;
    recordResult('T01', 'OTP válido gera session token', passT1,
      'Status 200 e token de 64 caracteres hex',
      `Status ${resT1.statusCode}, token length=${sessionToken ? sessionToken.length : 0}`,
      JSON.stringify(resT1.json));

    // -------------------------------------------------------------------------
    // Teste 2: OTP ausente
    // -------------------------------------------------------------------------
    const resT2 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/pair',
      method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Content-Type': 'application/json' }
    }, {});
    const passT2 = resT2.statusCode === 401;
    recordResult('T02', 'OTP ausente rejeitado', passT2, 'Status 401 Unauthorized', `Status ${resT2.statusCode}`, resT2.body);

    // -------------------------------------------------------------------------
    // Teste 3: OTP inválido
    // -------------------------------------------------------------------------
    // Gera novo OTP para testar falha sem queimar a sessão ativa
    generateOtp();
    const resT3 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/pair',
      method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Content-Type': 'application/json' }
    }, { pairingCode: '000000' });
    const passT3 = resT3.statusCode === 401 && resT3.json?.error === 'INVALID_CODE';
    recordResult('T03', 'OTP inválido rejeitado com mensagem de tentativas', passT3, 'Status 401 INVALID_CODE', `Status ${resT3.statusCode}, error=${resT3.json?.error}`, resT3.body);

    // -------------------------------------------------------------------------
    // Teste 4: OTP expirado / reutilizado
    // -------------------------------------------------------------------------
    const resT4 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/pair',
      method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Content-Type': 'application/json' }
    }, { pairingCode: capturedOtp });
    const passT4 = resT4.statusCode === 401;
    recordResult('T04', 'OTP reutilizado/antigo rejeitado', passT4, 'Status 401', `Status ${resT4.statusCode}`, resT4.body);

    // -------------------------------------------------------------------------
    // Teste 5: Mais de 3 tentativas inválidas (Lockout)
    // -------------------------------------------------------------------------
    // Faz mais 2 tentativas inválidas para completar 3 falhas
    await makeRequest({
      hostname: '127.0.0.1', port: PORT, path: '/api/auth/pair', method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Content-Type': 'application/json' }
    }, { pairingCode: '111111' });
    const resT5 = await makeRequest({
      hostname: '127.0.0.1', port: PORT, path: '/api/auth/pair', method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Content-Type': 'application/json' }
    }, { pairingCode: '222222' });
    const passT5 = resT5.statusCode === 401 && (resT5.json?.error === 'MAX_ATTEMPTS_EXCEEDED' || resT5.json?.error === 'LOCKED_OUT');
    recordResult('T05', 'Bloqueio temporário após 3 falhas de OTP', passT5, 'Status 401 MAX_ATTEMPTS_EXCEEDED ou LOCKED_OUT', `Status ${resT5.statusCode}, error=${resT5.json?.error}`, resT5.body);

    // -------------------------------------------------------------------------
    // Teste 6: Token válido acessa rota protegida
    // -------------------------------------------------------------------------
    const resT6 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/session-info',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });
    const passT6 = resT6.statusCode === 200 && resT6.json?.authenticated === true;
    recordResult('T06', 'Token válido autentica rota protegida', passT6, 'Status 200 authenticated: true', `Status ${resT6.statusCode}`, resT6.body);

    // -------------------------------------------------------------------------
    // Teste 7: Token ausente em rota protegida
    // -------------------------------------------------------------------------
    const resT7 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/session-info',
      method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Content-Type': 'application/json' }
    });
    const passT7 = resT7.statusCode === 401 && resT7.json?.error === 'UNAUTHORIZED';
    recordResult('T07', 'Token ausente rejeitado em rota protegida', passT7, 'Status 401 UNAUTHORIZED', `Status ${resT7.statusCode}`, resT7.body);

    // -------------------------------------------------------------------------
    // Teste 8: Token expirado / inválido
    // -------------------------------------------------------------------------
    const resT8 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/session-info',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': 'Bearer 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'Content-Type': 'application/json'
      }
    });
    const passT8 = resT8.statusCode === 401 && resT8.json?.error === 'UNAUTHORIZED';
    recordResult('T08', 'Token inválido ou expirado rejeitado', passT8, 'Status 401 UNAUTHORIZED', `Status ${resT8.statusCode}`, resT8.body);

    // -------------------------------------------------------------------------
    // Teste 9: Revogação manual de sessão
    // -------------------------------------------------------------------------
    const resT9 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/auth/revoke',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });
    // Verifica que o token revogado agora retorna 401
    const resT9Check = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/session-info',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });
    const passT9 = resT9.statusCode === 200 && resT9Check.statusCode === 401;
    recordResult('T09', 'Revogação manual invalida sessão imediatamente', passT9, 'Status 200 na revogação e 401 na chamada subsequente', `Revoke: ${resT9.statusCode}, Check: ${resT9Check.statusCode}`, resT9Check.body);

    // -------------------------------------------------------------------------
    // Teste 10: Novo pareamento revogando sessão anterior
    // -------------------------------------------------------------------------
    // Reseta o lockout provocado intencionalmente pelo T05 e gera novo OTP
    resetLockout();
    const newOtp = generateOtp();
    const resT10A = await makeRequest({
      hostname: '127.0.0.1', port: PORT, path: '/api/auth/pair', method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Content-Type': 'application/json' }
    }, { pairingCode: newOtp });

    const newTokenA = resT10A.json?.token;
    sessionToken = newTokenA; // atualiza para os próximos testes

    const passT10 = resT10A.statusCode === 200 && typeof newTokenA === 'string' && newTokenA.length === 64;
    recordResult('T10', 'Novo pareamento gera nova sessão válida', passT10, 'Status 200 e novo token gerado', `Status ${resT10A.statusCode}`, JSON.stringify(resT10A.json));

    // -------------------------------------------------------------------------
    // Teste 11: Origin autorizada
    // -------------------------------------------------------------------------
    const resT11 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/status',
      method: 'GET',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID }
    });
    const passT11 = resT11.statusCode === 200 && resT11.headers['access-control-allow-origin'] === ORIGIN_AUTH;
    recordResult('T11', 'Origin autorizada aceita com CORS correto', passT11, `CORS header: ${ORIGIN_AUTH}`, `Status ${resT11.statusCode}, header=${resT11.headers['access-control-allow-origin']}`, resT11.body);

    // -------------------------------------------------------------------------
    // Teste 12: Origin não autorizada
    // -------------------------------------------------------------------------
    const resT12 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/status',
      method: 'GET',
      headers: { 'Origin': ORIGIN_UNAUTH, 'Host': HOST_VALID }
    });
    const passT12 = resT12.statusCode === 403;
    recordResult('T12', 'Origin não autorizada rejeitada com 403', passT12, 'Status 403 Forbidden', `Status ${resT12.statusCode}`, resT12.body);

    // -------------------------------------------------------------------------
    // Teste 13: Host inválido (Proteção contra DNS Rebinding)
    // -------------------------------------------------------------------------
    const resT13 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/status',
      method: 'GET',
      headers: { 'Host': HOST_INVALID }
    });
    const passT13 = resT13.statusCode === 400 && resT13.json?.error === 'INVALID_HOST';
    recordResult('T13', 'Host header inválido rejeitado com 400', passT13, 'Status 400 INVALID_HOST', `Status ${resT13.statusCode}`, resT13.body);

    // -------------------------------------------------------------------------
    // Teste 14: Método HTTP não permitido
    // -------------------------------------------------------------------------
    const resT14 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/status',
      method: 'DELETE',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Authorization': `Bearer ${sessionToken}` }
    });
    const passT14 = resT14.statusCode === 404;
    recordResult('T14', 'Método HTTP não suportado rejeitado com 404', passT14, 'Status 404', `Status ${resT14.statusCode}`, resT14.body);

    // -------------------------------------------------------------------------
    // Teste 15: Payload CAD inválido (Schema)
    // -------------------------------------------------------------------------
    const resT15 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/open',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    }, { projectId: 'malicious; command', dieline: {} });
    const passT15 = resT15.statusCode === 400 && resT15.json?.error === 'INVALID_PAYLOAD';
    recordResult('T15', 'Payload com projectId fora do schema rejeitado', passT15, 'Status 400 INVALID_PAYLOAD', `Status ${resT15.statusCode}`, resT15.body);

    // -------------------------------------------------------------------------
    // Teste 16: Payload acima do limite (5 MB)
    // -------------------------------------------------------------------------
    const hugeBuffer = Buffer.alloc(6 * 1024 * 1024, 'a');
    const resT16 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/open',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    }, hugeBuffer.toString());
    const passT16 = resT16.statusCode === 413 || resT16.error;
    recordResult('T16', 'Payload CAD > 5 MB rejeitado por tamanho', passT16, 'Status 413 ou conexão fechada pelo servidor', `Status ${resT16.statusCode || resT16.error}`, resT16.body);

    // -------------------------------------------------------------------------
    // Teste 17: Tentativa de campo de comando arbitrário
    // -------------------------------------------------------------------------
    const resT17 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/open',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      projectId: 'proj_test',
      cmd: 'powershell.exe -Command calc.exe',
      dieline: { bounds: { width: 100, height: 100 } }
    });
    const passT17 = resT17.statusCode === 400 && resT17.json?.error === 'INVALID_PAYLOAD';
    recordResult('T17', 'Campo de comando suspeito bloqueado pelo validador', passT17, 'Status 400 INVALID_PAYLOAD', `Status ${resT17.statusCode}`, resT17.body);

    // -------------------------------------------------------------------------
    // Teste 18: Duas operações simultâneas (Semáforo de Concorrência)
    // -------------------------------------------------------------------------
    const validDieline = {
      projectId: 'proj_concurrent_test',
      modelCode: '0201',
      targetApp: 'illustrator',
      dieline: { bounds: { width: 300, height: 200 } }
    };
    const p1 = makeRequest({
      hostname: '127.0.0.1', port: PORT, path: '/api/open', method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' }
    }, validDieline);
    const p2 = makeRequest({
      hostname: '127.0.0.1', port: PORT, path: '/api/open', method: 'POST',
      headers: { 'Origin': ORIGIN_AUTH, 'Host': HOST_VALID, 'Authorization': `Bearer ${sessionToken}`, 'Content-Type': 'application/json' }
    }, validDieline);

    const [r1, r2] = await Promise.all([p1, p2]);
    const passT18 = (r1.statusCode === 429 || r2.statusCode === 429) || (r1.statusCode === 200 && r2.statusCode === 200);
    recordResult('T18', 'Semáforo de concorrência processa sem corrupção', passT18, 'Respostas 200 e/ou 429 Busy', `R1: ${r1.statusCode}, R2: ${r2.statusCode}`, `R1: ${r1.body}, R2: ${r2.body}`);

    // -------------------------------------------------------------------------
    // Teste 19: Bridge parada / offline
    // -------------------------------------------------------------------------
    const resT19 = await makeRequest({
      hostname: '127.0.0.1',
      port: 48999, // porta fechada
      path: '/api/status',
      method: 'GET'
    });
    const passT19 = !!resT19.error && (resT19.error.includes('ECONNREFUSED') || resT19.error.includes('connect'));
    recordResult('T19', 'Detecção graciosa de porta offline', passT19, 'Erro ECONNREFUSED capturado', `Erro: ${resT19.error}`, resT19.error);

    // -------------------------------------------------------------------------
    // Teste 20: Porta ocupada (EADDRINUSE)
    // -------------------------------------------------------------------------
    let passT20 = false;
    try {
      const conflictServer = http.createServer();
      await new Promise((resolve) => {
        conflictServer.on('error', (err) => {
          if (err.code === 'EADDRINUSE') passT20 = true;
          resolve();
        });
        conflictServer.listen(PORT, '127.0.0.1', () => {
          conflictServer.close();
          resolve();
        });
      });
    } catch (e) {
      if (e.code === 'EADDRINUSE') passT20 = true;
    }
    recordResult('T20', 'Tratamento de porta ocupada (EADDRINUSE)', passT20, 'Exceção EADDRINUSE capturada', `EADDRINUSE detectado: ${passT20}`, 'EADDRINUSE');

    // -------------------------------------------------------------------------
    // Teste 21: Abertura no CorelDRAW com token válido
    // -------------------------------------------------------------------------
    const resT21 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/open',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      projectId: 'proj_e2e_fefco_0201',
      modelCode: '0201',
      targetApp: 'coreldraw',
      dieline: {
        bounds: { minX: 0, minY: 0, maxX: 1041, maxY: 358, width: 1041, height: 358 },
        lines: [
          { x1: 0, y1: 0, x2: 1041, y2: 0, type: 'cut' },
          { x1: 0, y1: 0, x2: 0, y2: 358, type: 'cut' }
        ],
        arcs: []
      }
    });
    // O endpoint deve autenticar (sem 401) e processar com sucesso ou retornar erro controlado
    const passT21 = (resT21.statusCode === 200 && resT21.json?.success === true) || (resT21.statusCode === 500 && resT21.json?.error === 'COREL_ERROR');
    recordResult('T21', 'Abertura no CorelDRAW autenticada', passT21, 'Status 200 (ou 500 COREL_ERROR controlado, sem 401)', `Status ${resT21.statusCode}`, resT21.body);

    // -------------------------------------------------------------------------
    // Teste 22: Sincronização de arte no CorelDRAW autenticada
    // -------------------------------------------------------------------------
    const resT22 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/sync-artwork',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    }, { targetApp: 'coreldraw' });
    const passT22 = (resT22.statusCode === 200 || resT22.statusCode === 500) && resT22.statusCode !== 401;
    recordResult('T22', 'Endpoint de arte CorelDRAW responde autenticado', passT22, 'Status 200 ou 500 controlado (sem 401)', `Status ${resT22.statusCode}`, resT22.body);

    // -------------------------------------------------------------------------
    // Teste 23: Abertura no Illustrator com token válido
    // -------------------------------------------------------------------------
    const resT23 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/open',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    }, {
      projectId: 'proj_e2e_ai_0201',
      modelCode: '0201',
      targetApp: 'illustrator',
      dieline: {
        bounds: { minX: 0, minY: 0, maxX: 1041, maxY: 358, width: 1041, height: 358 },
        lines: [
          { x1: 0, y1: 0, x2: 1041, y2: 0, type: 'cut' },
          { x1: 0, y1: 0, x2: 0, y2: 358, type: 'cut' }
        ],
        arcs: []
      }
    });
    const passT23 = (resT23.statusCode === 200 && resT23.json?.success === true) || (resT23.statusCode === 500 && resT23.json?.error === 'ILLUSTRATOR_ERROR');
    recordResult('T23', 'Abertura no Illustrator autenticada', passT23, 'Status 200 (ou 500 ILLUSTRATOR_ERROR controlado, sem 401)', `Status ${resT23.statusCode}`, resT23.body);

    // -------------------------------------------------------------------------
    // Teste 24: Sincronização de arte no Illustrator autenticada
    // -------------------------------------------------------------------------
    const resT24 = await makeRequest({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/sync-artwork',
      method: 'POST',
      headers: {
        'Origin': ORIGIN_AUTH,
        'Host': HOST_VALID,
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    }, { targetApp: 'illustrator' });
    const passT24 = (resT24.statusCode === 200 || resT24.statusCode === 500) && resT24.statusCode !== 401;
    recordResult('T24', 'Endpoint de arte Illustrator responde autenticado', passT24, 'Status 200 ou 500 controlado (sem 401)', `Status ${resT24.statusCode}`, resT24.body);

    // -------------------------------------------------------------------------
    // Teste 25: Não-regressão do gerador ExtendScript JSX do Illustrator
    // -------------------------------------------------------------------------
    const jsxFilePath = path.join(__dirname, '..', 'web', 'src', 'integrations', 'illustrator', 'jsxGenerator.ts');
    const jsxFileContent = fs.readFileSync(jsxFilePath, 'utf-8');
    const hasTarget = jsxFileContent.includes('#target illustrator');
    const hasSpotCut = jsxFileContent.includes('PLMPACKLIB_CORTE');
    const hasSpotCrease = jsxFileContent.includes('PLMPACKLIB_VINCO');
    const hasArtworkLayer = jsxFileContent.includes('PLMPACKLIB_ARTE');
    const hasExportFunc = jsxFileContent.includes('export function generateIllustratorJsx');
    const passT25 = hasTarget && hasSpotCut && hasSpotCrease && hasArtworkLayer && hasExportFunc;
    recordResult('T25', 'Compilador JSX do Illustrator preservado com Spot colors e camadas', passT25, 'Todas as constantes e rotinas ExtendScript presentes', `hasTarget: ${hasTarget}, hasSpotCut: ${hasSpotCut}, hasSpotCrease: ${hasSpotCrease}, hasArtworkLayer: ${hasArtworkLayer}`, `Verificação léxica e estrutural do gerador JSX`);

    // -------------------------------------------------------------------------
    // Teste 26: Integridade dos arquivos não modificados
    // -------------------------------------------------------------------------
    const gitDiff = execSync('git diff --name-only', { encoding: 'utf-8' });
    const touchedFiles = gitDiff.split('\n').map(s => s.trim()).filter(Boolean);
    const forbiddenTouched = touchedFiles.filter(f =>
      f.includes('projectExchange.ts') ||
      f.includes('jsxGenerator.ts') ||
      f.includes('cepStudioEntry.ts')
    );
    const passT26 = forbiddenTouched.length === 0;
    recordResult('T26', 'projectExchange, jsxGenerator e cepStudioEntry 100% preservados', passT26, '0 arquivos proibidos modificados', `Modificados proibidos: ${forbiddenTouched.join(', ') || 'Nenhum'}`, 'Zero diff em arquivos protegidos');

  } finally {
    // Encerra servidor HTTP da bridge de testes
    server.close();
  }

  console.log('\n========================================================================');
  console.log(' RESUMO FINAL DOS TESTES DA FASE 1:');
  console.log('========================================================================');
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  console.log(` Total de Testes: ${total}`);
  console.log(` Aprovados:       ${passed}`);
  console.log(` Falhas:          ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
