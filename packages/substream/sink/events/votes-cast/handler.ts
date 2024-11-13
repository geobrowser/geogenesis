import { Effect, Either } from 'effect';

import { mapVotes } from './map-votes';
import type { VoteCast } from './parser';
import { ProposalVotes } from '~/sink/db/proposal-votes';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';

class CouldNotWriteVotesError extends Error {
  _tag: 'CouldNotWriteVotesError' = 'CouldNotWriteVotesError';
}

export function handleVotesCast(votesCast: VoteCast[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    yield* _(Effect.logInfo('Handling votes cast'));

    const schemaVotes = yield* _(mapVotes(votesCast, block));

    yield* _(Effect.logDebug('Writing votes'));

    const writtenVotes = yield* _(
      Effect.tryPromise({
        try: async () => {
          await ProposalVotes.insert(schemaVotes);
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
      telemetry.captureException(error);
      yield* _(
        Effect.logError(`Could not write votes
        Cause: ${error.cause}
        Message: ${error.message}
      `)
      );

      return;
    }

    yield* _(Effect.logInfo('Votes cast'));
  });
}
