import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../../utils/get-checksum-address';
import { slog } from '../../utils/slog';
import type { MemberRemoved } from './parser';
import { Spaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';

export function mapRemovedMembers(membersRemoved: MemberRemoved[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const removedMembers: S.space_members.Whereable[] = [];

    for (const member of membersRemoved) {
      // @TODO(performance): We can query for this outside of the loop. Alternatively we
      // can use effect's structured concurrency to run every block of the loop concurrently.
      const maybeSpace = yield* _(Effect.promise(() => Spaces.findForDaoAddress(member.daoAddress)));

      if (!maybeSpace) {
        const message = `Could not find space for removed member ${member.memberAddress} with plugin address ${member.pluginAddress} and dao address ${member.daoAddress}`;

        slog({
          level: 'error',
          message,
          requestId: block.requestId,
        });

        yield* _(Effect.fail(new Error(message)));
        continue;
      }

      const hasMatchingMainVotingPlugin =
        maybeSpace.main_voting_plugin_address === getChecksumAddress(member.pluginAddress);
      const hasMatchingPersonalSpaceAdminPlugin =
        maybeSpace.personal_space_admin_plugin_address === getChecksumAddress(member.pluginAddress);

      if (!hasMatchingMainVotingPlugin && !hasMatchingPersonalSpaceAdminPlugin) {
        const message = `Plugin address ${member.pluginAddress} does not match the supplied dao address ${member.daoAddress} when removing member ${member.memberAddress}`;

        slog({
          level: 'error',
          message,
          requestId: block.requestId,
        });

        yield* _(Effect.fail(new Error(message)));
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
