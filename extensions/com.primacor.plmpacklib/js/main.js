// Lógica do Painel CEP PLMPackLib para Illustrator 2025
(function() {
  var cs = new CSInterface();
  var BRIDGE_URL = 'http://127.0.0.1:48123';
  var pollInterval = null;

  var elStatusBadge = document.getElementById('statusBadge');
  var elStatusText = document.getElementById('statusText');
  var elProjectName = document.getElementById('txtProjectName');
  var elModelCode = document.getElementById('txtModelCode');
  var elGeomVersion = document.getElementById('txtGeomVersion');
  var elArtVersion = document.getElementById('txtArtVersion');
  var elLog = document.getElementById('logBox');

  function log(msg) {
    elLog.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg + '\n' + elLog.textContent;
  }

  function setOnline(isOnline) {
    if (isOnline) {
      elStatusBadge.className = 'status-badge';
      elStatusText.textContent = 'CONECTADO';
    } else {
      elStatusBadge.className = 'status-badge offline';
      elStatusText.textContent = 'OFFLINE';
    }
  }

  // Verifica status da Bridge Local
  function checkBridge() {
    fetch(BRIDGE_URL + '/api/status')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        setOnline(true);
        if (data.activeProject) {
          elProjectName.textContent = data.activeProject;
        }
      })
      .catch(function() {
        setOnline(false);
      });
  }

  // Exporta a camada de arte através de ExtendScript e envia para a Bridge
  function sendArtwork() {
    log('Exportando camada PLMPACKLIB_ARTE em 300 DPI...');
    
    cs.evalScript('exportArtworkFromIllustrator()', function(resStr) {
      try {
        var res = JSON.parse(resStr);
        if (res.error) {
          log('Erro: ' + res.error);
          return;
        }

        log('Arte exportada! Enviando para o PLMPackLib 3D...');

        fetch(BRIDGE_URL + '/api/artwork', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: elProjectName.textContent,
            textureDataUri: res.dataUri
          })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          log(data.message || 'Arte enviada com sucesso!');
          elArtVersion.textContent = 'v' + (parseInt(elArtVersion.textContent.replace('v', '') || '0') + 1);
        })
        .catch(function(err) {
          log('Falha ao enviar arte para a Bridge: ' + err.message);
        });

      } catch(e) {
        log('Falha ao interpretar resposta do Illustrator: ' + e.message);
      }
    });
  }

  // Listeners dos botões
  document.getElementById('btnSendArtwork').addEventListener('click', sendArtwork);
  
  document.getElementById('btnUpdateDieline').addEventListener('click', function() {
    log('Solicitando atualização da faca ao PLMPackLib...');
    fetch(BRIDGE_URL + '/api/request-geometry', { method: 'POST' })
      .then(function() { log('Faca sincronizada.'); })
      .catch(function(e) { log('Erro: ' + e.message); });
  });

  document.getElementById('btnUpdate3D').addEventListener('click', function() {
    sendArtwork();
  });

  document.getElementById('btnOpenWeb').addEventListener('click', function() {
    cs.openURLInDefaultBrowser('http://localhost:5173');
  });

  // Inicialização
  checkBridge();
  pollInterval = setInterval(checkBridge, 3000);
  log('Painel PLMPackLib CAD Bridge iniciado.');
})();
