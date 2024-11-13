import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../../utils/get-checksum-address';
import type { MemberAdded } from './parser';
import { Spaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';

export function mapMembers(membersApproved: MemberAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('Mapping editors'));

    const members: S.space_members.Insertable[] = [];

    for (const member of membersApproved) {
      const [maybeSpaceIdForVotingPlugin, maybeSpaceIdForPersonalPlugin] = yield* _(
        Effect.all([
          Effect.tryPromise({
            try: () => Spaces.findForVotingPlugin(member.mainVotingPluginAddress),
            catch: () => new Error(),
          }),
          Effect.tryPromise({
            try: () => Spaces.findForPersonalPlugin(member.mainVotingPluginAddress),
            catch: () => new Error(),
          }),
        ])
      );

      if (!maybeSpaceIdForVotingPlugin && !maybeSpaceIdForPersonalPlugin) {
        yield* _(
          Effect.logError(
            `Matching space for approved member not found for plugin address ${member.mainVotingPluginAddress}`
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
