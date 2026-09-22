import fs from 'node:fs';
import * as fflate from 'fflate';
import { CadImportEngine } from '../src/engine/importers/CadImportEngine';
import { LoopTopologyEngine } from '../src/engine/importers/LoopTopologyEngine';
import { FoldingTreeEngine } from '../src/engine/importers/FoldingTreeEngine';

async function testCompressedPdf() {
  const vectorStream = [
    'q',
    '1 0 0 RG',
    '1 w',
    '0 0 m 850.39 0 l 850.39 566.93 l 0 566.93 l h S',
    '0 1 0 RG',
    '283.46 0 m 283.46 566.93 l S',
    '566.93 0 m 566.93 566.93 l S',
    'Q'
  ].join('\n');

  const rawBytes = new TextEncoder().encode(vectorStream);
  const compressed = fflate.zlibSync(rawBytes);

  const pdfHeader = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 850.39 566.93] /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${compressed.length} /Filter /FlateDecode >>`,
    'stream\r\n'
  ].join('\r\n');

  const pdfFooter = [
    '\r\nendstream',
    'endobj',
    'xref',
    '0 5',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000214 00000 n ',
    'trailer << /Size 5 /Root 1 0 R >>',
    'startxref',
    '500',
    '%%EOF'
  ].join('\r\n');

  const fullPdf = Buffer.concat([
    Buffer.from(pdfHeader, 'latin1'),
    compressed,
    Buffer.from(pdfFooter, 'latin1')
  ]);

  fs.writeFileSync('tests/import-fixtures/08_compressed_real_die.pdf', fullPdf);
  console.log('PDF gerado e salvo: tests/import-fixtures/08_compressed_real_die.pdf (' + fullPdf.length + ' bytes)');

  const doc = await CadImportEngine.importFile(fullPdf, '08_compressed_real_die.pdf');
  console.log('PDF importado com sucesso!');
  console.log('Formato:', doc.format);
  console.log('Entidades vetoriais extraídas:', doc.entities.length);
  console.log('Unidade detectada:', doc.detectedUnit);

  const { dieline, report } = CadImportEngine.buildPackagingGeometry(doc);
  console.log('Classificação:', report.classifiedCounts);
  console.log('Dieline:', dieline.segments.length, 'segmentos');
  console.log('Dimensões detectadas:', dieline.bounds.width.toFixed(1), 'x', dieline.bounds.height.toFixed(1), 'mm');

  const topo = LoopTopologyEngine.extractTopology(dieline);
  const tree = FoldingTreeEngine.buildFoldingTree(topo.panels, dieline);
  console.log('Topologia 3D:', topo.panels.length, 'painéis,', tree.hinges.length, 'vincos dobráveis');
}

testCompressedPdf().catch(err => {
  console.error('Falha no teste:', err);
  process.exit(1);
});
