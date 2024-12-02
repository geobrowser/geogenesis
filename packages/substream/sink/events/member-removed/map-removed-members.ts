import { getChecksumAddress } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import type { MemberRemoved } from './parser';
import { Spaces } from '~/sink/db';
import { InvalidPluginAddressForDaoError, isInvalidPluginForDao } from '~/sink/errors';

export function mapRemovedMembers(membersRemoved: MemberRemoved[]) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('Mapping removed members'));
    const removedMembers: S.space_members.Whereable[] = [];

    for (const member of membersRemoved) {
      // @TODO(performance): We can query for this outside of the loop. Alternatively we
      // can use effect's structured concurrency to run every block of the loop concurrently.
      const maybeSpace = yield* _(Effect.promise(() => Spaces.findForDaoAddress(member.daoAddress)));

      if (!maybeSpace) {
        const message = `Could not find space for removed member ${member.memberAddress} with plugin address ${member.pluginAddress} and dao address ${member.daoAddress}`;

        yield* _(Effect.logError(message));
        yield* _(Effect.fail(new InvalidPluginAddressForDaoError(message)));
        continue;
      }

      if (isInvalidPluginForDao(member.pluginAddress, maybeSpace)) {
        const message = `Plugin address ${member.pluginAddress} does not match the supplied dao address ${member.daoAddress} when removing member ${member.memberAddress}`;

        yield* _(Effect.logError(message));
        yield* _(Effect.fail(new InvalidPluginAddressForDaoError(message)));
        continue;
      }

      if (maybeSpace) {
        const removedMember: S.space_members.Whereable = {
          account_id: getChecksumAddress(member.memberAddress),
          space_id: maybeSpace.id,
        };

        removedMembers.push(removedMember);
      }
    }

    return removedMembers;
  });
}
