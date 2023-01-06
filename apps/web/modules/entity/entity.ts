import { SYSTEM_IDS } from '../constants';
import { NetworkEntity } from '../services/network';
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

export function networkStringDescriptionValue(triples: NetworkEntity['entityOf']) {
  return (
    triples
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
      .pop() ?? null
  );
}

/** --------------------------------------------------------------------------------------- **/

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
