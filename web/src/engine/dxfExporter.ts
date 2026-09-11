import type { DielineResult } from './types';

/**
 * Exporta o resultado da faca paramétrica em formato DXF AutoCAD R12 padrão industrial.
 * Compatível com Adobe Illustrator, CorelDraw, AutoCAD e mesas de corte (Zünd, Kongsberg, Laser).
 */
export function exportToDXF(dieline: DielineResult, filename = 'faca_embalagem.dxf'): void {
  const lines: string[] = [];

  // Cabeçalho DXF
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1009'); // AutoCAD Release 11/12
  lines.push('9', '$INSUNITS', '70', '4');    // 4 = Millimeters
  lines.push('0', 'ENDSEC');

  // Seção de Tabelas e Camadas (Layers)
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '4');

  // Camada CORTE (Vermelho - Cor 1)
  lines.push('0', 'LAYER', '2', 'CORTE', '70', '0', '62', '1', '6', 'CONTINUOUS');
  // Camada VINCO (Azul - Cor 5)
  lines.push('0', 'LAYER', '2', 'VINCO', '70', '0', '62', '5', '6', 'DASHED');
  // Camada PICOTE (Verde - Cor 3)
  lines.push('0', 'LAYER', '2', 'PICOTE', '70', '0', '62', '3', '6', 'DASHDOT');
  // Camada COTAS (Ciano - Cor 4)
  lines.push('0', 'LAYER', '2', 'COTAS', '70', '0', '62', '4', '6', 'CONTINUOUS');

  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // Seção de Entidades
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  for (const seg of dieline.segments) {
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

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  const content = lines.join('\r\n');
  const blob = new Blob([content], { type: 'application/dxf;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.dxf') ? filename : `${filename}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exporta a faca em formato SVG vetorial em escala 1:1.
 */
export function exportToSVG(dieline: DielineResult, filename = 'faca_embalagem.svg'): void {
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
    // Invertemos Y para coordenadas padrão SVG de cima para baixo
    const y0 = b.height - seg.y0;
    const y1 = b.height - seg.y1;
    svg += `    <line x1="${seg.x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${seg.x1.toFixed(2)}" y2="${y1.toFixed(2)}" class="${cls}" />\n`;
  }

  svg += `  </g>\n`;
  svg += `</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
