import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import type { ContentProposal, ProposalProcessed } from '../proposals-created/parser';
import { populateApprovedContentProposal } from '~/sink/entries/populate-approved-content-proposal';
import type { BlockEvent } from '~/sink/types';
import { getProposalFromProcessedProposal } from '~/sink/utils/ipfs';
import { pool } from '~/sink/utils/pool';
import { slog } from '~/sink/utils/slog';

export function handleProposalsProcessed(proposalsProcessed: ProposalProcessed[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    /**
     * 1. Fetch IPFS content
     * 2. Find the proposal based on the proposalId
     * 3. Update the proposal status to ACCEPTED
     * 4. Write the proposal content as Versions, Triples, Entities, etc.
     */
    const maybeProposalsFromIpfs = yield* _(
      Effect.all(
        proposalsProcessed.map(proposal =>
          getProposalFromProcessedProposal(
            {
              ipfsUri: proposal.contentUri,
              pluginAddress: proposal.pluginAddress,
            },
            block.timestamp
          )
        ),
        {
          concurrency: 20,
        }
      )
    );

    const proposalsFromIpfs = maybeProposalsFromIpfs.filter(
      (maybeProposal): maybeProposal is ContentProposal => maybeProposal !== null
    );

    const maybeProposals = yield* _(
      Effect.all(
        proposalsFromIpfs.map(p => {
          return Effect.tryPromise({
            try: () => db.selectExactlyOne('proposals', { id: p.proposalId }).run(pool),
            catch: error => {
              slog({
                requestId: block.cursor,
                message: `Failed to read proposal from DB ${error}`,
                level: 'error',
              });
            },
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
            catch: () => {
              slog({
                requestId: block.cursor,
                message: `Failed to update proposal in DB ${proposal.id}`,
                level: 'error',
              });
            },
          });
        })
      )
    );

    yield* _(
      populateApprovedContentProposal(
        proposals,
        proposalsFromIpfs.flatMap(p => p.actions),
        block.timestamp,
        block.blockNumber
      )
    );

    slog({
      requestId: block.cursor,
      message: `Processing ${proposalsProcessed.length} processed proposals`,
    });

    slog({
      requestId: block.cursor,
      message: `Writing ${proposals.length} processed proposals to DB`,
    });
  });
}
