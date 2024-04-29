import { Effect } from 'effect';

import { groupProposalsByType, mapContentProposalsToSchema } from '../proposals-created/map-proposals';
import type { ContentProposal, ProposalProcessed } from '../proposals-created/parser';
import { Actions, Proposals, ProposedVersions } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { getProposalFromProcessedProposal } from '~/sink/utils/ipfs';
import { slog } from '~/sink/utils/slog';

export function handleInitialProposalCreated(proposalsProcessed: ProposalProcessed[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    /**
     * Write the proposal data for a "proposed" proposal
     */
    slog({
      requestId: block.cursor,
      message: `Processing ${proposalsProcessed.length} initial space proposals`,
    });

    slog({
      requestId: block.cursor,
      message: `Gathering IPFS content for ${proposalsProcessed.length} initial space proposals`,
    });

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

    const { contentProposals } = groupProposalsByType(proposalsFromIpfs);
    const schemaContentProposals = mapContentProposalsToSchema(contentProposals, {
      blockNumber: block.blockNumber,
      cursor: block.cursor,
      timestamp: block.timestamp,
    });

    slog({
      requestId: block.cursor,
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
              requestId: block.cursor,
              message: `Failed to write proposals to DB ${error}`,
              level: 'error',
            });

            return error;
          },
        })
      )
    );

    return contentProposals;
  });
}
