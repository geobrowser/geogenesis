import { Triple } from '../types';

export function entityName(triple: Triple) {
  return triple?.value?.type === 'string'
    ? triple.value.value
    : triple?.value?.type === 'entity'
    ? triple.value.name
    : null;
}
