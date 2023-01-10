import { SYSTEM_IDS } from '@geogenesis/ids';
import { Triple } from '../types';
import { groupBy } from '../utils';

/**
 * This function traverses through all the triples of an Entity and attempts to find the
 * description of the entity.
 *
 * We assume that the Description triple's attribute for an Entity will match the expected
 * system Description attribute ID at SYSTEM_IDS.DESCRIPTION. However, anybody can
 * set up a triple that references _any_ attribute whose name is "Description."
 *
 * We currently handle this in the UI by checking the system ID for Description as well
 * as any attribute whose name is "Description."
 *
 * We currently only handle description triples whose value is a StringValue. If the value
 * is an EntityValue we assume it's not valid and don't attempt to parse it to render in the UI.
 */
export function description(triples: Triple[]): string | null {
  const triple = descriptionTriple(triples);
  return triple?.value.type === 'string' ? triple.value.value : null;
}

export function descriptionTriple(triples: Triple[]): Triple | undefined {
  return triples.find(
    triple => triple.attributeId === SYSTEM_IDS.DESCRIPTION || triple.attributeName === SYSTEM_IDS.DESCRIPTION
  );
}

/**
 * This function traverses through all the triples whose attributeId is SYSTEM_ID.TYPES and returns
 * an array of of their names if they have one. If they don't have one we filter it from the array.
 *
 * There is an edge-case where an Entity can have Triples assigned to it from multiple Spaces. If
 * there are Triples from multiple Spaces and they are Types, and they have the same name, we will
 * only show the Type from the current space.
 */
export function types(triples: Triple[], currentSpace: string): string[] {
  const typeTriples = triples.filter(triple => triple.attributeId === SYSTEM_IDS.TYPES);

  const groupedTypeTriples = groupBy(typeTriples, t => t.attributeId);

  return Object.entries(groupedTypeTriples)
    .flatMap(([, triples]) => {
      if (triples.length === 1) {
        return triples.flatMap(triple => (triple.value.type === 'entity' ? triple.value.name : []));
      }

      // There are some system level Entities that have Triples from multiple Spaces. We only
      // want to show the Triples/Types from the current Space if there are multiple Types
      // with the same name assigned to this Entity.
      if (triples.length > 1) {
        return triples
          .filter(triple => triple.space === currentSpace)
          .flatMap(triple => (triple.value.type === 'entity' ? triple.value.name : []));
      }

      return [];
    })
    .flatMap(name => (name ? name : []));
}

/**
 * This function traverses through all the triples associated with an entity and attempts
 * to find the name of the entity.
 */
export function name(triples: Triple[]): string | null {
  const triple = nameTriple(triples);
  return triple?.value.type === 'string' ? triple?.value.value : null;
}

export function nameTriple(triples: Triple[]): Triple | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.NAME);
}
