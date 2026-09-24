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

function switchArtworkWorkMode(side) {
  if (app.documents.length === 0) {
    return JSON.stringify({ error: "Nenhum documento aberto no Illustrator." });
  }

  var doc = app.activeDocument;
  var sideName = (side || "outer").toLowerCase();
  var isInner = (sideName === "inner" || sideName === "interna" || sideName === "inside" || sideName === "interior");

  var targetLayer = null;
  var outerLayers = [];
  var innerLayers = [];
  var techLayers = [];

  for (var i = 0; i < doc.layers.length; i++) {
    var ly = doc.layers[i];
    var lName = ly.name || "";
    if (isTechnicalLayer(lName)) {
      techLayers.push(ly);
    } else if (isInnerLayer(lName)) {
      innerLayers.push(ly);
      if (!targetLayer && isInner) targetLayer = ly;
    } else {
      outerLayers.push(ly);
      if (!targetLayer && !isInner) targetLayer = ly;
    }
  }

  // Se não existir a camada do lado desejado, cria automaticamente
  if (isInner && !targetLayer) {
    try {
      targetLayer = doc.layers.add();
      targetLayer.name = "ARTWORK_INTERNA";
      innerLayers.push(targetLayer);
    } catch(eAddIn) {}
  } else if (!isInner && !targetLayer) {
    try {
      targetLayer = doc.layers.add();
      targetLayer.name = "ARTWORK_EXTERNA";
      outerLayers.push(targetLayer);
    } catch(eAddOut) {}
  }

  // Aplica visibilidade exclusiva:
  // No modo EXTERNO: apenas arte externa e guias da faca ficam visíveis; arte interna fica 100% oculta.
  // No modo INTERNO: apenas arte interna e guias da faca ficam visíveis; arte externa fica 100% oculta.
  for (var o = 0; o < outerLayers.length; o++) {
    try {
      outerLayers[o].visible = !isInner;
      outerLayers[o].locked = isInner;
    } catch(eO) {}
  }

  for (var n = 0; n < innerLayers.length; n++) {
    try {
      innerLayers[n].visible = isInner;
      innerLayers[n].locked = !isInner;
    } catch(eN) {}
  }

  for (var t = 0; t < techLayers.length; t++) {
    try {
      techLayers[t].visible = true; // Linhas de corte e vinco sempre visíveis para o operador
      techLayers[t].locked = true;
    } catch(eT) {}
  }

  if (targetLayer) {
    try { doc.activeLayer = targetLayer; } catch(eAct) {}
  }

  // Se houver 2 pranchetas, foca na prancheta do lado ativo
  if (doc.artboards.length > 1) {
    var targetAb = isInner ? 1 : 0;
    for (var ab = 0; ab < doc.artboards.length; ab++) {
      var abName = cleanLayerName(doc.artboards[ab].name || "");
      if (isInner && (abName.indexOf("VERSO") !== -1 || abName.indexOf("INTERN") !== -1 || abName.indexOf("INTERIOR") !== -1)) {
        targetAb = ab; break;
      } else if (!isInner && (abName.indexOf("FRENTE") !== -1 || abName.indexOf("EXTERN") !== -1 || abName.indexOf("EXTERIOR") !== -1)) {
        targetAb = ab; break;
      }
    }
    try { doc.artboards.setActiveArtboardIndex(targetAb); } catch(eAb) {}
  }

  return JSON.stringify({
    success: true,
    mode: isInner ? "inner" : "outer",
    activeLayerName: targetLayer ? targetLayer.name : (isInner ? "ARTWORK_INTERNA" : "ARTWORK_EXTERNA"),
    message: isInner
      ? "Modo INTERNO ativado: Você está vendo e editando apenas a ARTE INTERNA no Illustrator."
      : "Modo EXTERNO ativado: Você está vendo e editando apenas a ARTE EXTERNA no Illustrator."
  });
}

function exportSingleArtworkSide(side) {
  if (app.documents.length === 0) {
    return { error: "Nenhum documento aberto no Illustrator." };
  }

  var doc = app.activeDocument;
  var sideName = (side || "outer").toLowerCase();
  var isInner = (sideName === "inner" || sideName === "interna" || sideName === "inside" || sideName === "interior");

  // Garante que o documento esteja no modo de trabalho correto antes de exportar
  switchArtworkWorkMode(sideName);

  // Oculta temporariamente camadas técnicas (CUT, CREASE, etc.) para que o PNG gerado contenha PURAMENTE a arte
  var techLayersState = [];
  var visibleItemsCount = 0;
  var matchedLayerCount = 0;

  for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    var lName = l.name || "";

    if (isTechnicalLayer(lName)) {
      techLayersState.push({ layer: l, visible: l.visible });
      l.visible = false;
    } else if (isInner && isInnerLayer(lName)) {
      matchedLayerCount++;
      setLayerStateRecursive(l, true, true, null);
      visibleItemsCount += countItemsRecursive(l);
    } else if (!isInner && !isInnerLayer(lName)) {
      matchedLayerCount++;
      setLayerStateRecursive(l, true, true, null);
      visibleItemsCount += countItemsRecursive(l);
    } else {
      l.visible = false;
    }
  }

  // Se a camada interna ou externa não tiver itens desenhados:
  if (visibleItemsCount === 0) {
    // Restaura a visualização da faca técnica
    for (var r = 0; r < techLayersState.length; r++) {
      try { techLayersState[r].layer.visible = techLayersState[r].visible; } catch(eR) {}
    }
    // Restaura modo exclusivo para o operador poder desenhar
    switchArtworkWorkMode(sideName);

    return {
      success: true,
      empty: true,
      side: isInner ? "inner" : "outer",
      layerFound: matchedLayerCount > 0,
      filePath: null,
      hasVector: false,
      vectorSvg: "",
      message: isInner
        ? "A camada ARTWORK_INTERNA está vazia. Desenhe sua arte no Illustrator e clique em ATUALIZAR ARTE INTERNA."
        : "A camada ARTWORK_EXTERNA está vazia. Desenhe sua arte no Illustrator e clique em ATUALIZAR ARTE EXTERNA."
    };
  }

  // Seleciona a prancheta ativa para exportar
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
    if (doc.artboards.length === 2 && targetArtboardIdx === origArtboardIdx) {
      targetArtboardIdx = isInner ? 1 : 0;
    }
  }

  try { doc.artboards.setActiveArtboardIndex(targetArtboardIdx); } catch(eAb) {}

  var tempFolder = Folder.temp;
  var ts = (new Date()).getTime();
  var fileSuffix = isInner ? "inner" : "outer";
  var destFile = new File(tempFolder.fsName + "/plmpack_cep_artwork_" + fileSuffix + "_" + ts + ".png");

  var exportOptions = new ExportOptionsPNG24();
  exportOptions.antiAliasing = true;
  exportOptions.transparency = true;
  exportOptions.artBoardClipping = true;

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

    // Restaura as camadas técnicas e mantém o modo exclusivo ativo
    for (var j = 0; j < techLayersState.length; j++) {
      try { techLayersState[j].layer.visible = techLayersState[j].visible; } catch(eRestore) {}
    }

    // Garante que o Illustrator permaneça exibindo APENAS a face em que o usuário está trabalhando!
    switchArtworkWorkMode(sideName);
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
