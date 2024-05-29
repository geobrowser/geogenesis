import { SYSTEM_IDS, createCollectionItem, createGeoId } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as s from 'zapatos/schema';

import { ROOT_SPACE_ADDRESS } from '../../ids/system-ids';
import {
  INITIAL_COLLECTION_ITEM_INDEX,
  ROOT_SPACE_CREATED_AT,
  ROOT_SPACE_CREATED_AT_BLOCK,
  ROOT_SPACE_CREATED_BY_ID,
} from './constants/constants';
import { Accounts, Collections, Entities, Proposals, Spaces, Triples } from './db';
import { CollectionItems } from './db/collection-items';
import { getTripleFromOp } from './events/get-triple-from-op';

const entities: string[] = [
  SYSTEM_IDS.TYPES,
  SYSTEM_IDS.ATTRIBUTES,
  SYSTEM_IDS.SCHEMA_TYPE,
  SYSTEM_IDS.VALUE_TYPE,
  SYSTEM_IDS.RELATION,
  SYSTEM_IDS.TEXT,
  SYSTEM_IDS.IMAGE,
  SYSTEM_IDS.IMAGE_ATTRIBUTE,
  SYSTEM_IDS.DESCRIPTION,
  SYSTEM_IDS.NAME,
  SYSTEM_IDS.SPACE,
  SYSTEM_IDS.ATTRIBUTE,
  SYSTEM_IDS.SPACE_CONFIGURATION,
  SYSTEM_IDS.FOREIGN_TYPES,
  SYSTEM_IDS.TABLE_BLOCK,
  SYSTEM_IDS.SHOWN_COLUMNS,
  SYSTEM_IDS.TEXT_BLOCK,
  SYSTEM_IDS.IMAGE_BLOCK,
  SYSTEM_IDS.BLOCKS,
  SYSTEM_IDS.MARKDOWN_CONTENT,
  SYSTEM_IDS.ROW_TYPE,
  SYSTEM_IDS.PARENT_ENTITY,
  SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE,
  SYSTEM_IDS.DATE,
  SYSTEM_IDS.WEB_URL,
  SYSTEM_IDS.PERSON_TYPE,
  SYSTEM_IDS.AVATAR_ATTRIBUTE,
  SYSTEM_IDS.COVER_ATTRIBUTE,

  // Compound types are value types that are stored as entities but are
  // selectable as a "native" type for a triple's value type.
  //
  // e.g., you can select a Text value type, or a Number, or an Image. The
  // image is stored as an entity while the others are stored as a primitive
  // type in the database.
  SYSTEM_IDS.IMAGE_COMPOUND_TYPE_IMAGE_URL_ATTRIBUTE,

  // Collections
  SYSTEM_IDS.COLLECTION_TYPE,
  SYSTEM_IDS.COLLECTION_ITEM_TYPE,
  SYSTEM_IDS.COLLECTION_ITEM_INDEX,
  SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
  SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
];

const names: Record<string, string> = {
  [SYSTEM_IDS.TYPES]: 'Types',
  [SYSTEM_IDS.NAME]: 'Name',
  [SYSTEM_IDS.ATTRIBUTE]: 'Attribute',
  [SYSTEM_IDS.SPACE]: 'Indexed Space',
  [SYSTEM_IDS.ATTRIBUTES]: 'Attributes',
  [SYSTEM_IDS.SCHEMA_TYPE]: 'Type',
  [SYSTEM_IDS.VALUE_TYPE]: 'Value type',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.TEXT]: 'Text',

  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.IMAGE_COMPOUND_TYPE_IMAGE_URL_ATTRIBUTE]: 'Image URL',

  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
  [SYSTEM_IDS.IMAGE_ATTRIBUTE]: 'Image',
  [SYSTEM_IDS.DESCRIPTION]: 'Description',
  [SYSTEM_IDS.SPACE_CONFIGURATION]: 'Space',
  [SYSTEM_IDS.FOREIGN_TYPES]: 'Foreign Types',
  [SYSTEM_IDS.TABLE_BLOCK]: 'Table Block',
  [SYSTEM_IDS.SHOWN_COLUMNS]: 'Shown Columns',
  [SYSTEM_IDS.TEXT_BLOCK]: 'Text Block',
  [SYSTEM_IDS.IMAGE_BLOCK]: 'Image Block',
  [SYSTEM_IDS.BLOCKS]: 'Blocks',
  [SYSTEM_IDS.PARENT_ENTITY]: 'Parent Entity',
  [SYSTEM_IDS.PERSON_TYPE]: 'Person',
  [SYSTEM_IDS.MARKDOWN_CONTENT]: 'Markdown Content',
  [SYSTEM_IDS.ROW_TYPE]: 'Row Type',
  [SYSTEM_IDS.AVATAR_ATTRIBUTE]: 'Avatar',
  [SYSTEM_IDS.COVER_ATTRIBUTE]: 'Cover',
  [SYSTEM_IDS.FILTER]: 'Filter',
  [SYSTEM_IDS.WALLETS_ATTRIBUTE]: 'Wallets',
  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: 'Relation Value Types',

  [SYSTEM_IDS.COLLECTION_TYPE]: 'Collection',
  [SYSTEM_IDS.COLLECTION_ITEM_TYPE]: 'Collection Item',
  [SYSTEM_IDS.COLLECTION_ITEM_INDEX]: 'Index',
  [SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE]: 'Entity Reference',
  [SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE]: 'Collection Reference',
};

