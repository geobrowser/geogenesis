import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_COLLECTION_ITEM_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { StoreRelation } from '~/core/database/write';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';

import { getInitialBlockTypeRelation } from './block-types';

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
 * Returns the ops and relations to create a data entity. Data entities by default
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
