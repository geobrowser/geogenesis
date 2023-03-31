import { SYSTEM_IDS } from '@geogenesis/ids';
import { A, D, pipe } from '@mobily/ts-belt';

import { Value } from '~/modules/value';
import { Triple } from '../triple';
import { Action, Entity as EntityType, Triple as TripleType } from '../types';
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
export function description(triples: TripleType[]): string | null {
  const triple = descriptionTriple(triples);
  return triple?.value.type === 'string' ? triple.value.value : null;
}

export function descriptionTriple(triples: TripleType[]): TripleType | undefined {
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
export function types(triples: TripleType[], currentSpace?: string): { id: string; name: string | null }[] {
  const typeTriples = triples.filter(triple => triple.attributeId === SYSTEM_IDS.TYPES);
  const groupedTypeTriples = groupBy(typeTriples, t => t.attributeId);

  return Object.entries(groupedTypeTriples)
    .flatMap(([, triples]) => {
      if (triples.length === 1) {
        return triples.flatMap(triple =>
          triple.value.type === 'entity' ? { id: triple.value.id, name: triple.value.name } : []
        );
      }

      // There are some system level Entities that have Triples from multiple Spaces. We only
      // want to show the Triples/Types from the current Space if there are multiple Types
      // with the same name assigned to this Entity.
      if (triples.length > 1) {
        return triples
          .filter(triple => triple.space === currentSpace)
          .flatMap(triple => (triple.value.type === 'entity' ? { id: triple.value.id, name: triple.value.name } : []));
      }

      return [];
    })
    .flatMap(name => (name ? name : []));
}

/**
 * This function traverses through all the triples associated with an entity and attempts
 * to find the name of the entity.
 */
export function name(triples: TripleType[]): string | null {
  const triple = nameTriple(triples);
  return triple?.value.type === 'string' ? triple?.value.value : null;
}

export function nameTriple(triples: TripleType[]): TripleType | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.NAME);
}

export function valueTypeTriple(triples: TripleType[]): TripleType | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.VALUE_TYPE);
}

export function valueTypeId(triples: TripleType[]): string | null {
  // Returns SYSTEM_IDS.TEXT, SYSTEM_IDS.RELATION, etc... or null if not found
  const triple = valueTypeTriple(triples);
  return triple?.value.type === 'entity' ? triple?.value.id : null;
}

/**
 * This function takes an array of triples and maps them to an array of Entity types.
 */
export function entitiesFromTriples(triples: TripleType[]): EntityType[] {
  return pipe(
    triples,
    A.groupBy(triple => triple.entityId),
    D.toPairs,
    A.map(([entityId, triples]) => {
      // ts-belt returns readonly arrays from groupBy, so we need to coerce here.
      // We can do array operations like .concat or .slice to coerce the triples
      // array to a mutable version, but casting is cheaper performance-wise as
      // entitiesFromTriples may be used in performance-heavy situations.
      const mutableTriples = triples as unknown as TripleType[];

      return {
        id: entityId,
        name: name(mutableTriples),
        description: description(mutableTriples),
        nameTripleSpace: nameTriple(mutableTriples)?.space,
        types: types(mutableTriples, triples[0]?.space),
        triples: mutableTriples,
      };
    })
  );
}

/**
 * This function merges local triple actions with entities from the network. This is useful
 * if you have a collection of Entities from the network and want to display any updates
 * that were made to them during local editing.
 */
export function mergeActionsWithEntities(
  actions: Record<string, Action[]>,
  networkEntities: EntityType[]
): EntityType[] {
  return pipe(
    actions,
    D.values,
    A.flat,
    // We need to merge the local actions with the network triple in order to correctly
    // display any description or type metadata in the search results list.
    actions => {
      const entityIds = actions.map(a => {
        switch (a.type) {
          case 'createTriple':
          case 'deleteTriple':
            return a.entityId;
          case 'editTriple':
            return a.after.entityId;
        }
      });

      const networkEntity = networkEntities.find(e => A.isNotEmpty(entityIds) && e.id === A.head(entityIds));
      const triplesForNetworkEntity = networkEntity?.triples ?? [];
      const updatedTriples = Triple.fromActions(actions, triplesForNetworkEntity);
      return Triple.withLocalNames(actions, updatedTriples);
    },
    entitiesFromTriples
  );
}

/**
 * This function traverses through all the triples associated with an entity and attempts to find the avatar URL of the entity.
 */
export function avatar(triples: TripleType[] | undefined): string | null {
  if (!triples) return null;

  const avatarTriple = triples.find(triple => triple.attributeId === SYSTEM_IDS.AVATAR_ATTRIBUTE);
  const avatarUrl = avatarTriple !== undefined ? Value.imageValue(avatarTriple) : null;

  return avatarUrl;
}

/**
 * This function traverses through all the triples associated with an entity and attempts to find the cover URL of the entity.
 */
export function cover(triples: TripleType[] | undefined): string | null {
  if (!triples) return null;

  const coverTriple = triples.find(triple => triple.attributeId === SYSTEM_IDS.COVER_ATTRIBUTE);
  const coverUrl = coverTriple !== undefined ? Value.imageValue(coverTriple) : null;

  return coverUrl;
}
