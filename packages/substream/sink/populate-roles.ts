import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { SpaceWithPluginAddressNotFoundError } from './errors';
import { slog } from './utils';
import { getChecksumAddress } from './utils/get-checksum-address';
import { pool } from './utils/pool';
import { type EditorsAdded, type RoleChange } from './zod';

class CouldNotWriteAccountsError extends Error {
  _tag: 'CouldNotWriteAccountsError' = 'CouldNotWriteAccountsError';
}

class CouldNotWriteEditorsV2Error extends Error {
  _tag: 'CouldNotWriteEditorsV2Error' = 'CouldNotWriteEditorsV2Error';
}

/**
 * The data model for DAO-based spaces works slightly differently than in legacy spaces.
 * This means there will be a period where we need to support both data models depending
 * on which space/contract we are working with. Eventually these data models will be merged
 * and usage of the legacy space contracts will be migrated to the DAO-based contracts, but
 * for now we are appending "V2" to permissions data models to denote it's used for the
 * DAO-based spaces.
 *
 * An editor has editing and voting permissions in a DAO-based space. Editors join a space
 * one of two ways:
 * 1. They submit a request to join the space as an editor which goes to a vote. The editors
 *    in the space vote on whether to accept the new editor.
 * 2. They are added as a set of initial editors when first creating the space. This allows
 *    space deployers to bootstrap a set of editors on space creation.
 */
export function getEditorsGrantedV2Effect({
  editorsAdded,
  timestamp,
  blockNumber,
}: {
  editorsAdded: EditorsAdded[];
  timestamp: number;
  blockNumber: number;
}) {
  return Effect.gen(function* (_) {
    const accounts = editorsAdded.flatMap(e => e.addresses.map(a => ({ id: getChecksumAddress(a) })));

    // This should be handled by our zod parsing validation so this shouldn't trigger
    if (editorsAdded.length === 0) {
      console.error('No editors added in editors granted event');
      return;
    }

    // Note that the plugin address for each entry in editorsAdded _should_ be the same
    // for a given editorsAdded event. TypeScript type narrowing doesn't really work when
    // we're using `noUncheckedIndexedAccess` even though we've asserted that editorsAdded is
    // not empty.
    const pluginAddresses = editorsAdded.map(e => e.pluginAddress);

    const maybeSpacesForPlugins = yield* _(
      Effect.all(
        pluginAddresses.map(p =>
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
          })
        ),
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
            acc.set(checksumPluginAddress, getChecksumAddress(s.id));
          }

          return acc;
        },
        // Mapping of the plugin address to the space id (address)
        new Map<string, string>()
      );

    /**
     * Here we ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    yield* _(
      Effect.tryPromise({
        try: () =>
          db
            .upsert('accounts', accounts, ['id'], {
              updateColumns: db.doNothing,
            })
            .run(pool),
        catch: error => new CouldNotWriteAccountsError(String(error)),
      })
    );

    const newEditors = editorsAdded.flatMap(({ addresses, pluginAddress }) =>
      addresses
        .map(a => {
          const editor: S.space_editors_v2.Insertable = {
            // Can safely assert that spacesForPlugins.get(pluginAddress) is not null here
            // since we set up the mapping based on the plugin address previously
            //
            // @NOTE: This might break if we start indexing at a block that occurs after the
            // space was created.
            space_id: spacesForPlugins.get(getChecksumAddress(pluginAddress))!,
            account_id: getChecksumAddress(a),
            created_at: timestamp,
            created_at_block: blockNumber,
          };

          return editor;
        })
        // Handle the edge case where we might start indexing at a block that occurs after
        // the space was created.
        .map(e => {
          if (e.space_id === undefined) {
            slog({
              level: 'error',
              message: `Could not find space for plugin address, ${pluginAddress}`,
              requestId: '0',
            });
          }

          return e;
        })
        .filter(e => e.space_id !== undefined)
    );

    yield* _(
      Effect.tryPromise({
        try: () =>
          db
            .upsert('space_editors_v2', newEditors, ['space_id', 'account_id'], { updateColumns: db.doNothing })
            .run(pool),
        catch: error => new CouldNotWriteEditorsV2Error(String(error)),
      })
    );
  });
}

// @TODO: Effectify the role granted and role revoked handlers
export async function handleRoleGranted({
  roleGranted,
  blockNumber,
  timestamp,
}: {
  roleGranted: RoleChange;
  blockNumber: number;
  timestamp: number;
}) {
  try {
    const role = roleGranted.role;
    const isAdminRole = role === 'ADMIN';
    const isMemberRole = role === 'MEMBER';
    const isModeratorRole = role === 'MODERATOR';

    /**
     * @HACK: For legacy spaces we don't generate the space entry in the sink until someone
     * actually adds content to the space. This is problematic as roles can be changed before
     * any content is actually added to the space.
     *
     * Here we ensure that we create any relations for the role change before we create the
     * role change itself.
     *
     * This gets fixed with the new DAO-based spaces as we create the space before we process
     * any other events. See the substream mapping for more information on the different space
     * contracts.
     */
    await Promise.all([
      db
        .upsert('spaces', [{ id: roleGranted.space, created_at_block: blockNumber, is_root_space: false }], ['id'], {
          updateColumns: db.doNothing,
        })
        .run(pool),
      db
        .upsert('accounts', [{ id: roleGranted.account }], ['id'], {
          updateColumns: db.doNothing,
        })
        .run(pool),
    ]);

    if (isAdminRole) {
      await db
        .upsert(
          'space_admins',
          {
            space_id: roleGranted.space,
            account_id: roleGranted.account,
            created_at: timestamp,
            created_at_block: blockNumber,
          },
          ['space_id', 'account_id'],
          { updateColumns: db.doNothing }
        )
        .run(pool);
    } else if (isMemberRole) {
      await db
        .upsert(
          'space_editors',
          {
            space_id: roleGranted.space,
            account_id: roleGranted.account,
            created_at: timestamp,
            created_at_block: blockNumber,
          },
          ['space_id', 'account_id'],
          { updateColumns: db.doNothing }
        )
        .run(pool);
    } else if (isModeratorRole) {
      await db
        .upsert(
          'space_editor_controllers',
          {
            space_id: roleGranted.space,
            account_id: roleGranted.account,
            created_at: timestamp,
            created_at_block: blockNumber,
          },
          ['space_id', 'account_id'],
          { updateColumns: db.doNothing }
        )
        .run(pool);
    }
  } catch (error) {
    console.error('Error handling role granted:', error);
  }
}

