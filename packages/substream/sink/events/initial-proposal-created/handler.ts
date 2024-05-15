import { Effect, Either } from 'effect';

import { mapIpfsProposalToSchemaProposalByType } from '../proposals-created/map-proposals';
import type { ContentProposal } from '../proposals-created/parser';
import { Actions, Proposals, ProposedVersions } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

class CouldNotWriteInitialSpaceProposalsError extends Error {
  _tag: 'CouldNotWriteInitialSpaceProposalsError' = 'CouldNotWriteInitialSpaceProposalsError';
}

export function handleInitialProposalsCreated(proposalsFromIpfs: ContentProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    slog({
      requestId: block.requestId,
      message: `Processing ${proposalsFromIpfs.length} initial space proposals`,
    });

    // @TODO: We need a special function to map a proposal endtime to be now
    const { schemaContentProposals } = mapIpfsProposalToSchemaProposalByType(proposalsFromIpfs, block);

    slog({
      requestId: block.requestId,
      message: `Writing ${schemaContentProposals.proposals.length} initial content proposals to DB`,
    });

    // @TODO: Put this in a transaction since all these writes are related
    const writtenProposals = yield* _(
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
          return new CouldNotWriteInitialSpaceProposalsError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenProposals)) {
      const error = writtenProposals.left;
      telemetry.captureException(error);

      slog({
        requestId: block.requestId,
        message: 'Could not write initial proposals for new spaces',
        level: 'error',
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: 'Initial proposals for new spaces written successfully!',
    });
  });
}
