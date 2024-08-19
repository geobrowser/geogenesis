import { SYSTEM_IDS } from '@geogenesis/sdk';
import { atom } from 'jotai';

import { localOpsAtom } from '~/core/database/write';
import { Relation } from '~/core/io/dto/entities';
import { EntityId } from '~/core/io/schema';
import { Triple } from '~/core/types';
import { Triples } from '~/core/utils/triples';

import { activeTriplesForEntityIdSelector } from './selectors';

export const createTriplesForEntityAtom = (initialTriples: Triple[], entityId: string) => {
  return atom(get => {
    const triplesForEntityId = get(localOpsAtom).filter(activeTriplesForEntityIdSelector(entityId));
    return Triples.merge(triplesForEntityId, initialTriples);
  });
};

export const createRelationsAtom = (initialRelations: Relation[]) => {
  return atom(get => {
    const localTriples = get(localOpsAtom);

    /***********************************************************************************************
     * Map all triples for locally created relations to Relation
     **********************************************************************************************/
    // We assume if there is a created triple with Types -> Relation that it's creating an entire
    // relation. Users shouldn't normally have a reason to change this type to something else locally,
    // so using this triple should be a good heuristic to get all locally created relations while
    // still reading from triples.
    const typeTriplesForAllLocallyCreatedRelations = localTriples.filter(
      t => t.attributeId === SYSTEM_IDS.TYPES && t.value.value === SYSTEM_IDS.RELATION_TYPE && t.isDeleted === false
    );

    // Map all the triples for locally created relations to a Relation
    const locallyCreatedRelationTriplesByRelationId = typeTriplesForAllLocallyCreatedRelations.map(t => t.entityId);

    const locallyCreatedRelations = locallyCreatedRelationTriplesByRelationId
      .map((relationId): Relation | null => {
        const triplesForRelation = localTriples.filter(t => t.entityId === relationId);
        const typeOfTriple = triplesForRelation.find(t => t.attributeId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);
        const indexTriple = triplesForRelation.find(t => t.attributeId === SYSTEM_IDS.RELATION_INDEX);
        const fromEntityTriple = triplesForRelation.find(t => t.attributeId === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE);
        const toEntityTriple = triplesForRelation.find(t => t.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE);

        if (!typeOfTriple || !indexTriple || !fromEntityTriple || !toEntityTriple) {
          return null;
        }

        return {
          typeOf: {
            id: EntityId(typeOfTriple.value.value),
            name: typeOfTriple.value.type === 'ENTITY' ? typeOfTriple.value.name : null,
          },
          index: indexTriple.value.value,
          id: EntityId(relationId),
          fromEntity: {
            id: EntityId(fromEntityTriple.value.value),
            name: fromEntityTriple.value.type === 'ENTITY' ? fromEntityTriple.value.name : null,
          },
          toEntity: {
            id: EntityId(toEntityTriple.value.value),
            name: toEntityTriple.value.type === 'ENTITY' ? toEntityTriple.value.name : null,
            renderableType: 'DEFAULT',
            value: toEntityTriple.value.type === 'ENTITY' ? toEntityTriple.value.value : '',
            triples: localTriples.filter(t => t.entityId === toEntityTriple.value.value),
          },
        };
      })
      .filter(r => r !== null);

    /***********************************************************************************************/

    // A relation might exist remotely but is deleted locally. We need to remove those from the
    // list of relations that we return.
    //
    // We can consider a relation as being deleted when its Types -> Relation triple is deleted. This set
    // of ids might include relations from entities besides the entityPageId that were deleted locally.
    //
    // Later we filter these to only be the relations that are from the entityPageId.
    const locallyDeletedRelations = localTriples
      .filter(
        t => t.attributeId === SYSTEM_IDS.TYPES && t.value.value === SYSTEM_IDS.RELATION_TYPE && t.isDeleted === true
      )
      .map(t => t.entityId);

    const deletedRelationIds = new Set(...locallyDeletedRelations);
    const remoteRelationsThatWerentDeleted = initialRelations
      // Only return relations coming from the entity page id which haven't been deleted locally
      .filter(r => !deletedRelationIds.has(r.id));

    const remoteRelationsThatWerentDeletedIds = new Set(remoteRelationsThatWerentDeleted.map(r => r.id));

    const localTriplesForActiveRemoteRelations = localTriples.filter(t =>
      remoteRelationsThatWerentDeletedIds.has(EntityId(t.entityId))
    );

    const activeRemoteRelations = remoteRelationsThatWerentDeleted.map((r): Relation => {
      const maybeLocalTypeOfTriple = localTriplesForActiveRemoteRelations.find(
        t => t.attributeId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE && t.entityId === r.id
      );

      const maybeLocalIndexTriple = localTriplesForActiveRemoteRelations.find(
        t => t.attributeId === SYSTEM_IDS.RELATION_INDEX && t.entityId === r.id
      );

      const maybeLocalFromTriple = localTriplesForActiveRemoteRelations.find(
        t => t.attributeId === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE && t.entityId === r.id
      );

      const maybeLocalToTriple = localTriplesForActiveRemoteRelations.find(
        t => t.attributeId === SYSTEM_IDS.RELATION_TO_ATTRIBUTE && t.entityId === r.id
      );

      return {
        id: r.id,
        typeOf: {
          id: maybeLocalTypeOfTriple ? EntityId(maybeLocalTypeOfTriple.value.value) : EntityId(r.typeOf.id),
          name: maybeLocalTypeOfTriple
            ? maybeLocalTypeOfTriple.value.type === 'ENTITY'
              ? maybeLocalTypeOfTriple.value.name
              : r.typeOf.name
            : r.typeOf.name,
        },
        index: maybeLocalIndexTriple ? maybeLocalIndexTriple.value.value : r.index,
        fromEntity: {
          id: maybeLocalFromTriple ? EntityId(maybeLocalFromTriple.value.value) : r.fromEntity.id,
          name: maybeLocalFromTriple
            ? maybeLocalFromTriple.value.type === 'ENTITY'
              ? maybeLocalFromTriple.value.name
              : r.fromEntity.name
            : r.fromEntity.name,
        },
        toEntity: {
          id: maybeLocalToTriple ? EntityId(maybeLocalToTriple.value.value) : r.toEntity.id,
          renderableType: 'DEFAULT',
          value: maybeLocalToTriple
            ? maybeLocalToTriple.value.type === 'ENTITY'
              ? maybeLocalToTriple.value.value
              : r.toEntity.value
            : r.toEntity.value,
          name: maybeLocalToTriple
            ? maybeLocalToTriple.value.type === 'ENTITY'
              ? maybeLocalToTriple.value.name
              : r.toEntity.name
            : r.toEntity.name,

          // @TODO(database): Not sure if this is correct
          triples: localTriples.filter(t => t.entityId === r.toEntity.id),
        },
      };
    });

    return [...locallyCreatedRelations, ...activeRemoteRelations];
  });
};
