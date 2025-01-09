import { NETWORK_IDS, getChecksumAddress } from '@geogenesis/sdk';
import { Effect } from 'effect';
import type * as S from 'zapatos/schema';

import { writeAccounts } from '../write-accounts';
import type { InitialEditorsAdded } from './parser';
import { SpaceEditors, SpaceMembers } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { deriveSpaceId } from '~/sink/utils/id';
import { retryEffect } from '~/sink/utils/retry-effect';

class CouldNotWriteEditorsError extends Error {
  _tag: 'CouldNotWriteEditorsError' = 'CouldNotWriteEditorsError';
}

export function handleInitialGovernanceSpaceEditorsAdded(editorsAdded: InitialEditorsAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('Handling initial editors for new public spaces'));
    yield* _(
      Effect.logDebug(
        `Accounts ${editorsAdded
          .map(e => e.addresses)
          .join(', ')} being added as initial editors to space with plugin ${editorsAdded.map(e => e.pluginAddress)}`
      )
    );

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    const accounts = editorsAdded.flatMap(e => e.addresses.map(a => ({ id: getChecksumAddress(a) })));

    yield* _(writeAccounts(accounts));

    const newEditors = editorsAdded.flatMap(({ addresses, daoAddress }) =>
      addresses.map(a => {
        const editor: S.space_editors.Insertable = {
          space_id: deriveSpaceId({ address: daoAddress, network: NETWORK_IDS.GEO }),
          account_id: getChecksumAddress(a),
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        };

        return editor;
      })
    );

    // @TODO: Transaction
    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([SpaceEditors.upsert(newEditors), SpaceMembers.upsert(newEditors)]);
        },
        catch: error => {
          return new CouldNotWriteEditorsError(`Could not write initial editors and members ${String(error)}`);
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('Initial editors and members created'));
  });
}

export function handleInitialPersonalSpaceEditorsAdded(editorsAdded: InitialEditorsAdded[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('Handling initial editors for new personal spaces'));
    yield* _(
      Effect.logDebug(
        `Accounts ${editorsAdded
          .map(e => e.addresses)
          .join(', ')} being added as initial editors to space with plugin ${editorsAdded.map(e => e.pluginAddress)}`
      )
    );

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    const accounts = editorsAdded.flatMap(e => e.addresses.map(a => ({ id: getChecksumAddress(a) })));
    yield* _(writeAccounts(accounts));

    const newEditors = editorsAdded.flatMap(({ addresses, daoAddress }) =>
      addresses
        .map(a => {
          const editor: S.space_editors.Insertable = {
            // Can safely assert that spacesForPlugins.get(pluginAddress) is not null here
            // since we set up the mapping based on the plugin address previously
            //
            // @NOTE: This might break if we start indexing at a block that occurs after the
            // space was created.
            space_id: deriveSpaceId({ address: daoAddress, network: NETWORK_IDS.GEO }),
            account_id: getChecksumAddress(a),
            created_at: block.timestamp,
            created_at_block: block.blockNumber,
          };

          return editor;
        })
        .filter(e => e.space_id !== undefined)
    );

    yield* _(Effect.logDebug('Writing initial editors and members'));

    // @TODO: Transaction
    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([SpaceEditors.upsert(newEditors), SpaceMembers.upsert(newEditors)]);
        },
        catch: error => {
          return new CouldNotWriteEditorsError(`Could not write initial editors and members ${String(error)}`);
        },
      }),
      retryEffect
    );

    yield* _(Effect.logInfo('Initial editors and members created'));
  });
}
