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

function exportSingleArtworkSide(side) {
  if (app.documents.length === 0) {
    return { error: "Nenhum documento aberto no Illustrator." };
  }

  var doc = app.activeDocument;
  var targetLayer = null;
  var sideName = (side || "outer").toLowerCase();

  if (sideName === "inner" || sideName === "interna" || sideName === "inside") {
    targetLayer = findLayerByNames(doc, ["ARTWORK_INTERNA", "ARTE_INTERNA", "ARTWORK_INNER", "ARTE INTERNA", "INNER_ARTWORK"]);
    if (!targetLayer) {
      return { error: "Camada ARTWORK_INTERNA não encontrada no documento ativo.", notFound: true, side: "inner" };
    }
  } else {
    targetLayer = findLayerByNames(doc, ["ARTWORK_EXTERNA", "ARTWORK", "ARTE_EXTERNA", "PLMPACKLIB_ARTE", "ARTE EXTERNA", "OUTER_ARTWORK"]);
    if (!targetLayer) {
      return { error: "Camada ARTWORK_EXTERNA (ou ARTWORK) não encontrada no documento ativo.", notFound: true, side: "outer" };
    }
  }

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
  var fileSuffix = (sideName === "inner" || sideName === "interna" || sideName === "inside") ? "inner" : "outer";

  // 1. Exportação SVG Vetorial
  var svgOptions = new ExportOptionsSVG();
  svgOptions.embedRasterImages = true;
  svgOptions.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;
  svgOptions.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;
  try { svgOptions.coordinatePrecision = 4; } catch(e) {}

  var destSvgFile = new File(tempFolder.fsName + "/plmpack_cep_artwork_" + fileSuffix + ".svg");
  var hasVector = false;
  var vectorSvg = "";
  try {
    doc.exportFile(destSvgFile, ExportType.SVG, svgOptions);
    if (destSvgFile.exists && destSvgFile.length > 0) {
      destSvgFile.open("r");
      vectorSvg = destSvgFile.read();
      destSvgFile.close();
      if (vectorSvg && vectorSvg.length > 30) {
        hasVector = true;
      }
    }
  } catch(eSvg) {
    hasVector = false;
  }

  // 2. Exportação PNG 300 DPI
  var exportOptions = new ExportOptionsPNG24();
  exportOptions.antiAliasing = true;
  exportOptions.transparency = true;
  exportOptions.artBoardClipping = true;
  exportOptions.horizontalScale = 416.666; // 300 DPI
  exportOptions.verticalScale = 416.666;

  var destFile = new File(tempFolder.fsName + "/plmpack_cep_artwork_" + fileSuffix + ".png");
  doc.exportFile(destFile, ExportType.PNG24, exportOptions);

  // Restaura visibilidade das camadas
  for (var j = 0; j < layersVisibility.length; j++) {
    layersVisibility[j].layer.visible = layersVisibility[j].visible;
  }

  return {
    success: true,
    side: (sideName === "inner" || sideName === "interna" || sideName === "inside") ? "inner" : "outer",
    hasVector: hasVector,
    vectorSvg: vectorSvg,
    svgFilePath: destSvgFile.fsName,
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
