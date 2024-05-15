import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import type { EditProposal } from '../proposals-created/parser';
import { populateApprovedContentProposal } from '~/sink/entries/populate-approved-content-proposal';
import type { BlockEvent } from '~/sink/types';
import { pool } from '~/sink/utils/pool';
import { slog } from '~/sink/utils/slog';

export function handleProposalsProcessed(proposalsFromIpfs: EditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Processing ${proposalsFromIpfs.length} processed proposals`,
    });

    /**
     * 1. Fetch IPFS content
     * 2. Find the proposal based on the proposalId
     * 3. Update the proposal status to ACCEPTED
     * 4. Write the proposal content as Versions, Triples, Entities, etc.
     */
    const maybeProposals = yield* _(
      Effect.all(
        proposalsFromIpfs.map(p => {
          return Effect.tryPromise({
            try: () => db.selectExactlyOne('proposals', { id: p.proposalId }).run(pool),
            catch: error => {
              slog({
                requestId: block.requestId,
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
                requestId: block.requestId,
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
        proposalsFromIpfs.flatMap(p => p.ops),
        block
      )
    );

    slog({
      requestId: block.requestId,
      message: `Processing ${proposalsFromIpfs.length} processed proposals`,
    });

    slog({
      requestId: block.requestId,
      message: `Writing ${proposals.length} processed proposals to DB`,
    });
  });
}
