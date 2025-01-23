import { Effect, Either } from 'effect';

import { mapRemovedMembers } from './map-removed-members';
import type { MemberRemoved } from './parser';
import { SpaceMembers } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';

export class CouldNotWriteRemovedMembersError extends Error {
  _tag: 'CouldNotWriteRemovedMembersError' = 'CouldNotWriteRemovedMembersError';
}

export function handleMemberRemoved(membersRemoved: MemberRemoved[]) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const schemaMembers = yield* _(mapRemovedMembers(membersRemoved));

    yield* _(Effect.logInfo('[MEMBERS REMOVED] Started'));

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
          concurrency: 20,
          mode: 'either',
        }
      )
    );

    let failedDeletions = 0;

    for (const removedMember of writtenRemovedMembers) {
      if (Either.isLeft(removedMember)) {
        const error = removedMember.left;
        telemetry.captureException(error);

        yield* _(
          Effect.logError(`Could not remove member
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
        `[MEMBERS REMOVED] ${writtenRemovedMembers.length - failedDeletions} out of ${
          writtenRemovedMembers.length
        } members removed`
      )
    );
  });
}
