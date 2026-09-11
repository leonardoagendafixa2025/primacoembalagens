import type { DielineResult, Segment2D, Arc2D } from './types';
import type { PackagingGeometry } from './geometry';
import type { ImpositionResult } from './imposition';

/**
 * Monta o conteúdo de um arquivo DXF AutoCAD R12 padrão industrial.
 * Compatível com Adobe Illustrator, CorelDraw, AutoCAD e mesas de corte (Zünd, Kongsberg, Esko, Laser).
 */
export function buildDxfContent(entities: {
  segments: Segment2D[];
  arcs?: Arc2D[];
}): string {
  const lines: string[] = [];

  // Cabeçalho DXF
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1009'); // AutoCAD Release 11/12
  lines.push('9', '$INSUNITS', '70', '4');    // 4 = Millimeters
  lines.push('0', 'ENDSEC');

  // Seção de Tabelas e Camadas (Layers)
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '6');

  // Camada CHAPA (Branco/Cinza - Cor 7)
  lines.push('0', 'LAYER', '2', 'CHAPA', '70', '0', '62', '7', '6', 'CONTINUOUS');
  // Camada PINCA (Cinza - Cor 8)
  lines.push('0', 'LAYER', '2', 'PINCA', '70', '0', '62', '8', '6', 'DASHED');
  // Camada CORTE (Vermelho - Cor 1 / L5-113 no PLMPackLib)
  lines.push('0', 'LAYER', '2', 'CORTE', '70', '0', '62', '1', '6', 'CONTINUOUS');
  // Camada VINCO (Azul - Cor 5 / L8-123 no PLMPackLib)
  lines.push('0', 'LAYER', '2', 'VINCO', '70', '0', '62', '5', '6', 'DASHED');
  // Camada PICOTE (Verde - Cor 3 / EC1-193 no PLMPackLib)
  lines.push('0', 'LAYER', '2', 'PICOTE', '70', '0', '62', '3', '6', 'DASHDOT');
  // Camada COTAS (Ciano - Cor 4 / LDM-4 no PLMPackLib)
  lines.push('0', 'LAYER', '2', 'COTAS', '70', '0', '62', '4', '6', 'CONTINUOUS');

  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // Seção de Entidades CAD
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // 1. Exporta Segmentos (Lines)
  for (const seg of entities.segments) {
    let layer = 'CORTE';
    if (seg.type === 'crease') layer = 'VINCO';
    else if (seg.type === 'perfo') layer = 'PICOTE';
    else if (seg.type === 'dimension') layer = 'COTAS';

    lines.push('0', 'LINE');
    lines.push('8', layer);
    lines.push('10', seg.x0.toFixed(3));
    lines.push('20', seg.y0.toFixed(3));
    lines.push('30', '0.0');
    lines.push('11', seg.x1.toFixed(3));
    lines.push('21', seg.y1.toFixed(3));
    lines.push('31', '0.0');
  }

  // 2. Exporta Arcos (Arcs)
  if (entities.arcs && entities.arcs.length > 0) {
    for (const arc of entities.arcs) {
      let layer = 'CORTE';
      if (arc.type === 'crease') layer = 'VINCO';
      else if (arc.type === 'perfo') layer = 'PICOTE';
      else if (arc.type === 'dimension') layer = 'COTAS';

      lines.push('0', 'ARC');
      lines.push('8', layer);
      lines.push('10', arc.cx.toFixed(3));
      lines.push('20', arc.cy.toFixed(3));
      lines.push('30', '0.0');
      lines.push('40', arc.r.toFixed(3));
      lines.push('50', arc.startAngle.toFixed(3));
      lines.push('51', arc.endAngle.toFixed(3));
    }
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\r\n');
}

/**
 * Dispara o download de um arquivo no navegador
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta a faca paramétrica individual para DXF
 */
export function exportToDXF(
  dieline: DielineResult | PackagingGeometry,
  filename = 'faca_embalagem.dxf'
): void {
  const content = buildDxfContent({
    segments: dieline.segments,
    arcs: dieline.arcs || [],
  });
  downloadFile(content, filename.endsWith('.dxf') ? filename : `${filename}.dxf`, 'application/dxf;charset=utf-8');
}

