/**
 * PLMPackLib Official Bridge Server (Adobe Illustrator 2025 & CorelDRAW Graphics Suite)
 * Serviço local direto e de alta velocidade em Node.js (porta 48123)
 * Conexão transparente 1-Clique para CorelDRAW e Illustrator
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const PORT = 48123;
const WORKDIR = path.join(os.tmpdir(), 'plmpack_bridge');

if (!fs.existsSync(WORKDIR)) {
  fs.mkdirSync(WORKDIR, { recursive: true });
}

let activeProject = null;
let latestArtworkDataUri = null;
let latestArtworkVectorSvg = null;
let latestArtworkMeta = null;
let isProcessing = false;
const wsClients = new Set();

// Utilitário de CORS e Private Network Access
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Access-Control-Allow-Private-Network');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

// Verifica se o processo do Illustrator está ativo
function isIllustratorRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq Illustrator.exe"', (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes('illustrator.exe'));
    });
  });
}

// Verifica se o processo do CorelDRAW está ativo
function isCorelDrawRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq CorelDRW.exe"', (err, stdout) => {
      if (err) return resolve(false);
      resolve(stdout.toLowerCase().includes('coreldrw.exe'));
    });
  });
}

// Executa um script JSX no Adobe Illustrator via PowerShell COM Automation
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

    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${runnerFile}"`, { timeout: 25000 }, (error, stdout, stderr) => {
      if (error) {
        console.warn('[Bridge Illustrator] Erro COM/PowerShell:', stderr || error.message);
        return resolve({ success: false, error: stderr || error.message });
      }
      resolve({ success: true, stdout: stdout.trim() });
    });
  });
}

// Executa um script de automação no CorelDRAW via PowerShell COM
function runScriptInCorelDraw(scriptPath) {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 35000 }, (error, stdout, stderr) => {
      if (error) {
        console.warn('[Bridge CorelDRAW] Erro COM/PowerShell:', stderr || error.message);
        return resolve({ success: false, error: stderr || error.message, stdout: stdout });
      }
      resolve({ success: true, stdout: stdout.trim() });
    });
  });
}

// Notifica navegadores conectados via WebSocket
function broadcastWs(message) {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  for (const client of wsClients) {
    try {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    } catch {}
  }
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // 1. Status do Bridge, Illustrator e CorelDRAW (Conexão Transparente)
  if (url.pathname === '/api/status' && req.method === 'GET') {
    const [aiRunning, corelRunning] = await Promise.all([
      isIllustratorRunning(),
      isCorelDrawRunning(),
    ]);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      bridgeOnline: true,
      bridge: 'online',
      authenticated: true,
      illustratorDetected: aiRunning,
      illustratorVersion: 'Adobe Illustrator 2025',
      corelDetected: corelRunning,
      corelVersion: 'CorelDRAW Graphics Suite 2025',
      activeProject: activeProject ? activeProject.projectId : null,
      hasArtwork: !!latestArtworkDataUri || !!latestInnerArtworkDataUri,
      latestArtworkDataUri: latestArtworkDataUri,
      outerArtworkDataUri: latestArtworkDataUri,
      innerArtworkDataUri: latestInnerArtworkDataUri,
    }));
    return;
  }

  // 1.1 Rota de compatibilidade para session-info
  if (url.pathname === '/api/session-info') {
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

  // 1.2 Rota de compatibilidade de pareamento (sempre sucesso imediato)
  if (url.pathname === '/api/auth/pair') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      token: 'auto_auth_token',
      expiresIn: 86400,
    }));
    return;
  }

  // 2. Obter Geometria / Faca atual (para macros VBS / scripts)
  if ((url.pathname === '/api/request-geometry' || url.pathname === '/api/active-script') && (req.method === 'GET' || req.method === 'POST')) {
    if (!activeProject) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, project: null, message: 'Nenhum projeto ativo na Bridge.' }));
      return;
    }

    try {
      const { generateCorelAutomationScript } = require('../web/src/integrations/coreldraw/corelGenerator.cjs');
      const corelScript = generateCorelAutomationScript(activeProject);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        project: activeProject,
        corelScript,
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        project: activeProject,
      }));
    }
    return;
  }

  // 3. Abertura de Faca: POST /api/open (CorelDRAW ou Illustrator)
  if (url.pathname === '/api/open' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const project = JSON.parse(body);
        activeProject = project;
        const targetApp = (project.targetApp || 'illustrator').toLowerCase();

        console.log(`[Bridge] Recebida solicitação de abertura: ${project.modelCode} -> ${targetApp.toUpperCase()}`);

        // Ramo CorelDRAW
        if (targetApp === 'coreldraw') {
          const { generateCorelAutomationScript } = require('../web/src/integrations/coreldraw/corelGenerator.cjs');
          const scriptContent = generateCorelAutomationScript(project);
          const scriptPath = path.join(WORKDIR, 'open_project_corel.ps1');
          fs.writeFileSync(scriptPath, scriptContent, 'utf-8');

          console.log('[Bridge CorelDRAW] Executando automação no CorelDRAW...');
          const execRes = await runScriptInCorelDraw(scriptPath);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: execRes.success,
            corelRunning: true,
            message: execRes.success ? `Faca do projeto ${project.modelCode} aberta no CorelDRAW!` : `Erro ao abrir no CorelDRAW: ${execRes.error}`,
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

        console.log('[Bridge Illustrator] Executando ExtendScript no Illustrator...');
        const execRes = await runJsxInIllustrator(scriptPath);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: execRes.success,
          illustratorRunning: true,
          message: execRes.success ? `Faca do projeto ${project.modelCode} aberta no Illustrator!` : `Erro ao abrir no Illustrator: ${execRes.error}`,
          projectId: project.projectId,
          error: execRes.error,
        }));
      } catch (err) {
        console.error('[Bridge] Erro ao processar /api/open:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. Recepção de Arte do CorelDRAW: POST /api/coreldraw/artwork
  if (url.pathname === '/api/coreldraw/artwork' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        let base64 = payload.image || payload.artworkBase64 || payload.dataUri || '';
        if (base64.startsWith('data:image')) {
          latestArtworkDataUri = base64;
        } else if (base64) {
          latestArtworkDataUri = `data:image/png;base64,${base64}`;
        }

        console.log('[Bridge CorelDRAW] Nova arte 300 DPI recebida do CorelDRAW!');

        broadcastWs({
          type: 'ARTWORK_UPDATED',
          source: 'coreldraw',
          data: { textureDataUri: latestArtworkDataUri },
          timestamp: Date.now(),
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Arte do CorelDRAW sincronizada com sucesso!' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 5. Recepção de Arte do Illustrator: POST /api/artwork ou /api/sync-artwork
  if ((url.pathname === '/api/artwork' || url.pathname === '/api/sync-artwork') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Proteção de segurança: limite de payload a 50MB (Fase 6 — Seção 16)
      if (body.length > 50 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        let base64 = payload.image || payload.artworkBase64 || payload.dataUri || payload.textureDataUri || payload.outerArtworkDataUri || '';
        let innerBase64 = payload.innerArtworkDataUri || payload.innerDataUri || payload.innerImage || '';
        const side = payload.side || 'outer';

        if (side === 'inner') {
          if (base64.startsWith('data:image')) {
            latestInnerArtworkDataUri = base64;
          } else if (base64) {
            latestInnerArtworkDataUri = `data:image/png;base64,${base64}`;
          }
        } else if (side === 'both') {
          if (base64.startsWith('data:image')) {
            latestArtworkDataUri = base64;
          } else if (base64) {
            latestArtworkDataUri = `data:image/png;base64,${base64}`;
          }
          if (innerBase64.startsWith('data:image')) {
            latestInnerArtworkDataUri = innerBase64;
          } else if (innerBase64) {
            latestInnerArtworkDataUri = `data:image/png;base64,${innerBase64}`;
          }
        } else {
          // outer
          if (base64.startsWith('data:image')) {
            latestArtworkDataUri = base64;
          } else if (base64) {
            latestArtworkDataUri = `data:image/png;base64,${base64}`;
          }
          if (innerBase64) {
            if (innerBase64.startsWith('data:image')) {
              latestInnerArtworkDataUri = innerBase64;
            } else {
              latestInnerArtworkDataUri = `data:image/png;base64,${innerBase64}`;
            }
          }
        }

        let vectorSvg = payload.vectorSvg || payload.vector || '';
        if (vectorSvg) {
          latestArtworkVectorSvg = vectorSvg;
        }

        const hasVector = !!latestArtworkVectorSvg;
        const artworkType = (hasVector && latestArtworkDataUri)
          ? 'VECTOR_AND_RASTER'
          : (hasVector ? 'VECTOR_ONLY' : (latestArtworkDataUri ? 'RASTER_ONLY' : 'NONE'));

        const artworkMetadata = {
          textureDataUri: latestArtworkDataUri,
          outerArtworkDataUri: latestArtworkDataUri,
          innerArtworkDataUri: latestInnerArtworkDataUri,
          side: side,
          vectorSvg: latestArtworkVectorSvg,
          hasVector: hasVector,
          artworkType: artworkType,
          vectorStatus: hasVector ? 'VECTOR_SYNCHRONIZED' : 'VECTOR_ARTWORK_UNAVAILABLE',
          projectId: payload.projectId || (activeProject ? activeProject.projectId : null),
          modelId: payload.modelId || (activeProject ? activeProject.modelId : null),
          modelCode: payload.modelCode || (activeProject ? activeProject.modelCode : null),
          projectRevision: payload.projectRevision !== undefined ? payload.projectRevision : (activeProject ? activeProject.projectRevision : 1),
          sessionId: payload.sessionId || payload.illustratorSessionId || (activeProject ? activeProject.illustratorSessionId : null),
          timestamp: Date.now(),
        };

        latestArtworkMeta = artworkMetadata;

        console.log('[Bridge Illustrator] Nova arte sincronizada do Illustrator! Projeto:', artworkMetadata.projectId, 'Lado:', side, 'Tipo:', artworkType, 'Rev:', artworkMetadata.projectRevision);

        broadcastWs({
          type: 'ARTWORK_UPDATED',
          source: 'illustrator',
          data: artworkMetadata,
          timestamp: Date.now(),
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Arte do Illustrator sincronizada com sucesso!', metadata: artworkMetadata }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 6. Última Arte Sincronizada: GET /api/latest-artwork
  if (url.pathname === '/api/latest-artwork' && req.method === 'GET') {
    const hasVector = !!latestArtworkVectorSvg;
    const artworkType = (hasVector && latestArtworkDataUri)
      ? 'VECTOR_AND_RASTER'
      : (hasVector ? 'VECTOR_ONLY' : (latestArtworkDataUri ? 'RASTER_ONLY' : 'NONE'));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasArtwork: !!latestArtworkDataUri || !!latestInnerArtworkDataUri || hasVector,
      hasVector: hasVector,
      artworkType: artworkType,
      vectorStatus: hasVector ? 'VECTOR_SYNCHRONIZED' : 'VECTOR_ARTWORK_UNAVAILABLE',
      vectorSvg: latestArtworkVectorSvg,
      textureDataUri: latestArtworkDataUri,
      outerArtworkDataUri: latestArtworkDataUri,
      innerArtworkDataUri: latestInnerArtworkDataUri,
      projectId: latestArtworkMeta?.projectId || null,
      modelId: latestArtworkMeta?.modelId || null,
      modelCode: latestArtworkMeta?.modelCode || null,
      projectRevision: latestArtworkMeta?.projectRevision || 1,
      sessionId: latestArtworkMeta?.sessionId || null,
      metadata: latestArtworkMeta,
    }));
    return;
  }

  // Rota padrão 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'NOT_FOUND' }));
});

// Suporte a WebSocket para sincronização em tempo real
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const crypto = require('crypto');
  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
  ];

  socket.write(headers.join('\r\n') + '\r\n\r\n');

  const client = {
    readyState: 1, // OPEN
    send: (data) => {
      const payload = Buffer.from(data);
      const length = payload.length;
      let header;

      if (length < 126) {
        header = Buffer.from([0x81, length]);
      } else if (length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(length), 2);
      }

      socket.write(Buffer.concat([header, payload]));
    },
  };

  wsClients.add(client);

  socket.on('close', () => {
    client.readyState = 3;
    wsClients.delete(client);
  });

  socket.on('error', () => {
    client.readyState = 3;
    wsClients.delete(client);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n========================================================================');
  console.log(` [PLMPackLib Bridge] Online na porta ${PORT} (127.0.0.1:${PORT})`);
  console.log(' Conexão 1-Clique Ativa para CorelDRAW e Adobe Illustrator!');
  console.log(' Pronto para receber facas e sincronizar artes em tempo real.');
  console.log('========================================================================\n');
});
