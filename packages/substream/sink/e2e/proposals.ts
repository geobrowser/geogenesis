import { Effect } from 'effect';
import fs from 'fs';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { Ops, Proposals, ProposedVersions } from '../db';
import { populateApprovedContentProposal } from '../entries/populate-approved-content-proposal';
import { mapIpfsProposalToSchemaProposalByType } from '../events/proposals-created/map-proposals';
import { type EditProposal, type Op } from '../events/proposals-created/parser';
import { Decoder } from '../proto';
import type { BlockEvent } from '../types';
import { retryEffect } from '../utils/retry-effect';
import { pool } from '~/sink/utils/pool';

const mockBlock: BlockEvent = {
  blockNumber: 0,
  cursor: '',
  requestId: '-1',
  timestamp: 0,
};

const mockProposal = {
  metadataUri: '',
  startTime: '',
  endTime: '',
  onchainProposalId: '-1',
  pluginAddress: '',
  creator: '0x1234',
  space: '',
};

class CouldNotWriteInitialSpaceProposalsError extends Error {
  _tag: 'CouldNotWriteInitialSpaceProposalsError' = 'CouldNotWriteInitialSpaceProposalsError';
}

function e2e() {
  return Effect.gen(function* (_) {
    const edit = yield* _(Decoder.decodeEdit(fs.readFileSync('data-2-with-new-schema.pb')));

    if (!edit) return;

    const editProposal: EditProposal = {
      type: 'EDIT',
      name: edit.name ?? null,
      proposalId: edit.proposalId,
      ops: edit.ops as Op[],

      // These would be derived from the onchain proposal and substream data
      metadataUri: mockProposal.metadataUri,
      startTime: mockProposal.startTime,
      endTime: mockProposal.endTime,
      onchainProposalId: mockProposal.onchainProposalId,
      pluginAddress: mockProposal.pluginAddress,
      creator: mockProposal.creator,
      space: mockProposal.space,
    };

    const { schemaEditProposals } = mapIpfsProposalToSchemaProposalByType([editProposal], mockBlock);

    console.log('pvs', schemaEditProposals.proposedVersions);

    const writtenProposals = yield* _(
      Effect.tryPromise({
        try: async () => {
          // @TODO: Batch since there might be postgres byte limits. See upsertChunked
          await Promise.all([
            // @TODO: Should we only attempt to write to the db for the correct content type?
            // What if we get multiple proposals in the same block with different content types?
            // Content proposals
            Proposals.upsert(schemaEditProposals.proposals),
            ProposedVersions.upsert(schemaEditProposals.proposedVersions),
            Ops.upsert(schemaEditProposals.ops),
          ]);
        },
        catch: error => {
          return new CouldNotWriteInitialSpaceProposalsError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    // --------------------------

    const maybeProposals = yield* _(
      Effect.all(
        [editProposal].map(p => {
          return Effect.tryPromise({
            try: () => db.selectExactlyOne('proposals', { id: p.proposalId }).run(pool),
            catch: () => {},
          });
        })
      )
    );

    const proposals = maybeProposals.filter(
      (maybeProposal): maybeProposal is S.proposals.Selectable => maybeProposal !== null
    );

    yield* _(
      Effect.all(
        proposals.map(proposal => {
          return Effect.tryPromise({
            try: () => db.update('proposals', { status: 'accepted' }, { id: proposal.id }).run(pool),
            catch: () => {},
          });
        })
      )
    );

    yield* _(
      populateApprovedContentProposal(
        proposals,
        [editProposal].flatMap(p => p.ops),
        mockBlock
      )
    );
  });
}

Effect.runPromise(e2e());
