import { SYSTEM_IDS, createRelationship } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { ROOT_SPACE_CREATED_AT, ROOT_SPACE_CREATED_AT_BLOCK, ROOT_SPACE_CREATED_BY_ID } from './constants/constants';
import { handleEditsPublished } from './events/edits-published/handler';
import { handleInitialGovernanceSpaceEditorsAdded } from './events/initial-editors-added/handler';
import { createInitialContentForSpaces } from './events/initial-proposal-created/handler';
import type { EditProposal } from './events/proposals-created/parser';
import { handleProposalsExecuted } from './events/proposals-executed/handler';
import { handleGovernancePluginCreated, handleSpacesCreated } from './events/spaces-created/handler';
import type { Op } from './types';

const SPACE_ID = 'ab7d4b9e02f840dab9746d352acb0ac6';
const DAO_ADDRESS = '0x9e2342C55080f2fCb6163c739a88c4F2915163C4';
const SPACE_ADDRESS = '0x7a260AC2D569994AA22a259B19763c9F681Ff84c';
const MAIN_VOTING_ADDRESS = '0x379408c230817DC7aA36033BEDC05DCBAcE7DF50';
const MEMBER_ACCESS_ADDRESS = '0xd09225EAe465f562719B9cA07da2E8ab286DBB36';

const names: Record<string, string> = {
  [SYSTEM_IDS.TYPES]: 'Types',
  [SYSTEM_IDS.NAME]: 'Name',
  [SYSTEM_IDS.ATTRIBUTE]: 'Attribute',
  [SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE]: 'Relation Type',
  [SYSTEM_IDS.ATTRIBUTES]: 'Attributes',
  [SYSTEM_IDS.SCHEMA_TYPE]: 'Type',
  [SYSTEM_IDS.TEMPLATE_ATTRIBUTE]: 'Template',
  [SYSTEM_IDS.VALUE_TYPE]: 'Value type',
  [SYSTEM_IDS.RELATION]: 'Relation',
  [SYSTEM_IDS.TEXT]: 'Text',
  [SYSTEM_IDS.CHECKBOX]: 'Checkbox',

  [SYSTEM_IDS.IMAGE]: 'Image',
  [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE]: 'Image URL',

  [SYSTEM_IDS.DATE]: 'Date',
  [SYSTEM_IDS.WEB_URL]: 'Web URL',
  [SYSTEM_IDS.DESCRIPTION]: 'Description',
  [SYSTEM_IDS.SPACE_CONFIGURATION]: 'Space',
  [SYSTEM_IDS.SOURCE_SPACE_ATTRIBUTE]: 'Source Space',
  [SYSTEM_IDS.VERIFIED_SOURCE_ATTRIBUTE]: 'Verified Source',
  [SYSTEM_IDS.FOREIGN_TYPES]: 'Foreign Types',

  // Data blocks
  [SYSTEM_IDS.VIEW_TYPE]: 'View',
  [SYSTEM_IDS.DATA_BLOCK]: 'Data Block',
  [SYSTEM_IDS.VIEW_ATTRIBUTE]: 'View',
  [SYSTEM_IDS.GALLERY_VIEW]: 'Gallery View',
  [SYSTEM_IDS.TABLE_VIEW]: 'Table View',
  [SYSTEM_IDS.LIST_VIEW]: 'List View',
  [SYSTEM_IDS.SHOWN_COLUMNS]: 'Shown Columns',
  [SYSTEM_IDS.TEXT_BLOCK]: 'Text Block',
  [SYSTEM_IDS.IMAGE_BLOCK]: 'Image Block',
  [SYSTEM_IDS.BLOCKS]: 'Blocks',
  [SYSTEM_IDS.FILTER]: 'Filter',
  [SYSTEM_IDS.SPACE_FILTER]: 'Space filter',
  [SYSTEM_IDS.MARKDOWN_CONTENT]: 'Markdown Content',
  [SYSTEM_IDS.PLACEHOLDER_IMAGE]: 'Placeholder Image',
  [SYSTEM_IDS.PLACEHOLDER_TEXT]: 'Placeholder Text',

  [SYSTEM_IDS.PERSON_TYPE]: 'Person',
  [SYSTEM_IDS.AVATAR_ATTRIBUTE]: 'Avatar',
  [SYSTEM_IDS.COVER_ATTRIBUTE]: 'Cover',
  [SYSTEM_IDS.ACCOUNTS_ATTRIBUTE]: 'Accounts',
  [SYSTEM_IDS.BROADER_SPACES]: 'Broader Spaces',
  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: 'Relation Value Types',

  [SYSTEM_IDS.RELATION_TYPE]: 'Relation',
  [SYSTEM_IDS.RELATION_INDEX]: 'Index',
  [SYSTEM_IDS.RELATION_TO_ATTRIBUTE]: 'To entity',
  [SYSTEM_IDS.RELATION_FROM_ATTRIBUTE]: 'From entity',

  [SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE]: 'Data Source',
  [SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE]: 'Data Source Type',
  [SYSTEM_IDS.COLLECTION_DATA_SOURCE]: 'Collection Data Source',
  [SYSTEM_IDS.ALL_OF_GEO_DATA_SOURCE]: 'Geo Data Source',
  [SYSTEM_IDS.QUERY_DATA_SOURCE]: 'Query Data Source',
  [SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE]: 'Collection Item',
};

