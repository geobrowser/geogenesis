import { getChecksumAddress } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import type { MemberAdded } from './parser';
import { Spaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';

class CouldNotMapMembersError extends Error {
  _tag: 'CouldNotMapMembersError' = 'CouldNotMapMembersError';
}

export function mapMembers(membersApproved: MemberAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('[MAP MEMBERS] Started'));

    const members: S.space_members.Insertable[] = [];

    for (const member of membersApproved) {
      const [maybeSpaceIdForVotingPlugin, maybeSpaceIdForPersonalPlugin] = yield* _(
        Effect.all(
          [
            Effect.tryPromise({
              try: () => Spaces.findForVotingPlugin(member.mainVotingPluginAddress),
              catch: e => new CouldNotMapMembersError(String(e)),
            }),
            Effect.tryPromise({
              try: () => Spaces.findForPersonalPlugin(member.mainVotingPluginAddress),
              catch: e => new CouldNotMapMembersError(String(e)),
            }),
          ],
          { concurrency: 2 }
        )
      );

      if (!maybeSpaceIdForVotingPlugin && !maybeSpaceIdForPersonalPlugin) {
        yield* _(
          Effect.logError(
            `[MAP MEMBERS] Matching space for approved member not found for plugin address ${member.mainVotingPluginAddress}`
          )
        );

        continue;
      }

      if (maybeSpaceIdForVotingPlugin) {
        const newMember: S.space_members.Insertable = {
          account_id: getChecksumAddress(member.memberAddress),
          space_id: maybeSpaceIdForVotingPlugin,
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        };

        members.push(newMember);
      }

      if (maybeSpaceIdForPersonalPlugin) {
        const newMember: S.space_members.Insertable = {
          account_id: getChecksumAddress(member.memberAddress),
          space_id: maybeSpaceIdForPersonalPlugin.id,
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        };

        members.push(newMember);
      }
    }

    return members;
  });
}
