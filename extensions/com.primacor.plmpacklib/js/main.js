// PLMPackLib Studio 3D - CEP Controller (Esko Studio Style)
(function() {
  var cs = new CSInterface();
  var BRIDGE_URL = 'http://127.0.0.1:48123';
  var pollInterval = null;

  // Elementos da UI
  var elStatusDot = document.getElementById('statusDot');
  var elStatusText = document.getElementById('statusText');
  var elModelTag = document.getElementById('modelTag');
  var elStatusMsg = document.getElementById('txtStatusMsg');
  var elVersion = document.getElementById('txtVersion');

  var sliderFold = document.getElementById('sliderFold');
  var txtFoldPct = document.getElementById('txtFoldPct');
  var btnPlayFold = document.getElementById('btnPlayFold');

  var btnSyncArtwork = document.getElementById('btnSyncArtwork');
  var btnUpdateDieline = document.getElementById('btnUpdateDieline');
  var btnOpenWeb = document.getElementById('btnOpenWeb');

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

  // 1. Inicializa o Estúdio 3D
  var container = document.getElementById('studioCanvas');
  if (window.PLMStudio && container) {
    window.PLMStudio.init(container);
    setStatus('Estúdio 3D pronto para visualização.');
  }

  var lastLoadedArtworkUri = null;

  // 2. Carrega ou Atualiza Modelo 3D a partir da Bridge
  function fetchProjectGeometry() {
    fetch(BRIDGE_URL + '/api/request-geometry')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.project) return;
        currentProject = data.project;

        if (elModelTag) {
          elModelTag.textContent = data.project.modelCode || data.project.modelName || 'EMBALAGEM';
        }

        if (window.PLMStudio) {
          window.PLMStudio.loadModel(data.project);
          var artUri = (data.project.artwork && data.project.artwork.textureDataUri) || lastLoadedArtworkUri;
          if (artUri) {
            window.PLMStudio.updateArtwork(artUri);
          }
          setStatus('Modelo ' + (data.project.modelCode || '') + ' carregado no 3D.');
        }
      })
      .catch(function(e) {
        setStatus('Aguardando ponte PLMPackLib: ' + e.message);
      });
  }

  // Carrega imediatamente ao abrir o painel
  fetchProjectGeometry();

  // 3. Captura Rápida e Fotorrealista de Arte do Illustrator e Projeção no 3D
  function syncArtwork() {
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

        // Atualiza imediatamente o Estúdio 3D dentro do Illustrator!
        if (window.PLMStudio) {
          window.PLMStudio.updateArtwork(dataUri);
        }

        setStatus('Projetando arte no 3D e sincronizando Web...');

        // Envia para a Bridge Server para atualizar a Web ao mesmo tempo!
        fetch(BRIDGE_URL + '/api/artwork', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: (currentProject && currentProject.projectId) || 'active',
            textureDataUri: dataUri
          })
        })
        .then(function() {
          setStatus('Arte aplicada no 3D e sincronizada com sucesso!');
        })
        .catch(function(err) {
          setStatus('Arte aplicada no 3D local. Aviso Web: ' + err.message);
        });

      } catch(e) {
        setStatus('Erro ao processar arte: ' + e.message);
      }
    });
  }

  // 4. Controle de Dobra (Slider & Animação)
  if (sliderFold) {
    sliderFold.addEventListener('input', function(e) {
      var pct = parseInt(e.target.value, 10);
      if (txtFoldPct) txtFoldPct.textContent = pct + '%';
      if (window.PLMStudio) {
        window.PLMStudio.setFoldProgress(pct / 100);
      }
    });
  }

  if (btnPlayFold) {
    btnPlayFold.addEventListener('click', function() {
      if (isPlayingAnim) {
        clearInterval(animInterval);
        isPlayingAnim = false;
        btnPlayFold.textContent = '▶ Play';
        return;
      }

      isPlayingAnim = true;
      btnPlayFold.textContent = '⏸ Pausar';

      var direction = -1; // Começa abrindo
      animInterval = setInterval(function() {
        var current = parseInt(sliderFold.value, 10);
        var next = current + (direction * 2);

        if (next <= 0) {
          next = 0;
          direction = 1; // Volta a fechar
        } else if (next >= 100) {
          next = 100;
          direction = -1; // Volta a abrir
        }

        sliderFold.value = next;
        if (txtFoldPct) txtFoldPct.textContent = next + '%';
        if (window.PLMStudio) {
          window.PLMStudio.setFoldProgress(next / 100);
        }
      }, 30);
    });
  }

  // 5. Câmeras & Vistas
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
        var r = window.PLMStudio.toggleAutoRotate();
        btnAutoRotate.classList.toggle('active', r);
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
  if (btnOpenWeb) {
    btnOpenWeb.addEventListener('click', function() {
      cs.openURLInDefaultBrowser('http://localhost:5173');
    });
  }

  // 10. Polling de status e sincronização automática
  function checkBridge() {
    fetch(BRIDGE_URL + '/api/status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        setOnline(true);
        if (data.activeProject) {
          if (!currentProject || currentProject.projectId !== data.activeProject) {
            fetchProjectGeometry();
          }
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
