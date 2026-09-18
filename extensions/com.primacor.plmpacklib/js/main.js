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
  var elVersion = document.getElementById('txtVersion');
  var elEmptyState = document.getElementById('emptyStateOverlay');

  var sliderFold = document.getElementById('sliderFold');
  var txtFoldPct = document.getElementById('txtFoldPct');
  var btnPlayFold = document.getElementById('btnPlayFold');

  var btnSyncArtwork = document.getElementById('btnSyncArtwork');
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
  var artVersion = 0;
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
      artVersion = 0;
      if (elVersion) elVersion.textContent = 'Arte: v0';

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
      if (sliderFold) sliderFold.disabled = true;
      if (btnPlayFold) btnPlayFold.disabled = true;
      if (btnUpdateDieline) btnUpdateDieline.disabled = true;

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
      if (sliderFold) sliderFold.disabled = false;
      if (btnPlayFold) btnPlayFold.disabled = false;
      if (btnUpdateDieline) btnUpdateDieline.disabled = false;
    }
  }

  // 1. Inicializa o Estúdio 3D (começa ZERADO sem malha carregada)
  var container = document.getElementById('studioCanvas');
  if (window.PLMStudio && container) {
    window.PLMStudio.init(container);
  }

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

        currentProject = data.project;
        setEmptyState(false);

        if (elModelTag) {
          elModelTag.textContent = data.project.modelCode || data.project.modelName || 'EMBALAGEM';
        }

        if (window.PLMStudio) {
          window.PLMStudio.loadModel(data.project);
          var artUri = (data.project.artwork && data.project.artwork.textureDataUri) || lastLoadedArtworkUri;
          if (artUri) {
            window.PLMStudio.updateArtwork(artUri);
          }
          setStatus('Modelo ' + (data.project.modelCode || '') + ' carregado com sucesso no 3D.');
        }
      })
      .catch(function(e) {
        setEmptyState(true, 'Aguardando conexão com a Bridge PLMPackLib...');
      });
  }

  // 3. Captura de Arte do Illustrator e Projeção no 3D
  function syncArtwork() {
    if (!currentProject) {
      setStatus('Nenhum modelo 3D carregado para aplicar arte.');
      return;
    }

    setStatus('Capturando camada de arte do Illustrator...');
    btnSyncArtwork.disabled = true;
    btnSyncArtwork.style.opacity = '0.7';

    cs.evalScript('exportArtworkFromIllustrator()', function(resStr) {
      btnSyncArtwork.disabled = false;
      btnSyncArtwork.style.opacity = '1';

      try {
        var res = JSON.parse(resStr);
        if (res.error) {
          setStatus('Erro no Illustrator: ' + res.error);
          return;
        }

        if (!res.filePath) {
          setStatus('Arquivo de arte não gerado.');
          return;
        }

        // Leitura rápida via Node.js embutido no CEP
        var dataUri = null;
        try {
          if (typeof require === 'function') {
            var fs = require('fs');
            if (fs.existsSync(res.filePath)) {
              var buf = fs.readFileSync(res.filePath);
              dataUri = 'data:image/png;base64,' + buf.toString('base64');
            }
          }
        } catch(nodeErr) {
          console.warn('Node.js fs indisponível, usando fallback cep:', nodeErr);
        }

        // Fallback CSInterface window.cep
        if (!dataUri && window.cep && window.cep.fs) {
          var readRes = window.cep.fs.readFile(res.filePath, window.cep.encoding.Base64);
          if (readRes.err === 0) {
            dataUri = 'data:image/png;base64,' + readRes.data;
          }
        }

        if (!dataUri) {
          setStatus('Não foi possível carregar a imagem exportada.');
          return;
        }

        artVersion++;
        if (elVersion) elVersion.textContent = 'Arte: v' + artVersion;

        // Atualiza imediatamente o Estúdio 3D dentro do Illustrator
        if (window.PLMStudio) {
          window.PLMStudio.updateArtwork(dataUri);
        }

        setStatus('Projetando arte no 3D e sincronizando com a Web...');

        // Envia para a Bridge Server para sincronizar a Web também
        fetch(BRIDGE_URL + '/api/artwork', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: (currentProject && (currentProject.modelId || currentProject.modelCode)) || 'current',
            textureDataUri: dataUri
          })
        })
        .then(function() {
          setStatus('Arte sincronizada no 3D e com a Web!');
        })
        .catch(function(err) {
          console.warn('Erro ao notificar Bridge da nova arte:', err);
          setStatus('Arte aplicada no 3D local com sucesso.');
        });

      } catch (err) {
        setStatus('Erro ao processar arte: ' + err.message);
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

  // 7. Botão Atualizar 3D com Arte
  if (btnSyncArtwork) {
    btnSyncArtwork.addEventListener('click', syncArtwork);
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
  if (btnClearStudio) {
    btnClearStudio.addEventListener('click', function() {
      fetch(BRIDGE_URL + '/api/clear', { method: 'POST' }).catch(function() {});
      if (window.PLMStudio) {
        window.PLMStudio.clearModel();
      }
      setEmptyState(true, 'Estúdio zerado. Aguardando novo projeto da Web.');
    });
  }

  // 11. Polling de status e sincronização automática
  function checkBridge() {
    fetch(BRIDGE_URL + '/api/status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setOnline(true);
        if (data.activeProject) {
          if (!currentProject || currentProject.projectId !== data.activeProject) {
            fetchProjectGeometry();
          }
        } else if (!data.activeProject && currentProject) {
          // Projeto foi limpo na bridge
          if (window.PLMStudio) window.PLMStudio.clearModel();
          setEmptyState(true);
        }
        if (data.latestArtworkDataUri && data.latestArtworkDataUri !== lastLoadedArtworkUri) {
          lastLoadedArtworkUri = data.latestArtworkDataUri;
          if (window.PLMStudio) {
            window.PLMStudio.updateArtwork(data.latestArtworkDataUri);
          }
        }
      })
      .catch(function() {
        setOnline(false);
      });
  }

  checkBridge();
  pollInterval = setInterval(checkBridge, 2500);
})();
