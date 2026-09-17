export type DimensionMode = 'internal' | 'dieline' | 'external';

export interface BoxDimensions {
  L: number;
  B: number;
  H: number;
}

export interface DimensionComparison {
  internal: BoxDimensions;
  dieline: BoxDimensions;
  external: BoxDimensions;
  caliper: number;
}

/**
 * Converte as dimensões L x B x H da embalagem entre os 3 sistemas industriais:
 * 1. Interna (Inside): Medida útil interna para acomodação do produto
 * 2. Faca (Dieline / Crease-to-crease): Distância geométrica de centro a centro de vinco
 * 3. Externa (Outside): Medida exterior da caixa fechada (usada para cubagem e logística)
 * 
 * Regra padrão da indústria (DIN 55437 / FEFCO Standard):
 * - Tolerância de dobra em 90° = 0.5 * Caliper por vinco (+1.0 * Caliper por par de paredes)
 * - Tolerância em fechamento de abas opostas = +2.0 * Caliper na altura
 */
export function calculateDimensionMatrix(
  input: BoxDimensions,
  mode: DimensionMode,
  caliper: number
): DimensionComparison {
  const e = Math.max(0.1, Number(caliper) || 0.4);
  const rawL = Number(input.L) || 100;
  const rawB = Number(input.B) || 100;
  const rawH = Number(input.H) || 100;

  let internal: BoxDimensions;
  let dieline: BoxDimensions;
  let external: BoxDimensions;

  switch (mode) {
    case 'internal': {
      // Usuário digitou as medidas internas desejadas
      internal = { L: rawL, B: rawB, H: rawH };
      dieline = {
        L: Math.round((rawL + e) * 10) / 10,
        B: Math.round((rawB + e) * 10) / 10,
        H: Math.round((rawH + 2 * e) * 10) / 10,
      };
      external = {
        L: Math.round((rawL + 2 * e) * 10) / 10,
        B: Math.round((rawB + 2 * e) * 10) / 10,
        H: Math.round((rawH + 4 * e) * 10) / 10,
      };
      break;
    }
    case 'dieline': {
      // Usuário digitou as medidas nominais de centro de vinco da faca
      dieline = { L: rawL, B: rawB, H: rawH };
      internal = {
        L: Math.round(Math.max(5, rawL - e) * 10) / 10,
        B: Math.round(Math.max(5, rawB - e) * 10) / 10,
        H: Math.round(Math.max(5, rawH - 2 * e) * 10) / 10,
      };
      external = {
        L: Math.round((rawL + e) * 10) / 10,
        B: Math.round((rawB + e) * 10) / 10,
        H: Math.round((rawH + 2 * e) * 10) / 10,
      };
      break;
    }
    case 'external': {
      // Usuário digitou as medidas externas para cubagem de frete / palete
      external = { L: rawL, B: rawB, H: rawH };
      dieline = {
        L: Math.round(Math.max(5, rawL - e) * 10) / 10,
        B: Math.round(Math.max(5, rawB - e) * 10) / 10,
        H: Math.round(Math.max(5, rawH - 2 * e) * 10) / 10,
      };
      internal = {
        L: Math.round(Math.max(5, rawL - 2 * e) * 10) / 10,
        B: Math.round(Math.max(5, rawB - 2 * e) * 10) / 10,
        H: Math.round(Math.max(5, rawH - 4 * e) * 10) / 10,
      };
      break;
    }
  }

  return {
    internal,
    dieline,
    external,
    caliper: e,
  };
}
