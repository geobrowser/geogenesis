import { Effect } from 'effect';

import { mapSubspaces } from './map-subspaces';
import type { SubspaceAdded } from './parser';
import { Subspaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';

export class CouldNotWriteSubspacesError extends Error {
  _tag: 'CouldNotWriteSubspacesError' = 'CouldNotWriteSubspacesError';
}

export function handleSubspacesAdded(subspacesAdded: SubspaceAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[SUBSPACES ADDED] Started'));

    const subspaces = yield* _(
      mapSubspaces({
        subspacesAdded: subspacesAdded,
        timestamp: block.timestamp,
        blockNumber: block.blockNumber,
      })
    );

    yield* _(Effect.logDebug('[SUBSPACES ADDED] Writing subspaces'));

    const writtenSubspaces = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Subspaces.upsert(subspaces);
        },
        catch: error => {
          return new CouldNotWriteSubspacesError(String(error));
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('[SUBSPACES ADDED] Ended'));
    return writtenSubspaces.map(s => s.subspace_id);
  });
}
