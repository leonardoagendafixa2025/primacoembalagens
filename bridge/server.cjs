/**
 * PLMPackLib Official Bridge Server (Adobe Illustrator 2025 & CorelDRAW Graphics Suite)
 * Serviço local seguro em Node.js (porta 48123)
 * Fase 1: Autenticação Segura por OTP, CORS Restrito, PNA e Validação Estrita
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const crypto = require('crypto');

const PORT = 48123;
const WORKDIR = path.join(os.tmpdir(), 'plmpack_bridge');

if (!fs.existsSync(WORKDIR)) {
  fs.mkdirSync(WORKDIR, { recursive: true });
}

// -----------------------------------------------------------------------------
// 1. Configurações de Segurança e Origens Autorizadas
// -----------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  'https://primacorembalagens.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const ALLOWED_HOSTS = new Set([
  `127.0.0.1:${PORT}`,
  `localhost:${PORT}`,
]);

// -----------------------------------------------------------------------------
// 2. Gerenciador de Autenticação: OTP (6 Dígitos) e Session Token
// -----------------------------------------------------------------------------
const OTP_TTL_MS = 120 * 1000; // 120 segundos
const MAX_OTP_ATTEMPTS = 3;
const LOCKOUT_MS = 60 * 1000; // 60 segundos de bloqueio após 3 falhas

let currentOtp = null;
let otpExpiresAt = 0;
let otpFailedAttempts = 0;
let lockoutUntil = 0;

const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutos
const SLIDING_EXTEND_MS = 15 * 60 * 1000; // +15 minutos a cada uso
const MAX_SESSION_LIFETIME_MS = 4 * 60 * 60 * 1000; // Teto máximo de 4 horas

let activeSession = null;

function generateOtp() {
  currentOtp = crypto.randomInt(100000, 999999).toString();
  otpExpiresAt = Date.now() + OTP_TTL_MS;
  otpFailedAttempts = 0;
  lockoutUntil = 0;

  console.log('\n========================================================================');
  console.log(' [PLMPackLib Bridge] NOVO CÓDIGO DE PAREAMENTO (OTP):');
  console.log(`\n                      >>>   ${currentOtp.slice(0, 3)}-${currentOtp.slice(3)}   <<<\n`);
  console.log(' Válido por 120 segundos. Digite este código no cabeçalho do PLMPackLib Web.');
  console.log('========================================================================\n');
  return currentOtp;
}

function verifyOtp(inputCode) {
  const now = Date.now();
  if (now < lockoutUntil) {
    const remainingSec = Math.ceil((lockoutUntil - now) / 1000);
    return { ok: false, error: 'LOCKED_OUT', message: `Muitas tentativas incorretas. Aguarde ${remainingSec}s.` };
  }
  if (!currentOtp || now > otpExpiresAt) {
    generateOtp();
    return { ok: false, error: 'OTP_EXPIRED', message: 'Código de pareamento expirou. Um novo código foi gerado.' };
  }

  const cleanInput = (inputCode || '').toString().replace(/[-\s]/g, '');
  if (cleanInput.length !== 6) {
    return { ok: false, error: 'INVALID_FORMAT', message: 'O código deve conter exatamente 6 dígitos.' };
  }

  const isMatch = crypto.timingSafeEqual(Buffer.from(cleanInput), Buffer.from(currentOtp));
  if (!isMatch) {
    otpFailedAttempts++;
    if (otpFailedAttempts >= MAX_OTP_ATTEMPTS) {
      lockoutUntil = now + LOCKOUT_MS;
      currentOtp = null;
      return { ok: false, error: 'MAX_ATTEMPTS_EXCEEDED', message: 'Limite de 3 tentativas excedido. Bloqueado por 60s.' };
    }
    const remaining = MAX_OTP_ATTEMPTS - otpFailedAttempts;
    return { ok: false, error: 'INVALID_CODE', message: `Código incorreto. Você tem mais ${remaining} tentativa(s).` };
  }

  // Código correto: gera Session Token e invalida o OTP imediatamente
  currentOtp = null;
  otpExpiresAt = 0;
  otpFailedAttempts = 0;

  const tokenHex = crypto.randomBytes(32).toString('hex');
  activeSession = {
    token: tokenHex,
    expiresAt: now + SESSION_TTL_MS,
    maxExpiresAt: now + MAX_SESSION_LIFETIME_MS,
    createdAt: now,
  };

  return { ok: true, token: tokenHex, expiresInSec: Math.floor(SESSION_TTL_MS / 1000) };
}

function validateSession(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const providedToken = authHeader.slice(7).trim();

  if (!activeSession || !activeSession.token) return false;
  const now = Date.now();
  if (now > activeSession.expiresAt) {
    activeSession = null;
    return false;
  }

  if (Buffer.byteLength(providedToken) !== Buffer.byteLength(activeSession.token)) {
    return false;
  }

  const match = crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(activeSession.token));
  if (match) {
    // Renovação deslizante (+15 min respeitando teto de 4 horas)
    activeSession.expiresAt = Math.min(activeSession.maxExpiresAt, now + SLIDING_EXTEND_MS);
    return true;
  }
  return false;
}

function revokeSession() {
  activeSession = null;
  generateOtp();
}

// -----------------------------------------------------------------------------
// 3. Semáforo de Concorrência e Estado do Projeto
// -----------------------------------------------------------------------------
let isProcessing = false;
let activeProject = null;
let latestArtworkDataUri = null;

// -----------------------------------------------------------------------------
// 4. Utilitários de Cabeçalho e Segurança de Rede
// -----------------------------------------------------------------------------
function getOriginMatch(req) {
  const origin = req.headers['origin'];
  if (!origin) return null;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function validateHost(req) {
  const host = req.headers['host'];
  if (!host) return false;
  return ALLOWED_HOSTS.has(host.toLowerCase());
}

function applyCorsAndPnaHeaders(req, res) {
  const matchedOrigin = getOriginMatch(req);
  if (matchedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

// -----------------------------------------------------------------------------
// 5. Automação COM Isolada e Sanitizada
// -----------------------------------------------------------------------------
function isIllustratorRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq Illustrator.exe"', { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes('illustrator.exe'));
    });
  });
}

function isCorelDrawRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq CorelDRW.exe"', { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes('coreldrw.exe'));
    });
  });
}

function runJsxInIllustrator(scriptPath) {
  return new Promise((resolve) => {
    const cleanPath = scriptPath.replace(/\\/g, '/');
    const psScript = `
      $ai = $null;
      try {
        $ai = [System.Runtime.InteropServices.Marshal]::GetActiveObject('Illustrator.Application');
      } catch {
        try {
          $ai = New-Object -ComObject Illustrator.Application;
        } catch {
          Write-Error ("COM Failure: " + $_.Exception.Message);
          exit 1;
        }
      }
      if ($ai) {
        try {
          $ai.UserInteractionLevel = -1;
          $res = $ai.DoJavaScriptFile('${cleanPath}');
          try {
            $wshell = New-Object -ComObject WScript.Shell;
            $wshell.AppActivate('Adobe Illustrator');
          } catch {}
          Write-Output $res;
        } catch {
          Write-Error ("ExtendScript Failure: " + $_.Exception.Message);
          exit 1;
        }
      }
    `;

    const runnerFile = path.join(WORKDIR, 'run_jsx.ps1');
    fs.writeFileSync(runnerFile, psScript, 'utf-8');

    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${runnerFile}"`, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        return resolve({ success: false, error: 'Falha ao executar script no Adobe Illustrator.' });
      }
      resolve({ success: true, stdout: stdout.trim() });
    });
  });
}

function runScriptInCorelDraw(scriptPath) {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        return resolve({ success: false, error: 'Falha ao executar script no CorelDRAW.' });
      }
      resolve({ success: true, stdout: stdout.trim() });
    });
  });
}

// Validador de Schema CAD
function validateProjectPayload(project) {
  if (!project || typeof project !== 'object') return false;
  if (typeof project.projectId !== 'string' || !/^[a-zA-Z0-9_\-]{3,64}$/.test(project.projectId)) return false;
  if (!project.dieline || typeof project.dieline !== 'object') return false;
  if (!project.dieline.bounds || typeof project.dieline.bounds !== 'object') return false;
  const b = project.dieline.bounds;
  if (typeof b.width !== 'number' || typeof b.height !== 'number' || !isFinite(b.width) || !isFinite(b.height) || b.width <= 0 || b.height <= 0) {
    return false;
  }
  // Rejeita payloads com comandos arbitrários desconhecidos
  const suspiciousKeys = ['cmd', 'exec', 'command', 'powershell', 'shell', 'scriptCode'];
  for (const k of suspiciousKeys) {
    if (k in project) return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// 6. Servidor HTTP
// -----------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  applyCorsAndPnaHeaders(req, res);

  // Validação de Host
  if (!validateHost(req)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'INVALID_HOST', message: 'Cabeçalho Host inválido ou não autorizado.' }));
    return;
  }

  // Preflight OPTIONS (CORS & PNA)
  if (req.method === 'OPTIONS') {
    const matchedOrigin = getOriginMatch(req);
    if (!matchedOrigin) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  // Validação de Origin para métodos mutáveis ou acessos via navegador
  const requestOrigin = req.headers['origin'];
  if (requestOrigin && !ALLOWED_ORIGINS.has(requestOrigin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'FORBIDDEN_ORIGIN', message: 'Origem não autorizada.' }));
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ---------------------------------------------------------------------------
  // Rota Pública Mínima: GET /api/status
  // Retorna estritamente { bridge: "online", version: "1.0.0" }
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      bridge: 'online',
      version: '1.0.0',
    }));
    return;
  }

  // ---------------------------------------------------------------------------
  // Rota de Pareamento: POST /api/auth/pair
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/auth/pair' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024) req.destroy(); // Max 1 KB
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const result = verifyOtp(payload.pairingCode);
        if (!result.ok) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: result.error, message: result.message }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          token: result.token,
          expiresIn: result.expiresInSec,
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'BAD_REQUEST', message: 'JSON inválido.' }));
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Rota de Revogação: POST /api/auth/revoke (Exige Auth)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/auth/revoke' && req.method === 'POST') {
    if (!validateSession(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }));
      return;
    }
    revokeSession();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Sessão revogada com sucesso.' }));
    return;
  }

  // ---------------------------------------------------------------------------
  // Todas as demais rotas abaixo EXIGEM autenticação via Bearer Token
  // ---------------------------------------------------------------------------
  if (!validateSession(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'UNAUTHORIZED', message: 'Token de autenticação local inválido ou expirado.' }));
    return;
  }

  // ---------------------------------------------------------------------------
  // Rota Protegida de Telemetria: POST /api/session-info
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/session-info' && req.method === 'POST') {
    const [aiRunning, corelRunning] = await Promise.all([
      isIllustratorRunning(),
      isCorelDrawRunning(),
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      authenticated: true,
      illustratorDetected: aiRunning,
      corelDetected: corelRunning,
      activeProject: activeProject ? activeProject.projectId : null,
      hasArtwork: !!latestArtworkDataUri,
    }));
    return;
  }

  // ---------------------------------------------------------------------------
  // Rota Protegida: POST /api/open (Limite 5 MB, Semáforo de Concorrência)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/open' && req.method === 'POST') {
    if (isProcessing) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'BUSY', message: 'Uma operação de faca já está em andamento. Aguarde.' }));
      return;
    }

    let body = '';
    let exceeded = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5 MB max
        exceeded = true;
        req.destroy();
      }
    });

    req.on('end', async () => {
      if (exceeded) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload CAD excede o limite de 5 MB.' }));
        return;
      }

      isProcessing = true;
      try {
        const project = JSON.parse(body);
        if (!validateProjectPayload(project)) {
          isProcessing = false;
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_PAYLOAD', message: 'Schema CAD inválido ou campos não permitidos.' }));
          return;
        }

        activeProject = project;
        const targetApp = (project.targetApp || 'illustrator').toLowerCase();

        if (targetApp !== 'coreldraw' && targetApp !== 'illustrator') {
          isProcessing = false;
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'INVALID_TARGET', message: 'targetApp deve ser coreldraw ou illustrator.' }));
          return;
        }

        // Ramo CorelDRAW
        if (targetApp === 'coreldraw') {
          const { generateCorelAutomationScript } = require('../web/src/integrations/coreldraw/corelGenerator.cjs');
          const scriptContent = generateCorelAutomationScript(project);
          const scriptPath = path.join(WORKDIR, 'open_project_corel.ps1');
          fs.writeFileSync(scriptPath, scriptContent, 'utf-8');

          const isRunning = await isCorelDrawRunning();
          if (!isRunning) {
            isProcessing = false;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              corelRunning: false,
              message: 'Projeto preparado. Abra o CorelDRAW para sincronizar.',
              projectId: project.projectId,
            }));
            return;
          }

          const execRes = await runScriptInCorelDraw(scriptPath);
          isProcessing = false;

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: execRes.success,
            corelRunning: true,
            message: `Faca do projeto ${project.modelCode} enviada ao CorelDRAW.`,
            projectId: project.projectId,
            error: execRes.error,
          }));
          return;
        }

        // Ramo Illustrator
        const scriptPath = path.join(WORKDIR, 'open_project.jsx');
        const { generateIllustratorJsx } = require('../web/src/integrations/illustrator/jsxGenerator.cjs');
        const jsxCode = generateIllustratorJsx(project);
        fs.writeFileSync(scriptPath, jsxCode, 'utf-8');

        const isRunning = await isIllustratorRunning();
        if (!isRunning) {
          isProcessing = false;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            illustratorRunning: false,
            message: 'Projeto preparado. Abra o Illustrator para sincronizar.',
            projectId: project.projectId,
          }));
          return;
        }

        const execRes = await runJsxInIllustrator(scriptPath);
        isProcessing = false;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: execRes.success,
          illustratorRunning: true,
          message: `Faca do projeto ${project.modelCode} aberta no Illustrator.`,
          projectId: project.projectId,
          error: execRes.error,
        }));
      } catch (err) {
        isProcessing = false;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'SERVER_ERROR', message: 'Erro interno ao processar abertura de faca.' }));
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Rota Protegida: POST /api/sync-artwork (Semáforo de Concorrência)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/sync-artwork' && req.method === 'POST') {
    if (isProcessing) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'BUSY', message: 'Uma operação já está em andamento.' }));
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 64 * 1024) req.destroy(); // 64 KB max
    });

    req.on('end', async () => {
      if (!activeProject) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'NO_ACTIVE_PROJECT', message: 'Nenhum projeto ativo para sincronizar arte.' }));
        return;
      }

      isProcessing = true;
      try {
        let parsed = {};
        try { parsed = JSON.parse(body || '{}'); } catch {}
        const targetApp = (parsed.targetApp || 'illustrator').toLowerCase();
        const artworkPngPath = path.join(WORKDIR, 'artwork_export.png');

        if (fs.existsSync(artworkPngPath)) {
          try { fs.unlinkSync(artworkPngPath); } catch {}
        }

        if (targetApp === 'coreldraw') {
          const { generateCorelArtworkExportScript } = require('../web/src/integrations/coreldraw/corelGenerator.cjs');
          const exportScript = generateCorelArtworkExportScript(artworkPngPath);
          const exportScriptPath = path.join(WORKDIR, 'export_artwork_corel.ps1');
          fs.writeFileSync(exportScriptPath, exportScript, 'utf-8');

          await runScriptInCorelDraw(exportScriptPath);
        } else {
          const { generateArtworkExportJsx } = require('../web/src/integrations/illustrator/jsxGenerator.cjs');
          const exportJsx = generateArtworkExportJsx(activeProject, artworkPngPath);
          const exportScriptPath = path.join(WORKDIR, 'export_artwork.jsx');
          fs.writeFileSync(exportScriptPath, exportJsx, 'utf-8');

          await runJsxInIllustrator(exportScriptPath);
        }

        // Aguarda geração do arquivo por até 4 segundos
        let attempts = 0;
        while (!fs.existsSync(artworkPngPath) && attempts < 10) {
          await new Promise(r => setTimeout(r, 400));
          attempts++;
        }

        isProcessing = false;

        if (fs.existsSync(artworkPngPath)) {
          const imgBuf = fs.readFileSync(artworkPngPath);
          latestArtworkDataUri = `data:image/png;base64,${imgBuf.toString('base64')}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            textureDataUri: latestArtworkDataUri,
          }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'EXPORT_FAILED',
            message: 'O software gráfico não gerou o arquivo de arte da camada PLMPACKLIB_ARTE.',
          }));
        }
      } catch {
        isProcessing = false;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'SERVER_ERROR', message: 'Falha durante a sincronização de arte.' }));
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // Rotas Protegidas de Leitura / Limpeza
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/artwork' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: !!latestArtworkDataUri, textureDataUri: latestArtworkDataUri }));
    return;
  }

  if (url.pathname === '/api/request-geometry' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: !!activeProject, project: activeProject }));
    return;
  }

  if (url.pathname === '/api/clear' && req.method === 'POST') {
    activeProject = null;
    latestArtworkDataUri = null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Projeto zerado.' }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'NOT_FOUND', message: 'Endpoint não encontrado.' }));
});

// Inicialização: gera o primeiro código OTP e inicia o servidor HTTP
generateOtp();

server.listen(PORT, '127.0.0.1', () => {
  console.log('========================================================================');
  console.log(` PLMPackLib Bridge Local Segura (Fase 1) - Porta ${PORT}`);
  console.log(' Conexão exclusiva para: https://primacorembalagens.vercel.app');
  console.log('========================================================================\n');
});

function resetLockout() {
  lockoutUntil = 0;
  otpFailedAttempts = 0;
}

module.exports = {
  server,
  generateOtp,
  verifyOtp,
  validateSession,
  revokeSession,
  resetLockout,
  getOtp: () => currentOtp,
  PORT,
};
