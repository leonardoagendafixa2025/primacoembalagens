/**
 * VectorCraft Engine — Exportador PDF Vetorial
 * Gera PDFs vetoriais com camadas semânticas (corte, vinco, picote)
 * Inspirado no vectorcraft-pdf / craft-pdf do storytold/vectorcraft
 *
 * Gera PDF compatível com padrão ISO 32000-1 (PDF 1.7):
 *  - Vetores precisos em escala 1:1 (mm → pt)
 *  - Camadas OCG (Optional Content Groups) para cada tipo de linha
 *  - Cores por camada (CORTE vermelho, VINCO azul, PICOTE verde)
 *  - Marcas de registro e sangria opcionais
 *  - Cotas dimensionais
 */

import type { DielineResult, Segment2D, Arc2D, BoundingBox2D } from '../types';
import { generateCadAnnotations } from '../cadMarks';

const MM_TO_PT = 72 / 25.4; // 1 mm = 2.8346 pt

interface PdfExportOptions {
  includeBleed?: boolean;
  bleedMm?: number;
  includeRegistrationMarks?: boolean;
  includeDimensions?: boolean;
  title?: string;
  author?: string;
  /** Margem extra ao redor da faca (mm) */
  margin?: number;
}

interface PdfObject {
  id: number;
  content: string;
}

/**
 * Gera conteúdo PDF vetorial completo a partir de um DielineResult.
 */
