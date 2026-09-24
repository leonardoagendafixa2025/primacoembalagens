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

function cleanLayerName(str) {
  if (!str) return "";
  var s = ("" + str).toUpperCase().replace(/[\s_\-]+/g, "");
  s = s.replace(/[ÁÀÃÂÄ]/g, "A")
       .replace(/[ÉÈÊË]/g, "E")
       .replace(/[ÍÌÎÏ]/g, "I")
       .replace(/[ÓÒÕÔÖ]/g, "O")
       .replace(/[ÚÙÛÜ]/g, "U")
       .replace(/Ç/g, "C");
  return s;
}

function isTechnicalLayer(layerName) {
  if (!layerName) return false;
  var n = cleanLayerName(layerName);
  var techKeywords = [
    "CUT", "CORTE", "CREASE", "VINCO", "PERF", "PICOTE",
    "GUIDESINFO", "GUIDES", "GUIAS", "COTAS", "INFO",
    "DIMENSIONS", "DIMENSOES", "FACATECNICA"
  ];
  for (var i = 0; i < techKeywords.length; i++) {
    if (n === techKeywords[i]) return true;
    if (n.indexOf(techKeywords[i]) !== -1) {
      if (n.indexOf("ARTE") === -1 && n.indexOf("ARTWORK") === -1) {
        return true;
      }
    }
  }
  return false;
}

function isInnerLayer(layerName) {
  if (!layerName) return false;
  var n = cleanLayerName(layerName);

  // Palavras-chave completas ou parciais para arte interna
  if (n.indexOf("INTERIOR") !== -1) return true;
  if (n.indexOf("INTERN") !== -1) return true;
  if (n.indexOf("VERSO") !== -1) return true;
  if (n.indexOf("INNER") !== -1) return true;
  if (n.indexOf("INSIDE") !== -1) return true;
  if (n.indexOf("DENTRO") !== -1) return true;
  if (n.indexOf("FUNDO") !== -1 && n.indexOf("ARTE") !== -1) return true;

  var exactList = [
    "ARTWORKINTERNA", "ARTEINTERNA", "ARTWORKINNER", "INNERARTWORK", "VERSO",
    "INTERIOR", "ARTEINTERIOR", "ARTWORKINTERIOR", "INTERNA", "INTERNO",
    "ARTEVERSO", "VERSOARTE", "INNER", "INSIDE", "INSIDEARTWORK", "ARTWORKINSIDE"
  ];
  for (var i = 0; i < exactList.length; i++) {
    if (n === exactList[i]) return true;
  }

  return false;
}

function countItemsRecursive(layer) {
  var count = 0;
  try {
    if (layer.pageItems) count += layer.pageItems.length;
  } catch(e) {}
  try {
    if (layer.layers) {
      for (var k = 0; k < layer.layers.length; k++) {
        count += countItemsRecursive(layer.layers[k]);
      }
    }
  } catch(eSub) {}
  return count;
}

function setLayerStateRecursive(layer, vis, unlk, stateList) {
  try {
    if (stateList) {
      stateList.push({ layer: layer, visible: layer.visible, locked: layer.locked });
    }
    layer.visible = vis;
    if (unlk) layer.locked = false;
  } catch(e) {}
  try {
    if (layer.layers) {
      for (var k = 0; k < layer.layers.length; k++) {
        setLayerStateRecursive(layer.layers[k], vis, unlk, stateList);
      }
    }
  } catch(eSub) {}
}

function exportSingleArtworkSide(side) {
  if (app.documents.length === 0) {
    return { error: "Nenhum documento aberto no Illustrator." };
  }

  var doc = app.activeDocument;
  var sideName = (side || "outer").toLowerCase();
  var isInner = (sideName === "inner" || sideName === "interna" || sideName === "inside" || sideName === "interior");

  // Salva visibilidade e estado de bloqueio original de todas as camadas e sub-camadas
  var layersState = [];
  var visibleItemsCount = 0;
  var matchedLayerCount = 0;

  for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    var lName = l.name || "";
    var origVis = l.visible;
    var origLock = l.locked;

    layersState.push({ layer: l, visible: origVis, locked: origLock });

    if (isInner) {
      // Para a face interna: exibe camadas identificadas como internas (e suas sub-camadas)
      if (isInnerLayer(lName)) {
        matchedLayerCount++;
        setLayerStateRecursive(l, true, true, layersState);
        visibleItemsCount += countItemsRecursive(l);
      } else {
        l.visible = false;
      }
    } else {
      // Para a face externa: oculta camadas técnicas e camadas internas
      if (isTechnicalLayer(lName) || isInnerLayer(lName)) {
        l.visible = false;
      } else {
        // Camadas de arte externa e personalizadas permanecem visíveis
        matchedLayerCount++;
        setLayerStateRecursive(l, true, true, layersState);
        visibleItemsCount += countItemsRecursive(l);
      }
    }
  }

  // Se for busca de interna e nenhuma camada interna existir ou estiver sem objetos:
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
      layerFound: matchedLayerCount > 0,
      filePath: null,
      hasVector: false,
      vectorSvg: "",
      message: isInner
        ? (matchedLayerCount === 0
            ? "Nenhuma camada de arte interna identificada. Crie uma camada chamada 'ARTWORK_INTERNA' ou 'INTERIOR'."
            : "Camada de arte interna encontrada, mas está vazia sem desenhos.")
        : "Nenhuma arte externa encontrada."
    };
  }

  // Suporte a seleção de Prancheta (Artboard): Se houver prancheta específica para o verso
  var origArtboardIdx = doc.artboards.getActiveArtboardIndex();
  var targetArtboardIdx = origArtboardIdx;
  if (doc.artboards.length > 1) {
    for (var a = 0; a < doc.artboards.length; a++) {
      var abName = cleanLayerName(doc.artboards[a].name || "");
      if (isInner) {
        if (abName.indexOf("VERSO") !== -1 || abName.indexOf("INTERN") !== -1 || abName.indexOf("INTERIOR") !== -1 || abName.indexOf("BACK") !== -1) {
          targetArtboardIdx = a;
          break;
        }
      } else {
        if (abName.indexOf("FRENTE") !== -1 || abName.indexOf("EXTERN") !== -1 || abName.indexOf("EXTERIOR") !== -1 || abName.indexOf("FRONT") !== -1) {
          targetArtboardIdx = a;
          break;
        }
      }
    }
    // Se não tiver nome específico mas houver 2 pranchetas: 0=Frente, 1=Verso
    if (doc.artboards.length === 2 && targetArtboardIdx === origArtboardIdx) {
      targetArtboardIdx = isInner ? 1 : 0;
    }
  }

  try {
    doc.artboards.setActiveArtboardIndex(targetArtboardIdx);
  } catch(eAb) {}

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
    // Restaura a prancheta ativa original
    try { doc.artboards.setActiveArtboardIndex(origArtboardIdx); } catch(eAbR) {}

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
    layerFound: true,
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
