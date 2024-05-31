import { SYSTEM_IDS } from '@geogenesis/sdk';
import { A, D, pipe } from '@mobily/ts-belt';

import { EntitySearchResult, Entity as IEntity, Triple as ITriple, ValueTypeId } from '~/core/types';

import { Triple } from '../triple';
import { groupBy } from '../utils';
import { Value } from '../value';

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
export function description(triples: ITriple[]): string | null {
  const triple = descriptionTriple(triples);
  return triple?.value.type === 'TEXT' ? triple.value.value : null;
}

export function descriptionTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.DESCRIPTION);
}

/**
 * This function traverses through all the triples whose attributeId is SYSTEM_ID.TYPES and returns
 * an array of of their names if they have one. If they don't have one we filter it from the array.
 *
 * There is an edge-case where an Entity can have Triples assigned to it from multiple Spaces. If
 * there are Triples from multiple Spaces and they are Types, and they have the same name, we will
 * only show the Type from the current space.
 */
export function types(triples: ITriple[], currentSpace?: string): EntitySearchResult[] {
  const typeTriples = triples.filter(triple => triple.attributeId === SYSTEM_IDS.TYPES);
  const groupedTypeTriples = groupBy(typeTriples, t => t.attributeId);

  return Object.entries(groupedTypeTriples)
    .flatMap(([, triples]) => {
      if (triples.length === 1) {
        return triples.flatMap(triple =>
          triple.value.type === 'ENTITY' ? { id: triple.value.value, name: triple.value.name } : []
        );
      }

      // There are some system level Entities that have Triples from multiple Spaces. We only
      // want to show the Triples/Types from the current Space if there are multiple Types
      // with the same name assigned to this Entity.
      if (triples.length > 1 && currentSpace) {
        return triples
          .filter(triple => triple.space === currentSpace)
          .flatMap(triple =>
            triple.value.type === 'ENTITY' ? { id: triple.value.value, name: triple.value.name } : []
          );
      }

      if (triples.length > 1) {
        return triples.flatMap(triple =>
          triple.value.type === 'ENTITY' ? { id: triple.value.value, name: triple.value.name } : []
        );
      }

      return [];
    })
    .flatMap(type => (type ? type : []));
}

/**
 * This function traverses through all the triples associated with an entity and attempts
 * to find the name of the entity.
 */
export function name(triples: ITriple[]): string | null {
  const triple = nameTriple(triples);
  return triple?.value.type === 'TEXT' ? triple?.value.value : null;
}

export function nameTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.NAME);
}

export function nameTriples(triples: ITriple[]): ITriple[] {
  return triples.filter(triple => triple.attributeId === SYSTEM_IDS.NAME);
}

export function valueTypeTriple(triples: ITriple[]): ITriple | undefined {
  return triples.find(triple => triple.attributeId === SYSTEM_IDS.VALUE_TYPE);
}

export function valueTypeId(triples: ITriple[]): ValueTypeId | null {
  // Returns SYSTEM_IDS.TEXT, SYSTEM_IDS.RELATION, etc... or null if not found
  const triple = valueTypeTriple(triples);
  return triple?.value.type === 'ENTITY' ? (triple?.value.value as ValueTypeId) : null;
}

/**
 * This function takes an array of triples and maps them to an array of Entity types.
 */
export function entitiesFromTriples(triples: ITriple[]): IEntity[] {
  return pipe(
    triples,
    // ts-belt returns readonly arrays from groupBy, so we use our own
    // groupBy here to avoid weird casting later. We might be able to
    // get around this by using a newer version of ts-belt.
    triples => groupBy(triples, triple => triple.entityId),
    D.toPairs,
    A.map(([entityId, triples]) => {
      const tripleForName = nameTriple(triples);

      return {
        id: entityId,
        name: name(triples),
        description: description(triples),
        nameTripleSpaces: nameTriples(triples).map(triple => triple.space),
        types: types(triples, tripleForName?.space),
        triples,
      };
    })
  );
}

