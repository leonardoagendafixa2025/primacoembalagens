import type { IllustratorProjectPayload } from './projectExchange';

/**
 * Compilador de script ExtendScript (.jsx) oficial para Adobe Illustrator 2025.
 * Gera documentos vetoriais em escala métrica 1:1, camadas semânticas padronizadas:
 * CUT, CREASE, PERF, ARTWORK, GUIDES_INFO
 * Canais de cor Spot (Corte, Vinco, Picote) e metadados de sessão embutidos.
 */
export function generateIllustratorJsx(project: IllustratorProjectPayload): string {
  const jsonPayload = JSON.stringify(project);

  return `// PLMPackLib Oficial Bridge Script para Adobe Illustrator 2025
// Gerado automaticamente pelo motor CAD PLMPackLib
#target illustrator

// Polyfill JSON para Adobe ExtendScript (ES3)
if (typeof JSON !== 'object') {
  JSON = {
    stringify: function(o) {
      if (o === null) return 'null';
      if (typeof o === 'number' || typeof o === 'boolean') return '' + o;
      if (typeof o === 'string') return '"' + o.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r') + '"';
      if (o instanceof Array) {
        var a = [];
        for (var i = 0; i < o.length; i++) a.push(JSON.stringify(o[i]));
        return '[' + a.join(',') + ']';
      }
      if (typeof o === 'object') {
        var p = [];
        for (var k in o) {
          if (o.hasOwnProperty(k)) p.push('"' + k + '":' + JSON.stringify(o[k]));
        }
        return '{' + p.join(',') + '}';
      }
      return 'null';
    },
    parse: function(s) {
      return eval('(' + s + ')');
    }
  };
}

(function() {
try {
  var projectData = ${jsonPayload};

  var MM_TO_PT = 72.0 / 25.4; // 2.83464567 pt por mm
  var MARGIN_MM = 15.0; // Margem de respiro ao redor da faca

  var bounds = projectData.dieline.bounds || projectData.canonicalGeometry.bounds;
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
    doc = app.documents.add(DocumentColorSpace.CMYK, artboardWidthPt, artboardHeightPt);
  } else {
    // Atualização de prancheta existente
    var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()];
    ab.artboardRect = [0, artboardHeightPt, artboardWidthPt, 0];
  }

  app.activeDocument = doc;

  // 2. Criação ou recuperação de Tintas Especiais (Spot Colors) padronizadas
  function getOrCreateSpotColor(name, c, m, y, k) {
    var spot = null;
    try {
      spot = doc.spots.getByName(name);
    } catch(e) {
      spot = doc.spots.add();
      spot.name = name;
      spot.colorType = ColorModel.SPOT;
      var cmyk = new CMYKColor();
      cmyk.cyan = c;
      cmyk.magenta = m;
      cmyk.yellow = y;
      cmyk.black = k;
      spot.color = cmyk;
    }
    var sc = new SpotColor();
    sc.spot = spot;
    sc.tint = 100;
    return sc;
  }

  var cutSpotColor = getOrCreateSpotColor("Corte", 0, 100, 100, 0); // Vermelho faca (CUT)
  var creaseSpotColor = getOrCreateSpotColor("Vinco", 100, 0, 30, 0); // Verde-água vinco (CREASE)
  var perfSpotColor = getOrCreateSpotColor("Picote", 0, 50, 100, 0); // Laranja picote (PERF)

  var cmykCotas = new CMYKColor();
  cmykCotas.cyan = 0; cmykCotas.magenta = 40; cmykCotas.yellow = 100; cmykCotas.black = 0;

  var cmykSangria = new CMYKColor();
  cmykSangria.cyan = 80; cmykSangria.magenta = 0; cmykSangria.yellow = 80; cmykSangria.black = 0;

  // 3. Gerenciamento de Camadas Semânticas Padronizadas (Fase 6 — Seção 12)
  // CUT, CREASE, PERF, ARTWORK, GUIDES / INFO
  function getOrCreateLayer(name) {
    try {
      return doc.layers.getByName(name);
    } catch(e) {
      var l = doc.layers.add();
      l.name = name;
      return l;
    }
  }

  // Camadas de Arte Externa e Interna (Face Frontal e Face Verso)
  var layerArteExterna = getOrCreateLayer("ARTWORK_EXTERNA");
  layerArteExterna.locked = false;
  layerArteExterna.printable = true;

  var layerArteInterna = getOrCreateLayer("ARTWORK_INTERNA");
  layerArteInterna.locked = false;
  layerArteInterna.printable = true;

  var layerCorte = getOrCreateLayer("CUT");
  var layerVinco = getOrCreateLayer("CREASE");
  var layerPicote = getOrCreateLayer("PERF");
  var layerGuias = getOrCreateLayer("GUIDES_INFO");

  // Limpa apenas as camadas técnicas de geometria ao sincronizar, NUNCA as camadas de arte!
  var layersToClean = [layerCorte, layerVinco, layerPicote, layerGuias];
  for (var li = 0; li < layersToClean.length; li++) {
    try {
      layersToClean[li].locked = false;
      for (var pi = layersToClean[li].pageItems.length - 1; pi >= 0; pi--) {
        layersToClean[li].pageItems[pi].remove();
      }
    } catch(e) {}
  }

  // 4. Desenhar Linhas Vetoriais da Faca Canônica
  var lines = (projectData.canonicalGeometry && projectData.canonicalGeometry.segments) || projectData.dieline.lines || [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var x1 = l.x0 !== undefined ? l.x0 : l.x1;
    var y1 = l.y0 !== undefined ? l.y0 : l.y1;
    var x2 = l.x1 !== undefined && l.x0 !== undefined ? l.x1 : l.x2;
    var y2 = l.y1 !== undefined && l.y0 !== undefined ? l.y1 : l.y2;

    var p1x = toPtX(x1);
    var p1y = toPtY(y1);
    var p2x = toPtX(x2);
    var p2y = toPtY(y2);

    if (Math.abs(p1x - p2x) < 0.001 && Math.abs(p1y - p2y) < 0.001) {
      continue;
    }

    var targetLayer = layerCorte;
    var strokeColor = cutSpotColor;
    var isDashed = false;
    var dashConfig = [4 * MM_TO_PT, 2 * MM_TO_PT];

    if (l.type === 'crease') {
      targetLayer = layerVinco;
      strokeColor = creaseSpotColor;
      isDashed = true;
    } else if (l.type === 'perfo') {
      targetLayer = layerPicote;
      strokeColor = perfSpotColor;
      isDashed = true;
      dashConfig = [2 * MM_TO_PT, 1.5 * MM_TO_PT];
    } else if (l.type === 'dimension') {
      targetLayer = layerGuias;
      strokeColor = cmykCotas;
    } else if (l.type === 'bleed') {
      targetLayer = layerGuias;
      strokeColor = cmykSangria;
      isDashed = true;
    }

    try {
      var path = targetLayer.pathItems.add();
      path.setEntirePath([[p1x, p1y], [p2x, p2y]]);
      path.filled = false;
      path.stroked = true;
      path.strokeColor = strokeColor;
      path.strokeWidth = 0.5 * MM_TO_PT;

      if (isDashed) {
        path.strokeDashes = dashConfig;
      }
    } catch(e) {}
  }

  // 5. Desenhar Arcos Vetoriais Canônicos
  var arcs = (projectData.canonicalGeometry && projectData.canonicalGeometry.arcs) || projectData.dieline.arcs || [];
  for (var a = 0; a < arcs.length; a++) {
    var arc = arcs[a];
    if (!arc.r || arc.r <= 0.001) continue;
    var cx = toPtX(arc.cx);
    var cy = toPtY(arc.cy);
    var r = arc.r * MM_TO_PT;

    var arcLayer = arc.type === 'crease' ? layerVinco : layerCorte;
    var arcColor = arc.type === 'crease' ? creaseSpotColor : cutSpotColor;

    var startRad = (arc.startAngle * Math.PI) / 180.0;
    var endRad = (arc.endAngle * Math.PI) / 180.0;
    var stepCount = Math.max(8, Math.round(Math.abs(arc.endAngle - arc.startAngle) / 10));

    var arcPts = [];
    for (var s = 0; s <= stepCount; s++) {
      var curAngle = startRad + (s / stepCount) * (endRad - startRad);
      arcPts.push([cx + Math.cos(curAngle) * r, cy + Math.sin(curAngle) * r]);
    }

    try {
      var arcPath = arcLayer.pathItems.add();
      arcPath.setEntirePath(arcPts);
      arcPath.filled = false;
      arcPath.stroked = true;
      arcPath.strokeColor = arcColor;
      arcPath.strokeWidth = 0.5 * MM_TO_PT;
      if (arc.type === 'crease') {
        arcPath.strokeDashes = [4 * MM_TO_PT, 2 * MM_TO_PT];
      }
    } catch(e) {}
  }

  // 6. Desenhar Polígonos de Painéis com Metadados Canônicos
  var panels = projectData.panels || [];
  for (var p = 0; p < panels.length; p++) {
    var panel = panels[p];
    if (!panel.polygon || panel.polygon.length < 3) continue;

    var polyPts = [];
    for (var pt = 0; pt < panel.polygon.length; pt++) {
      polyPts.push([toPtX(panel.polygon[pt].x), toPtY(panel.polygon[pt].y)]);
    }

    try {
      var panelGuide = layerGuias.pathItems.add();
      panelGuide.setEntirePath(polyPts);
      panelGuide.closed = true;
      panelGuide.filled = false;
      panelGuide.stroked = true;
      panelGuide.strokeColor = cmykCotas;
      panelGuide.strokeWidth = 0.25 * MM_TO_PT;
      panelGuide.strokeDashes = [2 * MM_TO_PT, 2 * MM_TO_PT];
      panelGuide.note = "PLMPACK_PANEL:" + panel.id + ":" + panel.name;
    } catch(e) {}
  }

  // 7. Bloquear apenas as camadas técnicas de corte/vinco para não serem alteradas acidentalmente
  try { layerCorte.locked = true; } catch(e) {}
  try { layerVinco.locked = true; } catch(e) {}
  try { layerPicote.locked = true; } catch(e) {}
  try { layerGuias.locked = true; } catch(e) {}

  // 8. Organiza a hierarquia no painel de camadas: Faca no topo e Artes logo abaixo
  try {
    layerCorte.move(doc, ElementPlacement.PLACEATBEGINNING);
    layerVinco.move(layerCorte, ElementPlacement.PLACEAFTER);
    layerPicote.move(layerVinco, ElementPlacement.PLACEAFTER);
    layerGuias.move(layerPicote, ElementPlacement.PLACEAFTER);
    layerArteExterna.move(layerGuias, ElementPlacement.PLACEAFTER);
    layerArteInterna.move(layerArteExterna, ElementPlacement.PLACEAFTER);
  } catch(e) {}

  // 9. Garante que as camadas de arte fiquem 100% DESBLOQUEADAS e a ARTWORK_EXTERNA seja a camada ativa selecionada para desenho imediato
  try {
    layerArteExterna.locked = false;
    layerArteExterna.visible = true;
    layerArteInterna.locked = false;
    layerArteInterna.visible = true;
    doc.activeLayer = layerArteExterna;
  } catch(e) {}

  return JSON.stringify({
    success: true,
    documentName: doc.name,
    artboardWidthMm: artboardWidthMm,
    artboardHeightMm: artboardHeightMm,
    isUpdate: isUpdate,
    projectId: projectData.projectId,
    modelId: projectData.modelId,
    modelCode: projectData.modelCode,
    projectRevision: projectData.projectRevision || 1,
    illustratorSessionId: projectData.illustratorSessionId || "",
    schemaVersion: projectData.schemaVersion || 1
  });
} catch(err) {
  alert("PLMPackLib Erro ExtendScript: " + err.message + " (Linha: " + err.line + ")");
  return JSON.stringify({
    error: "ExtendScript Error: " + err.message + " (linha " + err.line + ")"
  });
}
})();
`;
}

