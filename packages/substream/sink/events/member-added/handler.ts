import { Effect, Either } from 'effect';

import { mapMembers } from './map-members';
import type { MemberAdded } from './parser';
import { Accounts, SpaceMembers } from '~/sink/db';
import { CouldNotWriteAccountsError } from '~/sink/errors';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteAddedMembersError extends Error {
  _tag: 'CouldNotWriteAddedMembersError' = 'CouldNotWriteAddedMembersError';
}

export function handleMemberAdded(membersAdded: MemberAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const schemaMembers = yield* _(mapMembers(membersAdded, block));

    slog({
      requestId: block.requestId,
      message: `Writing ${schemaMembers.length} added members to DB`,
    });

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    const writtenAccounts = yield* _(
      Effect.tryPromise({
        try: async () => {
          const accounts = schemaMembers.map(m => {
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
        message: `Could not write accounts when writing added members
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    const writtenAddedMembers = yield* _(
      Effect.tryPromise({
        try: () => SpaceMembers.upsert(schemaMembers),
        catch: error => {
          return new CouldNotWriteAddedMembersError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenAddedMembers)) {
      const error = writtenAddedMembers.left;
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write approved members
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: `Approved members written successfully!`,
    });
  });
}
