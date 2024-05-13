import { Effect, Either } from 'effect';

import { mapMembers } from './map-members';
import type { MemberAdded } from './parser';
import { SpaceMembers } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
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
