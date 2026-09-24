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

function findLayerByNames(doc, names) {
  for (var i = 0; i < names.length; i++) {
    try {
      var l = doc.layers.getByName(names[i]);
      if (l) return l;
    } catch(e) {}
  }
  return null;
}

function hasLayerAnyContent(layer) {
  if (!layer) return false;
  try {
    if (layer.pageItems && layer.pageItems.length > 0) return true;
    if (layer.layers && layer.layers.length > 0) {
      for (var s = 0; s < layer.layers.length; s++) {
        if (hasLayerAnyContent(layer.layers[s])) return true;
      }
    }
  } catch(e) {}
  return false;
}

function exportSingleArtworkSide(side) {
  if (app.documents.length === 0) {
    return { error: "Nenhum documento aberto no Illustrator." };
  }

  var doc = app.activeDocument;
  var targetLayer = null;
  var sideName = (side || "outer").toLowerCase();
  var isInner = (sideName === "inner" || sideName === "interna" || sideName === "inside");

  if (isInner) {
    targetLayer = findLayerByNames(doc, ["ARTWORK_INTERNA", "ARTE_INTERNA", "ARTWORK_INNER", "ARTE INTERNA", "INNER_ARTWORK"]);
    if (!targetLayer) {
      return { success: true, empty: true, notFound: true, side: "inner", filePath: null };
    }
  } else {
    targetLayer = findLayerByNames(doc, ["ARTWORK_EXTERNA", "ARTWORK", "ARTE_EXTERNA", "PLMPACKLIB_ARTE", "ARTE EXTERNA", "OUTER_ARTWORK"]);
    if (!targetLayer) {
      return { success: true, empty: true, notFound: true, side: "outer", filePath: null };
    }
  }

  // Se a camada de arte estiver vazia (sem nenhum elemento desenhado), retorna imediatamente
  // sem travar o Illustrator nem tentar exportar prancheta em branco
  if (!hasLayerAnyContent(targetLayer)) {
    return {
      success: true,
      empty: true,
      side: isInner ? "inner" : "outer",
      filePath: null,
      hasVector: false,
      vectorSvg: ""
    };
  }

  var wasLocked = targetLayer.locked;
  targetLayer.locked = false;

  // Salva visibilidade original de todas as camadas
  var layersVisibility = [];
  for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    layersVisibility.push({ layer: l, visible: l.visible });
    if (l !== targetLayer) {
      l.visible = false;
    } else {
      l.visible = true;
    }
  }

  var tempFolder = Folder.temp;
  var fileSuffix = isInner ? "inner" : "outer";
  var destFile = new File(tempFolder.fsName + "/plmpack_cep_artwork_" + fileSuffix + ".png");

  // Exportação PNG otimizada para tempo real e alta fidelidade 3D (evita estouro de VRAM e travamentos)
  var exportOptions = new ExportOptionsPNG24();
  exportOptions.antiAliasing = true;
  exportOptions.transparency = true;
  exportOptions.artBoardClipping = true;

  // Resolução calculada: 150 DPI padrão (208.33%) — nítido e super veloz (sub-segundo)
  // Pranchetas muito grandes têm escala ajustada para manter tamanho sob limites de GPU WebGL
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
    try {
      targetLayer.locked = wasLocked;
      for (var j = 0; j < layersVisibility.length; j++) {
        layersVisibility[j].layer.visible = layersVisibility[j].visible;
      }
    } catch(eRestore) {}
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