const attributes: Record<string, string> = {
  [SYSTEM_IDS.TYPES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.ATTRIBUTES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.VALUE_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.IMAGE_ATTRIBUTE]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.DESCRIPTION]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.NAME]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.SPACE]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.FOREIGN_TYPES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.MARKDOWN_CONTENT]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.ROW_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.BLOCKS]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.PARENT_ENTITY]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.FILTER]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.AVATAR_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.COVER_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.WALLETS_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.COLLECTION_ITEM_INDEX]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.IMAGE_COMPOUND_TYPE_IMAGE_URL_ATTRIBUTE]: SYSTEM_IDS.WEB_URL,
};

const types: Record<string, string[]> = {
  [SYSTEM_IDS.TEXT]: [],
  [SYSTEM_IDS.RELATION]: [],
  [SYSTEM_IDS.IMAGE]: [SYSTEM_IDS.IMAGE_COMPOUND_TYPE_IMAGE_URL_ATTRIBUTE],
  [SYSTEM_IDS.DATE]: [],
  [SYSTEM_IDS.WEB_URL]: [],
  [SYSTEM_IDS.ATTRIBUTE]: [SYSTEM_IDS.VALUE_TYPE],
  [SYSTEM_IDS.SCHEMA_TYPE]: [SYSTEM_IDS.ATTRIBUTES],
  [SYSTEM_IDS.SPACE_CONFIGURATION]: [SYSTEM_IDS.FOREIGN_TYPES],
  [SYSTEM_IDS.IMAGE_BLOCK]: [SYSTEM_IDS.IMAGE_ATTRIBUTE, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.TABLE_BLOCK]: [SYSTEM_IDS.ROW_TYPE, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.TEXT_BLOCK]: [SYSTEM_IDS.MARKDOWN_CONTENT, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.PERSON_TYPE]: [SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.COVER_ATTRIBUTE],
  [SYSTEM_IDS.COLLECTION_ITEM_TYPE]: [
    SYSTEM_IDS.COLLECTION_ITEM_INDEX,
    SYSTEM_IDS.COLLECTION_ITEM_ENTITY_REFERENCE,
    SYSTEM_IDS.COLLECTION_ITEM_COLLECTION_ID_REFERENCE_ATTRIBUTE,
  ],
};

const geoEntities: s.entities.Insertable[] = entities.map(entity => ({
  id: entity,
  name: names[entity],
  // is_attribute: attributes[entity] ? true : false,
  // is_type: types[entity] ? true : false,
  // attribute_value_type_id: attributes[entity],
  created_by_id: ROOT_SPACE_CREATED_BY_ID,
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
  created_at: ROOT_SPACE_CREATED_AT,
  updated_at: ROOT_SPACE_CREATED_AT,
  updated_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
}));

const namesTriples: s.triples.Insertable[] = Object.entries(names).map(
  ([id, name]): s.triples.Insertable => ({
    entity_id: id,
    attribute_id: SYSTEM_IDS.NAME,
    value_type: 'TEXT',
    text_value: name,
    space_id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
    created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
    created_at: ROOT_SPACE_CREATED_AT,
    is_stale: false,
  })
);

const attributeTriples: s.triples.Insertable[] = Object.entries(attributes)
  .map(([id, entity_value_id]): s.triples.Insertable[] => [
    /* Giving these entities a type of attribute */
    {
      entity_id: id,
      attribute_id: SYSTEM_IDS.TYPES,
      value_type: 'TEXT',
      entity_value_id: SYSTEM_IDS.ATTRIBUTE,
      space_id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
      created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
      created_at: ROOT_SPACE_CREATED_AT,
      is_stale: false,
    },
    /* Giving these attributes a value type of the type they are */
    {
      entity_id: id,
      attribute_id: SYSTEM_IDS.VALUE_TYPE,
      value_type: 'ENTITY',
      entity_value_id,
      space_id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
      created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
      created_at: ROOT_SPACE_CREATED_AT,
      is_stale: false,
    },
  ])
  .flat();

