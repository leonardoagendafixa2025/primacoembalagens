// Script ExtendScript de apoio à extensão CEP PLMPackLib
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

function exportArtworkFromIllustrator() {
  try {
    if (app.documents.length === 0) {
      return JSON.stringify({ error: "Nenhum documento aberto no Illustrator." });
    }

  var doc = app.activeDocument;
  var layerArte = null;

  try {
    layerArte = doc.layers.getByName("PLMPACKLIB_ARTE");
  } catch(e) {
    return JSON.stringify({ error: "Camada PLMPACKLIB_ARTE não encontrada no documento ativo." });
  }

  // Oculta temporariamente todas as camadas técnicas
  var layersVisibility = [];
  for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    layersVisibility.push({ layer: l, visible: l.visible });
    if (l.name !== "PLMPACKLIB_ARTE") {
      l.visible = false;
    } else {
      l.visible = true;
    }
  }

  var exportOptions = new ExportOptionsPNG24();
  exportOptions.antiAliasing = true;
  exportOptions.transparency = true;
  exportOptions.artBoardClipping = true;
  exportOptions.horizontalScale = 416.666; // 300 DPI
  exportOptions.verticalScale = 416.666;

  var tempFolder = Folder.temp;
  var destFile = new File(tempFolder.fsName + "/plmpack_cep_artwork.png");
  doc.exportFile(destFile, ExportType.PNG24, exportOptions);

  // Restaura visibilidade das camadas técnicas
  for (var j = 0; j < layersVisibility.length; j++) {
    layersVisibility[j].layer.visible = layersVisibility[j].visible;
  }

  return JSON.stringify({
    success: true,
    filePath: destFile.fsName
  });
} catch(err) {
  return JSON.stringify({ error: "Erro na exportação da arte: " + err.message + " (linha " + err.line + ")" });
}
}

