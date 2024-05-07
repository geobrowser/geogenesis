import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../../utils/get-checksum-address';
import { slog } from '../../utils/slog';
import type { MembersAdded } from './parser';
import { Spaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';

export function mapMembers(membersApproved: MembersAdded[], block: BlockEvent) {
  return Effect.gen(function* (unwrap) {
    const members: S.space_members.Insertable[] = [];

    for (const member of membersApproved) {
      const maybeSpaceIdForPlugin = yield* unwrap(
        Effect.promise(() => Spaces.findForVotingPlugin(member.mainVotingPluginAddress))
      );

      if (!maybeSpaceIdForPlugin) {
        slog({
          level: 'error',
          message: `Matching space for approved member not found for plugin address ${member.mainVotingPluginAddress}`,
          requestId: block.requestId,
        });

        continue;
      }

      const newMember: S.space_members.Insertable = {
        account_id: getChecksumAddress(member.memberAddress),
        space_id: getChecksumAddress(maybeSpaceIdForPlugin),
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
      };

      members.push(newMember);
    }

    return members;
  });
}
