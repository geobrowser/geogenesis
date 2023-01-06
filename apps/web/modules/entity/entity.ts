import { SYSTEM_IDS } from '../constants';
import { Triple } from '../types';

/**
 * We assume that the Description triple's attribute for an Entity will match the expected
 * system Description attribute ID at SYSTEM_IDS.DESCRIPTION_SCALAR. However, anybody can
 * set up a triple that references _any_ attribute whose name is "Description."
 *
 * We currently handle this in the UI by checking the system ID for Description as well
 * as any attribute whose name is "Description."
 *
 * We currently only handle description triples whose value is a StringValue. If the value
 * is an EntityValue we assume it's not valid and don't attempt to parse it to render in the UI.
 */
export function description(triples: Triple[]) {
  const descriptionTriple = triples.find(
    triple => triple.attributeId === SYSTEM_IDS.DESCRIPTION_SCALAR || triple.attributeName === 'Description'
  );

  return descriptionTriple?.value?.type === 'string' ? descriptionTriple.value.value : null;
}

/**
 * This function traverses through all the triples of SYSTEM_ID.TYPES and returns an array
 * of of their names if they have one. If they don't have one we filter it from the array.
 */
export function types(triples: Triple[]) {
  return triples
    .filter(entityOf => entityOf.attributeId === SYSTEM_IDS.TYPES)
    .flatMap(entityOf => (entityOf.value.type === 'entity' ? entityOf.value.name : []))
    .flatMap(name => (name ? name : []));
}

export function name(triples: Triple[]) {
  const nameValue = triples.find(triple => triple.attributeId === SYSTEM_IDS.NAME)?.value;
  return nameValue?.type === 'string' ? nameValue.value : null;
}