/**
 * Exporta a prancha gráfica de imposição completa para DXF
 * Inclui o contorno da chapa, linhas de margem e todas as poses individuais transformadas
 */
export function exportImpositionToDXF(
  imposition: ImpositionResult,
  filename = 'imposicao_chapa.dxf'
): void {
  const allSegments: Segment2D[] = [];
  const allArcs: Arc2D[] = [];

  const W = imposition.sheetWidth;
  const H = imposition.sheetHeight;

  // 1. Contorno da chapa (Layer CHAPA)
  allSegments.push(
    { x0: 0, y0: 0, x1: W, y1: 0, type: 'cut' },
    { x0: W, y0: 0, x1: W, y1: H, type: 'cut' },
    { x0: W, y0: H, x1: 0, y1: H, type: 'cut' },
    { x0: 0, y0: H, x1: 0, y1: 0, type: 'cut' }
  );

  // 2. Coleta todas as entidades das poses individuais
  for (const pose of imposition.bestSolution.poses) {
    if (pose.geometry && pose.geometry.segments) {
      allSegments.push(...pose.geometry.segments);
    }
    if (pose.geometry && pose.geometry.arcs) {
      allArcs.push(...pose.geometry.arcs);
    }
  }

  const content = buildDxfContent({
    segments: allSegments,
    arcs: allArcs,
  });

  downloadFile(
    content,
    filename.endsWith('.dxf') ? filename : `${filename}.dxf`,
    'application/dxf;charset=utf-8'
  );
}

/**
 * Exporta a faca em formato SVG vetorial em escala 1:1.
 */
export function exportToSVG(
  dieline: DielineResult | PackagingGeometry,
  filename = 'faca_embalagem.svg'
): void {
  const margin = 20;
  const b = dieline.bounds;
  const viewBoxWidth = b.width + margin * 2;
  const viewBoxHeight = b.height + margin * 2;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxWidth}mm" height="${viewBoxHeight}mm" viewBox="${-margin} ${-margin} ${viewBoxWidth} ${viewBoxHeight}">\n`;
  svg += `  <style>\n`;
  svg += `    .cut { stroke: #c53236; stroke-width: 0.5; fill: none; }\n`;
  svg += `    .crease { stroke: #35a89e; stroke-width: 0.5; stroke-dasharray: 4,3; fill: none; }\n`;
  svg += `    .perfo { stroke: #10B981; stroke-width: 0.5; stroke-dasharray: 2,2; fill: none; }\n`;
  svg += `  </style>\n`;
  svg += `  <g id="Faca">\n`;

  for (const seg of dieline.segments) {
    const cls = seg.type === 'crease' ? 'crease' : seg.type === 'perfo' ? 'perfo' : 'cut';
    const y0 = b.height - seg.y0;
    const y1 = b.height - seg.y1;
    svg += `    <line x1="${seg.x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${seg.x1.toFixed(2)}" y2="${y1.toFixed(2)}" class="${cls}" />\n`;
  }

  if (dieline.arcs) {
    for (const arc of dieline.arcs) {
      const cls = arc.type === 'crease' ? 'crease' : arc.type === 'perfo' ? 'perfo' : 'cut';
      const radBeg = (arc.startAngle * Math.PI) / 180;
      const radEnd = (arc.endAngle * Math.PI) / 180;
      const x1 = arc.cx + arc.r * Math.cos(radBeg);
      const y1 = b.height - (arc.cy + arc.r * Math.sin(radBeg));
      const x2 = arc.cx + arc.r * Math.cos(radEnd);
      const y2 = b.height - (arc.cy + arc.r * Math.sin(radEnd));
      const largeArc = Math.abs(arc.endAngle - arc.startAngle) > 180 ? 1 : 0;
      svg += `    <path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${arc.r.toFixed(2)} ${arc.r.toFixed(2)} 0 ${largeArc} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}" class="${cls}" />\n`;
    }
  }

  svg += `  </g>\n`;
  svg += `</svg>`;

  downloadFile(svg, filename.endsWith('.svg') ? filename : `${filename}.svg`, 'image/svg+xml;charset=utf-8');
}
