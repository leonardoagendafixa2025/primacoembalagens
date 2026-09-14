import { fefco0429 } from '../src/engine/models/fefco0429';
import { buildDxfContent } from '../src/engine/dxfExporter';

console.log('=== TESTE FORENSE EXPORTACAO DXF/SVG (FEFCO 0429) ===');

const dieline = fefco0429.calculate({ L: 300, B: 200, H: 150, Ep: 3.0, H7: 100 });
const dxf = buildDxfContent(dieline);

// Conta entidades no DXF
const lineMatches = dxf.match(/\r?\nLINE\r?\n/g) || [];
const arcMatches = dxf.match(/\r?\nARC\r?\n/g) || [];

console.log('DXF Linhas encontradas: ' + lineMatches.length + ' (Esperado: ' + dieline.segments.length + ')');
console.log('DXF Arcos encontrados: ' + arcMatches.length + ' (Esperado: ' + (dieline.arcs ? dieline.arcs.length : 0) + ')');

const dxfPass = lineMatches.length === dieline.segments.length && arcMatches.length === (dieline.arcs ? dieline.arcs.length : 0);
console.log('[TESTE DXF EXPORT] ' + (dxfPass ? 'PASS' : 'FAIL'));
