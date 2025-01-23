import { Effect } from 'effect';

import { mapSubspacesToRemove } from './map-subspaces-to-remove';
import type { SubspaceRemoved } from './parser';
import { Subspaces } from '~/sink/db';
import { retryEffect } from '~/sink/utils/retry-effect';

export class CouldNotRemoveSubspacesError extends Error {
  _tag: 'CouldNotRemoveSubspacesError' = 'CouldNotRemoveSubspacesError';
}

export function handleSubspacesRemoved(subspacesRemoved: SubspaceRemoved[]) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[SUBSPACES REMOVED] Started'));

    const subspacesToRemove = yield* _(mapSubspacesToRemove(subspacesRemoved));

    yield* _(Effect.logDebug('[SUBSPACES REMOVED] Writing subspaces'));

    yield* _(
      Effect.forEach(
        subspacesToRemove,
        s =>
          Effect.tryPromise({
            try: () => {
              return Subspaces.remove(s);
            },
            catch: error => {
              return new CouldNotRemoveSubspacesError(String(error));
            },
          }),
        {
          concurrency: 20,
        }
      ),
      retryEffect
    );

    yield* _(Effect.logInfo(`[SUBSPACES REMOVED] Ended`));
  });
}
