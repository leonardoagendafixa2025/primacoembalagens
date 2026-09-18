import type { PLMPackProjectExchange } from './projectExchange';

/**
 * Compilador de script ExtendScript (.jsx) oficial para Adobe Illustrator 2025.
 * Gera documentos vetoriais em escala métrica 1:1, camadas técnicas separadas e
 * canais de cor Spot (Corte e Vinco) com metadados para cada painel.
 */
export function generateIllustratorJsx(project: PLMPackProjectExchange): string {
  const jsonPayload = JSON.stringify(project);

  return `// PLMPackLib Oficial Bridge Script para Adobe Illustrator 2025
// Gerado automaticamente pelo motor CAD PLMPackLib
#target illustrator

(function() {
  var projectData = ${jsonPayload};

  var MM_TO_PT = 72.0 / 25.4; // 2.83464567 pt por mm
  var MARGIN_MM = 15.0; // Margem de respiro ao redor da faca

  var bounds = projectData.dieline.bounds;
  var dielineWidthMm = bounds.width;
  var dielineHeightMm = bounds.height;

  var artboardWidthMm = dielineWidthMm + (MARGIN_MM * 2.0);
  var artboardHeightMm = dielineHeightMm + (MARGIN_MM * 2.0);

  var artboardWidthPt = artboardWidthMm * MM_TO_PT;
  var artboardHeightPt = artboardHeightMm * MM_TO_PT;

  // Origem para centralizar a faca dentro da prancheta
  var originXMm = MARGIN_MM - bounds.minX;
  var originYMm = MARGIN_MM - bounds.minY;

  function toPtX(xMm) {
    return (xMm + originXMm) * MM_TO_PT;
  }

  function toPtY(yMm) {
    // No Illustrator, Y cresce para cima a partir da base inferior
    return (yMm + originYMm) * MM_TO_PT;
  }

  // 1. Obter documento existente ou criar novo
  var doc = null;
  var isUpdate = false;

  for (var i = 0; i < app.documents.length; i++) {
    var d = app.documents[i];
    if (d.name.indexOf(projectData.projectId) !== -1 || (d.XMPString && d.XMPString.indexOf(projectData.projectId) !== -1)) {
      doc = d;
      isUpdate = true;
      break;
    }
  }

  if (!doc) {
    // Cria novo documento CMYK
    var docPreset = new DocumentPreset();
    docPreset.title = projectData.projectName + "_" + projectData.projectId;
    docPreset.width = artboardWidthPt;
    docPreset.height = artboardHeightPt;
    docPreset.colorMode = DocumentColorSpace.CMYK;
    docPreset.units = RulerUnits.Millimeters;
    docPreset.rasterResolution = DocumentRasterResolution.HighResolution;

    doc = app.documents.addDocument(DocumentColorSpace.CMYK, docPreset);
  } else {
    // Atualização de prancheta existente
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    ab.artboardRect = [0, artboardHeightPt, artboardWidthPt, 0];
  }

  app.activeDocument = doc;

  // 2. Criação ou recuperação de Tintas Especiais (Spot Colors) para Facaria
  function getOrCreateSpotColor(name, c, m, y, k) {
    try {
      var spot = doc.spots.getByName(name);
      return spot.color;
    } catch(e) {
      var newSpot = doc.spots.add();
      newSpot.name = name;
      newSpot.colorType = ColorModel.SPOT;
      var cmyk = new CMYKColor();
      cmyk.cyan = c;
      cmyk.magenta = m;
      cmyk.yellow = y;
      cmyk.black = k;
      newSpot.color = cmyk;
      var sc = new SpotColor();
      sc.spot = newSpot;
      sc.tint = 100;
      return sc;
    }
  }

  var cutSpotColor = getOrCreateSpotColor("Corte", 0, 100, 100, 0); // Vermelho faca
  var creaseSpotColor = getOrCreateSpotColor("Vinco", 100, 0, 30, 0); // Verde-água vinco

  var cmykCotas = new CMYKColor();
  cmykCotas.cyan = 0; cmykCotas.magenta = 40; cmykCotas.yellow = 100; cmykCotas.black = 0; // Âmbar cotas

  var cmykSangria = new CMYKColor();
  cmykSangria.cyan = 80; cmykSangria.magenta = 0; cmykSangria.yellow = 80; cmykSangria.black = 0; // Verde sangria

  // 3. Gerenciamento de Camadas (Sincronização Segura que Preserva a Arte)
  function getOrCreateLayer(name) {
    try {
      return doc.layers.getByName(name);
    } catch(e) {
      var l = doc.layers.add();
      l.name = name;
      return l;
    }
  }

  // Camadas de facaria
  var layerArte = getOrCreateLayer("PLMPACKLIB_ARTE");
  layerArte.locked = false;
  layerArte.printable = true;

  var layerCorte = getOrCreateLayer("PLMPACKLIB_CORTE");
  var layerVinco = getOrCreateLayer("PLMPACKLIB_VINCO");
  var layerPaineis = getOrCreateLayer("PLMPACKLIB_PAINEIS");
  var layerCotas = getOrCreateLayer("PLMPACKLIB_COTAS");
  var layerRef = getOrCreateLayer("PLMPACKLIB_REFERENCIA");

  // Limpa apenas as camadas técnicas de geometria ao sincronizar, NUNCA a camada de arte!
  var layersToClean = [layerCorte, layerVinco, layerPaineis, layerCotas, layerRef];
  for (var li = 0; li < layersToClean.length; li++) {
    layersToClean[li].locked = false;
    layersToClean[li].hasSelectedArtwork = true;
    for (var pi = layersToClean[li].pageItems.length - 1; pi >= 0; pi--) {
      layersToClean[li].pageItems[pi].remove();
    }
  }

  // 4. Desenhar Linhas Vetoriais da Faca
  var lines = projectData.dieline.lines;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var p1x = toPtX(l.x1);
    var p1y = toPtY(l.y1);
    var p2x = toPtX(l.x2);
    var p2y = toPtY(l.y2);

    var targetLayer = layerCorte;
    var strokeColor = cutSpotColor;
    var isDashed = false;

    if (l.type === 'crease') {
      targetLayer = layerVinco;
      strokeColor = creaseSpotColor;
      isDashed = true;
    } else if (l.type === 'dimension') {
      targetLayer = layerCotas;
      strokeColor = cmykCotas;
    } else if (l.type === 'bleed') {
      targetLayer = layerRef;
      strokeColor = cmykSangria;
      isDashed = true;
    }

    var path = targetLayer.pathItems.add();
    path.setEntirePath([[p1x, p1y], [p2x, p2y]]);
    path.filled = false;
    path.stroked = true;
    path.strokeColor = strokeColor;
    path.strokeWidth = 0.5 * MM_TO_PT; // 0.5 mm

    if (isDashed) {
      path.strokeDashes = [4 * MM_TO_PT, 2 * MM_TO_PT];
    }
  }

  // 5. Desenhar Arcos Vetoriais
  var arcs = projectData.dieline.arcs || [];
  for (var a = 0; a < arcs.length; a++) {
    var arc = arcs[a];
    var cx = toPtX(arc.cx);
    var cy = toPtY(arc.cy);
    var r = arc.r * MM_TO_PT;

    var arcLayer = arc.type === 'crease' ? layerVinco : layerCorte;
    var arcColor = arc.type === 'crease' ? creaseSpotColor : cutSpotColor;

    // Aproximação de arco por pontos de Bézier
    var startRad = (arc.startAngle * Math.PI) / 180.0;
    var endRad = (arc.endAngle * Math.PI) / 180.0;
    var stepCount = Math.max(8, Math.round(Math.abs(arc.endAngle - arc.startAngle) / 10));

    var arcPts = [];
    for (var s = 0; s <= stepCount; s++) {
      var curAngle = startRad + (s / stepCount) * (endRad - startRad);
      arcPts.push([cx + Math.cos(curAngle) * r, cy + Math.sin(curAngle) * r]);
    }

    var arcPath = arcLayer.pathItems.add();
    arcPath.setEntirePath(arcPts);
    arcPath.filled = false;
    arcPath.stroked = true;
    arcPath.strokeColor = arcColor;
    arcPath.strokeWidth = 0.5 * MM_TO_PT;
    if (arc.type === 'crease') {
      arcPath.strokeDashes = [4 * MM_TO_PT, 2 * MM_TO_PT];
    }
  }

  // 6. Desenhar Polígonos de Painéis com Metadados (Para Mapeamento de Arte 3D)
  var panels = projectData.panels || [];
  for (var p = 0; p < panels.length; p++) {
    var panel = panels[p];
    if (!panel.polygon || panel.polygon.length < 3) continue;

    var polyPts = [];
    for (var pt = 0; pt < panel.polygon.length; pt++) {
      polyPts.push([toPtX(panel.polygon[pt].x), toPtY(panel.polygon[pt].y)]);
    }

    var panelGuide = layerPaineis.pathItems.add();
    panelGuide.setEntirePath(polyPts);
    panelGuide.closed = true;
    panelGuide.filled = false;
    panelGuide.stroked = true;
    panelGuide.strokeColor = cmykCotas;
    panelGuide.strokeWidth = 0.25 * MM_TO_PT;
    panelGuide.strokeDashes = [2 * MM_TO_PT, 2 * MM_TO_PT];
    panelGuide.note = "PLMPACK_PANEL:" + panel.id + ":" + panel.name;
  }

  // 7. Configurações de Camadas e Segurança
  layerCorte.locked = true;
  layerVinco.locked = true;
  layerPaineis.locked = true;
  layerCotas.locked = true;
  layerRef.locked = true;

  // Garante que a camada de arte fique no topo e ativa para edição direta pelo designer
  layerArte.zOrder(ZOrderMethod.BRINGTOFRONT);
  doc.activeLayer = layerArte;

  return JSON.stringify({
    success: true,
    documentName: doc.name,
    artboardWidthMm: artboardWidthMm,
    artboardHeightMm: artboardHeightMm,
    isUpdate: isUpdate,
    projectId: projectData.projectId,
    geometryVersion: projectData.geometryVersion
  });
})();
`;
}

