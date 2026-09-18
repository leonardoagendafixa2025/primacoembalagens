// Script ExtendScript de apoio à extensão CEP PLMPackLib
#target illustrator

function exportArtworkFromIllustrator() {
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

  // Restaura visibilidade
  for (var j = 0; j < layersVisibility.length; j++) {
    layersVisibility[j].layer.visible = layersVisibility[j].visible;
  }

  // Lê bytes para base64 se disponível
  destFile.open("r");
  destFile.encoding = "BINARY";
  var binaryData = destFile.read();
  destFile.close();

  // Codificação base64 simples em ExtendScript
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var base64 = "";
  for (var c = 0; c < binaryData.length; c += 3) {
    var b1 = binaryData.charCodeAt(c) & 0xff;
    var b2 = (c + 1 < binaryData.length) ? binaryData.charCodeAt(c + 1) & 0xff : 0;
    var b3 = (c + 2 < binaryData.length) ? binaryData.charCodeAt(c + 2) & 0xff : 0;

    base64 += chars.charAt(b1 >> 2);
    base64 += chars.charAt(((b1 & 3) << 4) | (b2 >> 4));
    base64 += (c + 1 < binaryData.length) ? chars.charAt(((b2 & 15) << 2) | (b3 >> 6)) : "=";
    base64 += (c + 2 < binaryData.length) ? chars.charAt(b3 & 63) : "=";
  }

  return JSON.stringify({
    success: true,
    dataUri: "data:image/png;base64," + base64,
    filePath: destFile.fsName
  });
}
