import { getChecksumAddress } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { writeAccounts } from '../write-accounts';
import { mapMembers } from './map-members';
import type { MemberAdded } from './parser';
import { SpaceMembers } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { retryEffect } from '~/sink/utils/retry-effect';

export class CouldNotWriteAddedMembersError extends Error {
  _tag: 'CouldNotWriteAddedMembersError' = 'CouldNotWriteAddedMembersError';
}

export function handleMemberAdded(membersAdded: MemberAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[MEMBERS ADDED] Started'));
    const schemaMembers = yield* _(mapMembers(membersAdded, block));

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    yield* _(
      writeAccounts(
        schemaMembers.map(m => {
          return {
            id: getChecksumAddress(m.account_id as string),
          };
        })
      )
    );

    yield* _(Effect.logDebug('[MEMBERS ADDED] Writing members'));

    yield* _(
      Effect.tryPromise({
        try: () => SpaceMembers.upsert(schemaMembers),
        catch: error => {
          return new CouldNotWriteAddedMembersError(String(error));
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('[MEMBERS ADDED] Ended'));
  });
}
