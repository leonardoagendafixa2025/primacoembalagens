/**
 * PLMPackLib Official Bridge Server para Adobe Illustrator 2025
 * Serviço local seguro em Node.js (porta 48123)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const PORT = 48123;
const ILLUSTRATOR_EXE = 'C:\\Program Files\\Adobe\\Adobe Illustrator 2025\\Support Files\\Contents\\Windows\\Illustrator.exe';
const WORKDIR = path.join(__dirname, 'temp');

if (!fs.existsSync(WORKDIR)) {
  fs.mkdirSync(WORKDIR, { recursive: true });
}

let activeProject = null;
let latestArtworkDataUri = null;
const wsClients = new Set();

// Utilitário de CORS e Private Network Access (necessário para navegadores modernos acessando via HTTPS)
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
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

    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${runnerFile}"`, { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.warn('[Bridge] Aviso COM/PowerShell:', stderr || error.message);
        return resolve({ success: false, error: stderr || error.message });
      }
      resolve({ success: true, stdout: stdout.trim() });
    });
  });
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

  // 1. Status do Bridge e do Illustrator
  if (url.pathname === '/api/status' && req.method === 'GET') {
    const running = await isIllustratorRunning();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      bridgeOnline: true,
      illustratorDetected: running,
      illustratorVersion: 'Adobe Illustrator 2025 (v29.8.2)',
      activeProject: activeProject ? activeProject.projectId : null,
      hasArtwork: !!latestArtworkDataUri,
      latestArtworkDataUri: latestArtworkDataUri,
    }));
    return;
  }

  // 1.1 Obter Geometria / Faca atual (para o painel CEP e extensões)
  if ((url.pathname === '/api/request-geometry' || url.pathname === '/api/active-script') && (req.method === 'GET' || req.method === 'POST')) {
    if (!activeProject) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, project: null, message: 'Nenhum projeto ativo na Bridge. Aguardando sincronização com o PLMPackLib Web.' }));
      return;
    }

    const { generateIllustratorJsx } = require('../web/src/integrations/illustrator/jsxGenerator.cjs');
    const jsxCode = generateIllustratorJsx(activeProject);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      project: activeProject,
      jsx: jsxCode,
      projectId: activeProject.projectId
    }));
    return;
  }

  // 1.2 Limpar Projeto Ativo (Zerar painel)
  if (url.pathname === '/api/clear' && (req.method === 'GET' || req.method === 'POST')) {
    activeProject = null;
    latestArtworkDataUri = null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Projeto zerado com sucesso.' }));
    return;
  }

  // 2. Abrir ou Atualizar Documento no Illustrator
  if (url.pathname === '/api/open' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const project = JSON.parse(body);
        activeProject = project;

        // Salva cópia do projeto em disco
        const projectPath = path.join(WORKDIR, `${project.projectId}.plmpack`);
        fs.writeFileSync(projectPath, JSON.stringify(project, null, 2), 'utf-8');

        // Gera o script JSX dinamicamente a partir dos dados do projeto
        const scriptPath = path.join(WORKDIR, 'open_project.jsx');
        
        // Importa gerador JSX
        const { generateIllustratorJsx } = require('../web/src/integrations/illustrator/jsxGenerator.cjs');
        const jsxCode = generateIllustratorJsx(project);
        fs.writeFileSync(scriptPath, jsxCode, 'utf-8');

        // Notifica extensão CEP e ouvintes em tempo real
        broadcast({
          type: 'PROJECT_UPDATED',
          payload: { project: project, jsx: jsxCode }
        });

        const isRunning = await isIllustratorRunning();
        if (!isRunning) {
          console.log('[Bridge] Illustrator não está rodando no momento.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            illustratorRunning: false,
            message: 'Projeto preparado! Abra o Adobe Illustrator 2025 para visualizar a faca sincronizada.',
            scriptPath: scriptPath,
          }));
          return;
        }

        console.log(`[Bridge] Executando script no Illustrator para o projeto ${project.projectId}...`);
        const execRes = await runJsxInIllustrator(scriptPath);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          illustratorRunning: true,
          comSuccess: execRes.success,
          message: `Faca do projeto ${project.projectName} aberta com sucesso no Illustrator 2025!`,
          projectId: project.projectId,
          scriptPath: scriptPath
        }));
      } catch (err) {
        console.error('[Bridge] Erro ao processar /api/open:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. Capturar e Sincronizar Arte do Illustrator para o 3D
  if (url.pathname === '/api/sync-artwork' && req.method === 'POST') {
    try {
      if (!activeProject) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Nenhum projeto ativo para sincronizar.' }));
        return;
      }

      const artworkPngPath = path.join(WORKDIR, `${activeProject.projectId}_artwork.png`);
      const exportScriptPath = path.join(WORKDIR, 'export_artwork.jsx');

      const { generateArtworkExportJsx } = require('../web/src/integrations/illustrator/jsxGenerator.cjs');
      const exportJsx = generateArtworkExportJsx(activeProject, artworkPngPath);
      fs.writeFileSync(exportScriptPath, exportJsx, 'utf-8');

      console.log(`[Bridge] Solicitando exportação de arte do Illustrator para ${artworkPngPath}...`);
      await runJsxInIllustrator(exportScriptPath);

      // Aguarda geração do arquivo PNG
      let attempts = 0;
      while (!fs.existsSync(artworkPngPath) && attempts < 10) {
        await new Promise(r => setTimeout(r, 400));
        attempts++;
      }

      if (fs.existsSync(artworkPngPath)) {
        const imageBuffer = fs.readFileSync(artworkPngPath);
        const base64 = imageBuffer.toString('base64');
        latestArtworkDataUri = `data:image/png;base64,${base64}`;

        // Notifica clientes WebSocket
        broadcast({
          type: 'ARTWORK_UPDATED',
          payload: { textureDataUri: latestArtworkDataUri, projectId: activeProject.projectId }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Arte extraída do Illustrator com sucesso!',
          textureDataUri: latestArtworkDataUri
        }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'O Illustrator não gerou o arquivo de arte da camada PLMPACKLIB_ARTE.'
        }));
      }
    } catch (err) {
      console.error('[Bridge] Erro em /api/sync-artwork:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 4. Obter ou Receber arte enviada diretamente da Extensão CEP do Illustrator
  if (url.pathname === '/api/artwork' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: !!latestArtworkDataUri,
      textureDataUri: latestArtworkDataUri
    }));
    return;
  }

  if (url.pathname === '/api/artwork' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (payload.textureDataUri) {
          latestArtworkDataUri = payload.textureDataUri;
          broadcast({
            type: 'ARTWORK_UPDATED',
            payload: { textureDataUri: latestArtworkDataUri, projectId: payload.projectId }
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Arte recebida com sucesso!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
});

// Transmissão de eventos (Broadcast SSE/WebSocket simples)
function broadcast(msg) {
  const dataStr = JSON.stringify(msg);
  for (const client of wsClients) {
    try {
      client.write(`data: ${dataStr}\n\n`);
    } catch {
      wsClients.delete(client);
    }
  }
}

server.on('upgrade', (req, socket) => {
  // Conexão WebSocket leve
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const crypto = require('crypto');
  const digest = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${digest}\r\n` +
    '\r\n'
  );

  wsClients.add(socket);

  socket.on('close', () => wsClients.delete(socket));
  socket.on('error', () => wsClients.delete(socket));
});

console.log(`[Bridge] Monitor de status do Illustrator ativo.`);
setInterval(async () => {
  const isRunning = await isIllustratorRunning();
  if (!isRunning && activeProject !== null) {
    console.log('[Bridge] Illustrator foi fechado. Zerando projeto ativo na Bridge.');
    activeProject = null;
    latestArtworkDataUri = null;
  }
}, 5000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`PLMPackLib Bridge Server v2.4 (Adobe Illustrator 2025)`);
  console.log(`======================================================`);
  console.log(`Ouvindo na porta ${PORT}... Mantenha esta janela aberta.\n`);
});
