import type { PackagingModel } from '../types';
import { fefco0201 } from './fefco0201';
import { fefco0427 } from './fefco0427';
import { fefco0200 } from './fefco0200';

export const MODELS: PackagingModel[] = [
  fefco0201,
  fefco0427,
  fefco0200,
];

export function getModelById(id: string): PackagingModel {
  const found = MODELS.find((m) => m.id === id);
  return found || MODELS[0];
}
