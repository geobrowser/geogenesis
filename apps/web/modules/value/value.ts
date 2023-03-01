import { Triple } from '../types';

export function nameOfEntityValue(triple: Triple) {
  return triple?.value?.type === 'entity' ? triple.value.name : null;
}

export function stringValue(triple: Triple) {
  return triple?.value?.type === 'string' ? triple.value.value : null;
}
