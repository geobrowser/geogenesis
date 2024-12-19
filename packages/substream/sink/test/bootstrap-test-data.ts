import { DataBlock, Position, PositionRange, Relation, SYSTEM_IDS, TextBlock, encodeBase58 } from '@geogenesis/sdk';
import { Effect } from 'effect';

import {
  DAO_ADDRESS,
  INITIAL_BLOCK,
  MAIN_VOTING_ADDRESS,
  MEMBER_ACCESS_ADDRESS,
  ROOT_SPACE_CREATED_AT,
  ROOT_SPACE_CREATED_BY_ID,
  SPACE_ADDRESS,
  SPACE_ID,
} from '../bootstrap/constants';
import { handleEditsPublished } from '../events/edits-published/handler';
import { handleInitialGovernanceSpaceEditorsAdded } from '../events/initial-editors-added/handler';
import { createInitialContentForSpaces } from '../events/initial-proposal-created/handler';
import { handleProposalsExecuted } from '../events/proposals-executed/handler';
import { handleGovernancePluginCreated, handleSpacesCreated } from '../events/spaces-created/handler';
import type { Op, SinkEditProposal } from '../types';

const TEST_ENTITY_ID = encodeBase58('62ef04337a56401db29ab40aa1d5c672');

const testEntityNameOp: Op = {
  type: 'SET_TRIPLE',
  space: SYSTEM_IDS.ROOT_SPACE_ID,
  triple: {
    attribute: SYSTEM_IDS.NAME,
    entity: TEST_ENTITY_ID,
    value: {
      type: 'TEXT',
      value: 'Bootstrapped Test Entity',
    },
  },
};

const testEntityTypes: Op[] = [SYSTEM_IDS.PERSON_TYPE].flatMap(typeId => {
  const newRelation = Relation.make({
    fromId: TEST_ENTITY_ID,
    toId: typeId,
    relationTypeId: SYSTEM_IDS.TYPES,
  });

  return {
    ...newRelation,
    space: SPACE_ID,
  };
});

const testEntityBlocks = [
  ...TextBlock.make({ fromId: TEST_ENTITY_ID, text: 'Test entity text block' }),
  ...DataBlock.make({
    fromId: TEST_ENTITY_ID,
    sourceType: 'GEO',
    position: Position.createBetween(PositionRange.FIRST),
  }),
].map(o => {
  return {
    ...o,
    space: SPACE_ID,
  };
}) as Op[];

const PROPOSAL: SinkEditProposal = {
  type: 'ADD_EDIT',
  daoAddress: DAO_ADDRESS,
  proposalId: '-2',
  onchainProposalId: '-2',
  creator: ROOT_SPACE_CREATED_BY_ID,
  name: 'Test Bootstrap',
  endTime: ROOT_SPACE_CREATED_AT.toString(),
  startTime: ROOT_SPACE_CREATED_AT.toString(),
  contentUri: 'bootstrapped-so-no-uri',
  ops: [testEntityNameOp, ...testEntityTypes, ...testEntityBlocks],
  pluginAddress: MAIN_VOTING_ADDRESS,
  space: SPACE_ID,
};

export const bootstrapTest = Effect.gen(function* (_) {
  yield* _(Effect.logDebug('Writing test bootstrap data'));

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
          daoAddress: DAO_ADDRESS,
        },
      ],
      INITIAL_BLOCK
    )
  );

  yield* _(createInitialContentForSpaces({ proposals: [PROPOSAL], block: INITIAL_BLOCK, editType: 'DEFAULT' }));
  yield* _(handleEditsPublished([PROPOSAL], [SPACE_ID], INITIAL_BLOCK));
  yield* _(handleProposalsExecuted([PROPOSAL]));
});
