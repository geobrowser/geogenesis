import { Effect, Either } from 'effect';

import { mapSubspacesToRemove } from './map-subspaces-to-remove';
import type { SubspaceRemoved } from './parser';
import { Subspaces } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotRemoveSubspacesError extends Error {
  _tag: 'CouldNotRemoveSubspacesError' = 'CouldNotRemoveSubspacesError';
}

export function handleSubspacesRemoved(subspacesRemoved: SubspaceRemoved[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    const subspacesToRemove = yield* _(mapSubspacesToRemove(subspacesRemoved));

    const writtenSubspaces = yield* _(
      Effect.all(
        subspacesToRemove.map(
          s =>
            Effect.tryPromise({
              try: async () => {
                return await Subspaces.remove(s);
              },
              catch: error => {
                return new CouldNotRemoveSubspacesError(String(error));
              },
            }),
          retryEffect
        ),
        {
          mode: 'either',
        }
      )
    );

    for (const writtenSubspace of writtenSubspaces) {
      if (Either.isLeft(writtenSubspace)) {
        const error = writtenSubspace.left;
        telemetry.captureException(error);

        slog({
          level: 'error',
          requestId: block.requestId,
          message: `Could not remove subspaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
        });

        continue;
      }
    }
  });
}
