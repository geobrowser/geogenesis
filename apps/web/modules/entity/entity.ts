import { SYSTEM_IDS } from '../constants';
import { NetworkEntity } from '../services/network';
import { Triple } from '../types';

export function stringOrEntityDescriptionValue(triples: Triple[]) {
  const descriptionTriple = triples.find(triple => triple.attributeName === 'Description');
  return descriptionTriple?.value?.type === 'string'
    ? descriptionTriple.value.value
    : descriptionTriple?.value?.type === 'entity'
    ? descriptionTriple.value.name
    : null;
}

export function networkStringDescriptionValue(triples: NetworkEntity['entityOf']) {
  return triples
    .filter(
      entityOf =>
        // HACK: Right now we're checking for both expected Description attribute ID and
        // any attributes that have the "Description" name. Ideally all attributes reference
        // the expected Description ID, but right now there are many different Description
        // entities that might be referenced by an Entity.
        entityOf.attribute.id === SYSTEM_IDS.DESCRIPTION_SCALAR ||
        entityOf.attribute.name === SYSTEM_IDS.DESCRIPTION_SCALAR
    )
    .flatMap(entityOf => (entityOf.valueType === 'STRING' ? entityOf.stringValue : []))
    .pop();
}

export function networkTypeNames(triples: NetworkEntity['entityOf']) {
  return triples
    .filter(entityOf => entityOf.attribute.id === SYSTEM_IDS.TYPES)
    .flatMap(entityOf => (entityOf.valueType === 'ENTITY' ? entityOf.entityValue.name : []))
    .flatMap(name => (name ? name : []));
}

export function name(triples: Triple[]) {
  const nameValue = triples.find(triple => triple.attributeId === SYSTEM_IDS.NAME)?.value;
  return nameValue?.type === 'string' ? nameValue.value : null;
}

export function entityName(triple: Triple) {
  return triple?.value?.type === 'string'
    ? triple.value.value
    : triple?.value?.type === 'entity'
    ? triple.value.name
    : null;
}
