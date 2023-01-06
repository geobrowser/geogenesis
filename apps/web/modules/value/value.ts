import { Triple } from '../types';

export function nameOfEntityValue(triple: Triple) {
  return triple?.value?.type === 'entity' ? triple.value.name : null;
}
