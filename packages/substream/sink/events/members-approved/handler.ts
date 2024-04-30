import { Effect, Either } from 'effect';

import { mapMembers } from './map-members';
import type { MembersApproved } from './parser';
import { SpaceMembers } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteApprovedMembersError extends Error {
  _tag: 'CouldNotWriteApprovedMembersError' = 'CouldNotWriteApprovedMembersError';
}

export function handleMembersApproved(membersApproved: MembersApproved[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const schemaMembers = yield* _(mapMembers(membersApproved, block));

    slog({
      requestId: block.requestId,
      message: `Writing ${schemaMembers.length} approved members to DB`,
    });

    const writtenApprovedMembers = yield* _(
      Effect.tryPromise({
        try: () => SpaceMembers.upsert(schemaMembers),
        catch: error => {
          return new CouldNotWriteApprovedMembersError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenApprovedMembers)) {
      const error = writtenApprovedMembers.left;
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
