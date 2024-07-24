import { Effect, Either } from 'effect';

import { mapRemovedEditors } from './map-removed-editors';
import type { EditorRemoved } from './parser';
import { SpaceEditors } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteRemovedEditorsError extends Error {
  _tag: 'CouldNotWriteRemovedEditorsError' = 'CouldNotWriteRemovedEditorsError';
}

export function handleEditorRemoved(editorsRemoved: EditorRemoved[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const schemaEditors = yield* _(mapRemovedEditors(editorsRemoved, block));

    slog({
      requestId: block.requestId,
      message: `Writing ${schemaEditors.length} removed editors to DB`,
    });

    const writtenRemovedEditors = yield* _(
      Effect.all(
        schemaEditors.map(m => {
          return Effect.tryPromise({
            try: () => SpaceEditors.remove(m),
            catch: error => {
              return new CouldNotWriteRemovedEditorsError(String(error));
            },
          });
        }),
        {
          mode: 'either',
        }
      )
    );

    let failedDeletions = 0;

    for (const removedEditor of writtenRemovedEditors) {
      if (Either.isLeft(removedEditor)) {
        const error = removedEditor.left;
        telemetry.captureException(error);

        slog({
          level: 'error',
          requestId: block.requestId,
          message: `Could not remove editor
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
      message: `${writtenRemovedEditors.length - failedDeletions} out of ${
        writtenRemovedEditors.length
      } editors removed successfully!`,
    });
  });
}