const attributes: Record<string, string> = {
  [SYSTEM_IDS.TYPES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.TEMPLATE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.ATTRIBUTES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.VALUE_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.DESCRIPTION]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.NAME]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.SOURCE_SPACE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.VERIFIED_SOURCE_ATTRIBUTE]: SYSTEM_IDS.CHECKBOX,

  // Data blocks
  [SYSTEM_IDS.VIEW_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.FOREIGN_TYPES]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.MARKDOWN_CONTENT]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.BLOCKS]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.FILTER]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.PLACEHOLDER_IMAGE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.PLACEHOLDER_TEXT]: SYSTEM_IDS.TEXT,

  [SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.AVATAR_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.COVER_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.ACCOUNTS_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_INDEX]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.RELATION_TO_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_FROM_ATTRIBUTE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE]: SYSTEM_IDS.WEB_URL,
  [SYSTEM_IDS.BROADER_SPACES]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE]: SYSTEM_IDS.RELATION,
};

// These types include the default types and attributes for a given type. There might be more
// attributes on a type than are listed here if they were later added by users.
const types: Record<string, string[]> = {
  [SYSTEM_IDS.SCHEMA_TYPE]: [SYSTEM_IDS.TEMPLATE_ATTRIBUTE],
  [SYSTEM_IDS.VIEW_TYPE]: [],
  [SYSTEM_IDS.TEXT]: [],
  [SYSTEM_IDS.CHECKBOX]: [],
  [SYSTEM_IDS.RELATION]: [],
  [SYSTEM_IDS.IMAGE]: [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE],
  [SYSTEM_IDS.DATE]: [],
  [SYSTEM_IDS.WEB_URL]: [],
  [SYSTEM_IDS.ATTRIBUTE]: [SYSTEM_IDS.VALUE_TYPE],
  [SYSTEM_IDS.SPACE_CONFIGURATION]: [SYSTEM_IDS.FOREIGN_TYPES, SYSTEM_IDS.BLOCKS],
  [SYSTEM_IDS.IMAGE_BLOCK]: [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE],
  [SYSTEM_IDS.DATA_BLOCK]: [],
  [SYSTEM_IDS.TEXT_BLOCK]: [SYSTEM_IDS.MARKDOWN_CONTENT],
  [SYSTEM_IDS.PERSON_TYPE]: [SYSTEM_IDS.AVATAR_ATTRIBUTE, SYSTEM_IDS.COVER_ATTRIBUTE],
  [SYSTEM_IDS.RELATION_TYPE]: [
    SYSTEM_IDS.RELATION_INDEX,
    SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
    SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
    SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
  ],
};

