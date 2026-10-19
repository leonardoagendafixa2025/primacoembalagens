/**
 * VALIDADOR DE VIABILIDADE ESTRUTURAL E FÍSICA DE FACAS DE EMBALAGEM
 * Padrão Heidelberg Prinect Package Designer / Normas Técnicas ECMA & FEFCO / DIN 55437
 * 
 * Regra Absoluta: "SE A MEDIDA NÃO EXISTE, NÃO CRIA"
 * Impede a geração de geometrias irreais, auto-colidentes ou inextraturáveis por matrizes
 * de corte e vinco gráficas industriais.
 */

export interface FeasibilityValidationResult {
  isValid: boolean;
  error?: string;
  code?: string;
  recommendation?: string;
}

export interface BoxParamSet {
  L?: number;
  B?: number;
  H?: number;
  Ep?: number;
  M?: number;
  [key: string]: number | undefined;
}

export interface ModelContext {
  id?: string;
  code?: string;
  category?: 'FEFCO' | 'ECMA' | string;
  name?: string;
}

/**
 * Valida a viabilidade física de uma faca de corte e vinco antes de qualquer computação geométrica.
 */
export function validatePackagingFeasibility(
  params: BoxParamSet,
  modelContext?: ModelContext
): FeasibilityValidationResult {
  const L = params.L !== undefined ? Number(params.L) : 300;
  const B = params.B !== undefined ? Number(params.B) : 200;
  const H = params.H !== undefined ? Number(params.H) : 150;
  const Ep = params.Ep !== undefined ? Number(params.Ep) : 0.5;

  // 1. CHECAGEM DE VALORES BÁSICOS NÃO-POSITIVOS OU CORROMPIDOS
  if (isNaN(L) || L <= 0) {
    return {
      isValid: false,
      code: 'INVALID_L',
      error: `Comprimento (L = ${L} mm) inválido. Deve ser um valor positivo.`,
      recommendation: 'Defina L entre 30 mm e 1500 mm.',
    };
  }
  if (isNaN(B) || B <= 0) {
    return {
      isValid: false,
      code: 'INVALID_B',
      error: `Largura (B = ${B} mm) inválida. Deve ser um valor positivo.`,
      recommendation: 'Defina B entre 20 mm e 1200 mm.',
    };
  }
  if (isNaN(H) || H <= 0) {
    return {
      isValid: false,
      code: 'INVALID_H',
      error: `Altura (H = ${H} mm) inválida. Deve ser um valor positivo.`,
      recommendation: 'Defina H entre 25 mm e 800 mm.',
    };
  }
  if (isNaN(Ep) || Ep <= 0) {
    return {
      isValid: false,
      code: 'INVALID_EP',
      error: `Espessura (Ep = ${Ep} mm) inválida. O material deve possuir caliper mensurável.`,
      recommendation: 'Defina Ep entre 0.1 mm e 10.0 mm.',
    };
  }

  // 2. LIMITES MÍNIMOS DE FABRICAÇÃO DE FACAS GRÁFICAS (DIN / Bobst / Heidelberg)
  // Lâminas de aço (2pt = 0.71mm / 3pt = 1.05mm) e borrachas de ejeção exigem espaço físico na madeira
  const MIN_L = 30.0; // mm
  const MIN_B = 20.0; // mm
  const MIN_H = 20.0; // mm

  if (L < MIN_L) {
    return {
      isValid: false,
      code: 'L_BELOW_MINIMUM',
      error: `Comprimento L (${L} mm) abaixo do limite físico de fabricação da faca (mínimo ${MIN_L} mm).`,
      recommendation: `O corte laser em compensado e dobra de canaletas de aço exigem L ≥ ${MIN_L} mm.`,
    };
  }

  if (B < MIN_B) {
    return {
      isValid: false,
      code: 'B_BELOW_MINIMUM',
      error: `Largura B (${B} mm) abaixo do limite técnico de dobragem do vinco (mínimo ${MIN_B} mm).`,
      recommendation: `Painéis com largura inferior a ${MIN_B} mm sofrem delaminação e travamento na coladeira.`,
    };
  }

  if (H < MIN_H) {
    return {
      isValid: false,
      code: 'H_BELOW_MINIMUM',
      error: `Altura H (${H} mm) abaixo do limite técnico de montagem do corpo (mínimo ${MIN_H} mm).`,
      recommendation: `A altura do tubo da caixa requer H ≥ ${MIN_H} mm para passagem nos trilhos da dobradeira.`,
    };
  }

  // 3. LIMITES MÁXIMOS INDUSTRIAIS (Capacidade máxima de rama de corte e vinco)
  const MAX_L = 2500.0;
  const MAX_B = 2000.0;
  const MAX_H = 1500.0;

  if (L > MAX_L || B > MAX_B || H > MAX_H) {
    return {
      isValid: false,
      code: 'DIMENSION_EXCEEDS_PLATEN',
      error: `Dimensões (${L} × ${B} × ${H} mm) excedem a capacidade máxima das autoplatinas industriais.`,
      recommendation: `Mantenha L ≤ ${MAX_L} mm, B ≤ ${MAX_B} mm e H ≤ ${MAX_H} mm.`,
    };
  }

  // 4. COMPATIBILIDADE DE ESPESSURA / CALIPER (Ep) COM A GEOMETRIA
  if (Ep > B / 3.0) {
    return {
      isValid: false,
      code: 'CALIPER_TOO_THICK',
      error: `Espessura do material Ep (${Ep} mm) é excessiva para a largura B (${B} mm).`,
      recommendation: `Embalagens de B = ${B} mm exigem Ep ≤ ${Math.round(B / 3.0 * 10) / 10} mm para permitir vincagem sem estourar.`,
    };
  }

  // 5. REGRAS ESPECÍFICAS DE FAMÍLIA E ESTILO (Heidelberg Prinect Structural Rules)
  const codeStr = ((modelContext?.code || '') + ' ' + (modelContext?.id || '')).toUpperCase();

  // A. FUNDOS SEMI-AUTOMÁTICOS OU AUTOMÁTICOS (ECMA A6020, FEFCO 0215, Snap-Lock, Crash-Lock)
  const isAutoBottom =
    codeStr.includes('0215') ||
    codeStr.includes('A6020') ||
    codeStr.includes('A60.20') ||
    codeStr.includes('SNAP') ||
    codeStr.includes('CRASH') ||
    codeStr.includes('AUTO-BOTTOM');

  if (isAutoBottom) {
    // Regra geométrica estrita de travas a 45°:
    // O painel lateral B não pode exceder o painel frontal L + 15mm,
    // caso contrário as abas triangulares de fundo colidem entre si e transpassam o corpo
    if (B > L + 15.0) {
      return {
        isValid: false,
        code: 'AUTOBOTTOM_COLLISION',
        error: `Geometria impossível para Fundo Semi-Automático: Largura B (${B} mm) excede Comprimento L (${L} mm) + 15 mm.`,
        recommendation: `Para fechar o fundo em 45° sem colisão mecânica, reduza B para no máximo ${L + 15} mm ou aumente L.`,
      };
    }
  }

  // B. CAIXAS COM ABAS ENCAIXÁVEIS TUCK-IN (ECMA B10, ECMA A20, FEFCO 0215, ECMA B1001)
  const isTuckStyle =
    codeStr.includes('B10') ||
    codeStr.includes('A20') ||
    codeStr.includes('TUCK') ||
    codeStr.includes('0215');

  if (isTuckStyle) {
    // A altura mínima H deve permitir a entrada da lingueta de encaixe (mínimo 20 mm)
    if (H < 20.0) {
      return {
        isValid: false,
        code: 'TUCK_FLAP_COLLISION',
        error: `Altura H (${H} mm) é insuficiente para permitir a inserção da aba superior (requer no mínimo 20 mm).`,
        recommendation: `Aumente a altura H para no mínimo 20 mm para evitar colisão interna da lingueta.`,
      };
    }
  }

  // C. BANDEJAS COM PAREDES DOBRÁVEIS INTERNAS (FEFCO 0427, ECMA B1001, FEFCO 0426)
  const isTrayRollover =
    codeStr.includes('0427') ||
    codeStr.includes('0426') ||
    codeStr.includes('B1001') ||
    codeStr.includes('B10.01');

  if (isTrayRollover) {
    // No modelo postal FEFCO 0427 / 0426, as orelhas de travamento curvas exigem largura mínima para corte
    if ((codeStr.includes('0427') || codeStr.includes('0426')) && B < 65.0) {
      return {
        isValid: false,
        code: '0427_MIN_WIDTH',
        error: `Largura B (${B} mm) insuficiente para os encaixes de travamento do padrão FEFCO 0427 (mínimo 65 mm).`,
        recommendation: 'Ajuste B para no mínimo 65 mm para acomodar os alívios e orelhas curvas.',
      };
    }
    if ((codeStr.includes('0427') || codeStr.includes('0426')) && L < 75.0) {
      return {
        isValid: false,
        code: '0427_MIN_LENGTH',
        error: `Comprimento L (${L} mm) insuficiente para o travamento frontal (mínimo 75 mm).`,
        recommendation: 'Ajuste L para no mínimo 75 mm para permitir o encaixe das travas frontais.',
      };
    }
  }

  // D. MALETAS COM ABAS QUE SE ENCONTRAM NO CENTRO (FEFCO 0200, 0201, 0202, 0203, 0205)
  const isSlottedBox =
    codeStr.includes('0201') ||
    codeStr.includes('0200') ||
    codeStr.includes('0202') ||
    codeStr.includes('0203') ||
    codeStr.includes('0205');

  if (isSlottedBox) {
    if (H < 30.0) {
      return {
        isValid: false,
        code: 'SLOTTED_MIN_H',
        error: `Altura H (${H} mm) é inferior ao limite de vinco e separação de ranhuras (slotter) da maleta (mínimo 30 mm).`,
        recommendation: 'Maletas americanas exigem H ≥ 30 mm para manter a estabilidade das facas rotativas/planas.',
      };
    }
  }

  return { isValid: true };
}
