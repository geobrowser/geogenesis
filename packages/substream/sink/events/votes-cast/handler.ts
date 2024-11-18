import { Effect } from 'effect';

import { mapVotes } from './map-votes';
import type { VoteCast } from './parser';
import { ProposalVotes } from '~/sink/db/proposal-votes';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';

class CouldNotWriteVotesError extends Error {
  _tag: 'CouldNotWriteVotesError' = 'CouldNotWriteVotesError';
}

export function handleVotesCast(votesCast: VoteCast[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('Handling votes cast'));

    const schemaVotes = yield* _(mapVotes(votesCast, block));

    yield* _(Effect.logDebug('Writing votes'));

    yield* _(
      Effect.tryPromise({
        try: async () => {
          await ProposalVotes.insert(schemaVotes);
        },
        catch: error => {
          return new CouldNotWriteVotesError(String(error));
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('Votes cast'));
  });
}
