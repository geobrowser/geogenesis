import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { StoreRelation } from '~/core/database/types';
import { ID } from '~/core/id';
import { Relation } from '~/core/io/dto/entities';
import { EntityId, SpaceId } from '~/core/io/schema';

import { getInitialBlockTypeRelation } from './block-types';
import { Source } from './types';

// Set a source by id as the source of the data block
export function setSource() {
  return;
}

// Collection -> Space || Space -> Collection
export function changeSourceType() {
  return;
}

export function somethingWithFilters() {
  return;
}

/**
 * Returns the relations to create a data entity. Data entities by default
 * have a type of Data, source set to be a collection, and a name.
 */
export function getInitialDataEntityRelations(
  blockId: string
): [StoreRelation, StoreRelation, StoreRelation, StoreRelation] {
  const collectionId = ID.createEntityId();

  return [
    // Create the type relation
    getInitialBlockTypeRelation(blockId, SYSTEM_IDS.TABLE_BLOCK),
    // Create the collection target for the data block
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
        id: EntityId(collectionId),
        name: null,
      },
    },

    // Set the data source type to be Collection
    {
      index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
      typeOf: {
        id: EntityId(SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE),
        name: 'Data Source Type',
      },
      toEntity: {
        id: EntityId(SYSTEM_IDS.COLLECTION_DATA_SOURCE),
        renderableType: 'RELATION',
        name: null,
        value: EntityId(SYSTEM_IDS.COLLECTION_DATA_SOURCE),
      },
      fromEntity: {
        id: EntityId(blockId),
        name: null,
      },
    },

    // Set the new collection as a data source
    {
      index: INITIAL_COLLECTION_ITEM_INDEX_VALUE,
      typeOf: {
        id: EntityId(SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE),
        name: 'Data Source Type',
      },
      toEntity: {
        id: EntityId(SYSTEM_IDS.COLLECTION_DATA_SOURCE),
        renderableType: 'RELATION',
        name: null,
        value: EntityId(SYSTEM_IDS.COLLECTION_DATA_SOURCE),
      },
      fromEntity: {
        id: EntityId(blockId),
        name: null,
      },
    },
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
export function getSource(dataEntityRelations: Relation[]): Source {
  const sourceType = dataEntityRelations.find(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE)?.toEntity
    .id;

  if (sourceType === SYSTEM_IDS.COLLECTION_DATA_SOURCE) {
    return {
      type: 'collection',
      value: dataEntityRelations.find(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE)?.toEntity.id ?? '',
    };
  }

  if (sourceType === SYSTEM_IDS.QUERY_DATA_SOURCE) {
    return {
      type: 'spaces',
      value: dataEntityRelations
        .filter(r => r.typeOf.id === SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE)
        .map(r => SpaceId(r.toEntity.id)),
    };
  }

  if (sourceType === SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE) {
    return {
      type: 'geo',
    };
  }

  return {
    type: 'collection',
    value: '',
  };
}
