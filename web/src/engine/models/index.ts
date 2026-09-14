import type { PackagingModel } from '../types';
import { fefco0201 } from './fefco0201';
import { fefco0427 } from './fefco0427';
import { fefco0420 } from './fefco0420';
import { fefco0429 } from './fefco0429';
import { fefco0200 } from './fefco0200';
import { fefco0203 } from './fefco0203';
import { ecmaB10 } from './ecmaCarton';
import { ecmaA20 } from './ecmaA20';
import { ecmaB1001 } from './ecmaB1001';

export { CATALOG, getModelById, generateAuditMatrix } from '../registry';
export type { CatalogItem, AuditRow } from '../registry';

export const MODELS: PackagingModel[] = [
  fefco0429,
  fefco0427,
  fefco0201,
  fefco0420,
  fefco0200,
  fefco0203,
  ecmaB1001,
  ecmaB10,
  ecmaA20,
];
