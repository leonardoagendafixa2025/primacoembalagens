import type { DielineResult, Segment2D, Arc2D } from './types';
import type { PackagingGeometry } from './geometry';
import type { ImpositionResult } from './imposition';
import { generateCadAnnotations } from './cadMarks';

export interface ExportOptions {
  includeBleed?: boolean;
  bleedMm?: number;
  includeRegistrationMarks?: boolean;
}

/**
 * Monta o conteúdo de um arquivo DXF AutoCAD R12 padrão industrial.
 * Compatível com Adobe Illustrator, CorelDraw, AutoCAD e mesas de corte (Zünd, Kongsberg, Esko, Laser).
 */
export function buildDxfContent(
  entities: {
    segments: Segment2D[];
    arcs?: Arc2D[];
  },
  customLayers?: { name: string; color: number; style: string }[]
): string {
  const lines: string[] = [];

  // Cabeçalho DXF
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$ACADVER', '1', 'AC1009'); // AutoCAD Release 11/12
  lines.push('9', '$INSUNITS', '70', '4');    // 4 = Millimeters
  lines.push('0', 'ENDSEC');

  // Seção de Tabelas e Camadas (Layers)
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '8');

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
  // Camada SANGRIA (Verde Claro - Cor 3)
  lines.push('0', 'LAYER', '2', 'SANGRIA', '70', '0', '62', '3', '6', 'DASHED');
  // Camada REGISTRO (Magenta - Cor 6)
  lines.push('0', 'LAYER', '2', 'REGISTRO', '70', '0', '62', '6', '6', 'CONTINUOUS');

  if (customLayers) {
    for (const cl of customLayers) {
      lines.push('0', 'LAYER', '2', cl.name, '70', '0', '62', String(cl.color), '6', cl.style);
    }
  }

  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // Seção de Entidades CAD
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // 1. Exporta Segmentos (Lines)
  for (const seg of entities.segments) {
    let layer = (seg as any).layer || 'CORTE';
    if (!(seg as any).layer) {
      if (seg.type === 'crease') layer = 'VINCO';
      else if (seg.type === 'perfo') layer = 'PICOTE';
      else if (seg.type === 'dimension') layer = 'COTAS';
    }

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
      let layer = (arc as any).layer || 'CORTE';
      if (!(arc as any).layer) {
        if (arc.type === 'crease') layer = 'VINCO';
        else if (arc.type === 'perfo') layer = 'PICOTE';
        else if (arc.type === 'dimension') layer = 'COTAS';
      }

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
  filename = 'faca_embalagem.dxf',
  options: ExportOptions = { includeBleed: true, includeRegistrationMarks: true, bleedMm: 5 }
): void {
  const allSegs: Segment2D[] = [...dieline.segments];
  const allArcs: Arc2D[] = [...(dieline.arcs || [])];

  if (options.includeBleed || options.includeRegistrationMarks) {
    const ann = generateCadAnnotations(dieline.bounds, { bleedMm: options.bleedMm ?? 5 });
    if (options.includeBleed) {
      for (const bs of ann.bleedSegments) {
        allSegs.push({ ...bs, layer: 'SANGRIA' } as any);
      }
    }
    if (options.includeRegistrationMarks) {
      for (const rm of ann.registrationMarks) {
        allArcs.push({ ...rm.circle, layer: 'REGISTRO' } as any);
        for (const cs of rm.segments) {
          allSegs.push({ ...cs, layer: 'REGISTRO' } as any);
        }
      }
      for (const cm of ann.centerMarks) {
        allSegs.push({ ...cm, layer: 'REGISTRO' } as any);
      }
    }
  }

  const content = buildDxfContent({
    segments: allSegs,
    arcs: allArcs,
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
  filename = 'faca_embalagem.svg',
  options: ExportOptions = { includeBleed: true, includeRegistrationMarks: true, bleedMm: 5 }
): void {
  const margin = 25;
  const b = dieline.bounds;
  const viewBoxWidth = b.width + margin * 2;
  const viewBoxHeight = b.height + margin * 2;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxWidth}mm" height="${viewBoxHeight}mm" viewBox="${-margin} ${-margin} ${viewBoxWidth} ${viewBoxHeight}">\n`;
  svg += `  <style>\n`;
  svg += `    .cut { stroke: #ef4444; stroke-width: 0.5; fill: none; }\n`;
  svg += `    .crease { stroke: #00d2b4; stroke-width: 0.5; stroke-dasharray: 4,3; fill: none; }\n`;
  svg += `    .perfo { stroke: #10B981; stroke-width: 0.5; stroke-dasharray: 2,2; fill: none; }\n`;
  svg += `    .bleed { stroke: #22c55e; stroke-width: 0.35; stroke-dasharray: 4,2; fill: none; }\n`;
  svg += `    .mark { stroke: #a855f7; stroke-width: 0.4; fill: none; }\n`;
  svg += `  </style>\n`;

  // Camada de Sangria (Bleed)
  if (options.includeBleed) {
    const ann = generateCadAnnotations(b, { bleedMm: options.bleedMm ?? 5 });
    svg += `  <g id="layer-bleed">\n`;
    for (const bs of ann.bleedSegments) {
      const y0 = b.height - (bs.y0 - b.minY);
      const y1 = b.height - (bs.y1 - b.minY);
      const x0 = bs.x0 - b.minX;
      const x1 = bs.x1 - b.minX;
      svg += `    <line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" class="bleed" />\n`;
    }
    svg += `  </g>\n`;
  }

  // Camada de Faca Principal (Corte e Vinco)
  svg += `  <g id="layer-dieline">\n`;

  for (const seg of dieline.segments) {
    const cls = seg.type === 'crease' ? 'crease' : seg.type === 'perfo' ? 'perfo' : 'cut';
    const y0 = b.height - (seg.y0 - b.minY);
    const y1 = b.height - (seg.y1 - b.minY);
    const x0 = seg.x0 - b.minX;
    const x1 = seg.x1 - b.minX;
    svg += `    <line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" class="${cls}" />\n`;
  }

  if (dieline.arcs) {
    for (const arc of dieline.arcs) {
      const cls = arc.type === 'crease' ? 'crease' : arc.type === 'perfo' ? 'perfo' : 'cut';
      let delta = arc.endAngle - arc.startAngle;
      while (delta < 0) delta += 360;
      while (delta > 360) delta -= 360;

      const cx = arc.cx - b.minX;
      const cy = b.height - (arc.cy - b.minY);

      if (Math.abs(delta - 360) < 1e-3 || delta === 0) {
        svg += `    <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${arc.r.toFixed(2)}" class="${cls}" />\n`;
      } else {
        const radBeg = (arc.startAngle * Math.PI) / 180;
        const radEnd = (arc.endAngle * Math.PI) / 180;
        const x1 = cx + arc.r * Math.cos(radBeg);
        const y1 = cy - arc.r * Math.sin(radBeg);
        const x2 = cx + arc.r * Math.cos(radEnd);
        const y2 = cy - arc.r * Math.sin(radEnd);
        const largeArc = delta > 180 ? 1 : 0;
        svg += `    <path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${arc.r.toFixed(2)} ${arc.r.toFixed(2)} 0 ${largeArc} 0 ${x2.toFixed(2)} ${y2.toFixed(2)}" class="${cls}" />\n`;
      }
    }
  }

  svg += `  </g>\n`;

  // Camada de Marcas de Registro CNC
  if (options.includeRegistrationMarks) {
    const ann = generateCadAnnotations(b, { bleedMm: options.bleedMm ?? 5 });
    svg += `  <g id="layer-marks">\n`;
    for (const rm of ann.registrationMarks) {
      const cx = rm.center.x - b.minX;
      const cy = b.height - (rm.center.y - b.minY);
      svg += `    <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rm.radius.toFixed(2)}" class="mark" />\n`;
      for (const cs of rm.segments) {
        const x0 = cs.x0 - b.minX;
        const y0 = b.height - (cs.y0 - b.minY);
        const x1 = cs.x1 - b.minX;
        const y1 = b.height - (cs.y1 - b.minY);
        svg += `    <line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" class="mark" />\n`;
      }
    }
    for (const cm of ann.centerMarks) {
      const x0 = cm.x0 - b.minX;
      const y0 = b.height - (cm.y0 - b.minY);
      const x1 = cm.x1 - b.minX;
      const y1 = b.height - (cm.y1 - b.minY);
      svg += `    <line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" class="mark" />\n`;
    }
    svg += `  </g>\n`;
  }

  svg += `</svg>`;

  downloadFile(svg, filename.endsWith('.svg') ? filename : `${filename}.svg`, 'image/svg+xml;charset=utf-8');
}
