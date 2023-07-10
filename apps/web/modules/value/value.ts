import { Triple } from '../types';

export function nameOfEntityValue(triple: Triple) {
  return triple?.value?.type === 'entity' ? triple.value.name : null;
}

export function stringValue(triple?: Triple) {
  if (!triple) return null;

  return triple?.value?.type === 'string' ? triple.value.value : null;
}

export function urlValue(triple?: Triple) {
  if (!triple) return null;

  return triple?.value?.type === 'url' ? triple.value.value : null;
}

export function dateValue(triple?: Triple) {
  if (!triple) return null;

  return triple?.value?.type === 'date' ? triple.value.value : null;
}

export function imageValue(triple: Triple) {
  return triple?.value?.type === 'image' ? triple.value.value : null;
}
