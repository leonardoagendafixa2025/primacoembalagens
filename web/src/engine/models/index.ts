import type { PackagingModel } from '../types';
import { fefco0201 } from './fefco0201';
import { fefco0427 } from './fefco0427';
import { fefco0200 } from './fefco0200';
import { fefco0203 } from './fefco0203';
import { ecmaB10 } from './ecmaCarton';
import { ecmaA20 } from './ecmaA20';

import rawCatalog from '../modelsCatalog.json';

export interface CatalogItem {
  id: string;
  rawName: string;
  code: string;
  name: string;
  category: 'FEFCO' | 'ECMA' | 'DISPLAYS';
  series: string;
  description: string;
  thumbnail: string | null;
  defaultParams: Record<string, number>;
}

export const CATALOG: CatalogItem[] = rawCatalog as CatalogItem[];

// Mapa de modelos com calculadora especializada
const BUILTIN_MODELS: Record<string, PackagingModel> = {
  fefco_0201: fefco0201,
  fefco_0427: fefco0427,
  fefco_0200: fefco0200,
  fefco_0203: fefco0203,
  ecma_b10: ecmaB10,
  ecma_a20: ecmaA20,
};

export const MODELS: PackagingModel[] = [
  fefco0201,
  fefco0427,
  fefco0200,
  fefco0203,
  ecmaB10,
  ecmaA20,
];

/**
 * Retorna um PackagingModel funcional para qualquer item do catálogo completo.
 * Caso o modelo não possua uma função dedicada, usa o calculador paramétrico
 * correspondente à sua família industrial (Maletas, Envoltórios ou Cartuchos).
 */
export function getModelById(id: string): PackagingModel {
  if (BUILTIN_MODELS[id]) {
    return BUILTIN_MODELS[id];
  }

  const catalogItem = CATALOG.find((c) => c.id === id);
  if (!catalogItem) {
    return fefco0201;
  }

  // Define o motor paramétrico com base na família/série
  let calculateFn = fefco0201.calculate;
  if (catalogItem.category === 'ECMA') {
    if (catalogItem.series.includes('Grupo A')) {
      calculateFn = ecmaA20.calculate;
    } else {
      calculateFn = ecmaB10.calculate;
    }
  } else if (catalogItem.category === 'FEFCO') {
    if (catalogItem.series.includes('0400')) {
      calculateFn = fefco0427.calculate;
    } else if (catalogItem.series.includes('0200')) {
      if (catalogItem.code.includes('0200')) calculateFn = fefco0200.calculate;
      else if (catalogItem.code.includes('0203')) calculateFn = fefco0203.calculate;
      else calculateFn = fefco0201.calculate;
    }
  }

  return {
    id: catalogItem.id,
    code: catalogItem.code,
    name: catalogItem.name,
    category: catalogItem.category as any,
    description: catalogItem.description,
    defaultParams: catalogItem.defaultParams,
    paramDefs: [
      { key: 'L', label: 'Comprimento (L)', min: 50, max: 1200, step: 5, unit: 'mm' },
      { key: 'B', label: 'Largura (B)', min: 30, max: 800, step: 5, unit: 'mm' },
      { key: 'H', label: 'Altura (H)', min: 20, max: 600, step: 5, unit: 'mm' },
      { key: 'Ep', label: 'Espessura (Ep)', min: 0.3, max: 8.0, step: 0.1, unit: 'mm' },
    ],
    calculate: calculateFn,
  };
}
