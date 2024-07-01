import { Effect, Either } from 'effect';

import { mapSubspaces } from './map-subspaces';
import type { SubspaceAdded } from './parser';
import { Subspaces } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteSubspacesError extends Error {
  _tag: 'CouldNotWriteSubspacesError' = 'CouldNotWriteSubspacesError';
}

export function handleSubspacesAdded(subspacesAdded: SubspaceAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    const subspaces = yield* _(
      mapSubspaces({
        subspacesAdded: subspacesAdded,
        timestamp: block.timestamp,
        blockNumber: block.blockNumber,
      })
    );

    const writtenSubspaces = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Subspaces.upsert(subspaces);
        },
        catch: error => {
          return new CouldNotWriteSubspacesError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenSubspaces)) {
      const error = writtenSubspaces.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write subspaces
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: `Subspaces written successfully!`,
    });
  });
}
