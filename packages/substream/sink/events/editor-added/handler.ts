import { getChecksumAddress } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { writeAccounts } from '../write-accounts';
import { mapEditors } from './map-editors';
import type { EditorAdded } from './parser';
import { SpaceEditors } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';

export class CouldNotWriteAddedEditorsError extends Error {
  _tag: 'CouldNotWriteAddedEditorsError' = 'CouldNotWriteAddedEditorsError';
}

export function handleEditorsAdded(editorsAdded: EditorAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const schemaEditors = yield* _(mapEditors(editorsAdded, block));
    yield* _(Effect.logInfo('[EDITORS ADDED] Started'));

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    yield* _(
      writeAccounts(
        schemaEditors.map(m => {
          return {
            id: getChecksumAddress(m.account_id as string),
          };
        })
      )
    );

    yield* _(Effect.logDebug('[EDITORS ADDED] Writing editors'));

    yield* _(
      Effect.tryPromise({
        try: () => SpaceEditors.upsert(schemaEditors),
        catch: error => {
          return new CouldNotWriteAddedEditorsError(String(error));
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('[EDITORS ADDED] Ended'));
  });
}
