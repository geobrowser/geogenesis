import { Effect } from 'effect';

import { groupProposalsByType, mapContentProposalsToSchema } from '../proposals-created/map-proposals';
import type { ContentProposal } from '../proposals-created/parser';
import { Actions, Proposals, ProposedVersions } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { slog } from '~/sink/utils/slog';

export function handleInitialProposalsCreated(proposalsFromIpfs: ContentProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Processing ${proposalsFromIpfs.length} initial space proposals`,
    });

    const { contentProposals } = groupProposalsByType(proposalsFromIpfs);

    // @TODO: We need a special function to map a proposal endtime to be now
    const schemaContentProposals = mapContentProposalsToSchema(contentProposals, {
      blockNumber: block.blockNumber,
      cursor: block.cursor,
      timestamp: block.timestamp,
      requestId: block.requestId,
    });

    slog({
      requestId: block.requestId,
      message: `Writing ${contentProposals.length} initial content proposals to DB`,
    });

    // @TODO: Put this in a transaction since all these writes are related
    yield* _(
      Effect.either(
        Effect.tryPromise({
          try: async () => {
            // @TODO: Batch since there might be postgres byte limits. See upsertChunked
            await Promise.all([
              // @TODO: Should we only attempt to write to the db for the correct content type?
              // What if we get multiple proposals in the same block with different content types?
              // Content proposals
              Proposals.upsert(schemaContentProposals.proposals),
              ProposedVersions.upsert(schemaContentProposals.proposedVersions),
              Actions.upsert(schemaContentProposals.actions),
            ]);
          },
          catch: error => {
            slog({
              requestId: block.requestId,
              message: `Failed to write proposals to DB ${error}`,
              level: 'error',
            });

            return error;
          },
        })
      )
    );
  });
}
