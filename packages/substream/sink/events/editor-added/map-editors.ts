import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import type { EditorAdded } from './parser';
import { Spaces } from '~/sink/db';
import type { GeoBlock } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { slog } from '~/sink/utils/slog';

export function mapEditors(editorAdded: EditorAdded[], block: GeoBlock) {
  return Effect.gen(function* (unwrap) {
    const editors: S.space_editors.Insertable[] = [];

    for (const editor of editorAdded) {
      // @TODO: effect.all
      const maybeSpaceIdForVotingPlugin = yield* unwrap(
        Effect.promise(() => Spaces.findForVotingPlugin(editor.mainVotingPluginAddress))
      );

      const maybeSpaceIdForPersonalPlugin = yield* unwrap(
        Effect.promise(() => Spaces.findForPersonalPlugin(editor.mainVotingPluginAddress))
      );

      if (!maybeSpaceIdForVotingPlugin && !maybeSpaceIdForPersonalPlugin) {
        slog({
          level: 'error',
          message: `Matching space for approved editor not found for plugin address ${editor.mainVotingPluginAddress}`,
          requestId: block.requestId,
        });

        continue;
      }

      if (maybeSpaceIdForVotingPlugin) {
        const newMember: S.space_editors.Insertable = {
          account_id: getChecksumAddress(editor.editorAddress),
          space_id: getChecksumAddress(maybeSpaceIdForVotingPlugin),
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        };

        editors.push(newMember);
      }

      if (maybeSpaceIdForPersonalPlugin) {
        const newMember: S.space_editors.Insertable = {
          account_id: getChecksumAddress(editor.editorAddress),
          space_id: maybeSpaceIdForPersonalPlugin.id,
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        };

        editors.push(newMember);
      }
    }

    return editors;
  });
}
