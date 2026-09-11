import type { PackagingModel } from '../../types';
import { ecmaA20 } from '../../models/ecmaA20';
import { ecmaB10 } from '../../models/ecmaCarton';
import { ecmaB1001 } from '../../models/ecmaB1001';

export const ecmaModels: PackagingModel[] = [
  ecmaA20,
  ecmaB10,
  ecmaB1001,
];

export { ecmaA20, ecmaB10, ecmaB1001 };
