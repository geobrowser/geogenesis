import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { writeAccounts } from '../write-accounts';
import type { InitialEditorsAdded } from './parser';
import { SpaceEditors, SpaceMembers, Spaces } from '~/sink/db';
import { SpaceWithPluginAddressNotFoundError } from '~/sink/errors';
import type { BlockEvent } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { pool } from '~/sink/utils/pool';
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

    const accounts = editorsAdded.flatMap(e => e.addresses.map(a => ({ id: getChecksumAddress(a) })));

    // Note that the plugin address for each entry in editorsAdded _should_ be the same
    // for a given editorsAdded event. TypeScript type narrowing doesn't really work when
    // we're using `noUncheckedIndexedAccess` even though we've asserted that editorsAdded is
    // not empty.
    const pluginAddresses = editorsAdded.map(e => e.pluginAddress);

    yield* _(Effect.logDebug('Collecting spaces for public plugins'));

    const maybeSpacesForPlugins = yield* _(
      Effect.forEach(
        pluginAddresses,
        p =>
          Effect.tryPromise({
            try: () =>
              db
                .selectOne(
                  'spaces',
                  { main_voting_plugin_address: getChecksumAddress(p) },
                  { columns: ['id', 'main_voting_plugin_address'] }
                )
                .run(pool),
            catch: error => new SpaceWithPluginAddressNotFoundError(String(error)),
          }),
        {
          concurrency: 20,
        }
      )
    );

    const spacesForPlugins = maybeSpacesForPlugins
      .flatMap(s => (s ? [s] : []))
      // Removing any duplicates and transforming to a map for faster access speed later
      .reduce(
        (acc, s) => {
          // Can safely assert that s.main_voting_plugin_address is not null here
          // since we query using that column previously
          //
          // @TODO: There should be a way to return only not-null values using zapatos
          // maybe using `having`
          const checksumPluginAddress = getChecksumAddress(s.main_voting_plugin_address!);

          if (!acc.has(checksumPluginAddress)) {
            acc.set(checksumPluginAddress, s.id);
          }

          return acc;
        },
        // Mapping of the plugin address to the space id (address)
        new Map<string, string>()
      );

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    yield* _(writeAccounts(accounts));

    const newEditors = editorsAdded.flatMap(({ addresses, pluginAddress }) =>
      addresses
        .map(a => {
          const editor: S.space_editors.Insertable = {
            // Can safely assert that spacesForPlugins.get(pluginAddress) is not null here
            // since we set up the mapping based on the plugin address previously
            space_id: spacesForPlugins.get(getChecksumAddress(pluginAddress))!,
            account_id: getChecksumAddress(a),
            created_at: block.timestamp,
            created_at_block: block.blockNumber,
          };

          return editor;
        })
        .filter(e => e.space_id !== undefined)
    );

    const newMembers = editorsAdded.flatMap(({ addresses, pluginAddress }) =>
      addresses
        .map(a => {
          const member: S.space_members.Insertable = {
            // Can safely assert that spacesForPlugins.get(pluginAddress) is not null here
            // since we set up the mapping based on the plugin address previously
            space_id: spacesForPlugins.get(getChecksumAddress(pluginAddress))!,
            account_id: getChecksumAddress(a),
            created_at: block.timestamp,
            created_at_block: block.blockNumber,
          };

          return member;
        })
        .filter(e => e.space_id !== undefined)
    );

    // @TODO: Transaction
    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([SpaceEditors.upsert(newEditors), SpaceMembers.upsert(newMembers)]);
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

    const accounts = editorsAdded.flatMap(e => e.addresses.map(a => ({ id: getChecksumAddress(a) })));

    // Note that the plugin address for each entry in editorsAdded _should_ be the same
    // for a given editorsAdded event. TypeScript type narrowing doesn't really work when
    // we're using `noUncheckedIndexedAccess` even though we've asserted that editorsAdded is
    // not empty.
    const pluginAddresses = editorsAdded.map(e => e.pluginAddress);

    yield* _(Effect.logDebug('Collecting spaces for personal plugins'));

    const maybeSpacesForPlugins = yield* _(
      Effect.forEach(
        pluginAddresses,
        p =>
          Effect.tryPromise({
            try: () => Spaces.findForPersonalPlugin(p),
            catch: error => new SpaceWithPluginAddressNotFoundError(String(error)),
          }),
        {
          concurrency: 20,
        }
      )
    );

    const spacesForPlugins = maybeSpacesForPlugins
      .flatMap(s => (s ? [s] : []))
      // Removing any duplicates and transforming to a map for faster access speed later
      .reduce(
        (acc, s) => {
          // Can safely assert that s.main_voting_plugin_address is not null here
          // since we query using that column previously
          //
          // @TODO: There should be a way to return only not-null values using zapatos
          // maybe using `having`
          const checksumPluginAddress = getChecksumAddress(s.personal_space_admin_plugin_address!);

          if (!acc.has(checksumPluginAddress)) {
            acc.set(checksumPluginAddress, s.id);
          }

          return acc;
        },
        // Mapping of the plugin address to the space id (address)
        new Map<string, string>()
      );

    /**
     * Ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    yield* _(writeAccounts(accounts));

    const newEditors = editorsAdded.flatMap(({ addresses, pluginAddress }) =>
      addresses
        .map(a => {
          const editor: S.space_editors.Insertable = {
            // Can safely assert that spacesForPlugins.get(pluginAddress) is not null here
            // since we set up the mapping based on the plugin address previously
            //
            // @NOTE: This might break if we start indexing at a block that occurs after the
            // space was created.
            space_id: spacesForPlugins.get(getChecksumAddress(pluginAddress))!,
            account_id: getChecksumAddress(a),
            created_at: block.timestamp,
            created_at_block: block.blockNumber,
          };

          return editor;
        })
        .filter(e => e.space_id !== undefined)
    );

    const newMembers = editorsAdded.flatMap(({ addresses, pluginAddress }) =>
      addresses
        .map(a => {
          const member: S.space_members.Insertable = {
            // Can safely assert that spacesForPlugins.get(pluginAddress) is not null here
            // since we set up the mapping based on the plugin address previously
            //
            // @NOTE: This might break if we start indexing at a block that occurs after the
            // space was created.
            space_id: spacesForPlugins.get(getChecksumAddress(pluginAddress))!,
            account_id: getChecksumAddress(a),
            created_at: block.timestamp,
            created_at_block: block.blockNumber,
          };

          return member;
        })
        .filter(e => e.space_id !== undefined)
    );

    yield* _(Effect.logDebug('Writing initial editors and members'));

    // @TODO: Transaction
    yield* _(
      Effect.tryPromise({
        try: async () => {
          await Promise.all([SpaceEditors.upsert(newEditors), SpaceMembers.upsert(newMembers)]);
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
