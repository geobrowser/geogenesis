import { Effect } from 'effect';

import { mapRemovedEditors } from './map-removed-editors';
import type { EditorRemoved } from './parser';
import { SpaceEditors } from '~/sink/db';

export class CouldNotWriteRemovedEditorsError extends Error {
  _tag: 'CouldNotWriteRemovedEditorsError' = 'CouldNotWriteRemovedEditorsError';
}

export function handleEditorRemoved(editorsRemoved: EditorRemoved[]) {
  return Effect.gen(function* (_) {
    const schemaEditors = yield* _(mapRemovedEditors(editorsRemoved));

    yield* _(Effect.logInfo('Handling editor removed'));

    yield* _(
      Effect.forEach(
        schemaEditors,
        m => {
          return Effect.tryPromise({
            try: () => SpaceEditors.remove(m),
            catch: error => {
              return new CouldNotWriteRemovedEditorsError(String(error));
            },
          });
        },
        {
          concurrency: 20,
        }
      )
    );

    yield* _(Effect.logInfo(`Editors removed`));
  });
}
