import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import type { EditorAdded } from './parser';
import { Spaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { slog } from '~/sink/utils/slog';

export function mapMembers(editorAdded: EditorAdded[], block: BlockEvent) {
  return Effect.gen(function* (unwrap) {
    const members: S.space_editors.Insertable[] = [];

    for (const member of editorAdded) {
      const maybeSpaceIdForPlugin = yield* unwrap(
        Effect.promise(() => Spaces.findForVotingPlugin(member.mainVotingPluginAddress))
      );

      if (!maybeSpaceIdForPlugin) {
        slog({
          level: 'error',
          message: `Matching space for approved editor not found for plugin address ${member.mainVotingPluginAddress}`,
          requestId: block.requestId,
        });

        continue;
      }

      const newMember: S.space_editors.Insertable = {
        account_id: getChecksumAddress(member.editorAddress),
        space_id: getChecksumAddress(maybeSpaceIdForPlugin),
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
      };

      members.push(newMember);
    }

    return members;
  });
}
