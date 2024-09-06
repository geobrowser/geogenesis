import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';
import { Match } from 'effect';

import { StoreRelation, UpsertOp } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { ID } from '~/core/id';
import { Relation } from '~/core/io/dto/entities';
import { EntityId, SpaceId } from '~/core/io/schema';

import { getRelationForBlockType } from './block-types';
import { Source } from './types';

/**
 * Returns the relations to create a data entity. Data entities by default
 * have a type of Data, source set to be a collection id, and source type
 * set to be collection.
 */
export function getInitialDataEntityRelations(
  blockId: EntityId
): [StoreRelation, StoreRelation, StoreRelation, StoreRelation] {
  const newCollectionId = ID.createEntityId();

  return [
    // Create relation for the source type, e.g., Spaces, Collection, Geo, etc.
    getRelationForSourceType('COLLECTION', blockId),

    // Create the type relation for the block itself. e.g., Table, Image, Text, etc.
    getRelationForBlockType(blockId, SYSTEM_IDS.TABLE_BLOCK),
    // Create the new collection entity by giving it a type of Collection.
    {
      index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
      typeOf: {
        id: EntityId(SYSTEM_IDS.TYPES),
        name: 'Types',
      },
      toEntity: {
        id: EntityId(SYSTEM_IDS.COLLECTION_TYPE),
        renderableType: 'RELATION',
        name: null,
        value: EntityId(SYSTEM_IDS.COLLECTION_TYPE),
      },
      fromEntity: {
        id: EntityId(newCollectionId),
        name: null,
      },
    },

    // Set the new collection as a data source. This points from the block entity to
    // the collection entity.
    getRelationForSource(EntityId(newCollectionId), blockId),
  ];
}

/**
 * Reads the relations on the data block to find the Data Source Type
 * and data source value and maps it to our local representation of the
 * Source.
 *
 * Valid data source types are:
 *  - Collection
 *  - Spaces
 *  - All of Geo
 *
 * Depending on the source type we either need to later read from a single
 * collection, or generate a query.
 *
 * @param dataEntityRelations - The relations coming from the data entity
 * @returns The source of the data block with the source type and entity id(s)
 * for the type of source.
 */
export function getSource(dataEntityRelations: Relation[], currentSpaceId: SpaceId): Source {
  const sourceType = dataEntityRelations.find(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE)?.toEntity
    .id;

  if (sourceType === SYSTEM_IDS.COLLECTION_DATA_SOURCE) {
    return {
      type: 'COLLECTION',
      value: dataEntityRelations.find(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE)?.toEntity.id ?? '',
    };
  }

  if (sourceType === SYSTEM_IDS.QUERY_DATA_SOURCE) {
    return {
      type: 'SPACES',
      value: dataEntityRelations
        .filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE)
        .map(r => SpaceId(r.toEntity.id)),
    };
  }

  if (sourceType === SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE) {
    return {
      type: 'GEO',
    };
  }

  return {
    type: 'SPACES',
    value: [currentSpaceId],
  };
}

export function deleteSources({ relations, spaceId }: { relations: Relation[]; spaceId: SpaceId }) {
  // Delete the existing source type relation. There should only be one source type
  // relation, but delete many just in case.
  const sourceTypeRelations = relations.filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE);
  // Delete the existing sources relations. There might be one or many of these depending
  // on the source type.
  const sourceRelations = relations.filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE);

  // @TODO(relations): Remove many
  for (const relation of [...sourceRelations, ...sourceTypeRelations]) {
    DB.removeRelation({
      relationId: relation.id,
      spaceId,
    });
  }
}

export function createSource({ source, blockId, spaceId }: { source: Source; blockId: EntityId; spaceId: SpaceId }) {
  const newSourceType = getRelationForSourceType(source.type, blockId); // Source: COLLECTION | SPACES | GEO | etc.
  const newSources = getRelationsForSourceEntities(source, blockId); // Source ids: SpaceId[] | CollectionId | GeoId

  for (const relation of [newSourceType, ...newSources]) {
    DB.upsertRelation({
      relation: relation,
      spaceId,
    });
  }
}

type CreateCollectionItemRelationArgs = {
  collectionId: EntityId;
  spaceId: SpaceId;
  toEntity: {
    id: EntityId;
    name: string | null;
  };
};

export function createCollectionItemRelation({ collectionId, spaceId, toEntity }: CreateCollectionItemRelationArgs) {
  // Create a relation for the Collection Item pointing from the collection to the new entity
  DB.upsertRelation({
    relation: getRelationForCollectionItem({
      collectionId,
      toEntityId: toEntity.id,
      toEntityName: toEntity.name,
    }),
    spaceId,
  });
}

type GetRelationForCollectionItemArgs = {
  collectionId: EntityId;
  toEntityId: EntityId;
  toEntityName: string | null;
};

function getRelationForCollectionItem({
  collectionId,
  toEntityId,
  toEntityName,
}: GetRelationForCollectionItemArgs): StoreRelation {
  // Create a relation that points from the collection to the entity with Relation Type -> CollectionItem
  // 1. Relation type -> CollectionItem
  return {
    index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
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

function getRelationForSourceType(sourceType: Source['type'], blockId: EntityId): StoreRelation {
  // Get the source type system id based on the source type
  const sourceTypeId = Match.value(sourceType).pipe(
    Match.when('COLLECTION', () => SYSTEM_IDS.COLLECTION_DATA_SOURCE),
    Match.when('SPACES', () => SYSTEM_IDS.QUERY_DATA_SOURCE),
    Match.when('GEO', () => SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE),
    Match.orElse(() => SYSTEM_IDS.COLLECTION_DATA_SOURCE)
  );

  return {
    index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE),
      name: 'Data Source Type',
    },
    toEntity: {
      id: EntityId(sourceTypeId),
      renderableType: 'RELATION',
      name: null,
      value: EntityId(sourceTypeId),
    },
    fromEntity: {
      id: EntityId(blockId),
      name: null,
    },
  };
}

function getRelationsForSourceEntities(source: Source, blockId: EntityId): StoreRelation[] {
  if (source.type === 'COLLECTION') {
    return [
      // Set the new collection as a data source. This points from the block entity to
      // the collection entity.
      getRelationForSource(EntityId(source.value), blockId),
    ];
  }

  if (source.type === 'SPACES') {
    return source.value.map(spaceId => {
      return getRelationForSource(EntityId(spaceId), blockId);
    });
  }

  return [getRelationForSource(EntityId(SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE), blockId)];
}

function getRelationForSource(sourceId: EntityId, blockId: EntityId): StoreRelation {
  // Set the new collection as a data source. This points from the block entity to
  // the collection entity.
  return {
    index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
    typeOf: {
      id: EntityId(SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE),
      name: 'Data Source',
    },
    toEntity: {
      id: EntityId(sourceId),
      renderableType: 'DATA',
      name: null,
      value: EntityId(sourceId),
    },
    fromEntity: {
      id: EntityId(blockId),
      name: null,
    },
  };
}

function getEmptyEntityNameOps(): UpsertOp {
  return {
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    entityId: ID.createEntityId(),
    entityName: '',
    value: {
      type: 'TEXT',
      value: '',
    },
  };
}
