import { Effect, Either } from 'effect';

import { mapRemovedEditors } from './map-removed-editors';
import type { EditorRemoved } from './parser';
import { SpaceEditors } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';

export class CouldNotWriteRemovedEditorsError extends Error {
  _tag: 'CouldNotWriteRemovedEditorsError' = 'CouldNotWriteRemovedEditorsError';
}

export function handleEditorRemoved(editorsRemoved: EditorRemoved[]) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const schemaEditors = yield* _(mapRemovedEditors(editorsRemoved));

    yield* _(Effect.logInfo('Handling editor removed'));

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

        yield* _(
          Effect.logError(`Could not remove editor
        Cause: ${error.cause}
        Message: ${error.message}
      `)
        );

        failedDeletions++;

        continue;
      }
    }

    yield* _(
      Effect.logInfo(
        `${writtenRemovedEditors.length - failedDeletions} out of ${writtenRemovedEditors.length} editors removed`
      )
    );
  });
}
