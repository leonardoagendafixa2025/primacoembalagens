/**
 * Testes e Validação do Motor CAD - Primacor PLMPackLib Web
 * Executa as validações exigidas nos itens 16 e 17 do prompt
 */

import { fefco0201 } from '../src/engine/models/fefco0201.ts';
import { fefco0200 } from '../src/engine/models/fefco0200.ts';
import { fefco0203 } from '../src/engine/models/fefco0203.ts';
import { fefco0427 } from '../src/engine/models/fefco0427.ts';
import { ecmaB1001 } from '../src/engine/models/ecmaB1001.ts';
import { toPackagingGeometry } from '../src/engine/geometry.ts';
import { calculateImpositionCAD } from '../src/engine/imposition.ts';
import { buildDxfContent } from '../src/engine/dxfExporter.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

console.log('====================================================');
console.log('VALIDAÇÃO DO MOTOR CAD — PRIMACOR / PLMPackLib Web');
console.log('====================================================\n');

// ----------------------------------------------------
// TESTE 1: FEFCO 0201 (L=200, B=150, H=100, Ep=3, M=30)
// ----------------------------------------------------
console.log('1. Testando FEFCO 0201 (Caso 1: 200x150x100 Ep=3 M=30)...');
const res1 = fefco0201.calculate({ L: 200, B: 150, H: 100, Ep: 3, M: 30, Cut: 1, Ec: 6 });

// Esperado pelas fórmulas C#:
// L1 = 200 + 3 - 1 = 202
// B1 = 150 + 3 = 153
// L2 = 200 + 3 = 203
// B2 = 150 + 3 = 153
// H1 = 100 + 2*3 = 106
// FL = FB = Math.floor((150 + 3)/2) = 76
// Width = 30 + 202 + 153 + 203 + 153 = 741
// Height = 76 + 106 + 76 = 258
assert(Math.abs(res1.bounds.width - 741) < 0.1, `Largura da faca esperada 741mm, obtido ${res1.bounds.width}`);
assert(Math.abs(res1.bounds.height - 258) < 0.1, `Altura da faca esperada 258mm, obtido ${res1.bounds.height}`);
assert(res1.segments.length > 20, `Segmentos de corte e vinco gerados: ${res1.segments.length}`);
assert(res1.arcs.length === 12, `Arcos de DieCut gerados (12 arcos nas ranhuras: 6 ranhuras x 2 cantos): ${res1.arcs.length}`);

// Validação de segmentos degenerados
for (const seg of res1.segments) {
  const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0);
  assert(len > 0.001, `Segmento não degenerado [${seg.x0}, ${seg.y0}] -> [${seg.x1}, ${seg.y1}] (tam: ${len.toFixed(2)})`);
}

// ----------------------------------------------------
// TESTE 2: FEFCO 0201 (L=300, B=200, H=150, Ep=5, M=40)
// ----------------------------------------------------
console.log('\n2. Testando FEFCO 0201 (Caso 2: 300x200x150 Ep=5 M=40)...');
const res2 = fefco0201.calculate({ L: 300, B: 200, H: 150, Ep: 5, M: 40, Cut: 1, Ec: 6 });
// L1 = 304, B1 = 205, L2 = 305, B2 = 205 => Soma = 1019 + 40 = 1059
// H1 = 160, FL = FB = Math.floor(205/2) = 102 => Height = 102 + 160 + 102 = 364
assert(Math.abs(res2.bounds.width - 1059) < 0.1, `Largura esperada 1059mm, obtido ${res2.bounds.width}`);
assert(Math.abs(res2.bounds.height - 364) < 0.1, `Altura esperada 364mm, obtido ${res2.bounds.height}`);

// ----------------------------------------------------
// TESTE 3: FEFCO 0200, FEFCO 0203, FEFCO 0427, ECMA B10.01
// ----------------------------------------------------
console.log('\n3. Testando outros modelos FEFCO e ECMA...');
const res0200 = fefco0200.calculate({ L: 300, B: 200, H: 150, Ep: 3, M: 35 });
assert(res0200.bounds.height < res2.bounds.height, `FEFCO 0200 (sem abas superiores) possui altura menor (${res0200.bounds.height}mm)`);

const res0203 = fefco0203.calculate({ L: 300, B: 200, H: 150, Ep: 3, M: 35 });
assert(res0203.bounds.height > res1.bounds.height, `FEFCO 0203 (abas 100% sobrepostas) possui altura total maior (${res0203.bounds.height}mm)`);

const res0427 = fefco0427.calculate({ L: 260, B: 180, H: 80, Ep: 2 });
assert(res0427.bounds.width > 0 && res0427.bounds.height > 0, `FEFCO 0427 calculado com sucesso (${res0427.bounds.width.toFixed(1)} x ${res0427.bounds.height.toFixed(1)} mm)`);

