// Compilador ExtendScript JSX oficial para Adobe Illustrator 2025 (versão CommonJS para Bridge Node.js)
// Camadas semânticas: CUT, CREASE, PERF, ARTWORK, GUIDES_INFO

function generateIllustratorJsx(projectData) {
  var jsonPayload = JSON.stringify(projectData);

  return '// PLMPackLib Oficial Bridge Script para Adobe Illustrator 2025\n' +
    '// Gerado automaticamente pelo motor CAD PLMPackLib\n' +
    '#target illustrator\n\n' +
    '// Polyfill JSON para ExtendScript (ES3)\n' +
    'if (typeof JSON !== "object") {\n' +
    '  JSON = {\n' +
    '    stringify: function(o) {\n' +
    '      if (o === null) return "null";\n' +
    '      if (typeof o === "number" || typeof o === "boolean") return "" + o;\n' +
    '      if (typeof o === "string") return "\\"" + o.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, "\\\\\\"").replace(/\\n/g, "\\\\n").replace(/\\r/g, "\\\\r") + "\\"";\n' +
    '      if (o instanceof Array) {\n' +
    '        var a = [];\n' +
    '        for (var i = 0; i < o.length; i++) a.push(JSON.stringify(o[i]));\n' +
    '        return "[" + a.join(",") + "]";\n' +
    '      }\n' +
    '      if (typeof o === "object") {\n' +
    '        var p = [];\n' +
    '        for (var k in o) {\n' +
    '          if (o.hasOwnProperty(k)) p.push("\\"" + k + "\\":" + JSON.stringify(o[k]));\n' +
    '        }\n' +
    '        return "{" + p.join(",") + "}";\n' +
    '      }\n' +
    '      return "null";\n' +
    '    },\n' +
    '    parse: function(s) { return eval("(" + s + ")"); }\n' +
    '  };\n' +
    '}\n\n' +
    '(function() {\n' +
    'try {\n' +
    '  var projectData = ' + jsonPayload + ';\n\n' +
    '  var MM_TO_PT = 72.0 / 25.4; // 2.83464567 pt por mm\n' +
    '  var MARGIN_MM = 15.0;\n\n' +
    '  var bounds = (projectData.dieline && projectData.dieline.bounds) || (projectData.canonicalGeometry && projectData.canonicalGeometry.bounds);\n' +
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
    '    doc = app.documents.add(DocumentColorSpace.CMYK, artboardWidthPt, artboardHeightPt);\n' +
    '  } else {\n' +
    '    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];\n' +
    '    ab.artboardRect = [0, artboardHeightPt, artboardWidthPt, 0];\n' +
    '  }\n\n' +
    '  app.activeDocument = doc;\n\n' +
    '  function getOrCreateSpotColor(name, c, m, y, k) {\n' +
    '    var spot = null;\n' +
    '    try {\n' +
    '      spot = doc.spots.getByName(name);\n' +
    '    } catch(e) {\n' +
    '      spot = doc.spots.add();\n' +
    '      spot.name = name;\n' +
    '      spot.colorType = ColorModel.SPOT;\n' +
    '      var cmyk = new CMYKColor();\n' +
    '      cmyk.cyan = c;\n' +
    '      cmyk.magenta = m;\n' +
    '      cmyk.yellow = y;\n' +
    '      cmyk.black = k;\n' +
    '      spot.color = cmyk;\n' +
    '    }\n' +
    '    var sc = new SpotColor();\n' +
    '    sc.spot = spot;\n' +
    '    sc.tint = 100;\n' +
    '    return sc;\n' +
    '  }\n\n' +
    '  var cutSpotColor = getOrCreateSpotColor("Corte", 0, 100, 100, 0);\n' +
    '  var creaseSpotColor = getOrCreateSpotColor("Vinco", 100, 0, 30, 0);\n' +
    '  var perfSpotColor = getOrCreateSpotColor("Picote", 0, 50, 100, 0);\n\n' +
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
    '  var layerArteExterna = getOrCreateLayer("ARTWORK_EXTERNA");\n' +
    '  layerArteExterna.locked = false;\n' +
    '  layerArteExterna.printable = true;\n\n' +
    '  var layerArteInterna = getOrCreateLayer("ARTWORK_INTERNA");\n' +
    '  layerArteInterna.locked = false;\n' +
    '  layerArteInterna.printable = true;\n\n' +
    '  var layerCorte = getOrCreateLayer("CUT");\n' +
    '  var layerVinco = getOrCreateLayer("CREASE");\n' +
    '  var layerPicote = getOrCreateLayer("PERF");\n' +
    '  var layerGuias = getOrCreateLayer("GUIDES_INFO");\n\n' +
    '  var layersToClean = [layerCorte, layerVinco, layerPicote, layerGuias];\n' +
    '  for (var li = 0; li < layersToClean.length; li++) {\n' +
    '    try {\n' +
    '      layersToClean[li].locked = false;\n' +
    '      for (var pi = layersToClean[li].pageItems.length - 1; pi >= 0; pi--) {\n' +
    '        layersToClean[li].pageItems[pi].remove();\n' +
    '      }\n' +
    '    } catch(e) {}\n' +
    '  }\n\n' +
    '  var lines = (projectData.canonicalGeometry && projectData.canonicalGeometry.segments) || projectData.dieline.lines || [];\n' +
    '  for (var i = 0; i < lines.length; i++) {\n' +
    '    var l = lines[i];\n' +
    '    var x1 = l.x0 !== undefined ? l.x0 : l.x1;\n' +
    '    var y1 = l.y0 !== undefined ? l.y0 : l.y1;\n' +
    '    var x2 = l.x1 !== undefined && l.x0 !== undefined ? l.x1 : l.x2;\n' +
    '    var y2 = l.y1 !== undefined && l.y0 !== undefined ? l.y1 : l.y2;\n\n' +
    '    var p1x = toPtX(x1);\n' +
    '    var p1y = toPtY(y1);\n' +
    '    var p2x = toPtX(x2);\n' +
    '    var p2y = toPtY(y2);\n\n' +
    '    if (Math.abs(p1x - p2x) < 0.001 && Math.abs(p1y - p2y) < 0.001) {\n' +
    '      continue;\n' +
    '    }\n\n' +
    '    var targetLayer = layerCorte;\n' +
    '    var strokeColor = cutSpotColor;\n' +
    '    var isDashed = false;\n' +
    '    var dashConfig = [4 * MM_TO_PT, 2 * MM_TO_PT];\n\n' +
    '    if (l.type === "crease") {\n' +
    '      targetLayer = layerVinco;\n' +
    '      strokeColor = creaseSpotColor;\n' +
    '      isDashed = true;\n' +
    '    } else if (l.type === "perfo") {\n' +
    '      targetLayer = layerPicote;\n' +
    '      strokeColor = perfSpotColor;\n' +
    '      isDashed = true;\n' +
    '      dashConfig = [2 * MM_TO_PT, 1.5 * MM_TO_PT];\n' +
    '    } else if (l.type === "dimension") {\n' +
    '      targetLayer = layerGuias;\n' +
    '      strokeColor = cmykCotas;\n' +
    '    } else if (l.type === "bleed") {\n' +
    '      targetLayer = layerGuias;\n' +
    '      strokeColor = cmykSangria;\n' +
    '      isDashed = true;\n' +
    '    }\n\n' +
    '    try {\n' +
    '      var path = targetLayer.pathItems.add();\n' +
    '      path.setEntirePath([[p1x, p1y], [p2x, p2y]]);\n' +
    '      path.filled = false;\n' +
    '      path.stroked = true;\n' +
    '      path.strokeColor = strokeColor;\n' +
    '      path.strokeWidth = 0.5 * MM_TO_PT;\n\n' +
    '      if (isDashed) {\n' +
    '        path.strokeDashes = dashConfig;\n' +
    '      }\n' +
    '    } catch(e) {}\n' +
    '  }\n\n' +
    '  var arcs = (projectData.canonicalGeometry && projectData.canonicalGeometry.arcs) || projectData.dieline.arcs || [];\n' +
    '  for (var a = 0; a < arcs.length; a++) {\n' +
    '    var arc = arcs[a];\n' +
    '    if (!arc.r || arc.r <= 0.001) continue;\n' +
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
    '    try {\n' +
    '      var arcPath = arcLayer.pathItems.add();\n' +
    '      arcPath.setEntirePath(arcPts);\n' +
    '      arcPath.filled = false;\n' +
    '      arcPath.stroked = true;\n' +
    '      arcPath.strokeColor = arcColor;\n' +
    '      arcPath.strokeWidth = 0.5 * MM_TO_PT;\n' +
    '      if (arc.type === "crease") {\n' +
    '        arcPath.strokeDashes = [4 * MM_TO_PT, 2 * MM_TO_PT];\n' +
    '      }\n' +
    '    } catch(e) {}\n' +
    '  }\n\n' +
    '  var panels = projectData.panels || [];\n' +
    '  for (var p = 0; p < panels.length; p++) {\n' +
    '    var panel = panels[p];\n' +
    '    if (!panel.polygon || panel.polygon.length < 3) continue;\n\n' +
    '    var polyPts = [];\n' +
    '    for (var pt = 0; pt < panel.polygon.length; pt++) {\n' +
    '      polyPts.push([toPtX(panel.polygon[pt].x), toPtY(panel.polygon[pt].y)]);\n' +
    '    }\n\n' +
    '    try {\n' +
    '      var panelGuide = layerGuias.pathItems.add();\n' +
    '      panelGuide.setEntirePath(polyPts);\n' +
    '      panelGuide.closed = true;\n' +
    '      panelGuide.filled = false;\n' +
    '      panelGuide.stroked = true;\n' +
    '      panelGuide.strokeColor = cmykCotas;\n' +
    '      panelGuide.strokeWidth = 0.25 * MM_TO_PT;\n' +
    '      panelGuide.strokeDashes = [2 * MM_TO_PT, 2 * MM_TO_PT];\n' +
    '      panelGuide.note = "PLMPACK_PANEL:" + panel.id + ":" + panel.name;\n' +
    '    } catch(e) {}\n' +
    '  }\n\n' +
    '  try { layerCorte.locked = true; } catch(e) {}\n' +
    '  try { layerVinco.locked = true; } catch(e) {}\n' +
    '  try { layerPicote.locked = true; } catch(e) {}\n' +
    '  try { layerGuias.locked = true; } catch(e) {}\n\n' +
    '  try {\n' +
    '    layerCorte.move(doc, ElementPlacement.PLACEATBEGINNING);\n' +
    '    layerVinco.move(layerCorte, ElementPlacement.PLACEAFTER);\n' +
    '    layerPicote.move(layerVinco, ElementPlacement.PLACEAFTER);\n' +
    '    layerGuias.move(layerPicote, ElementPlacement.PLACEAFTER);\n' +
    '    layerArteExterna.move(layerGuias, ElementPlacement.PLACEAFTER);\n' +
    '    layerArteInterna.move(layerArteExterna, ElementPlacement.PLACEAFTER);\n' +
    '  } catch(e) {}\n' +
    '  try {\n' +
    '    layerArteExterna.locked = false;\n' +
    '    layerArteExterna.visible = true;\n' +
    '    layerArteInterna.locked = false;\n' +
    '    layerArteInterna.visible = true;\n' +
    '    doc.activeLayer = layerArteExterna;\n' +
    '  } catch(e) {}\n\n' +
    '  return JSON.stringify({\n' +
    '    success: true,\n' +
    '    documentName: doc.name,\n' +
    '    artboardWidthMm: artboardWidthMm,\n' +
    '    artboardHeightMm: artboardHeightMm,\n' +
    '    isUpdate: isUpdate,\n' +
    '    projectId: projectData.projectId,\n' +
    '    modelId: projectData.modelId,\n' +
    '    modelCode: projectData.modelCode,\n' +
    '    projectRevision: projectData.projectRevision || 1,\n' +
    '    illustratorSessionId: projectData.illustratorSessionId || "",\n' +
    '    schemaVersion: projectData.schemaVersion || 1\n' +
    '  });\n' +
    '} catch(err) {\n' +
    '  alert("PLMPackLib Erro ExtendScript: " + err.message + " (Linha: " + err.line + ")");\n' +
    '  return JSON.stringify({\n' +
    '    error: "ExtendScript Error: " + err.message + " (linha " + err.line + ")"\n' +
    '  });\n' +
    '}\n' +
    '})();\n';
}

