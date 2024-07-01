import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import type { EditProposal } from '../proposals-created/parser';
import { populateApprovedContentProposal } from '~/sink/entries/populate-approved-content-proposal';
import type { BlockEvent } from '~/sink/types';
import { pool } from '~/sink/utils/pool';
import { slog } from '~/sink/utils/slog';

export function handleProposalsProcessed(ipfsProposals: EditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Mapping ${ipfsProposals.length} processed proposals`,
    });

    /**
     * 1. Fetch IPFS content
     * 2. Find the proposal based on the proposalId
     * 3. Update the proposal status to ACCEPTED
     * 4. Write the proposal content as Versions, Triples, Entities, etc.
     */
    const maybeProposals = yield* _(
      Effect.all(
        ipfsProposals.map(p => {
          return Effect.tryPromise({
            // @TODO: Exactly one
            try: () => db.selectOne('proposals', { id: p.proposalId }).run(pool),
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

    const dbProposals = maybeProposals.filter((maybeProposal): maybeProposal is S.proposals.Selectable =>
      Boolean(maybeProposal)
    );

    yield* _(
      Effect.all(
        dbProposals.map(proposal => {
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
        }),
        {
          concurrency: 75,
        }
      )
    );

    // @TODO(performance):
    // We store the proposal data and ops in the DB already, so we can read the
    // content of the ipfs proposals directly from the db using some kind of
    // ORM/Query builder that lets us fetch the ops relationships as part of
    // the query.
    yield* _(populateApprovedContentProposal(ipfsProposals, block));

    slog({
      requestId: block.requestId,
      message: 'Processed proposals written successfully!',
    });
  });
}
