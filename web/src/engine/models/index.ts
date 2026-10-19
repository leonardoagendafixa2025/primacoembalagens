import type { PackagingModel } from '../types';
import { fefco0201 } from './fefco0201';
import { fefco0427 } from './fefco0427';
import { fefco0420 } from './fefco0420';
import { fefco0429 } from './fefco0429';
import { fefco0426 } from './fefco0426';
import { fefco0200 } from './fefco0200';
import { fefco0202 } from './fefco0202';
import { fefco0203 } from './fefco0203';
import { fefco0205 } from './fefco0205';
import { fefco0215 } from './fefco0215';
import { ecmaB10 } from './ecmaCarton';
import { ecmaA20 } from './ecmaA20';
import { ecmaA6020 } from './ecmaA6020';
import { ecmaA1075 } from './ecmaA1075';
import { ecmaB1001 } from './ecmaB1001';
import { ecmaB1506_53 } from './ecmaB1506_53';
import { ecmaA0115 } from './ecmaA0115';
import { ecmaX85 } from './ecmaX85';

export { CATALOG, getModelById, registerCustomModel, generateAuditMatrix } from '../registry';
export type { CatalogItem, AuditRow } from '../registry';

export const MODELS: PackagingModel[] = [
  fefco0429,
  fefco0427,
  fefco0201,
  fefco0420,
  fefco0426,
  fefco0200,
  fefco0202,
  fefco0203,
  fefco0205,
  fefco0215,
  ecmaA6020,
  ecmaB1001,
  ecmaB10,
  ecmaA20,
  ecmaA1075,
  ecmaB1506_53,
  ecmaA0115,
  ecmaX85,
];

