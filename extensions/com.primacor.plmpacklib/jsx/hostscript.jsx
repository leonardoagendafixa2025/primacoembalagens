// Script ExtendScript de apoio à extensão CEP PRIMACOR EMBALAGENS
// Suporte completo a Arte Externa (Outer) e Arte Interna (Inner)
#target illustrator

if (typeof JSON !== "object") {
  JSON = {
    stringify: function(o) {
      if (o === null) return "null";
      if (typeof o === "number" || typeof o === "boolean") return "" + o;
      if (typeof o === "string") return "\"" + o.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n").replace(/\r/g, "\\r") + "\"";
      if (o instanceof Array) {
        var a = [];
        for (var i = 0; i < o.length; i++) a.push(JSON.stringify(o[i]));
        return "[" + a.join(",") + "]";
      }
      if (typeof o === "object") {
        var p = [];
        for (var k in o) {
          if (o.hasOwnProperty(k)) p.push("\"" + k + "\":" + JSON.stringify(o[k]));
        }
        return "{" + p.join(",") + "}";
      }
      return "null";
    },
    parse: function(s) { return eval("(" + s + ")"); }
  };
}

function isTechnicalLayer(layerName) {
  if (!layerName) return false;
  var n = layerName.toUpperCase().replace(/[\s_\-]+/g, "");
  var techNames = ["CUT", "CORTE", "CREASE", "VINCO", "PERF", "PICOTE", "GUIDESINFO", "GUIDES", "GUIAS", "COTAS", "INFO", "DIMENSIONS", "DIMENSOES"];
  for (var i = 0; i < techNames.length; i++) {
    if (n === techNames[i]) return true;
  }
  return false;
}

function isInnerLayer(layerName) {
  if (!layerName) return false;
  var n = layerName.toUpperCase().replace(/[\s_\-]+/g, "");
  var innerNames = ["ARTWORKINTERNA", "ARTEINTERNA", "ARTWORKINNER", "INNERARTWORK", "VERSO"];
  for (var i = 0; i < innerNames.length; i++) {
    if (n === innerNames[i]) return true;
  }
  return false;
}

function exportSingleArtworkSide(side) {
  if (app.documents.length === 0) {
    return { error: "Nenhum documento aberto no Illustrator." };
  }

  var doc = app.activeDocument;
  var sideName = (side || "outer").toLowerCase();
  var isInner = (sideName === "inner" || sideName === "interna" || sideName === "inside");

  // Salva visibilidade e estado de bloqueio original de todas as camadas
  var layersState = [];
  var visibleItemsCount = 0;

  for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    var lName = l.name || "";
    var origVis = l.visible;
    var origLock = l.locked;

    layersState.push({ layer: l, visible: origVis, locked: origLock });

    if (isInner) {
      // Para a face interna, exibe apenas camadas identificadas como internas
      if (isInnerLayer(lName)) {
        l.visible = true;
        l.locked = false;
        try { if (l.pageItems) visibleItemsCount += l.pageItems.length; } catch(eItem) {}
      } else {
        l.visible = false;
      }
    } else {
      // Para a face externa, oculta camadas técnicas (CUT, CREASE, etc.) e oculta a face interna
      if (isTechnicalLayer(lName) || isInnerLayer(lName)) {
        l.visible = false;
      } else {
        // Camadas de arte externa e personalizadas permanecem visíveis
        l.visible = true;
        l.locked = false;
        try { if (l.pageItems) visibleItemsCount += l.pageItems.length; } catch(eItem2) {}
      }
    }
  }

  // Se não houver nenhum objeto nas camadas selecionadas, retorna imediatamente
  // evitando travar o Illustrator ou disparar erro de exportação de prancheta vazia
  if (visibleItemsCount === 0) {
    // Restaura o estado das camadas antes de sair
    for (var r = 0; r < layersState.length; r++) {
      try {
        layersState[r].layer.visible = layersState[r].visible;
        layersState[r].layer.locked = layersState[r].locked;
      } catch(eR) {}
    }
    return {
      success: true,
      empty: true,
      side: isInner ? "inner" : "outer",
      filePath: null,
      hasVector: false,
      vectorSvg: ""
    };
  }

  var tempFolder = Folder.temp;
  var ts = (new Date()).getTime();
  var fileSuffix = isInner ? "inner" : "outer";
  var destFile = new File(tempFolder.fsName + "/plmpack_cep_artwork_" + fileSuffix + "_" + ts + ".png");

  // Exportação PNG otimizada para tempo real e alta fidelidade 3D (evita estouro de VRAM e travamentos)
  var exportOptions = new ExportOptionsPNG24();
  exportOptions.antiAliasing = true;
  exportOptions.transparency = true;
  exportOptions.artBoardClipping = true;

  // Resolução calculada: 150 DPI padrão (208.33%) — nítido e super veloz (sub-segundo)
  // Pranchetas gigantes têm escala ajustada para manter tamanho sob limites de GPU WebGL
  var maxPt = Math.max(doc.width, doc.height);
  var targetDpi = 150;
  if (maxPt > 2800) {
    targetDpi = 96;
  } else if (maxPt < 1000) {
    targetDpi = 180;
  }
  var scaleFactor = (targetDpi / 72.0) * 100.0;
  exportOptions.horizontalScale = scaleFactor;
  exportOptions.verticalScale = scaleFactor;

  var exportSuccess = false;
  var exportError = null;

  try {
    if (destFile.exists) {
      try { destFile.remove(); } catch(eDel) {}
    }
    doc.exportFile(destFile, ExportType.PNG24, exportOptions);
    exportSuccess = destFile.exists && destFile.length > 0;
  } catch(eExp) {
    exportError = eExp.message;
    exportSuccess = false;
  } finally {
    // SEMPRE restaura a visibilidade e o bloqueio originais das camadas no documento!
    for (var j = 0; j < layersState.length; j++) {
      try {
        layersState[j].layer.visible = layersState[j].visible;
        layersState[j].layer.locked = layersState[j].locked;
      } catch(eRestore) {}
    }
  }

  if (!exportSuccess) {
    return {
      success: false,
      error: exportError || "Falha ao gerar arquivo de imagem da arte.",
      side: isInner ? "inner" : "outer"
    };
  }

  return {
    success: true,
    empty: false,
    side: isInner ? "inner" : "outer",
    hasVector: false,
    vectorSvg: "",
    filePath: destFile.fsName
  };
}

function exportArtworkFromIllustrator(side) {
  try {
    var res = exportSingleArtworkSide(side);
    return JSON.stringify(res);
  } catch(err) {
    return JSON.stringify({ error: "Erro na exportação da arte: " + err.message + " (linha " + err.line + ")" });
  }
}

function exportBothArtworksFromIllustrator() {
  try {
    if (app.documents.length === 0) {
      return JSON.stringify({ error: "Nenhum documento aberto no Illustrator." });
    }

    var outerRes = exportSingleArtworkSide("outer");
    var innerRes = exportSingleArtworkSide("inner");

    return JSON.stringify({
      success: true,
      outer: outerRes,
      inner: innerRes
    });
  } catch(err) {
    return JSON.stringify({ error: "Erro na exportação de ambas as artes: " + err.message + " (linha " + err.line + ")" });
  }
}
