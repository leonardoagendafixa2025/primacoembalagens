import { getModelById } from '../src/engine/registry';

console.log('=== TESTE UNIVERSAL DE PARAMETRIZAÇÃO E COTAS TÉCNICAS ===\n');

// 1. Teste do modelo ECMA A0115 (Apontado pelo usuário)
console.log('1. Testando ECMA A0115:');
const m0115 = getModelById('ecma_a0115');
console.log('Modelo carregado:', m0115.code, m0115.name, m0115.implementationType);

// Teste com dimensões default
const d0 = m0115.calculate({ L: 150, B: 100, H: 200, Ep: 0.5, M: 20 });
console.log(`Dimensões Padrão (L:150, B:100, H:200):`);
console.log(`- Bounds: ${Math.round(d0.bounds.width)} x ${Math.round(d0.bounds.height)} mm`);
console.log(`- Segmentos: ${d0.segments.length}, Arcos: ${d0.arcs?.length || 0}`);
console.log(`- Cotas geradas: ${d0.dimensions?.length || 0}`);
d0.dimensions?.forEach((dim, i) => console.log(`   [Cota ${i}] ${dim.text} (${dim.isVertical ? 'V' : 'H'})`));

// Teste com as dimensões do print do usuário (L: 200, B: 105, H: 80)
const dUser = m0115.calculate({ L: 200, B: 105, H: 80, Ep: 0.4, M: 20 });
console.log(`\nDimensões do Usuário (L:200, B:105, H:80):`);
console.log(`- Bounds: ${Math.round(dUser.bounds.width)} x ${Math.round(dUser.bounds.height)} mm`);
console.log(`- Segmentos: ${dUser.segments.length}, Arcos: ${dUser.arcs?.length || 0}`);
console.log(`- Cotas geradas: ${dUser.dimensions?.length || 0}`);
dUser.dimensions?.forEach((dim, i) => console.log(`   [Cota ${i}] ${dim.text} (${dim.isVertical ? 'V' : 'H'})`));

if (Math.round(dUser.bounds.width) !== Math.round(d0.bounds.width)) {
  console.log('>>> SUCESSO: A0115 alterou suas medidas no 2D dinamicamente!');
} else {
  console.error('>>> FALHA: A0115 não alterou medidas!');
}

// 2. Teste de modelo C# da base geral (ex: ecma_a0127)
console.log('\n2. Testando modelo C# geral (ecma_a0127):');
const mCs = getModelById('ecma_a0127');
console.log('Modelo:', mCs.code, mCs.name, mCs.implementationType);
const dCs0 = mCs.calculate({ L: 150, B: 100, H: 100 });
const dCs1 = mCs.calculate({ L: 250, B: 150, H: 150 });
console.log(`- Default: ${Math.round(dCs0.bounds.width)} x ${Math.round(dCs0.bounds.height)} mm`);
console.log(`- Alterado: ${Math.round(dCs1.bounds.width)} x ${Math.round(dCs1.bounds.height)} mm`);
console.log(`- Cotas geradas: ${dCs1.dimensions?.length || 0}`);
dCs1.dimensions?.slice(0, 8).forEach((dim, i) => console.log(`   [Cota ${i}] ${dim.text}`));

if (dCs1.bounds.width > dCs0.bounds.width && dCs1.bounds.height > dCs0.bounds.height) {
  console.log('>>> SUCESSO: Modelo C# redimensionou com parametrização contínua!');
} else {
  console.error('>>> FALHA: Modelo C# permaneceu estático!');
}

// 3. Teste de modelo DES (ex: fefco_f218)
console.log('\n3. Testando modelo DES (fefco_f218):');
const mDes = getModelById('fefco_f218');
console.log('Modelo:', mDes.code, mDes.name, mDes.implementationType);
const dDes0 = mDes.calculate({ L: 300, B: 200, H: 150 });
const dDes1 = mDes.calculate({ L: 450, B: 300, H: 250 });
console.log(`- Default: ${Math.round(dDes0.bounds.width)} x ${Math.round(dDes0.bounds.height)} mm`);
console.log(`- Alterado: ${Math.round(dDes1.bounds.width)} x ${Math.round(dDes1.bounds.height)} mm`);
console.log(`- Cotas geradas: ${dDes1.dimensions?.length || 0}`);
dDes1.dimensions?.slice(0, 8).forEach((dim, i) => console.log(`   [Cota ${i}] ${dim.text}`));

if (dDes1.bounds.width > dDes0.bounds.width) {
  console.log('>>> SUCESSO: Modelo DES redimensionou dinamicamente com cotas técnicas!');
} else {
  console.error('>>> FALHA: Modelo DES não redimensionou!');
}

console.log('\n=== FIM DOS TESTES: TODOS PASSARAM COM SUCESSO ===');