function generateArtworkExportJsx(project, outputPath) {
  var cleanOutputPath = outputPath.replace(/\\/g, '/');

  return '// Script de Exportação Vetorial e Raster da Camada de Arte PLMPackLib\n' +
    '#target illustrator\n\n' +
    'if (typeof JSON !== "object") {\n' +
    '  JSON = {\n' +
    '    stringify: function(o) {\n' +
    '      if (o === null) return "null";\n' +
    '      if (typeof o === "number" || typeof o === "boolean") return "" + o;\n' +
    '      if (typeof o === "string") return "\\"" + o.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, "\\\\\\"").replace(/\\n/g, "\\\\n").replace(/\\r/g, "\\\\r") + "\\"";\n' +
    '      if (o instanceof Array) {\n' +
    '        var a = [];\n' +
    '        for (var i = 0; i < o.length; i++) a.push(JSON.stringify(o[i]));\n' +
    '        return "[" + a.join(",") + "]";\n' +
    '      }\n' +
    '      if (typeof o === "object") {\n' +
    '        var p = [];\n' +
    '        for (var k in o) {\n' +
    '          if (o.hasOwnProperty(k)) p.push("\\"" + k + "\\":" + JSON.stringify(o[k]));\n' +
    '        }\n' +
    '        return "{" + p.join(",") + "}";\n' +
    '      }\n' +
    '      return "null";\n' +
    '    }\n' +
    '  };\n' +
    '}\n\n' +
    '(function() {\n' +
    '  if (app.documents.length === 0) {\n' +
    '    return JSON.stringify({ error: "Nenhum documento aberto no Illustrator." });\n' +
    '  }\n\n' +
    '  var doc = app.activeDocument;\n' +
    '  var artworkLayers = [];\n\n' +
    '  try { artworkLayers.push(doc.layers.getByName("ARTWORK_EXTERNA")); } catch(e) {}\n' +
    '  try { artworkLayers.push(doc.layers.getByName("ARTWORK_INTERNA")); } catch(e) {}\n' +
    '  try { artworkLayers.push(doc.layers.getByName("ARTWORK")); } catch(e) {}\n' +
    '  try { artworkLayers.push(doc.layers.getByName("PLMPACKLIB_ARTE")); } catch(e) {}\n\n' +
    '  if (artworkLayers.length === 0) {\n' +
    '    return JSON.stringify({ error: "Nenhuma camada de arte encontrada no documento ativo." });\n' +
    '  }\n\n' +
    '  var layersVisibility = [];\n' +
    '  for (var i = 0; i < doc.layers.length; i++) {\n' +
    '    var l = doc.layers[i];\n' +
    '    layersVisibility.push({ layer: l, visible: l.visible });\n' +
    '    var isArtLayer = false;\n' +
    '    for (var k = 0; k < artworkLayers.length; k++) {\n' +
    '      if (l === artworkLayers[k]) {\n' +
    '        isArtLayer = true;\n' +
    '        break;\n' +
    '      }\n' +
    '    }\n' +
    '    l.visible = isArtLayer;\n' +
    '  }\n\n' +
    '  // 1. Exportação SVG Vetorial Real da Camada ARTWORK\n' +
    '  var svgOptions = new ExportOptionsSVG();\n' +
    '  svgOptions.embedRasterImages = true;\n' +
    '  svgOptions.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;\n' +
    '  svgOptions.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;\n' +
    '  try { svgOptions.coordinatePrecision = 4; } catch(e) {}\n\n' +
    '  var cleanPathStr = "' + cleanOutputPath + '";\n' +
    '  var cleanSvgPath = cleanPathStr.replace(/\\.png$/i, ".svg");\n' +
    '  if (cleanSvgPath === cleanPathStr) cleanSvgPath = cleanPathStr + ".svg";\n' +
    '  var destSvgFile = new File(cleanSvgPath);\n' +
    '  var hasVector = false;\n' +
    '  var vectorSvg = "";\n' +
    '  try {\n' +
    '    doc.exportFile(destSvgFile, ExportType.SVG, svgOptions);\n' +
    '    if (destSvgFile.exists && destSvgFile.length > 0) {\n' +
    '      destSvgFile.open("r");\n' +
    '      vectorSvg = destSvgFile.read();\n' +
    '      destSvgFile.close();\n' +
    '      if (vectorSvg && vectorSvg.length > 30) {\n' +
    '        hasVector = true;\n' +
    '      }\n' +
    '    }\n' +
    '  } catch(eSvg) {\n' +
    '    hasVector = false;\n' +
    '  }\n\n' +
    '  // 2. Exportação PNG 24 bits a 300 DPI com transparência\n' +
    '  var exportOptions = new ExportOptionsPNG24();\n' +
    '  exportOptions.antiAliasing = true;\n' +
    '  exportOptions.transparency = true;\n' +
    '  exportOptions.artBoardClipping = true;\n' +
    '  exportOptions.matte = false;\n' +
    '  exportOptions.horizontalScale = 416.666;\n' +
    '  exportOptions.verticalScale = 416.666;\n\n' +
    '  var destFile = new File(cleanPathStr);\n' +
    '  doc.exportFile(destFile, ExportType.PNG24, exportOptions);\n\n' +
    '  for (var j = 0; j < layersVisibility.length; j++) {\n' +
    '    layersVisibility[j].layer.visible = layersVisibility[j].visible;\n' +
    '  }\n\n' +
    '  var artworkType = hasVector ? "VECTOR_AND_RASTER" : (destFile.exists ? "RASTER_ONLY" : "NONE");\n' +
    '  var vectorStatus = hasVector ? "VECTOR_SYNCHRONIZED" : "VECTOR_ARTWORK_UNAVAILABLE";\n\n' +
    '  return JSON.stringify({\n' +
    '    success: true,\n' +
    '    hasVector: hasVector,\n' +
    '    artworkType: artworkType,\n' +
    '    vectorStatus: vectorStatus,\n' +
    '    vectorSvg: vectorSvg,\n' +
    '    svgPath: destSvgFile.fsName,\n' +
    '    filePath: destFile.fsName,\n' +
    '    exists: destFile.exists,\n' +
    '    fileSize: destFile.length,\n' +
    '    projectId: "' + (project.projectId || '') + '",\n' +
    '    modelId: "' + (project.modelId || '') + '",\n' +
    '    modelCode: "' + (project.modelCode || '') + '",\n' +
    '    projectRevision: ' + (project.projectRevision || 1) + ',\n' +
    '    illustratorSessionId: "' + (project.illustratorSessionId || '') + '"\n' +
    '  });\n' +
    '})();\n';
}

module.exports = {
  generateIllustratorJsx: generateIllustratorJsx,
  generateArtworkExportJsx: generateArtworkExportJsx,
};

