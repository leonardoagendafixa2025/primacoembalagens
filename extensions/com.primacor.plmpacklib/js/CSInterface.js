/**
 * Minimal Adobe CSInterface library for CEP 9+ / Illustrator 2025
 */
function CSInterface() {}

CSInterface.prototype.evalScript = function(script, callback) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.evalScript(script, callback);
  } else {
    console.warn('CEP runtime não detectado. Executando em modo de simulação.');
    if (callback) callback('{"error": "CEP não ativo"}');
  }
};

CSInterface.prototype.openURLInDefaultBrowser = function(url) {
  if (window.__adobe_cep__) {
    window.__adobe_cep__.openURLInDefaultBrowser(url);
  } else {
    window.open(url, '_blank');
  }
};

CSInterface.prototype.getHostEnvironment = function() {
  if (window.__adobe_cep__) {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment());
  }
  return { appName: "ILST", appVersion: "29.8.2" };
};
