import { Id, Position, SystemIds } from '@graphprotocol/grc-20';

import { storage } from '~/core/sync/use-mutate';
import { Relation } from '~/core/v2.types';

type CreateCollectionItemRelationArgs = {
  relationId?: string;
  collectionId: string;
  spaceId: string;
  toEntity: {
    id: string;
    name: string | null;
  };
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
}: CreateCollectionItemRelationArgs) {
  // Create a relation for the Collection Item pointing from the collection to the new entity
  storage.relations.set({
    ...(relationId ? { id: relationId } : {}),
    ...makeRelationForCollectionItem({
      collectionId,
      toEntityId: toEntity.id,
      toEntityName: toEntity.name,
      spaceId,
    }),
  });
}

type UpsertSourceSpaceCollectionItemArgs = {
  collectionItemId: string;
  spaceId: string;
  sourceSpaceId?: string;
  toId: string;
};

export function upsertSourceSpaceOnCollectionItem({
  collectionItemId,
  spaceId,
  toId,
  sourceSpaceId,
}: UpsertSourceSpaceCollectionItemArgs) {
  // @TODO(migration): Update source space
  const relation = storage.relations.get('the-relation-id', 'the-entity-id');

  if (relation) {
    storage.relations.update(relation, draft => {
      draft.toSpaceId = sourceSpaceId;
    });
  }
}

type UpsertVerifiedSourceCollectionItemArgs = {
  collectionItemId: string;
  spaceId: string;
  verified?: boolean;
};

export function upsertVerifiedSourceOnCollectionItem({
  collectionItemId,
  spaceId,
  verified = true,
}: UpsertVerifiedSourceCollectionItemArgs) {
  const relation = storage.relations.get('the-relation-id', 'the-entity-id');

  if (relation) {
    storage.relations.update(relation, draft => {
      draft.verified = verified;
    });
  }
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
    id: Id.generate(),
    // @TODO(migration): Potentially reuse relation entity
    entityId: Id.generate(),
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
