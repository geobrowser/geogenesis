import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { EntityId, SpaceId } from '~/core/io/schema';

type CreateCollectionItemRelationArgs = {
  relationId?: EntityId;
  collectionId: EntityId;
  spaceId: SpaceId;
  toEntity: {
    id: EntityId;
    name: string | null;
  };
};

/**
 * Creates the relation describing a collection item in a collection. Collection items
 * are just Relations with a Relation type of {@link SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE}
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
}: CreateCollectionItemRelationArgs) {
  // Create a relation for the Collection Item pointing from the collection to the new entity
  DB.upsertRelation({
    relation: {
      ...(relationId ? { id: relationId } : {}),
      ...makeRelationForCollectionItem({
        collectionId,
        toEntityId: toEntity.id,
        toEntityName: toEntity.name,
        spaceId,
      }),
    },
    spaceId,
  });
}

type UpsertSourceSpaceCollectionItemArgs = {
  collectionItemId: EntityId;
  spaceId: SpaceId;
  sourceSpaceId: string;
  toId: EntityId;
};

export function upsertSourceSpaceOnCollectionItem({
  collectionItemId,
  spaceId,
  toId,
  sourceSpaceId,
}: UpsertSourceSpaceCollectionItemArgs) {
  DB.upsert(
    {
      attributeId: SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
      attributeName: 'To entity',
      entityId: collectionItemId,
      entityName: null,
      value: {
        type: 'URL',
        value: GraphUrl.fromEntityId(toId, { spaceId: sourceSpaceId }),
      },
    },
    spaceId
  );
}

type UpsertVerifiedSourceCollectionItemArgs = {
  collectionItemId: EntityId;
  spaceId: SpaceId;
};

export function upsertVerifiedSourceOnCollectionItem({
  collectionItemId,
  spaceId,
}: UpsertVerifiedSourceCollectionItemArgs) {
  DB.upsert(
    {
      attributeId: SYSTEM_IDS.VERIFIED_SOURCE_ATTRIBUTE,
      attributeName: 'Verified Source',
      entityId: collectionItemId,
      entityName: null,
      value: {
        type: 'CHECKBOX',
        value: '1',
      },
    },
    spaceId
  );
}

type GetRelationForCollectionItemArgs = {
  collectionId: EntityId;
  toEntityId: EntityId;
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
}: GetRelationForCollectionItemArgs): StoreRelation {
  // Create a relation that points from the collection to the entity with Relation Type -> CollectionItem
  // 1. Relation type -> CollectionItem
  return {
    space: spaceId,
    index: INITIAL_RELATION_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE),
      name: 'Collection Item',
    },
    fromEntity: {
      id: collectionId,
      name: null,
    },
    toEntity: {
      id: toEntityId,
      name: toEntityName,
      renderableType: 'RELATION',
      value: toEntityId,
    },
  };
}
