import { NETWORK_IDS, Relation, SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { handleEditsPublished } from '../events/edits-published/handler';
import { handleInitialGovernanceSpaceEditorsAdded } from '../events/initial-editors-added/handler';
import { createInitialContentForSpaces } from '../events/initial-proposal-created/handler';
import { handleProposalsExecuted } from '../events/proposals-executed/handler';
import { handleGovernancePluginCreated, handleSpacesCreated } from '../events/spaces-created/handler';
import type { Op, SinkEditProposal } from '../types';
import { templateOps } from './bootstrap-templates';
import {
  DAO_ADDRESS,
  INITIAL_BLOCK,
  MAIN_VOTING_ADDRESS,
  MEMBER_ACCESS_ADDRESS,
  ROOT_SPACE_CREATED_AT,
  ROOT_SPACE_CREATED_BY_ID,
  SPACE_ADDRESS,
  SPACE_ID,
} from './constants';

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
  [SYSTEM_IDS.NETWORK_TYPE]: 'Network',
  [SYSTEM_IDS.NETWORK_ATTRIBUTE]: 'Network',
  [SYSTEM_IDS.ADDRESS_ATTRIBUTE]: 'Address',
  [SYSTEM_IDS.ACCOUNT_TYPE]: 'Account',
  [NETWORK_IDS.ETHEREUM]: 'Ethereum',

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

  // Templates + Space Layouts
  [SYSTEM_IDS.NONPROFIT_TYPE]: 'Nonprofit',
  [SYSTEM_IDS.PROJECT_TYPE]: 'Project',
  [SYSTEM_IDS.COMPANY_TYPE]: 'Company',
  [SYSTEM_IDS.PAGE_TYPE]: 'Page',
  [SYSTEM_IDS.PAGE_TYPE_ATTRIBUTE]: 'Page type',
  [SYSTEM_IDS.POSTS_PAGE]: 'Posts page',
  [SYSTEM_IDS.PROJECTS_PAGE]: 'Projects page',
  [SYSTEM_IDS.FINANCES_PAGE]: 'Finances page',
  [SYSTEM_IDS.TEAM_PAGE]: 'Team page',
  [SYSTEM_IDS.JOBS_PAGE]: 'Jobs page',
  [SYSTEM_IDS.EVENTS_PAGE]: 'Events page',
  [SYSTEM_IDS.SERVICES_PAGE]: 'Services page',
  [SYSTEM_IDS.PRODUCTS_PAGE]: 'Products page',
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

  [SYSTEM_IDS.RELATION_INDEX]: SYSTEM_IDS.TEXT,
  [SYSTEM_IDS.RELATION_TO_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.RELATION_FROM_ATTRIBUTE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.IMAGE_URL_ATTRIBUTE]: SYSTEM_IDS.WEB_URL,
  [SYSTEM_IDS.BROADER_SPACES]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.DATA_SOURCE_TYPE_RELATION_TYPE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.DATA_SOURCE_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.COLLECTION_ITEM_RELATION_TYPE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.PAGE_TYPE]: SYSTEM_IDS.RELATION,

  [SYSTEM_IDS.AVATAR_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.COVER_ATTRIBUTE]: SYSTEM_IDS.IMAGE,
  [SYSTEM_IDS.ACCOUNTS_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.NETWORK_ATTRIBUTE]: SYSTEM_IDS.RELATION,
  [SYSTEM_IDS.ADDRESS_ATTRIBUTE]: SYSTEM_IDS.TEXT,
};

// These types include the default types and attributes for a given type. There might be more
// attributes on a type than are listed here if they were later added by users.
const schemaTypes: Record<string, string[]> = {
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
  [SYSTEM_IDS.ACCOUNT_TYPE]: [SYSTEM_IDS.NETWORK_ATTRIBUTE, SYSTEM_IDS.ADDRESS_ATTRIBUTE],
  [SYSTEM_IDS.NETWORK_TYPE]: [],
  [SYSTEM_IDS.NONPROFIT_TYPE]: [],
  [SYSTEM_IDS.PROJECT_TYPE]: [],
  [SYSTEM_IDS.COMPANY_TYPE]: [],
  [SYSTEM_IDS.RELATION_TYPE]: [
    SYSTEM_IDS.RELATION_INDEX,
    SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
    SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
    SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
  ],
};

