import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { getChecksumAddress } from '../../utils/get-checksum-address';
import type { EditorRemoved } from './parser';
import { Spaces } from '~/sink/db';
import { InvalidPluginAddressForDaoError, isInvalidPluginForDao } from '~/sink/errors';

export function mapRemovedEditors(editorsRemoved: EditorRemoved[]) {
  return Effect.gen(function* (_) {
    const removedEditors: S.space_editors.Whereable[] = [];

    yield* _(Effect.logDebug('Mapping removed editors'));

    for (const editor of editorsRemoved) {
      // @TODO(performance): We can query for this outside of the loop. Alternatively we
      // can use effect's structured concurrency to run every block of the loop concurrently.
      const maybeSpace = yield* _(
        Effect.tryPromise({
          try: () => Spaces.findForDaoAddress(editor.daoAddress),
          catch: () =>
            new InvalidPluginAddressForDaoError(`Could not find find space with dao address of ${editor.daoAddress}`),
        })
      );

      if (!maybeSpace) {
        const message = `Could not find space for removed editor ${editor.editorAddress} with plugin address ${editor.pluginAddress} and dao address ${editor.daoAddress}`;
        yield* _(Effect.logError(message));
        yield* _(Effect.fail(new InvalidPluginAddressForDaoError(message)));
        continue;
      }

      if (isInvalidPluginForDao(editor.pluginAddress, maybeSpace)) {
        const message = `Plugin address ${editor.pluginAddress} does not match the supplied dao address ${editor.daoAddress} when removing editor ${editor.editorAddress}`;

        yield* _(Effect.logError(message));
        yield* _(Effect.fail(new InvalidPluginAddressForDaoError(message)));
        continue;
      }

      if (maybeSpace) {
        const removedMember: S.space_editors.Whereable = {
          account_id: getChecksumAddress(editor.editorAddress),
          space_id: maybeSpace.id,
        };

        removedEditors.push(removedMember);
      }
    }

    return removedEditors;
  });
}
