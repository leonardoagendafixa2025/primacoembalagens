// Compilador ExtendScript JSX oficial para Adobe Illustrator 2025 (versão CommonJS para Bridge Node.js)

function generateIllustratorJsx(projectData) {
  var jsonPayload = JSON.stringify(projectData);

  return '// PLMPackLib Oficial Bridge Script para Adobe Illustrator 2025\n' +
    '// Gerado automaticamente pelo motor CAD PLMPackLib\n' +
    '#target illustrator\n\n' +
    '(function() {\n' +
    '  var projectData = ' + jsonPayload + ';\n\n' +
    '  var MM_TO_PT = 72.0 / 25.4; // 2.83464567 pt por mm\n' +
    '  var MARGIN_MM = 15.0;\n\n' +
    '  var bounds = projectData.dieline.bounds;\n' +
    '  var dielineWidthMm = bounds.width;\n' +
    '  var dielineHeightMm = bounds.height;\n\n' +
    '  var artboardWidthMm = dielineWidthMm + (MARGIN_MM * 2.0);\n' +
    '  var artboardHeightMm = dielineHeightMm + (MARGIN_MM * 2.0);\n\n' +
    '  var artboardWidthPt = artboardWidthMm * MM_TO_PT;\n' +
    '  var artboardHeightPt = artboardHeightMm * MM_TO_PT;\n\n' +
    '  var originXMm = MARGIN_MM - bounds.minX;\n' +
    '  var originYMm = MARGIN_MM - bounds.minY;\n\n' +
    '  function toPtX(xMm) {\n' +
    '    return (xMm + originXMm) * MM_TO_PT;\n' +
    '  }\n\n' +
    '  function toPtY(yMm) {\n' +
    '    return (yMm + originYMm) * MM_TO_PT;\n' +
    '  }\n\n' +
    '  var doc = null;\n' +
    '  var isUpdate = false;\n\n' +
    '  for (var i = 0; i < app.documents.length; i++) {\n' +
    '    var d = app.documents[i];\n' +
    '    if (d.name.indexOf(projectData.projectId) !== -1 || (d.XMPString && d.XMPString.indexOf(projectData.projectId) !== -1)) {\n' +
    '      doc = d;\n' +
    '      isUpdate = true;\n' +
    '      break;\n' +
    '    }\n' +
    '  }\n\n' +
    '  if (!doc) {\n' +
    '    var docPreset = new DocumentPreset();\n' +
    '    docPreset.title = projectData.projectName + "_" + projectData.projectId;\n' +
    '    docPreset.width = artboardWidthPt;\n' +
    '    docPreset.height = artboardHeightPt;\n' +
    '    docPreset.colorMode = DocumentColorSpace.CMYK;\n' +
    '    docPreset.units = RulerUnits.Millimeters;\n' +
    '    docPreset.rasterResolution = DocumentRasterResolution.HighResolution;\n\n' +
    '    doc = app.documents.addDocument(DocumentColorSpace.CMYK, docPreset);\n' +
    '  } else {\n' +
    '    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];\n' +
    '    ab.artboardRect = [0, artboardHeightPt, artboardWidthPt, 0];\n' +
    '  }\n\n' +
    '  app.activeDocument = doc;\n\n' +
    '  function getOrCreateSpotColor(name, c, m, y, k) {\n' +
    '    try {\n' +
    '      var spot = doc.spots.getByName(name);\n' +
    '      return spot.color;\n' +
    '    } catch(e) {\n' +
    '      var newSpot = doc.spots.add();\n' +
    '      newSpot.name = name;\n' +
    '      newSpot.colorType = ColorModel.SPOT;\n' +
    '      var cmyk = new CMYKColor();\n' +
    '      cmyk.cyan = c;\n' +
    '      cmyk.magenta = m;\n' +
    '      cmyk.yellow = y;\n' +
    '      cmyk.black = k;\n' +
    '      newSpot.color = cmyk;\n' +
    '      var sc = new SpotColor();\n' +
    '      sc.spot = newSpot;\n' +
    '      sc.tint = 100;\n' +
    '      return sc;\n' +
    '    }\n' +
    '  }\n\n' +
    '  var cutSpotColor = getOrCreateSpotColor("Corte", 0, 100, 100, 0);\n' +
    '  var creaseSpotColor = getOrCreateSpotColor("Vinco", 100, 0, 30, 0);\n\n' +
    '  var cmykCotas = new CMYKColor();\n' +
    '  cmykCotas.cyan = 0; cmykCotas.magenta = 40; cmykCotas.yellow = 100; cmykCotas.black = 0;\n\n' +
    '  var cmykSangria = new CMYKColor();\n' +
    '  cmykSangria.cyan = 80; cmykSangria.magenta = 0; cmykSangria.yellow = 80; cmykSangria.black = 0;\n\n' +
    '  function getOrCreateLayer(name) {\n' +
    '    try {\n' +
    '      return doc.layers.getByName(name);\n' +
    '    } catch(e) {\n' +
    '      var l = doc.layers.add();\n' +
    '      l.name = name;\n' +
    '      return l;\n' +
    '    }\n' +
    '  }\n\n' +
    '  var layerArte = getOrCreateLayer("PLMPACKLIB_ARTE");\n' +
    '  layerArte.locked = false;\n' +
    '  layerArte.printable = true;\n\n' +
    '  var layerCorte = getOrCreateLayer("PLMPACKLIB_CORTE");\n' +
    '  var layerVinco = getOrCreateLayer("PLMPACKLIB_VINCO");\n' +
    '  var layerPaineis = getOrCreateLayer("PLMPACKLIB_PAINEIS");\n' +
    '  var layerCotas = getOrCreateLayer("PLMPACKLIB_COTAS");\n' +
    '  var layerRef = getOrCreateLayer("PLMPACKLIB_REFERENCIA");\n\n' +
    '  var layersToClean = [layerCorte, layerVinco, layerPaineis, layerCotas, layerRef];\n' +
    '  for (var li = 0; li < layersToClean.length; li++) {\n' +
    '    layersToClean[li].locked = false;\n' +
    '    layersToClean[li].hasSelectedArtwork = true;\n' +
    '    for (var pi = layersToClean[li].pageItems.length - 1; pi >= 0; pi--) {\n' +
    '      layersToClean[li].pageItems[pi].remove();\n' +
    '    }\n' +
    '  }\n\n' +
    '  var lines = projectData.dieline.lines;\n' +
    '  for (var i = 0; i < lines.length; i++) {\n' +
    '    var l = lines[i];\n' +
    '    var p1x = toPtX(l.x1);\n' +
    '    var p1y = toPtY(l.y1);\n' +
    '    var p2x = toPtX(l.x2);\n' +
    '    var p2y = toPtY(l.y2);\n\n' +
    '    var targetLayer = layerCorte;\n' +
    '    var strokeColor = cutSpotColor;\n' +
    '    var isDashed = false;\n\n' +
    '    if (l.type === "crease") {\n' +
    '      targetLayer = layerVinco;\n' +
    '      strokeColor = creaseSpotColor;\n' +
    '      isDashed = true;\n' +
    '    } else if (l.type === "dimension") {\n' +
    '      targetLayer = layerCotas;\n' +
    '      strokeColor = cmykCotas;\n' +
    '    } else if (l.type === "bleed") {\n' +
    '      targetLayer = layerRef;\n' +
    '      strokeColor = cmykSangria;\n' +
    '      isDashed = true;\n' +
    '    }\n\n' +
    '    var path = targetLayer.pathItems.add();\n' +
    '    path.setEntirePath([[p1x, p1y], [p2x, p2y]]);\n' +
    '    path.filled = false;\n' +
    '    path.stroked = true;\n' +
    '    path.strokeColor = strokeColor;\n' +
    '    path.strokeWidth = 0.5 * MM_TO_PT;\n\n' +
    '    if (isDashed) {\n' +
    '      path.strokeDashes = [4 * MM_TO_PT, 2 * MM_TO_PT];\n' +
    '    }\n' +
    '  }\n\n' +
    '  var arcs = projectData.dieline.arcs || [];\n' +
    '  for (var a = 0; a < arcs.length; a++) {\n' +
    '    var arc = arcs[a];\n' +
    '    var cx = toPtX(arc.cx);\n' +
    '    var cy = toPtY(arc.cy);\n' +
    '    var r = arc.r * MM_TO_PT;\n\n' +
    '    var arcLayer = arc.type === "crease" ? layerVinco : layerCorte;\n' +
    '    var arcColor = arc.type === "crease" ? creaseSpotColor : cutSpotColor;\n\n' +
    '    var startRad = (arc.startAngle * Math.PI) / 180.0;\n' +
    '    var endRad = (arc.endAngle * Math.PI) / 180.0;\n' +
    '    var stepCount = Math.max(8, Math.round(Math.abs(arc.endAngle - arc.startAngle) / 10));\n\n' +
    '    var arcPts = [];\n' +
    '    for (var s = 0; s <= stepCount; s++) {\n' +
    '      var curAngle = startRad + (s / stepCount) * (endRad - startRad);\n' +
    '      arcPts.push([cx + Math.cos(curAngle) * r, cy + Math.sin(curAngle) * r]);\n' +
    '    }\n\n' +
    '    var arcPath = arcLayer.pathItems.add();\n' +
    '    arcPath.setEntirePath(arcPts);\n' +
    '    arcPath.filled = false;\n' +
    '    arcPath.stroked = true;\n' +
    '    arcPath.strokeColor = arcColor;\n' +
    '    arcPath.strokeWidth = 0.5 * MM_TO_PT;\n' +
    '    if (arc.type === "crease") {\n' +
    '      arcPath.strokeDashes = [4 * MM_TO_PT, 2 * MM_TO_PT];\n' +
    '    }\n' +
    '  }\n\n' +
    '  var panels = projectData.panels || [];\n' +
    '  for (var p = 0; p < panels.length; p++) {\n' +
    '    var panel = panels[p];\n' +
    '    if (!panel.polygon || panel.polygon.length < 3) continue;\n\n' +
    '    var polyPts = [];\n' +
    '    for (var pt = 0; pt < panel.polygon.length; pt++) {\n' +
    '      polyPts.push([toPtX(panel.polygon[pt].x), toPtY(panel.polygon[pt].y)]);\n' +
    '    }\n\n' +
    '    var panelGuide = layerPaineis.pathItems.add();\n' +
    '    panelGuide.setEntirePath(polyPts);\n' +
    '    panelGuide.closed = true;\n' +
    '    panelGuide.filled = false;\n' +
    '    panelGuide.stroked = true;\n' +
    '    panelGuide.strokeColor = cmykCotas;\n' +
    '    panelGuide.strokeWidth = 0.25 * MM_TO_PT;\n' +
    '    panelGuide.strokeDashes = [2 * MM_TO_PT, 2 * MM_TO_PT];\n' +
    '    panelGuide.note = "PLMPACK_PANEL:" + panel.id + ":" + panel.name;\n' +
    '  }\n\n' +
    '  layerCorte.locked = true;\n' +
    '  layerVinco.locked = true;\n' +
    '  layerPaineis.locked = true;\n' +
    '  layerCotas.locked = true;\n' +
    '  layerRef.locked = true;\n\n' +
    '  layerArte.zOrder(ZOrderMethod.BRINGTOFRONT);\n' +
    '  doc.activeLayer = layerArte;\n\n' +
    '  return JSON.stringify({\n' +
    '    success: true,\n' +
    '    documentName: doc.name,\n' +
    '    artboardWidthMm: artboardWidthMm,\n' +
    '    artboardHeightMm: artboardHeightMm,\n' +
    '    isUpdate: isUpdate,\n' +
    '    projectId: projectData.projectId,\n' +
    '    geometryVersion: projectData.geometryVersion\n' +
    '  });\n' +
    '})();\n';
}