const types: Record<string, string[]> = {
  [NETWORK_IDS.ETHEREUM]: [SYSTEM_IDS.NETWORK_TYPE],
};

const nameOps: Op[] = Object.entries(names).map(([entityId, name]) => {
  return {
    type: 'SET_TRIPLE',
    space: SPACE_ID,
    triple: {
      attribute: SYSTEM_IDS.NAME,
      entity: entityId,
      value: {
        type: 'TEXT',
        value: name,
      },
    },
  } satisfies Op;
});

const attributeOps: Op[] = Object.keys(attributes).flatMap(attributeId => {
  return Relation.make({
    fromId: attributeId,
    toId: SYSTEM_IDS.ATTRIBUTE,
    relationTypeId: SYSTEM_IDS.TYPES,
  }).map(op => ({
    ...op,
    space: SPACE_ID,
  }));
});

const attributeValueTypeOps: Op[] = Object.entries(attributes).flatMap(([attributeId, valueType]) => {
  return Relation.make({
    fromId: attributeId,
    toId: valueType,
    relationTypeId: SYSTEM_IDS.VALUE_TYPE,
  }).map(op => ({
    ...op,
    space: SPACE_ID,
  }));
});

// Temporary
const spaceType = Relation.make({
  fromId: SPACE_ID,
  toId: SYSTEM_IDS.SPACE_CONFIGURATION,
  relationTypeId: SYSTEM_IDS.TYPES,
})
  .map((o): Op => {
    return {
      ...o,
      space: SPACE_ID,
    };
  })
  .concat([
    {
      space: SPACE_ID,
      type: 'SET_TRIPLE',
      triple: {
        attribute: SYSTEM_IDS.NAME,
        entity: SPACE_ID,
        value: {
          type: 'TEXT',
          value: 'Root',
        },
      },
    },
  ]);

const typeOps: Op[] = Object.keys(schemaTypes).flatMap(typeId => {
  return Relation.make({
    fromId: typeId,
    toId: SYSTEM_IDS.SCHEMA_TYPE,
    relationTypeId: SYSTEM_IDS.TYPES,
  }).map(op => ({
    ...op,
    space: SPACE_ID,
  }));
});

const typeSchemaOps: Op[] = Object.entries(schemaTypes).flatMap(([typeId, attributeIds]) => {
  return attributeIds.flatMap(attributeId => {
    return Relation.make({
      fromId: typeId,
      toId: attributeId,
      relationTypeId: SYSTEM_IDS.ATTRIBUTES,
    }).map(op => ({
      ...op,
      space: SPACE_ID,
    }));
  });
});

const entitiesWithTypesOps: Op[] = Object.entries(types).flatMap(([entityId, typeIds]) => {
  return typeIds.flatMap(typeId => {
    return Relation.make({
      fromId: entityId,
      toId: typeId,
      relationTypeId: SYSTEM_IDS.TYPES,
    }).map(op => ({
      ...op,
      space: SPACE_ID,
    }));
  });
});

const editProposal: SinkEditProposal = {
  type: 'ADD_EDIT',
  proposalId: '-1',
  onchainProposalId: '-1',
  creator: ROOT_SPACE_CREATED_BY_ID,
  name: 'Root Space Bootstrap',
  endTime: ROOT_SPACE_CREATED_AT.toString(),
  startTime: ROOT_SPACE_CREATED_AT.toString(),
  contentUri: 'bootstrapped-so-no-uri',
  daoAddress: DAO_ADDRESS,
  ops: [
    ...nameOps,
    ...attributeOps,
    ...attributeValueTypeOps,
    ...typeOps,
    ...spaceType,
    ...typeSchemaOps,
    ...templateOps,
    ...entitiesWithTypesOps,
  ],
  pluginAddress: MAIN_VOTING_ADDRESS,
  space: SPACE_ID,
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
