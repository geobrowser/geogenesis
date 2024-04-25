import { Effect, Either } from 'effect';

import { mapVotes } from './map-votes';
import type { VoteCast } from './parser';
import { ProposalVotes } from '~/sink/db/proposal-votes';
import type { BlockEvent } from '~/sink/types';
import { slog } from '~/sink/utils';
import { retryEffect } from '~/sink/utils/retry-effect';

class CouldNotWriteVotesError extends Error {
  _tag: 'CouldNotWriteVotesError' = 'CouldNotWriteVotesError';
}

export function handleVotesCast(votesCast: VoteCast[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.cursor,
      message: `Writing ${votesCast.length} votes`,
    });

    const schemaVotes = yield* _(mapVotes(votesCast, block));

    const writtenVotes = yield* _(
      Effect.tryPromise({
        try: async () => {
          await ProposalVotes.upsert(schemaVotes);
        },
        catch: error => {
          return new CouldNotWriteVotesError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenVotes)) {
      const error = writtenVotes.left;

      slog({
        level: 'error',
        requestId: block.cursor,
        message: `Could not write votes
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.cursor,
      message: `Votes written successfully!`,
    });
  });
}