// @TODO: Effectify the role granted and role revoked handlers
export async function handleRoleRevoked({
  roleRevoked,
  blockNumber,
}: {
  roleRevoked: RoleChange;
  blockNumber: number;
}) {
  try {
    const role = roleRevoked.role;
    const isAdminRole = role === 'ADMIN';
    const isMemberRole = role === 'MEMBER';
    const isModeratorRole = role === 'MODERATOR';

    /**
     * @HACK: For legacy spaces we don't generate the space entry in the sink until someone
     * actually adds content to the space. This is problematic as roles can be changed before
     * any content is actually added to the space.
     *
     * Here we ensure that we create any relations for the role change before we create the
     * role change itself.
     *
     * This gets fixed with the new DAO-based spaces as we create the space before we process
     * any other events. See the substream mapping for more information on the different space
     * contracts.
     */
    await Promise.all([
      db
        .upsert('spaces', [{ id: roleRevoked.space, created_at_block: blockNumber, is_root_space: false }], ['id'], {
          updateColumns: db.doNothing,
        })
        .run(pool),
      db
        .upsert('accounts', [{ id: roleRevoked.account }], ['id'], {
          updateColumns: db.doNothing,
        })
        .run(pool),
    ]);

    if (isAdminRole) {
      await db
        .deletes('space_admins', {
          space_id: roleRevoked.space,
          account_id: roleRevoked.account,
        })
        .run(pool);
    } else if (isMemberRole) {
      await db
        .deletes('space_editors', {
          space_id: roleRevoked.space,
          account_id: roleRevoked.account,
        })
        .run(pool);
    } else if (isModeratorRole) {
      await db
        .deletes('space_editor_controllers', {
          space_id: roleRevoked.space,
          account_id: roleRevoked.account,
        })
        .run(pool);
    } else {
      console.error('Unknown revoked role:', role);
    }
  } catch (error) {
    console.error('Error handling role revoked:', error);
  }
}
