// PRIMACOR EMBALAGENS - Studio 3D CEP Controller (Esko Studio Style)
(function() {
  var cs = new CSInterface();
  var BRIDGE_URL = 'http://127.0.0.1:48123';
  var WEB_URL = 'https://primacoembalagens.vercel.app';
  var pollInterval = null;

  // Elementos da UI
  var elStatusDot = document.getElementById('statusDot');
  var elStatusText = document.getElementById('statusText');
  var elModelTag = document.getElementById('modelTag');
  var elStatusMsg = document.getElementById('txtStatusMsg');
  var elVersionOuter = document.getElementById('txtVersionOuter');
  var elVersionInner = document.getElementById('txtVersionInner');
  var elEmptyState = document.getElementById('emptyStateOverlay');

  var sliderFold = document.getElementById('sliderFold');
  var txtFoldPct = document.getElementById('txtFoldPct');
  var btnPlayFold = document.getElementById('btnPlayFold');

  var btnSyncArtwork = document.getElementById('btnSyncArtwork');
  var btnSyncArtworkOuter = document.getElementById('btnSyncArtworkOuter');
  var btnSyncArtworkInner = document.getElementById('btnSyncArtworkInner');
  var btnModeOuter = document.getElementById('btnModeOuter');
  var btnModeInner = document.getElementById('btnModeInner');
  var btnUpdateDieline = document.getElementById('btnUpdateDieline');
  var btnOpenWeb = document.getElementById('btnOpenWeb');
  var btnOpenWebEmpty = document.getElementById('btnOpenWebEmpty');
  var btnClearStudio = document.getElementById('btnClearStudio');

  var btnViewIso = document.getElementById('btnViewIso');
  var btnViewFront = document.getElementById('btnViewFront');
  var btnViewTop = document.getElementById('btnViewTop');
  var btnAutoRotate = document.getElementById('btnAutoRotate');

  var btnSubstrateCartao = document.getElementById('btnSubstrateCartao');
  var btnSubstrateKraft = document.getElementById('btnSubstrateKraft');

  var currentProject = null;
  var isPlayingAnim = false;
  var animInterval = null;
  var outerArtVersion = 0;
  var innerArtVersion = 0;
  var lastOuterArtworkUri = null;
  var lastInnerArtworkUri = null;
  var lastLoadedArtworkUri = null;

  function setStatus(msg) {
    if (elStatusMsg) elStatusMsg.textContent = msg;
  }

  function setOnline(isOnline) {
    if (isOnline) {
      if (elStatusDot) elStatusDot.className = 'status-dot';
      if (elStatusText) elStatusText.textContent = 'CONECTADO';
    } else {
      if (elStatusDot) elStatusDot.className = 'status-dot offline';
      if (elStatusText) elStatusText.textContent = 'OFFLINE';
    }
  }

  // Define estado Zerado / Aguardando vs Estado com Modelo Ativo
  function setEmptyState(isEmpty, message) {
    if (isEmpty) {
      currentProject = null;
      lastLoadedArtworkUri = null;
      lastOuterArtworkUri = null;
      lastInnerArtworkUri = null;
      outerArtVersion = 0;
      innerArtVersion = 0;
      if (elVersionOuter) elVersionOuter.textContent = 'Arte Ext: v0';
      if (elVersionInner) elVersionInner.textContent = 'Arte Int: v0';

      if (elEmptyState) elEmptyState.style.display = 'flex';
      if (elModelTag) {
        elModelTag.textContent = 'AGUARDANDO PROJETO';
        elModelTag.className = 'brand-badge waiting';
      }
      if (btnSyncArtwork) {
        btnSyncArtwork.disabled = true;
        btnSyncArtwork.style.opacity = '0.5';
        btnSyncArtwork.style.cursor = 'not-allowed';
      }
      if (btnSyncArtworkOuter) {
        btnSyncArtworkOuter.disabled = true;
        btnSyncArtworkOuter.style.opacity = '0.5';
      }
      if (btnSyncArtworkInner) {
        btnSyncArtworkInner.disabled = true;
        btnSyncArtworkInner.style.opacity = '0.5';
      }
      if (sliderFold) sliderFold.disabled = true;
      if (btnPlayFold) btnPlayFold.disabled = true;
      if (btnUpdateDieline) btnUpdateDieline.disabled = true;

      // O plugin do Illustrator TEM que ficar offline até conectar na Web
      setOnline(false);
      setStatus(message || 'Aguardando envio de projeto do PLMPackLib Web...');
    } else {
      if (elEmptyState) elEmptyState.style.display = 'none';
      if (elModelTag) {
        elModelTag.className = 'brand-badge';
      }
      if (btnSyncArtwork) {
        btnSyncArtwork.disabled = false;
        btnSyncArtwork.style.opacity = '1';
        btnSyncArtwork.style.cursor = 'pointer';
      }
      if (btnSyncArtworkOuter) {
        btnSyncArtworkOuter.disabled = false;
        btnSyncArtworkOuter.style.opacity = '1';
      }
      if (btnSyncArtworkInner) {
        btnSyncArtworkInner.disabled = false;
        btnSyncArtworkInner.style.opacity = '1';
      }
      if (sliderFold) sliderFold.disabled = false;
      if (btnPlayFold) btnPlayFold.disabled = false;
      if (btnUpdateDieline) btnUpdateDieline.disabled = false;
    }
  }

  // 1. Inicializa o Estúdio 3D (resiliente e protegido)
  var container = document.getElementById('studioCanvas');
  function initStudioIfReady() {
    if (!container) container = document.getElementById('studioCanvas');
    if (window.PLMStudio && container && !window.PLMStudio.isInitialized) {
      try {
        window.PLMStudio.init(container);
      } catch (err) {
        console.error('[CEP] Erro ao inicializar PLMStudio:', err);
      }
    }
  }
  initStudioIfReady();
  window.addEventListener('DOMContentLoaded', initStudioIfReady);

  // Inicia sempre zerado
  setEmptyState(true);

  // 2. Carrega ou Atualiza Modelo 3D a partir da Bridge
  function fetchProjectGeometry() {
    fetch(BRIDGE_URL + '/api/request-geometry')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.success || !data.project) {
          // Permanece zerado até o usuário clicar na web
          setEmptyState(true);
          return;
        }

        initStudioIfReady();
        currentProject = data.project;
        setEmptyState(false);

        if (elModelTag) {
          elModelTag.textContent = data.project.modelCode || data.project.modelName || 'EMBALAGEM';
        }

        if (window.PLMStudio) {
          try {
            window.PLMStudio.loadModel(data.project);
            var artUri = (data.project.artwork && data.project.artwork.textureDataUri) || lastLoadedArtworkUri;
            if (artUri) {
              window.PLMStudio.updateArtwork(artUri);
            }
            setStatus('Modelo ' + (data.project.modelCode || '') + ' carregado com sucesso no 3D.');
          } catch (mErr) {
            console.error('[CEP] Erro ao carregar geometria no 3D:', mErr);
            setStatus('Aviso: Erro ao renderizar 3D: ' + mErr.message);
          }
        }
      })
      .catch(function(e) {
        if (!embeddedServerOnline) {
          setEmptyState(true, 'Aguardando envio de projeto da Web...');
        }
      });
  }

  // Processa projeto recebido diretamente da Web pelo servidor embutido CEP
  function handleIncomingProjectFromWeb(pkg) {
    if (!pkg) return;
    initStudioIfReady();
    currentProject = pkg;
    setEmptyState(false);
    setOnline(true);

    if (elModelTag) {
      elModelTag.textContent = pkg.modelCode || pkg.modelName || 'EMBALAGEM';
    }

    if (window.PLMStudio) {
      try {
        window.PLMStudio.loadModel(pkg);
        var artUri = (pkg.artwork && pkg.artwork.textureDataUri) || lastLoadedArtworkUri;
        if (artUri) {
          window.PLMStudio.updateArtwork(artUri);
        }
      } catch (err3d) {
        console.error('[CEP] Erro ao carregar modelo no 3D:', err3d);
        setStatus('Aviso: Erro na malha 3D: ' + err3d.message);
      }
    } else {
      console.warn('[CEP] window.PLMStudio ainda não disponível');
    }

    // Se o pacote contém o script da faca vetorial (JSX), executa no Illustrator
    if (pkg.jsx) {
      setStatus('Desenhando faca 1:1 no Adobe Illustrator...');
      cs.evalScript(pkg.jsx, function(resStr) {
        try {
          var res = JSON.parse(resStr);
          if (res && res.error) {
            setStatus('Aviso ExtendScript: ' + res.error);
          } else {
            setStatus('Faca ' + (pkg.modelCode || '') + ' criada com sucesso no Illustrator!');
          }
        } catch (e) {
          setStatus('Faca sincronizada no Illustrator.');
        }
      });
    } else {
      setStatus('Modelo ' + (pkg.modelCode || '') + ' carregado no Estúdio 3D.');
    }
  }

  // Servidor HTTP Embutido no CEP (Node.js) - Ativa a porta 48123 automaticamente ao abrir a extensão
  var embeddedServerOnline = false;
  function startEmbeddedServer() {
    try {
      var reqFn = (typeof require === 'function') ? require : (typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null);
      if (reqFn) {
        var http = reqFn('http');
        if (!http || !http.createServer) return;

        var server = http.createServer(function(req, res) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Access-Control-Allow-Private-Network', 'true');

          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
          }

          var pathname = req.url.split('?')[0];

          if (pathname === '/api/status' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              bridgeOnline: true,
              cepExtensionActive: true,
              illustratorDetected: true,
              illustratorVersion: 'Adobe Illustrator 2025 (Painel PRIMACOR Ativo)',
              activeProject: currentProject ? (currentProject.projectId || currentProject.modelCode) : null,
              projectId: currentProject ? (currentProject.projectId || currentProject.modelCode) : null,
              modelId: currentProject ? (currentProject.modelId || currentProject.modelCode) : null,
              modelCode: currentProject ? currentProject.modelCode : null,
              hasArtwork: !!(lastOuterArtworkUri || lastInnerArtworkUri || lastLoadedArtworkUri),
              textureDataUri: lastOuterArtworkUri || lastLoadedArtworkUri,
              outerArtworkDataUri: lastOuterArtworkUri,
              innerArtworkDataUri: lastInnerArtworkUri,
              latestArtworkDataUri: lastOuterArtworkUri || lastLoadedArtworkUri,
              outerVersion: outerArtVersion,
              innerVersion: innerArtVersion,
              timestamp: Date.now()
            }));
            return;
          }

          if (pathname === '/api/open' && req.method === 'POST') {
            var body = '';
            req.on('data', function(chunk) { body += chunk; });
            req.on('end', function() {
              try {
                var pkg = JSON.parse(body);
                handleIncomingProjectFromWeb(pkg);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: true,
                  message: 'Projeto sincronizado com sucesso no Adobe Illustrator!'
                }));
              } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
              }
            });
            return;
          }

          if (pathname === '/api/request-geometry' && (req.method === 'GET' || req.method === 'POST')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: !!currentProject,
              project: currentProject,
              projectId: currentProject ? (currentProject.projectId || currentProject.modelCode) : null,
              latestArtworkDataUri: lastOuterArtworkUri || lastLoadedArtworkUri,
              outerArtworkDataUri: lastOuterArtworkUri,
              innerArtworkDataUri: lastInnerArtworkUri
            }));
            return;
          }

          // Endpoint consumido pela Web para buscar a última arte sincronizada
          if ((pathname === '/api/latest-artwork' || pathname === '/api/latest_artwork') && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              hasArtwork: !!(lastOuterArtworkUri || lastInnerArtworkUri || lastLoadedArtworkUri),
              textureDataUri: lastOuterArtworkUri || lastLoadedArtworkUri,
              outerArtworkDataUri: lastOuterArtworkUri,
              innerArtworkDataUri: lastInnerArtworkUri,
              projectId: currentProject ? (currentProject.projectId || currentProject.modelCode) : null,
              modelId: currentProject ? (currentProject.modelId || currentProject.modelCode) : null,
              modelCode: currentProject ? currentProject.modelCode : null,
              outerVersion: outerArtVersion,
              innerVersion: innerArtVersion,
              timestamp: Date.now()
            }));
            return;
          }

          // Obter ou enviar arte diretamente para a Web
          if (pathname === '/api/artwork' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: !!(lastOuterArtworkUri || lastInnerArtworkUri || lastLoadedArtworkUri),
              textureDataUri: lastOuterArtworkUri || lastLoadedArtworkUri,
              outerArtworkDataUri: lastOuterArtworkUri,
              innerArtworkDataUri: lastInnerArtworkUri,
              outerVersion: outerArtVersion,
              innerVersion: innerArtVersion
            }));
            return;
          }

          if (pathname === '/api/artwork' && req.method === 'POST') {
            var artBody = '';
            req.on('data', function(chunk) { artBody += chunk; });
            req.on('end', function() {
              try {
                var payload = JSON.parse(artBody);
                if (payload.outerArtworkDataUri || payload.textureDataUri) {
                  lastOuterArtworkUri = payload.outerArtworkDataUri || payload.textureDataUri;
                  lastLoadedArtworkUri = lastOuterArtworkUri;
                }
                if (payload.innerArtworkDataUri) {
                  lastInnerArtworkUri = payload.innerArtworkDataUri;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Arte recebida e sincronizada!' }));
              } catch(e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
              }
            });
            return;
          }

          // Solicitação de captura sob demanda vinda da Web
          if (pathname === '/api/sync-artwork' && req.method === 'POST') {
            syncArtwork(function(err, dataUri) {
              if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err }));
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: true,
                  textureDataUri: dataUri,
                  artworkVersion: artVersion
                }));
              }
            });
            return;
          }

          if (pathname === '/api/clear' && req.method === 'POST') {
            setEmptyState(true, 'Estúdio zerado. Aguardando novo projeto da Web.');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
          }

          res.writeHead(404);
          res.end();
        });

        server.on('error', function(err) {
          if (err.code === 'EADDRINUSE') {
            console.log('[CEP] Porta 48123 já em uso por servidor externo.');
          } else {
            console.warn('[CEP] Erro no servidor:', err);
          }
        });

        server.listen(48123, '127.0.0.1', function() {
          embeddedServerOnline = true;
          // O plugin permanece OFFLINE até que a Web envie um projeto
          console.log('[CEP] Servidor HTTP local ativo na porta 48123 (aguardando conexão da Web)...');
        });
      }
    } catch(e) {
      console.warn('[CEP] Node.js indisponível:', e);
    }
  }

  startEmbeddedServer();

  function readDataUriFromFile(filePath) {
    if (!filePath) return null;

    // 1. Tenta leitura direta pelo Node.js fs embutido no CEP
    try {
      var reqFn = (typeof require === 'function') ? require : (typeof window !== 'undefined' && typeof window.require === 'function' ? window.require : null);
      if (reqFn) {
        var fs = reqFn('fs');
        if (fs.existsSync(filePath)) {
          var buf = fs.readFileSync(filePath);
          if (buf && buf.length > 0) {
            return 'data:image/png;base64,' + buf.toString('base64');
          }
        }
      }
    } catch(nodeErr) {
      console.warn('[CEP] Leitura Node.js fs indisponível:', nodeErr);
    }

    // 2. Tenta leitura pela API CEP nativa (window.cep.fs)
    try {
      if (window.cep && window.cep.fs) {
        var enc = (window.cep.encoding && window.cep.encoding.Base64 !== undefined) ? window.cep.encoding.Base64 : 1;
        var readRes = window.cep.fs.readFile(filePath, enc);
        if (readRes.err === 0 && readRes.data) {
          return 'data:image/png;base64,' + readRes.data;
        }
        readRes = window.cep.fs.readFile(filePath, 'Base64');
        if (readRes.err === 0 && readRes.data) {
          return 'data:image/png;base64,' + readRes.data;
        }
      }
    } catch(cepErr) {
      console.warn('[CEP] Leitura window.cep.fs indisponível:', cepErr);
    }

    // 3. Fallback URL local file:/// (o Chromium do CEP com --allow-file-access carrega imagens locais diretamente)
    try {
      var normPath = filePath.replace(/\\/g, '/');
      if (normPath.indexOf('/') !== 0 && normPath.indexOf(':') === 1) {
        normPath = '/' + normPath;
      }
      return 'file://' + normPath + '?t=' + (new Date()).getTime();
    } catch(urlErr) {
      console.warn('[CEP] Fallback URL falhou:', urlErr);
    }

    return null;
  }

  // 3. Captura de Arte do Illustrator (Externa, Interna ou Ambas) e Projeção no 3D
  function syncArtwork(side, callback) {
    if (!currentProject) {
      setStatus('Nenhum modelo 3D carregado para aplicar arte.');
      if (typeof callback === 'function') callback('Nenhum modelo ativo');
      return;
    }

    var targetSide = side || 'both';
    var isBoth = targetSide === 'both';
    var sideLabel = isBoth ? 'Externa e Interna' : (targetSide === 'inner' ? 'Interna' : 'Externa');
    setStatus('Capturando camada de arte ' + sideLabel + ' do Illustrator...');

    var disableBtns = [btnSyncArtwork, btnSyncArtworkOuter, btnSyncArtworkInner];
    disableBtns.forEach(function(b) {
      if (b) { b.disabled = true; b.style.opacity = '0.7'; }
    });

    var scriptCmd = isBoth ? 'exportBothArtworksFromIllustrator()' : 'exportArtworkFromIllustrator("' + targetSide + '")';

    cs.evalScript(scriptCmd, function(resStr) {
      disableBtns.forEach(function(b) {
        if (b) { b.disabled = false; b.style.opacity = '1'; }
      });

      try {
        var res = JSON.parse(resStr);
        if (res.error && !res.outer && !res.inner) {
          setStatus('Erro no Illustrator: ' + res.error);
          if (typeof callback === 'function') callback(res.error);
          return;
        }

        var outerUri = null;
        var innerUri = null;
        var vectorSvg = '';

        if (isBoth) {
          if (res.outer && res.outer.success && res.outer.filePath) {
            outerUri = readDataUriFromFile(res.outer.filePath);
            vectorSvg = res.outer.vectorSvg || '';
          }
          if (res.inner && res.inner.success && res.inner.filePath) {
            innerUri = readDataUriFromFile(res.inner.filePath);
          }
        } else if (targetSide === 'inner') {
          if (res.success && res.filePath) {
            innerUri = readDataUriFromFile(res.filePath);
          }
        } else {
          // outer
          if (res.success && res.filePath) {
            outerUri = readDataUriFromFile(res.filePath);
            vectorSvg = res.vectorSvg || '';
          }
        }

        if (outerUri) {
          lastOuterArtworkUri = outerUri;
          lastLoadedArtworkUri = outerUri;
          outerArtVersion++;
          if (elVersionOuter) elVersionOuter.textContent = 'Ext: v' + outerArtVersion;
        }

        if (innerUri) {
          lastInnerArtworkUri = innerUri;
          innerArtVersion++;
          if (elVersionInner) elVersionInner.textContent = 'Int: v' + innerArtVersion;
        }

        if (!outerUri && !innerUri) {
          var errDetail = res.error;
          if (!errDetail) {
            if (isBoth) {
              errDetail = (res.inner && res.inner.message) || (res.outer && res.outer.message) || 'Nenhum desenho encontrado nas camadas de arte externa ou interna.';
            } else if (targetSide === 'inner') {
              errDetail = res.message || 'A camada de arte interna está vazia ou não foi identificada no Illustrator.';
            } else {
              errDetail = res.message || 'A camada de arte externa está vazia.';
            }
          }
          setStatus(errDetail);
          if (typeof callback === 'function') callback(errDetail);
          return;
        }

        // Atualiza imediatamente o Estúdio 3D dentro do Illustrator
        if (window.PLMStudio) {
          if (isBoth) {
            window.PLMStudio.updateArtwork(outerUri || lastOuterArtworkUri || '', 'both', innerUri || lastInnerArtworkUri || '');
          } else if (targetSide === 'inner') {
            window.PLMStudio.updateArtwork(innerUri || lastInnerArtworkUri || '', 'inner');
          } else {
            window.PLMStudio.updateArtwork(outerUri || lastOuterArtworkUri || '', 'outer');
          }
        }

        if (targetSide === 'inner') {
          if (btnModeInner && btnModeOuter) {
            btnModeInner.className = 'btn-mode active-inner';
            btnModeOuter.className = 'btn-mode';
          }
          if (window.PLMStudio && innerUri) {
            var curF = window.PLMStudio.getFoldProgress ? window.PLMStudio.getFoldProgress() : 1;
            if (curF > 0.45) {
              window.PLMStudio.setFoldProgress(0.35);
              if (sliderFold) sliderFold.value = 35;
              if (txtFoldPct) txtFoldPct.textContent = '35%';
            }
          }
        } else if (targetSide === 'outer') {
          if (btnModeInner && btnModeOuter) {
            btnModeOuter.className = 'btn-mode active-outer';
            btnModeInner.className = 'btn-mode';
          }
        }

        var successMessage = '';
        if (outerUri && innerUri) {
          successMessage = 'Artes Externa e Interna projetadas no 3D com sucesso!';
        } else if (outerUri) {
          var innerNote = (res.inner && res.inner.message) ? ' (' + res.inner.message + ')' : ' (Interna mantida)';
          successMessage = 'Arte Externa projetada no 3D com sucesso!' + innerNote;
        } else if (innerUri) {
          successMessage = 'Arte Interna projetada no 3D com sucesso! (Externa mantida)';
        } else {
          successMessage = 'Arte projetada no 3D!';
        }

        setStatus(successMessage + ' Sincronizando com a Web...');

        // Notifica bridge server se houver porta aberta externa
        fetch(BRIDGE_URL + '/api/artwork', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: currentProject ? currentProject.projectId : null,
            modelId: currentProject ? (currentProject.modelId || currentProject.modelCode || null) : null,
            modelCode: currentProject ? currentProject.modelCode : null,
            projectRevision: currentProject ? currentProject.projectRevision : 1,
            side: targetSide,
            textureDataUri: lastOuterArtworkUri || outerUri || '',
            outerArtworkDataUri: lastOuterArtworkUri || outerUri || '',
            innerArtworkDataUri: lastInnerArtworkUri || innerUri || '',
            vectorSvg: vectorSvg,
            hasVector: !!vectorSvg,
            artworkType: vectorSvg ? 'VECTOR_AND_RASTER' : 'RASTER_ONLY'
          })
        })
        .then(function() {
          setStatus(successMessage + ' Sincronizado com a Web!');
        })
        .catch(function() {
          setStatus(successMessage);
        });

        if (typeof callback === 'function') {
          callback(null, { outerUri: outerUri, innerUri: innerUri });
        }

      } catch (err) {
        setStatus('Erro ao processar arte: ' + err.message);
        if (typeof callback === 'function') callback(err.message);
      }
    });
  }

  // 4. Slider de Dobra / Fechamento 3D
  if (sliderFold) {
    sliderFold.addEventListener('input', function(e) {
      var val = parseFloat(e.target.value) / 100;
      if (txtFoldPct) txtFoldPct.textContent = Math.round(val * 100) + '%';
      if (window.PLMStudio) {
        window.PLMStudio.setFoldProgress(val);
      }
    });
  }

  // 5. Botão de Animação de Dobra (Play / Pause)
  if (btnPlayFold) {
    btnPlayFold.addEventListener('click', function() {
      if (isPlayingAnim) {
        clearInterval(animInterval);
        isPlayingAnim = false;
        btnPlayFold.textContent = '▶ Play';
        btnPlayFold.classList.remove('active');
        return;
      }

      isPlayingAnim = true;
      btnPlayFold.textContent = '⏸ Pausa';
      btnPlayFold.classList.add('active');

      var dir = 1;
      var cur = sliderFold ? parseFloat(sliderFold.value) : 100;
      if (cur >= 100) cur = 0;

      animInterval = setInterval(function() {
        cur += dir * 1.5;
        if (cur >= 100) {
          cur = 100;
          dir = -1;
        } else if (cur <= 0) {
          cur = 0;
          dir = 1;
        }

        if (sliderFold) sliderFold.value = cur;
        if (txtFoldPct) txtFoldPct.textContent = Math.round(cur) + '%';
        if (window.PLMStudio) window.PLMStudio.setFoldProgress(cur / 100);
      }, 25);
    });
  }

  // Câmeras Predefinidas
  if (btnViewIso) {
    btnViewIso.addEventListener('click', function() {
      if (window.PLMStudio) window.PLMStudio.setCameraView('iso');
    });
  }
  if (btnViewFront) {
    btnViewFront.addEventListener('click', function() {
      if (window.PLMStudio) window.PLMStudio.setCameraView('front');
    });
  }
  if (btnViewTop) {
    btnViewTop.addEventListener('click', function() {
      if (window.PLMStudio) window.PLMStudio.setCameraView('top');
    });
  }
  if (btnAutoRotate) {
    btnAutoRotate.addEventListener('click', function() {
      if (window.PLMStudio) {
        var isRotating = window.PLMStudio.toggleAutoRotate();
        btnAutoRotate.classList.toggle('active', isRotating);
      }
    });
  }

  // 6. Substratos
  if (btnSubstrateCartao) {
    btnSubstrateCartao.addEventListener('click', function() {
      btnSubstrateCartao.classList.add('active');
      btnSubstrateKraft.classList.remove('active');
      if (window.PLMStudio) window.PLMStudio.setSubstrate('cartao');
    });
  }

  if (btnSubstrateKraft) {
    btnSubstrateKraft.addEventListener('click', function() {
      btnSubstrateKraft.classList.add('active');
      btnSubstrateCartao.classList.remove('active');
      if (window.PLMStudio) window.PLMStudio.setSubstrate('kraft');
    });
  }

  // 6.5. Alternador de Modo de Trabalho (Visualização Externa vs Interna no Illustrator)
  function setWorkMode(mode) {
    var isInner = mode === 'inner';
    if (btnModeOuter && btnModeInner) {
      if (isInner) {
        btnModeInner.className = 'btn-mode active-inner';
        btnModeOuter.className = 'btn-mode';
      } else {
        btnModeOuter.className = 'btn-mode active-outer';
        btnModeInner.className = 'btn-mode';
      }
    }
    setStatus(isInner ? 'Ativando visão da Face Interna no Illustrator...' : 'Ativando visão da Face Externa no Illustrator...');
    cs.evalScript("switchArtworkWorkMode('" + mode + "')", function(resStr) {
      try {
        var res = JSON.parse(resStr);
        if (res.message) setStatus(res.message);
      } catch(e) {}
    });

    if (window.PLMStudio) {
      if (isInner) {
        var curFold = window.PLMStudio.getFoldProgress ? window.PLMStudio.getFoldProgress() : 1;
        if (curFold > 0.45) {
          window.PLMStudio.setFoldProgress(0.35);
          if (sliderFold) sliderFold.value = 35;
          if (txtFoldPct) txtFoldPct.textContent = '35%';
        }
      } else {
        var curFoldOut = window.PLMStudio.getFoldProgress ? window.PLMStudio.getFoldProgress() : 1;
        if (curFoldOut < 0.8) {
          window.PLMStudio.setFoldProgress(1.0);
          if (sliderFold) sliderFold.value = 100;
          if (txtFoldPct) txtFoldPct.textContent = '100%';
        }
      }
    }
  }

  if (btnModeOuter) {
    btnModeOuter.addEventListener('click', function() { setWorkMode('outer'); });
  }
  if (btnModeInner) {
    btnModeInner.addEventListener('click', function() { setWorkMode('inner'); });
  }

  // 7. Botões Separados de Atualização de Arte (Externa e Interna)
  if (btnSyncArtworkOuter) {
    btnSyncArtworkOuter.addEventListener('click', function() { syncArtwork('outer'); });
  }
  if (btnSyncArtworkInner) {
    btnSyncArtworkInner.addEventListener('click', function() { syncArtwork('inner'); });
  }
  if (btnSyncArtwork) {
    btnSyncArtwork.addEventListener('click', function() { syncArtwork('both'); });
  }

  // 8. Botão Atualizar Faca no Documento Illustrator
  if (btnUpdateDieline) {
    btnUpdateDieline.addEventListener('click', function() {
      if (!currentProject) {
        setStatus('Aviso: Nenhum projeto ativo para atualizar faca.');
        return;
      }

      setStatus('Solicitando script de faca à Bridge...');
      fetch(BRIDGE_URL + '/api/request-geometry')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (!data || !data.jsx) {
            setStatus('Aviso: Nenhuma faca ativa.');
            return;
          }
          setStatus('Reconstruindo faca no Illustrator...');
          cs.evalScript(data.jsx, function(resStr) {
            try {
              var res = JSON.parse(resStr);
              if (res && res.error) {
                setStatus('Erro ExtendScript: ' + res.error);
              } else {
                setStatus('Faca atualizada com sucesso no Illustrator!');
              }
            } catch(e) {
              setStatus('Faca sincronizada.');
            }
          });
        })
        .catch(function(err) {
          setStatus('Erro ao comunicar com a Bridge: ' + err.message);
        });
    });
  }

  // 9. Abrir Web
  function openWeb() {
    cs.openURLInDefaultBrowser(WEB_URL);
  }

  if (btnOpenWeb) {
    btnOpenWeb.addEventListener('click', openWeb);
  }
  if (btnOpenWebEmpty) {
    btnOpenWebEmpty.addEventListener('click', openWeb);
  }

  // 10. Botão Zerar Estúdio
  var isClearing = false;
  if (btnClearStudio) {
    btnClearStudio.addEventListener('click', function() {
      if (isClearing) return;
      isClearing = true;
      currentProject = null;
      lastLoadedArtworkUri = null;
      artVersion = 0;
      fetch(BRIDGE_URL + '/api/clear', { method: 'POST' })
        .then(function() { isClearing = false; })
        .catch(function() { isClearing = false; });
      try {
        if (window.PLMStudio && typeof window.PLMStudio.clearModel === 'function') {
          window.PLMStudio.clearModel();
        }
      } catch (e) {
        console.error('Erro ao limpar modelo 3D:', e);
      }
      setEmptyState(true, 'Estúdio zerado. Aguardando novo projeto da Web.');
    });
  }

  // 11. Polling de status e sincronização automática
  function checkBridge() {
    if (isClearing) return;
    fetch(BRIDGE_URL + '/api/status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (isClearing) return;
        if (data && data.activeProject) {
          setOnline(true);
          if (!currentProject || currentProject.projectId !== data.activeProject) {
            fetchProjectGeometry();
          }
        } else {
          // Nenhum projeto ativo enviado pela Web: permanece OFFLINE
          if (!currentProject) {
            setOnline(false);
          } else {
            // Projeto foi limpo na bridge
            if (window.PLMStudio) window.PLMStudio.clearModel();
            setEmptyState(true);
          }
        }
        if (data && data.latestArtworkDataUri && data.latestArtworkDataUri !== lastLoadedArtworkUri) {
          lastLoadedArtworkUri = data.latestArtworkDataUri;
          if (window.PLMStudio) {
            window.PLMStudio.updateArtwork(data.latestArtworkDataUri);
          }
        }
      })
      .catch(function() {
        if (!currentProject) {
          setOnline(false);
        }
      });
  }

  checkBridge();
  pollInterval = setInterval(checkBridge, 2500);
})();