export function buildPdfContent(
  dieline: DielineResult,
  options: PdfExportOptions = {}
): Uint8Array {
  const {
    includeBleed = true,
    bleedMm = 5,
    includeRegistrationMarks = true,
    includeDimensions = false,
    title = 'Faca de Embalagem - PLMPackLib + VectorCraft',
    author = 'Primacor Gráfica e Editora',
    margin = 15,
  } = options;

  const b = dieline.bounds;
  const pageW = (b.width + margin * 2) * MM_TO_PT;
  const pageH = (b.height + margin * 2) * MM_TO_PT;

  // Offset para centralizar a faca na página
  const ox = (margin - b.minX) * MM_TO_PT;
  const oy = (margin - b.minY) * MM_TO_PT;

  const objects: PdfObject[] = [];
  let nextObjId = 1;
  const allocObj = (): number => nextObjId++;

  // ─── Objetos Básicos ────────────────────────────────────────────
  const catalogId = allocObj();      // 1
  const pagesId = allocObj();        // 2
  const pageId = allocObj();         // 3
  const contentStreamId = allocObj(); // 4
  const procSetId = allocObj();      // 5
  const infoId = allocObj();         // 6

  // ─── Camadas OCG (Optional Content Groups) ────────────────────
  const ocgCutId = allocObj();
  const ocgCreaseId = allocObj();
  const ocgPerfoId = allocObj();
  const ocgBleedId = allocObj();
  const ocgMarksId = allocObj();
  const ocgDimsId = allocObj();
  const ocPropsId = allocObj();

  // ─── Construir Stream de Conteúdo ─────────────────────────────
  const streamLines: string[] = [];

  // Configurações iniciais
  streamLines.push('q'); // save state
  streamLines.push(`1 0 0 1 ${ox.toFixed(3)} ${oy.toFixed(3)} cm`); // translate

  // --- Sangria (Bleed) ---
  if (includeBleed) {
    const ann = generateCadAnnotations(b, { bleedMm });
    streamLines.push(`/OC /OCG_Bleed BDC`);
    streamLines.push('0.133 0.773 0.369 RG'); // verde #22c55e
    streamLines.push('0.35 w');
    streamLines.push('[4 2] 0 d');
    for (const bs of ann.bleedSegments) {
      const x0 = bs.x0 * MM_TO_PT;
      const y0 = bs.y0 * MM_TO_PT;
      const x1 = bs.x1 * MM_TO_PT;
      const y1 = bs.y1 * MM_TO_PT;
      streamLines.push(`${x0.toFixed(3)} ${y0.toFixed(3)} m ${x1.toFixed(3)} ${y1.toFixed(3)} l S`);
    }
    streamLines.push('EMC');
  }

  // --- Corte ---
  streamLines.push(`/OC /OCG_Cut BDC`);
  streamLines.push('0.937 0.267 0.267 RG'); // vermelho #ef4444
  streamLines.push('0.5 w');
  streamLines.push('[] 0 d');
  for (const seg of dieline.segments) {
    if (seg.type !== 'cut') continue;
    drawSegmentPdf(seg, streamLines);
  }
  for (const arc of dieline.arcs || []) {
    if (arc.type !== 'cut') continue;
    drawArcPdf(arc, streamLines);
  }
  streamLines.push('EMC');

  // --- Vinco ---
  streamLines.push(`/OC /OCG_Crease BDC`);
  streamLines.push('0.231 0.510 0.965 RG'); // azul #3b82f6
  streamLines.push('0.5 w');
  streamLines.push('[4 3] 0 d');
  for (const seg of dieline.segments) {
    if (seg.type !== 'crease') continue;
    drawSegmentPdf(seg, streamLines);
  }
  for (const arc of dieline.arcs || []) {
    if (arc.type !== 'crease') continue;
    drawArcPdf(arc, streamLines);
  }
  streamLines.push('EMC');

  // --- Picote ---
  streamLines.push(`/OC /OCG_Perfo BDC`);
  streamLines.push('0.063 0.725 0.506 RG'); // verde #10b981
  streamLines.push('0.5 w');
  streamLines.push('[2 2] 0 d');
  for (const seg of dieline.segments) {
    if (seg.type !== 'perfo') continue;
    drawSegmentPdf(seg, streamLines);
  }
  for (const arc of dieline.arcs || []) {
    if (arc.type !== 'perfo') continue;
    drawArcPdf(arc, streamLines);
  }
  streamLines.push('EMC');

  // --- Marcas de Registro ---
  if (includeRegistrationMarks) {
    const ann = generateCadAnnotations(b, { bleedMm });
    streamLines.push(`/OC /OCG_Marks BDC`);
    streamLines.push('0.659 0.333 0.969 RG'); // roxo #a855f7
    streamLines.push('0.4 w');
    streamLines.push('[] 0 d');
    for (const rm of ann.registrationMarks) {
      const cx = rm.circle.cx * MM_TO_PT;
      const cy = rm.circle.cy * MM_TO_PT;
      const r = rm.circle.r * MM_TO_PT;
      // Desenha círculo usando 4 curvas Bézier
      const k = r * 0.5523;
      streamLines.push(`${(cx + r).toFixed(3)} ${cy.toFixed(3)} m`);
      streamLines.push(`${(cx + r).toFixed(3)} ${(cy + k).toFixed(3)} ${(cx + k).toFixed(3)} ${(cy + r).toFixed(3)} ${cx.toFixed(3)} ${(cy + r).toFixed(3)} c`);
      streamLines.push(`${(cx - k).toFixed(3)} ${(cy + r).toFixed(3)} ${(cx - r).toFixed(3)} ${(cy + k).toFixed(3)} ${(cx - r).toFixed(3)} ${cy.toFixed(3)} c`);
      streamLines.push(`${(cx - r).toFixed(3)} ${(cy - k).toFixed(3)} ${(cx - k).toFixed(3)} ${(cy - r).toFixed(3)} ${cx.toFixed(3)} ${(cy - r).toFixed(3)} c`);
      streamLines.push(`${(cx + k).toFixed(3)} ${(cy - r).toFixed(3)} ${(cx + r).toFixed(3)} ${(cy - k).toFixed(3)} ${(cx + r).toFixed(3)} ${cy.toFixed(3)} c S`);
      for (const cs of rm.segments) {
        drawSegmentPdf(cs, streamLines);
      }
    }
    for (const cm of ann.centerMarks) {
      drawSegmentPdf(cm, streamLines);
    }
    streamLines.push('EMC');
  }

  // --- Cotas ---
  if (includeDimensions && dieline.dimensions) {
    streamLines.push(`/OC /OCG_Dims BDC`);
    streamLines.push('0.024 0.714 0.831 RG'); // ciano #06b6d4
    streamLines.push('0.3 w');
    streamLines.push('[] 0 d');
    for (const dim of dieline.dimensions) {
      const x0 = dim.x0 * MM_TO_PT;
      const y0 = dim.y0 * MM_TO_PT;
      const x1 = dim.x1 * MM_TO_PT;
      const y1 = dim.y1 * MM_TO_PT;
      streamLines.push(`${x0.toFixed(3)} ${y0.toFixed(3)} m ${x1.toFixed(3)} ${y1.toFixed(3)} l S`);
    }
    streamLines.push('EMC');
  }

  streamLines.push('Q'); // restore state

  const streamContent = streamLines.join('\n');
  const streamBytes = new TextEncoder().encode(streamContent);

  // ─── Montar Objetos PDF ───────────────────────────────────────

  // Info
  const now = new Date();
  const dateStr = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  objects.push({
    id: infoId,
    content: `<< /Title (${escapePdfString(title)}) /Author (${escapePdfString(author)}) /Creator (PLMPackLib VectorCraft Engine) /Producer (PLMPackLib + VectorCraft PDF Engine) /CreationDate (${dateStr}) >>`,
  });

  // OCGs
  objects.push({ id: ocgCutId, content: `<< /Type /OCG /Name (Corte) >>` });
  objects.push({ id: ocgCreaseId, content: `<< /Type /OCG /Name (Vinco) >>` });
  objects.push({ id: ocgPerfoId, content: `<< /Type /OCG /Name (Picote) >>` });
  objects.push({ id: ocgBleedId, content: `<< /Type /OCG /Name (Sangria) >>` });
  objects.push({ id: ocgMarksId, content: `<< /Type /OCG /Name (Marcas de Registro) >>` });
  objects.push({ id: ocgDimsId, content: `<< /Type /OCG /Name (Cotas) >>` });

  // OC Properties
  objects.push({
    id: ocPropsId,
    content: `<< /Type /OCProperties /OCGs [${ocgCutId} 0 R ${ocgCreaseId} 0 R ${ocgPerfoId} 0 R ${ocgBleedId} 0 R ${ocgMarksId} 0 R ${ocgDimsId} 0 R] /D << /ON [${ocgCutId} 0 R ${ocgCreaseId} 0 R ${ocgPerfoId} 0 R ${ocgBleedId} 0 R ${ocgMarksId} 0 R] /OFF [${ocgDimsId} 0 R] /Order [${ocgCutId} 0 R ${ocgCreaseId} 0 R ${ocgPerfoId} 0 R ${ocgBleedId} 0 R ${ocgMarksId} 0 R ${ocgDimsId} 0 R] >> >>`,
  });

  // Catalog
  objects.push({
    id: catalogId,
    content: `<< /Type /Catalog /Pages ${pagesId} 0 R /OCProperties ${ocPropsId} 0 R >>`,
  });

  // Pages
  objects.push({
    id: pagesId,
    content: `<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`,
  });

  // Content Stream
  objects.push({
    id: contentStreamId,
    content: `<< /Length ${streamBytes.length} >>\nstream\n${streamContent}\nendstream`,
  });

  // ProcSet
  objects.push({
    id: procSetId,
    content: `[/PDF /Text]`,
  });

  // Page
  objects.push({
    id: pageId,
    content: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW.toFixed(3)} ${pageH.toFixed(3)}] /Contents ${contentStreamId} 0 R /Resources << /ProcSet ${procSetId} 0 R /Properties << /OCG_Cut ${ocgCutId} 0 R /OCG_Crease ${ocgCreaseId} 0 R /OCG_Perfo ${ocgPerfoId} 0 R /OCG_Bleed ${ocgBleedId} 0 R /OCG_Marks ${ocgMarksId} 0 R /OCG_Dims ${ocgDimsId} 0 R >> >> >>`,
  });

  // ─── Serializar PDF ───────────────────────────────────────────
  return serializePdf(objects, catalogId, infoId);
}

function drawSegmentPdf(seg: Segment2D | { x0: number; y0: number; x1: number; y1: number }, lines: string[]): void {
  const x0 = seg.x0 * MM_TO_PT;
  const y0 = seg.y0 * MM_TO_PT;
  const x1 = seg.x1 * MM_TO_PT;
  const y1 = seg.y1 * MM_TO_PT;
  lines.push(`${x0.toFixed(3)} ${y0.toFixed(3)} m ${x1.toFixed(3)} ${y1.toFixed(3)} l S`);
}

function drawArcPdf(arc: Arc2D, lines: string[]): void {
  // Aproxima arco com curvas Bézier
  const startRad = (arc.startAngle * Math.PI) / 180;
  const endRad = (arc.endAngle * Math.PI) / 180;
  let span = endRad - startRad;
  while (span < 0) span += 2 * Math.PI;
  if (span < 0.001) span = 2 * Math.PI;

  const numSegs = Math.max(1, Math.ceil(span / (Math.PI / 2)));
  const segAngle = span / numSegs;
  const kappa = (4 / 3) * Math.tan(segAngle / 4);

  for (let i = 0; i < numSegs; i++) {
    const a1 = startRad + i * segAngle;
    const a2 = a1 + segAngle;

    const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
    const cos2 = Math.cos(a2), sin2 = Math.sin(a2);

    const r = arc.r * MM_TO_PT;
    const cx = arc.cx * MM_TO_PT;
    const cy = arc.cy * MM_TO_PT;

    const x0 = cx + r * cos1;
    const y0 = cy + r * sin1;
    const x3 = cx + r * cos2;
    const y3 = cy + r * sin2;

    const x1 = x0 - r * kappa * sin1;
    const y1 = y0 + r * kappa * cos1;
    const x2 = x3 + r * kappa * sin2;
    const y2 = y3 - r * kappa * cos2;

    if (i === 0) {
      lines.push(`${x0.toFixed(3)} ${y0.toFixed(3)} m`);
    }
    lines.push(`${x1.toFixed(3)} ${y1.toFixed(3)} ${x2.toFixed(3)} ${y2.toFixed(3)} ${x3.toFixed(3)} ${y3.toFixed(3)} c`);
  }
  lines.push('S');
}

function escapePdfString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function serializePdf(objects: PdfObject[], catalogId: number, infoId: number): Uint8Array {
  const parts: string[] = [];
  parts.push('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');

  const offsets: number[] = [];
  let currentOffset = parts[0].length;

  // Ordena por ID
  objects.sort((a, b) => a.id - b.id);

  for (const obj of objects) {
    offsets[obj.id] = currentOffset;
    const objStr = `${obj.id} 0 obj\n${obj.content}\nendobj\n`;
    parts.push(objStr);
    currentOffset += objStr.length;
  }

  // xref table
  const xrefOffset = currentOffset;
  const xrefLines: string[] = [];
  xrefLines.push('xref');
  xrefLines.push(`0 ${objects.length + 1}`);
  xrefLines.push('0000000000 65535 f ');

  for (let i = 1; i <= objects.length; i++) {
    const off = offsets[i] || 0;
    xrefLines.push(`${String(off).padStart(10, '0')} 00000 n `);
  }

  parts.push(xrefLines.join('\n') + '\n');

  // Trailer
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`);
  parts.push(`startxref\n${xrefOffset}\n%%EOF`);

  const fullContent = parts.join('');
  return new TextEncoder().encode(fullContent);
}

// ─── API de Download ────────────────────────────────────────────────

/**
 * Exporta a faca para PDF e dispara download no browser.
 */
export function exportToPDF(
  dieline: DielineResult,
  filename = 'faca_embalagem.pdf',
  options?: PdfExportOptions
): void {
  const pdfBytes = buildPdfContent(dieline, options);
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
