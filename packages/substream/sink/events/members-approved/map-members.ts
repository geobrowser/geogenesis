import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../../utils/get-checksum-address';
import { pool } from '../../utils/pool';
import { slog } from '../../utils/slog';
import type { MembersApproved } from './parser';
import { Spaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';

export function mapMembers(membersApproved: MembersApproved[], block: BlockEvent) {
  return Effect.gen(function* (unwrap) {
    const members: S.space_members.Insertable[] = [];

    for (const member of membersApproved) {
      const maybeSpaceIdForPlugin = yield* unwrap(
        Effect.promise(() => Spaces.findForMembershipPlugin(member.membershipPluginAddress))
      );

      if (!maybeSpaceIdForPlugin) {
        slog({
          level: 'error',
          message: `Matching space for approved member not found for plugin address ${member.membershipPluginAddress}`,
          requestId: '-1',
        });

        continue;
      }

      const maybeProposal = yield* unwrap(
        Effect.tryPromise({
          try: () =>
            db
              .selectExactlyOne(
                'proposals',
                { onchain_proposal_id: member.onchainProposalId, space_id: maybeSpaceIdForPlugin, type: 'ADD_MEMBER' },
                { columns: ['id'] }
              )
              .run(pool),
          catch: error => new Error(`Failed to fetch proposal. ${(error as Error).message}`),
        })
      );

      const maybeProposedMemberAddress = yield* unwrap(
        Effect.tryPromise({
          try: () =>
            db
              .selectExactlyOne(
                'proposed_members',
                { proposal_id: maybeProposal.id, space_id: maybeSpaceIdForPlugin },
                { columns: ['id', 'account_id'] }
              )
              .run(pool),
          catch: error => new Error(`Failed to fetch proposal. ${(error as Error).message}`),
        })
      );

      const newMember: S.space_members.Insertable = {
        account_id: getChecksumAddress(maybeProposedMemberAddress.account_id),
        space_id: getChecksumAddress(maybeSpaceIdForPlugin),
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
      };

      members.push(newMember);
    }

    return members;
  });
}
