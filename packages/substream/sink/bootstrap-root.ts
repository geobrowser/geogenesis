import { SYSTEM_IDS } from '@geogenesis/ids';
import { PERMISSIONED_SPACE_REGISTRY_ADDRESS } from '@geogenesis/ids/system-ids';
import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

import { ROOT_SPACE_CREATED_AT, ROOT_SPACE_CREATED_AT_BLOCK, ROOT_SPACE_CREATED_BY_ID } from './constants/constants';
import { generateTripleId } from './utils/id';
import { pool } from './utils/pool';

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
};

const types: Record<string, string[]> = {
  [SYSTEM_IDS.TEXT]: [],
  [SYSTEM_IDS.RELATION]: [],
  [SYSTEM_IDS.IMAGE]: [],
  [SYSTEM_IDS.DATE]: [],
  [SYSTEM_IDS.WEB_URL]: [],
  [SYSTEM_IDS.ATTRIBUTE]: [SYSTEM_IDS.VALUE_TYPE],
  [SYSTEM_IDS.SCHEMA_TYPE]: [SYSTEM_IDS.ATTRIBUTES],
  [SYSTEM_IDS.SPACE_CONFIGURATION]: [SYSTEM_IDS.FOREIGN_TYPES],
  [SYSTEM_IDS.IMAGE_BLOCK]: [SYSTEM_IDS.IMAGE_ATTRIBUTE, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.TABLE_BLOCK]: [SYSTEM_IDS.ROW_TYPE, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.TEXT_BLOCK]: [SYSTEM_IDS.MARKDOWN_CONTENT, SYSTEM_IDS.PARENT_ENTITY],
  [SYSTEM_IDS.PERSON_TYPE]: [SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.COVER_ATTRIBUTE],
};

const geoEntities: s.geo_entities.Insertable[] = entities.map(entity => ({
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

const namesTriples: s.triples.Insertable[] = Object.entries(names).map(([id, name]) => ({
  id: generateTripleId({
    space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
    entity_id: id,
    attribute_id: SYSTEM_IDS.NAME,
    value_id: name,
  }),
  entity_id: id,
  attribute_id: SYSTEM_IDS.NAME,
  value_type: 'string',
  value_id: id,
  string_value: name,
  is_protected: true,
  space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
  created_at: ROOT_SPACE_CREATED_AT,
  is_stale: false,
}));

const attributeTriples: s.triples.Insertable[] = Object.entries(attributes)
  .map(([id, entity_value_id]) => [
    /* Giving these entities a type of attribute */
    {
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: SYSTEM_IDS.TYPES,
        value_id: SYSTEM_IDS.ATTRIBUTE,
      }),
      entity_id: id,
      attribute_id: SYSTEM_IDS.TYPES,
      value_type: 'entity',
      value_id: SYSTEM_IDS.ATTRIBUTE,
      entity_value_id: SYSTEM_IDS.ATTRIBUTE,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
      created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
      created_at: ROOT_SPACE_CREATED_AT,
      is_stale: false,
    },
    /* Giving these attributes a value type of the type they are */
    {
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: SYSTEM_IDS.VALUE_TYPE,
        value_id: SYSTEM_IDS.ATTRIBUTE,
      }),
      entity_id: id,
      attribute_id: SYSTEM_IDS.VALUE_TYPE,
      value_type: 'entity',
      value_id: SYSTEM_IDS.ATTRIBUTE,
      entity_value_id,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
      created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
      created_at: ROOT_SPACE_CREATED_AT,
      is_stale: false,
    },
  ])
  .flat();

const typeTriples: s.triples.Insertable[] = Object.entries(types)
  .map(([id, attributes]) => [
    /* Giving these entities a type of type */
    {
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: SYSTEM_IDS.TYPES,
        value_id: SYSTEM_IDS.SCHEMA_TYPE,
      }),
      entity_id: id,
      attribute_id: SYSTEM_IDS.TYPES,
      value_type: 'entity',
      value_id: SYSTEM_IDS.SCHEMA_TYPE,
      entity_value_id: SYSTEM_IDS.SCHEMA_TYPE,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
      created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
      created_at: ROOT_SPACE_CREATED_AT,
      is_stale: false,
    },
    /* Giving these entities an attribute of attribute */
    ...attributes.map(attribute => ({
      id: generateTripleId({
        space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
        entity_id: id,
        attribute_id: SYSTEM_IDS.ATTRIBUTES,
        value_id: attribute,
      }),
      entity_id: id,
      attribute_id: SYSTEM_IDS.ATTRIBUTES,
      value_type: 'entity',
      value_id: attribute,
      entity_value_id: attribute,
      is_protected: true,
      space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
      created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
      created_at: ROOT_SPACE_CREATED_AT,
      is_stale: false,
    })),
  ])
  .flat();

const space: s.spaces.Insertable = {
  id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
  is_root_space: true,
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
  space_id: PERMISSIONED_SPACE_REGISTRY_ADDRESS,
  created_at_block: ROOT_SPACE_CREATED_AT_BLOCK,
  name: `Creating initial types for ${ROOT_SPACE_CREATED_BY_ID}`,
  type: 'content',
  status: 'approved',
  start_time: ROOT_SPACE_CREATED_AT,
  end_time: ROOT_SPACE_CREATED_AT,
};

export class BootstrapRootError extends Error {
  _tag: 'BootstrapRootError' = 'BootstrapRootError';
}

export function bootstrapRoot() {
  return Effect.tryPromise({
    try: async () => {
      // @TODO: Create versions for the entities
      await Promise.all([
        db.insert('spaces', space).run(pool),
        db.insert('accounts', account).run(pool),
        db.insert('geo_entities', geoEntities).run(pool),
        db.insert('triples', namesTriples).run(pool),
        db.insert('triples', typeTriples).run(pool),
        db.insert('triples', attributeTriples).run(pool),
        db.insert('proposals', proposal).run(pool),
      ]);
    },
    catch: error => new BootstrapRootError(String(error)),
  });
}
