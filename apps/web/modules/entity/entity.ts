import { SYSTEM_IDS } from '../constants';
import { Triple } from '../types';

export function description(triples: Triple[]) {
  const descriptionTriple = triples.find(triple => triple.attributeName === 'Description');
  return descriptionTriple?.value?.type === 'string'
    ? descriptionTriple.value.value
    : descriptionTriple?.value?.type === 'entity'
    ? descriptionTriple.value.name
    : null;
}

export function name(triples: Triple[]) {
  const nameValue = triples.find(triple => triple.attributeId === SYSTEM_IDS.NAME)?.value;
  return nameValue?.type === 'string' ? nameValue.value : null;
}
