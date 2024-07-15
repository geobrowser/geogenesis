import { Effect, Either } from 'effect';

import { mapEditors } from './map-editors';
import type { EditorAdded } from './parser';
import { Accounts, SpaceEditors } from '~/sink/db';
import { CouldNotWriteAccountsError } from '~/sink/errors';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteAddedEditorsError extends Error {
  _tag: 'CouldNotWriteAddedEditorsError' = 'CouldNotWriteAddedEditorsError';
}

export function handleEditorsAdded(editorsAdded: EditorAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const schemaEditors = yield* _(mapEditors(editorsAdded, block));

    slog({
      requestId: block.requestId,
      message: `Writing ${schemaEditors.length} added editors to DB`,
    });

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    const writtenAccounts = yield* _(
      Effect.tryPromise({
        try: async () => {
          const accounts = schemaEditors.map(m => {
            return {
              id: getChecksumAddress(m.account_id as string),
            };
          });
          await Accounts.upsert(accounts);
        },
        catch: error => new CouldNotWriteAccountsError(String(error)),
      }),
      Effect.either
    );

    if (Either.isLeft(writtenAccounts)) {
      const error = writtenAccounts.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write accounts when writing added editors
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    const writtenAddedEditors = yield* _(
      Effect.tryPromise({
        try: () => SpaceEditors.upsert(schemaEditors),
        catch: error => {
          return new CouldNotWriteAddedEditorsError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenAddedEditors)) {
      const error = writtenAddedEditors.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write approved editors
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: `Approved editors written successfully!`,
    });
  });
}
