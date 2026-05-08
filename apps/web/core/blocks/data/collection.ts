import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { storage } from '~/core/sync/use-mutate';
import { Relation } from '~/core/types';

type CreateCollectionItemRelationArgs = {
  relationId?: string;
  collectionId: string;
  spaceId: string;
  toEntity: {
    id: string;
    name: string | null;
  };
  toSpaceId?: string;
  verified?: boolean;
};

/**
 * Creates the relation describing a collection item in a collection. Collection items
 * are just Relations with a Relation type of {@link SystemIds.COLLECTION_ITEM_RELATION_TYPE}
 *
 * @params collectionId - The collection id as an {@link EntityId}
 * @params spaceId - The space id as a {@link SpaceId}
 * @params toEntity - The entity id and name of the ToEntity as an object with an id and name
 */
export function upsertCollectionItemRelation({
  relationId,
  collectionId,
  spaceId,
  toEntity,
  toSpaceId,
  verified,
}: CreateCollectionItemRelationArgs) {
  // upsertByKey resurrects any tombstoned (collectionId, COLLECTION_ITEM, toEntity)
  // relation so re-adding a previously-removed item reuses its original id,
  // instead of leaving a deleted relation alongside a freshly-id'd live one.
  // Callers may still pass an explicit relationId (e.g. when stitching to an
  // existing entity); upsertByKey honors it only if no key match is found.
  storage.relations.upsertByKey({
    ...(relationId ? { id: relationId } : {}),
    ...makeRelationForCollectionItem({
      collectionId,
      toEntityId: toEntity.id,
      toEntityName: toEntity.name,
      spaceId,
    }),
    ...(toSpaceId !== undefined ? { toSpaceId } : {}),
    ...(verified !== undefined ? { verified } : {}),
  });
}

type MakeRelationForCollectionItemArgs = {
  collectionId: string;
  toEntityId: string;
  toEntityName: string | null;
  spaceId: string;
};

/**
 * @param collectionId - The collection id as an {@link EntityId}
 * @param toEntityId - The entity id for the ToEntity as an {@link EntityId}
 * @param toEntityName - The name of the ToEntity as a string if it exists or null if it doesn't
 *
 * @returns A `StoreRelation` representing a Collection Item in a Collection.
 */
function makeRelationForCollectionItem({
  collectionId,
  toEntityId,
  toEntityName,
  spaceId,
}: MakeRelationForCollectionItemArgs): Relation {
  // Create a relation that points from the collection to the entity with Relation Type -> CollectionItem
  // 1. Relation type -> CollectionItem
  return {
    id: IdUtils.generate(),
    // @TODO(migration): Potentially reuse relation entity
    entityId: IdUtils.generate(),
    spaceId: spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: {
      id: SystemIds.COLLECTION_ITEM_RELATION_TYPE,
      name: 'Collection Item',
    },
    fromEntity: {
      id: collectionId,
      name: null,
    },
    toEntity: {
      id: toEntityId,
      name: toEntityName,
      value: toEntityId,
    },
  };
}