/**
 * Gera o script ExtendScript para exportação fotorrealista de 300 DPI da camada ARTE
 */
export function generateArtworkExportJsx(project: PLMPackProjectExchange, outputPath: string): string {
  const cleanOutputPath = outputPath.replace(/\\/g, '/');

  return `// Script de Exportação da Camada de Arte PLMPackLib
#target illustrator

(function() {
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

  // Oculta temporariamente todas as camadas técnicas para exportar puramente a arte
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

  // Configurações de exportação PNG 24 bits a 300 DPI com transparência
  var exportOptions = new ExportOptionsPNG24();
  exportOptions.antiAliasing = true;
  exportOptions.transparency = true;
  exportOptions.artBoardClipping = true;
  exportOptions.matte = false;
  exportOptions.horizontalScale = 416.666; // 300 DPI relativo aos 72 DPI base
  exportOptions.verticalScale = 416.666;

  var destFile = new File("${cleanOutputPath}");
  doc.exportFile(destFile, ExportType.PNG24, exportOptions);

  // Restaura visibilidade original de todas as camadas
  for (var j = 0; j < layersVisibility.length; j++) {
    layersVisibility[j].layer.visible = layersVisibility[j].visible;
  }

  return JSON.stringify({
    success: true,
    filePath: destFile.fsName,
    exists: destFile.exists,
    fileSize: destFile.length
  });
})();
`;
}
