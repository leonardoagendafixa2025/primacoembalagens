import { getModelById } from '../src/engine/registry';
import { validatePackagingFeasibility } from '../src/engine/packaging/feasibilityValidator';

console.log('============================================================');
console.log('TESTE DE PRECISÃO INDUSTRIAL HEIDELBERG & VALIDAÇÃO FÍSICA');
console.log('============================================================\n');

// 1. Teste da Medida da Foto do Usuário: L=150, B=100, H=310, Ep=0.4
console.log('1. TESTE DA MEDIDA DA FOTO: L=150, B=100, H=310, Ep=0.4');

const testIds = ['ecma_b10', 'ecma_a6020', 'fefco_0215', 'fefco_0201'];

for (const id of testIds) {
  const model = getModelById(id);
  const dieline = model.calculate({ L: 150, B: 100, H: 310, Ep: 0.4 });

  if (dieline.error) {
    console.error(`[ERRO INESPERADO] ${model.code}: ${dieline.error}`);
    process.exit(1);
  }

  // Verifica que os segmentos existem
  console.log(`[OK] ${model.code}: ${dieline.segments.length} segs, ${dieline.arcs?.length || 0} arcs.`);
  console.log(`     Bounds: ${Math.round(dieline.bounds.width)} x ${Math.round(dieline.bounds.height)} mm`);

  // Verifica que nenhuma aba superior foi esticada de forma bizarra com H=310
  // A altura total da faca de uma caixa tubular de H=310 e B=100 deve ser aproximadamente H + 2*B + 2*Tuck
  // ou seja, por volta de 310 + 200 + 40 = ~550mm, NUNCA 1000mm ou 1500mm!
  if (dieline.bounds.height > 750) {
    console.error(`[FALHA DE ENGENHARIA] ${model.code}: Altura da faca (${dieline.bounds.height} mm) excedeu limites de embalagem!`);
    process.exit(1);
  }
}

// 2. Teste: "SE A MEDIDA NÃO EXISTE, ELE NÃO CRIA"
console.log('\n2. TESTE DE BLOQUEIO FÍSICO ("SE A MEDIDA NÃO EXISTE ELE NÃO CRIA"):');

// Caso A: Fundo automático com B > L + 15 (ex: L=100, B=150)
const autoBottomModel = getModelById('ecma_a6020');
const badAutoBottom = autoBottomModel.calculate({ L: 100, B: 150, H: 200, Ep: 0.5 });
if (badAutoBottom.error && badAutoBottom.segments.length === 0) {
  console.log(`[PASS] Bloqueio de Fundo Automático (B=150 > L=100): "${badAutoBottom.error}"`);
} else {
  console.error(`[FALHA] Fundo automático permitiu geometria impossível com B > L!`);
  process.exit(1);
}

// Caso B: Medida abaixo do limite físico de corte (ex: L=15 mm)
const badL = autoBottomModel.calculate({ L: 15, B: 100, H: 100, Ep: 0.5 });
if (badL.error && badL.segments.length === 0) {
  console.log(`[PASS] Bloqueio de L abaixo do mínimo (L=15 mm): "${badL.error}"`);
} else {
  console.error(`[FALHA] Permitiu L abaixo do mínimo de corte!`);
  process.exit(1);
}

// Caso C: Espessura excessiva que esmagaria o vinco (ex: Ep=50 mm para B=100 mm)
const badEp = autoBottomModel.calculate({ L: 150, B: 100, H: 200, Ep: 50 });
if (badEp.error && badEp.segments.length === 0) {
  console.log(`[PASS] Bloqueio de Ep excessivo (Ep=50 mm): "${badEp.error}"`);
} else {
  console.error(`[FALHA] Permitiu Ep incompatível com o papelão!`);
  process.exit(1);
}

// Caso D: Caixa com altura negativa ou zero
const badZero = autoBottomModel.calculate({ L: 150, B: 100, H: 0, Ep: 0.5 });
if (badZero.error && badZero.segments.length === 0) {
  console.log(`[PASS] Bloqueio de H=0: "${badZero.error}"`);
} else {
  console.error(`[FALHA] Permitiu H=0!`);
  process.exit(1);
}

console.log('\n============================================================');
console.log('TODOS OS TESTES DE PRECISÃO INDUSTRIAL PASSARAM COM SUCESSO!');
console.log('============================================================');