function generateArtworkExportJsx(projectData, outputPath) {
  var cleanOutputPath = outputPath.replace(/\\/g, '/');

  return '// Script de Exportação da Camada de Arte PLMPackLib\n' +
    '#target illustrator\n\n' +
    '(function() {\n' +
    '  if (app.documents.length === 0) {\n' +
    '    return JSON.stringify({ error: "Nenhum documento aberto no Illustrator." });\n' +
    '  }\n\n' +
    '  var doc = app.activeDocument;\n' +
    '  var layerArte = null;\n\n' +
    '  try {\n' +
    '    layerArte = doc.layers.getByName("PLMPACKLIB_ARTE");\n' +
    '  } catch(e) {\n' +
    '    return JSON.stringify({ error: "Camada PLMPACKLIB_ARTE não encontrada no documento ativo." });\n' +
    '  }\n\n' +
    '  var layersVisibility = [];\n' +
    '  for (var i = 0; i < doc.layers.length; i++) {\n' +
    '    var l = doc.layers[i];\n' +
    '    layersVisibility.push({ layer: l, visible: l.visible });\n' +
    '    if (l.name !== "PLMPACKLIB_ARTE") {\n' +
    '      l.visible = false;\n' +
    '    } else {\n' +
    '      l.visible = true;\n' +
    '    }\n' +
    '  }\n\n' +
    '  var exportOptions = new ExportOptionsPNG24();\n' +
    '  exportOptions.antiAliasing = true;\n' +
    '  exportOptions.transparency = true;\n' +
    '  exportOptions.artBoardClipping = true;\n' +
    '  exportOptions.matte = false;\n' +
    '  exportOptions.horizontalScale = 416.666; // 300 DPI\n' +
    '  exportOptions.verticalScale = 416.666;\n\n' +
    '  var destFile = new File("' + cleanOutputPath + '");\n' +
    '  doc.exportFile(destFile, ExportType.PNG24, exportOptions);\n\n' +
    '  for (var j = 0; j < layersVisibility.length; j++) {\n' +
    '    layersVisibility[j].layer.visible = layersVisibility[j].visible;\n' +
    '  }\n\n' +
    '  return JSON.stringify({\n' +
    '    success: true,\n' +
    '    filePath: destFile.fsName,\n' +
    '    exists: destFile.exists,\n' +
    '    fileSize: destFile.length\n' +
    '  });\n' +
    '})();\n';
}

module.exports = {
  generateIllustratorJsx: generateIllustratorJsx,
  generateArtworkExportJsx: generateArtworkExportJsx,
};