const getTypeTriples = () => {
  const collectionsToWrite: s.collections.Insertable[] = [];
  const collectionItemsToWrite: s.collection_items.Insertable[] = [];

  const triples = Object.entries(types)
    .map(([id, attributes]): s.triples.Insertable[] => {
      const collectionEntityId = createGeoId();

      if (attributes.length > 0) {
        collectionsToWrite.push({ id: collectionEntityId, entity_id: collectionEntityId });
      }

      const collectionItemsForAttributes = attributes
        .map((attributeId): s.triples.Insertable[] => {
          const collectionItemEntityId = createGeoId();

          // This is used to write the collection item to the collection_items
          // table in the database. The below objects are used to write the
          // triples for each collection item.
          collectionItemsToWrite.push({
            id: collectionItemEntityId,
            collection_item_entity_id: collectionItemEntityId,
            collection_id: collectionEntityId,
            entity_id: attributeId,
            index: INITIAL_COLLECTION_ITEM_INDEX,
          });

          const collectionItemTriples = createCollectionItem({
            collectionId: collectionEntityId,
            entityId: attributeId,
            spaceId: ROOT_SPACE_ADDRESS,
          });

          return collectionItemTriples.map(op =>
            getTripleFromOp(op, ROOT_SPACE_ADDRESS, {
              blockNumber: ROOT_SPACE_CREATED_AT_BLOCK,
              cursor: '',
              requestId: '',
              timestamp: ROOT_SPACE_CREATED_AT,
            })
          );
        })
        .flat();

      return [
        /* Giving these entities a type of type */
        {
          entity_id: id,
          attribute_id: SYSTEM_IDS.TYPES,
          value_type: 'ENTITY',
          entity_value_id: SYSTEM_IDS.SCHEMA_TYPE,
          space_id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
          created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
          created_at: ROOT_SPACE_CREATED_AT,
          is_stale: false,
        },

        // Create a collection entity with type Collection. We might be
        // adding multiple attributes so need to use a collection list
        // many entity references.
        {
          entity_id: collectionEntityId,
          attribute_id: SYSTEM_IDS.TYPES,
          value_type: 'ENTITY',
          entity_value_id: SYSTEM_IDS.COLLECTION_TYPE,
          space_id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
          created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
          created_at: ROOT_SPACE_CREATED_AT,
          is_stale: false,
        },

        {
          entity_id: id,
          attribute_id: SYSTEM_IDS.ATTRIBUTES,
          value_type: 'COLLECTION',
          collection_value_id: collectionEntityId,
          space_id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
          created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
          created_at: ROOT_SPACE_CREATED_AT,
          is_stale: false,
        },

        // Create the collection + collection items to map multiple
        // attributes to the "Attributes" attribute (lol)
        ...collectionItemsForAttributes,
      ];
    })
    .flat();

  return {
    typeTriples: triples,
    collections: collectionsToWrite,
    collectionItems: collectionItemsToWrite,
  };
};

const space: s.spaces.Insertable = {
  id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
  is_root_space: true,
  type: 'public',
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
};

const account: s.accounts.Insertable = {
  id: ROOT_SPACE_CREATED_BY_ID,
};

const proposal: s.proposals.Insertable = {
  id: '0',
  onchain_proposal_id: '-1',
  created_by_id: ROOT_SPACE_CREATED_BY_ID,
  created_at: ROOT_SPACE_CREATED_AT,
  plugin_address: '',
  space_id: SYSTEM_IDS.ROOT_SPACE_ADDRESS,
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
  name: `Creating initial types for ${ROOT_SPACE_CREATED_BY_ID}`,
  type: 'CONTENT',
  status: 'accepted',
  start_time: ROOT_SPACE_CREATED_AT,
  end_time: ROOT_SPACE_CREATED_AT,
};

export class BootstrapRootError extends Error {
  _tag: 'BootstrapRootError' = 'BootstrapRootError';
}

export function bootstrapRoot() {
  return Effect.gen(function* (_) {
    // When binding the attributes schema to a type entity we
    // create collections to store many attributes. We need
    // to insert these collections into the Collections table.
    const { typeTriples, collections, collectionItems } = getTypeTriples();

    yield _(
      Effect.tryPromise({
        try: async () => {
          // @TODO: Create versions for the entities
          await Promise.all([
            Spaces.upsert([space]),
            Accounts.upsert([account]),
            Entities.upsert(geoEntities),

            Triples.insert(namesTriples),
            Triples.upsert(typeTriples),
            Triples.insert(attributeTriples),

            Proposals.upsert([proposal]),
            Collections.upsert(collections),
            CollectionItems.upsert(collectionItems),
          ]);
        },
        catch: error => new BootstrapRootError(String(error)),
      })
    );
  });
}