/**
 * This function merges local triple actions with entities from the network. This is useful
 * if you have a collection of Entities from the network and want to display any updates
 * that were made to them during local editing.
 */
export function mergeActionsWithEntities(actions: Record<string, ITriple[]>, networkEntities: IEntity[]): IEntity[] {
  return pipe(
    actions,
    D.values,
    A.flat,
    // We need to merge the local actions with the network triple in order to correctly
    // display any description or type metadata in the search results list.
    actions => {
      const entityIds = actions.map(a => {
        return a.entityId;
      });

      const networkEntity = networkEntities.find(e => A.isNotEmpty(entityIds) && e.id === A.head(entityIds));
      const triplesForNetworkEntity = networkEntity?.triples ?? [];
      const updatedTriples = Triple.merge(actions, triplesForNetworkEntity);
      return Triple.withLocalNames(actions, updatedTriples);
    },
    entitiesFromTriples
  );
}

export function mergeActionsWithEntity(allTriplesInStore: ITriple[], networkEntity: IEntity): IEntity {
  const triplesForEntity = pipe(
    allTriplesInStore.filter(t => t.entityId === networkEntity.id),
    actions => Triple.merge(actions, networkEntity.triples),
    triples => Triple.withLocalNames(allTriplesInStore, triples)
  );

  return {
    id: networkEntity.id,
    name: name(triplesForEntity),
    description: description(triplesForEntity),
    nameTripleSpaces: nameTriples(triplesForEntity).map(triple => triple.space),
    types: types(triplesForEntity, triplesForEntity[0]?.space),
    triples: triplesForEntity,
  };
}

export function fromTriples(allTriplesInStore: ITriple[], entityId: string): IEntity {
  const triplesForEntity = Triple.merge(
    allTriplesInStore.filter(t => t.entityId === entityId),
    []
  );

  const triplesForEntityWithLocalNames = Triple.withLocalNames(allTriplesInStore, triplesForEntity);

  return {
    id: entityId,
    name: name(triplesForEntityWithLocalNames),
    description: description(triplesForEntityWithLocalNames),
    nameTripleSpaces: nameTriples(triplesForEntityWithLocalNames).map(triple => triple.space),
    types: types(triplesForEntityWithLocalNames, triplesForEntityWithLocalNames[0]?.space),
    triples: triplesForEntityWithLocalNames,
  };
}

/**
 * This function traverses through all the triples associated with an entity and attempts to find the avatar URL of the entity.
 */
export function avatar(triples: ITriple[] | undefined): string | null {
  if (!triples) return null;

  const avatarTriple = triples.find(triple => triple.attributeId === SYSTEM_IDS.AVATAR_ATTRIBUTE);
  const avatarUrl = avatarTriple !== undefined ? Value.imageValue(avatarTriple) : null;

  return avatarUrl;
}

/**
 * This function traverses through all the triples associated with an entity and attempts to find the cover URL of the entity.
 */
export function cover(triples: ITriple[] | undefined): string | null {
  if (!triples) return null;

  const coverTriple = triples.find(triple => triple.attributeId === SYSTEM_IDS.COVER_ATTRIBUTE);
  const coverUrl = coverTriple !== undefined ? Value.imageValue(coverTriple) : null;

  return coverUrl;
}

/**
 * This function traverses through all the triples associated with a block entity and attempts to find the parent entity ID.
 */
export const getParentEntityId = (triples: ITriple[] = []) => {
  const parentEntityTriple = triples.find(triple => triple.attributeId === SYSTEM_IDS.PARENT_ENTITY);

  const parentEntityId = parentEntityTriple?.value.type === 'ENTITY' ? parentEntityTriple.value.value : null;

  return parentEntityId;
};

export const isNonNull = (entity: IEntity | null): entity is IEntity => entity !== null;