const resEcma = ecmaB1001.calculate({ L: 200, B: 140, H: 50, Ep: 0.6 });
assert(resEcma.bounds.width > 0 && resEcma.bounds.height > 0, `ECMA B10.01 calculado com sucesso (${resEcma.bounds.width.toFixed(1)} x ${resEcma.bounds.height.toFixed(1)} mm)`);

// ----------------------------------------------------
// TESTE 4: IMPOSIÇÃO EM CHAPAS (800x1200, 1000x1400, 1200x1600)
// ----------------------------------------------------
console.log('\n4. Testando Imposição de Produção com Geometria Real...');
const geom1 = toPackagingGeometry(res1);

const sheetsToTest = [
  { w: 1200, h: 800, name: 'Chapa 800 x 1200 mm' },
  { w: 1400, h: 1000, name: 'Chapa 1000 x 1400 mm' },
  { w: 1600, h: 1200, name: 'Chapa 1200 x 1600 mm' },
];

for (const sheet of sheetsToTest) {
  console.log(`\n  --- Testando na ${sheet.name} ---`);
  const imp = calculateImpositionCAD(geom1, {
    sheetWidth: sheet.w,
    sheetHeight: sheet.h,
    marginMargin: 15,
    gutter: 5,
    allowRotation: true,
  });

  console.log(`    Solução 0°:  ${imp.solution0.totalPoses} poses (${imp.solution0.posesX}x${imp.solution0.posesY}) - Aproveitamento: ${imp.solution0.utilizationPercentage}%`);
  console.log(`    Solução 90°: ${imp.solution90.totalPoses} poses (${imp.solution90.posesX}x${imp.solution90.posesY}) - Aproveitamento: ${imp.solution90.utilizationPercentage}%`);
  console.log(`    Vencedor (PLMPackLib): ${imp.selectedOrientation}° com ${imp.totalPoses} poses e ${imp.utilizationPercentage}% de aproveitamento`);

  assert(imp.totalPoses >= Math.max(imp.solution0.totalPoses, imp.solution90.totalPoses), 'Solução escolhida é ótima');
  assert(imp.items.length === imp.totalPoses, `Itens gerados correspondem ao número de poses (${imp.items.length})`);

  // Valida que cada pose contém a geometria real com segmentos e arcos
  for (const item of imp.items) {
    assert(item.geometry && item.geometry.segments.length > 0, `Pose possui geometria real com ${item.geometry.segments.length} segmentos`);
    // Checa se a pose está dentro dos limites da chapa com a margem
    assert(item.x >= 15 - 0.01 && item.x + item.width <= sheet.w - 15 + 0.01, `Pose respeita limites em X [${item.x.toFixed(1)}, ${(item.x + item.width).toFixed(1)}]`);
    assert(item.y >= 15 - 0.01 && item.y + item.height <= sheet.h - 15 + 0.01, `Pose respeita limites em Y [${item.y.toFixed(1)}, ${(item.y + item.height).toFixed(1)}]`);
  }
}

// ----------------------------------------------------
// TESTE 5: EXPORTAÇÃO DXF INDUSTRIAL
// ----------------------------------------------------
console.log('\n5. Testando DXF Exporter com Arcos e Camadas...');
const dxfContent = buildDxfContent({
  segments: res1.segments,
  arcs: res1.arcs,
});

assert(dxfContent.includes('SECTION\r\n2\r\nENTITIES'), 'DXF contém seção ENTITIES');
assert(dxfContent.includes('CORTE'), 'DXF contém layer CORTE');
assert(dxfContent.includes('VINCO'), 'DXF contém layer VINCO');
assert(dxfContent.includes('0\r\nARC'), 'DXF contém entidades ARC dos cantos arredondados');
// ----------------------------------------------------
// TESTE 6: CARREGAMENTO DE TODOS OS 472 MODELOS DO CATÁLOGO
// ----------------------------------------------------
console.log('\n6. Testando carregamento de todos os modelos da Biblioteca (Catalog)...');
import { CATALOG, getModelById } from '../src/engine/models/index.ts';

let catalogErrors = 0;
for (const item of CATALOG) {
  try {
    const model = getModelById(item.id);
    const params = {
      L: item.defaultParams?.L || 300,
      B: item.defaultParams?.B || 200,
      H: item.defaultParams?.H || 150,
      Ep: item.defaultParams?.Ep || 3.0,
      M: item.defaultParams?.M || 35,
      Ec: 6,
      Cut: 1,
    };
    const r = model.calculate(params);
    if (!r || !r.segments || r.segments.length === 0) {
      console.error(`❌ Erro no modelo ${item.id} (${item.code}): segmentos vazios`);
      catalogErrors++;
    }
  } catch (err) {
    console.error(`❌ Exceção no modelo ${item.id} (${item.code}):`, err);
    catalogErrors++;
  }
}
assert(catalogErrors === 0, `Todos os ${CATALOG.length} modelos da biblioteca carregam e calculam facas perfeitamente!`);

console.log('\n====================================================');
console.log('TODOS OS TESTES DO MOTOR CAD PASSARAM COM SUCESSO! 🎉');
console.log('====================================================');