const nameOps: Op[] = Object.entries(names).map(([entityId, name]) => {
  return {
    type: 'SET_TRIPLE',
    space: SPACE_ID,
    triple: {
      attribute: SYSTEM_IDS.NAME,
      entity: entityId!,
      value: {
        type: 'TEXT',
        value: name!,
      },
    },
  } satisfies Op;
});

const attributeOps: Op[] = Object.keys(attributes).flatMap(attributeId => {
  return createRelationship({
    fromId: attributeId,
    toId: SYSTEM_IDS.ATTRIBUTE,
    relationTypeId: SYSTEM_IDS.TYPES,
  }).map(op => ({
    ...op,
    space: SPACE_ID,
  }));
});

const attributeValueTypeOps: Op[] = Object.entries(attributes).flatMap(([attributeId, valueType]) => {
  return createRelationship({
    fromId: attributeId,
    toId: valueType,
    relationTypeId: SYSTEM_IDS.VALUE_TYPE,
  }).map(op => ({
    ...op,
    space: SPACE_ID,
  }));
});

const typeOps: Op[] = Object.keys(types).flatMap(typeId => {
  return createRelationship({
    fromId: typeId,
    toId: SYSTEM_IDS.SCHEMA_TYPE,
    relationTypeId: SYSTEM_IDS.TYPES,
  }).map(op => ({
    ...op,
    space: SPACE_ID,
  }));
});

const typeSchemaOps: Op[] = Object.entries(types).flatMap(([typeId, attributeIds]) => {
  return attributeIds.flatMap(attributeId => {
    return createRelationship({
      fromId: typeId,
      toId: attributeId,
      relationTypeId: SYSTEM_IDS.ATTRIBUTES,
    }).map(op => ({
      ...op,
      space: SPACE_ID,
    }));
  });
});

export class BootstrapRootError extends Error {
  _tag: 'BootstrapRootError' = 'BootstrapRootError';
}

const editProposal: EditProposal = {
  type: 'ADD_EDIT',
  proposalId: '-1',
  onchainProposalId: '-1',
  creator: ROOT_SPACE_CREATED_BY_ID,
  name: 'Root Space Bootstrap',
  endTime: ROOT_SPACE_CREATED_AT.toString(),
  startTime: ROOT_SPACE_CREATED_AT.toString(),
  metadataUri: 'bootstrapped-so-no-uri',
  ops: [...nameOps, ...attributeOps, ...attributeValueTypeOps, ...typeOps, ...typeSchemaOps],
  pluginAddress: MAIN_VOTING_ADDRESS,
  space: SYSTEM_IDS.ROOT_SPACE_ID,
};

const INITIAL_BLOCK = {
  blockNumber: ROOT_SPACE_CREATED_AT_BLOCK,
  cursor: '0',
  requestId: '-1',
  timestamp: ROOT_SPACE_CREATED_AT,
};

export const bootstrapRoot = Effect.gen(function* (_) {
  yield* _(
    handleSpacesCreated(
      [
        {
          daoAddress: DAO_ADDRESS,
          spaceAddress: SPACE_ADDRESS,
          id: SPACE_ID,
        },
      ],
      INITIAL_BLOCK
    )
  );

  yield* _(
    handleGovernancePluginCreated(
      [
        {
          daoAddress: DAO_ADDRESS,
          mainVotingAddress: MAIN_VOTING_ADDRESS,
          memberAccessAddress: MEMBER_ACCESS_ADDRESS,
        },
      ],
      INITIAL_BLOCK
    )
  );

  yield* _(
    handleInitialGovernanceSpaceEditorsAdded(
      [
        {
          addresses: [ROOT_SPACE_CREATED_BY_ID],
          pluginAddress: MAIN_VOTING_ADDRESS,
        },
      ],
      INITIAL_BLOCK
    )
  );

  yield* _(createInitialContentForSpaces({ proposals: [editProposal], block: INITIAL_BLOCK, editType: 'IMPORT' }));
  yield* _(handleEditsPublished([editProposal], [SPACE_ID], INITIAL_BLOCK));
  yield* _(handleProposalsExecuted([editProposal]));
});
