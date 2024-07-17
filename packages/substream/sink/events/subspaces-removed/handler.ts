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

    slog({
      message: `Removing subspaces`,
      requestId: block.requestId,
    });

    const subspacesToRemove = yield* _(mapSubspacesToRemove(subspacesRemoved));

    const removedSubspaces = yield* _(
      Effect.all(
        subspacesToRemove.map(
          s =>
            Effect.try({
              try: () => {
                return Subspaces.remove(s);
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

    let failedDeletions = 0;

    for (const removedSubspace of removedSubspaces) {
      if (Either.isLeft(removedSubspace)) {
        const error = removedSubspace.left;
        telemetry.captureException(error);

        slog({
          level: 'error',
          requestId: block.requestId,
          message: `Could not remove subspaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
        });

        failedDeletions++;

        continue;
      }
    }

    slog({
      requestId: block.requestId,
      message: `${removedSubspaces.length - failedDeletions} out of ${
        removedSubspaces.length
      } subspaces removed successfully!`,
    });
  });
}
