import { Effect, Either } from 'effect';

import { mapRemovedMembers } from './map-removed-members';
import type { MemberRemoved } from './parser';
import { SpaceMembers } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { slog } from '~/sink/utils/slog';

export class CouldNotWriteRemovedMembersError extends Error {
  _tag: 'CouldNotWriteRemovedMembersError' = 'CouldNotWriteRemovedMembersError';
}

export function handleMemberRemoved(membersRemoved: MemberRemoved[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const schemaMembers = yield* _(mapRemovedMembers(membersRemoved, block));

    slog({
      requestId: block.requestId,
      message: `Writing ${schemaMembers.length} removed members to DB`,
    });

    const writtenRemovedMembers = yield* _(
      Effect.all(
        schemaMembers.map(m => {
          return Effect.tryPromise({
            try: () => SpaceMembers.remove(m),
            catch: error => {
              return new CouldNotWriteRemovedMembersError(String(error));
            },
          });
        }),
        {
          mode: 'either',
        }
      )
    );

    let failedDeletions = 0;

    for (const removedMember of writtenRemovedMembers) {
      if (Either.isLeft(removedMember)) {
        const error = removedMember.left;
        telemetry.captureException(error);

        slog({
          level: 'error',
          requestId: block.requestId,
          message: `Could not remove member
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
      message: `${writtenRemovedMembers.length - failedDeletions} out of ${
        writtenRemovedMembers.length
      } members removed successfully!`,
    });
  });
}