/**
 * Gera o script ExtendScript para exportação de alta resolução (300 DPI) da camada ARTWORK
 */
export function generateArtworkExportJsx(project: IllustratorProjectPayload, outputPath: string): string {
  const cleanOutputPath = outputPath.replace(/\\/g, '/');

  return `// Script de Exportação da Camada de Arte PLMPackLib
#target illustrator

if (typeof JSON !== 'object') {
  JSON = {
    stringify: function(o) {
      if (o === null) return 'null';
      if (typeof o === 'number' || typeof o === 'boolean') return '' + o;
      if (typeof o === 'string') return '"' + o.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r') + '"';
      if (o instanceof Array) {
        var a = [];
        for (var i = 0; i < o.length; i++) a.push(JSON.stringify(o[i]));
        return '[' + a.join(',') + ']';
      }
      if (typeof o === 'object') {
        var p = [];
        for (var k in o) {
          if (o.hasOwnProperty(k)) p.push('"' + k + '":' + JSON.stringify(o[k]));
        }
        return '{' + p.join(',') + '}';
      }
      return 'null';
    }
  };
}

(function() {
  if (app.documents.length === 0) {
    return JSON.stringify({ error: "Nenhum documento aberto no Illustrator." });
  }

  var doc = app.activeDocument;
  var artworkLayers = [];

  try { artworkLayers.push(doc.layers.getByName("ARTWORK_EXTERNA")); } catch(e) {}
  try { artworkLayers.push(doc.layers.getByName("ARTWORK_INTERNA")); } catch(e) {}
  try { artworkLayers.push(doc.layers.getByName("ARTWORK")); } catch(e) {}
  try { artworkLayers.push(doc.layers.getByName("PLMPACKLIB_ARTE")); } catch(e) {}

  if (artworkLayers.length === 0) {
    return JSON.stringify({ error: "Nenhuma camada de arte encontrada no documento ativo." });
  }

  // Oculta temporariamente todas as camadas técnicas para exportar puramente a arte
  var layersVisibility = [];
  for (var i = 0; i < doc.layers.length; i++) {
    var l = doc.layers[i];
    layersVisibility.push({ layer: l, visible: l.visible });
    var isArtLayer = false;
    for (var k = 0; k < artworkLayers.length; k++) {
      if (l === artworkLayers[k]) {
        isArtLayer = true;
        break;
      }
    }
    l.visible = isArtLayer;
  }

  // 1. Exportação SVG Vetorial Real da Camada ARTWORK (Fase 6.1 — Seção 4 e 5)
  var svgOptions = new ExportOptionsSVG();
  svgOptions.embedRasterImages = true;
  svgOptions.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;
  svgOptions.cssProperties = SVGCSSPropertyLocation.STYLEATTRIBUTES;
  try { svgOptions.coordinatePrecision = 4; } catch(e) {}

  var cleanPathStr = "${cleanOutputPath}";
  var cleanSvgPath = cleanPathStr.replace(/\\.png$/i, '.svg');
  if (cleanSvgPath === cleanPathStr) {
    cleanSvgPath = cleanPathStr + '.svg';
  }
  var destSvgFile = new File(cleanSvgPath);
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

  // 2. Exportação PNG 24 bits a 300 DPI com transparência para Textura/Preview WebGL
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

  var artworkType = hasVector ? "VECTOR_AND_RASTER" : (destFile.exists ? "RASTER_ONLY" : "NONE");
  var vectorStatus = hasVector ? "VECTOR_SYNCHRONIZED" : "VECTOR_ARTWORK_UNAVAILABLE";

  return JSON.stringify({
    success: true,
    hasVector: hasVector,
    artworkType: artworkType,
    vectorStatus: vectorStatus,
    vectorSvg: vectorSvg,
    svgPath: destSvgFile.fsName,
    filePath: destFile.fsName,
    exists: destFile.exists,
    fileSize: destFile.length,
    projectId: "${project.projectId}",
    modelId: "${project.modelId}",
    modelCode: "${project.modelCode || ''}",
    projectRevision: ${project.projectRevision || 1},
    illustratorSessionId: "${project.illustratorSessionId || ''}"
  });
})();
`;
}
