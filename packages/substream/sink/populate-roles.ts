import * as db from 'zapatos/db';

import { getChecksumAddress } from './utils/get-checksum-address';
import { pool } from './utils/pool';
import { type EditorsAdded, type RoleChange } from './zod';

export async function handleEditorsGrantedV2({
  editorsAdded,
  timestamp,
  blockNumber,
}: {
  editorsAdded: EditorsAdded[];
  timestamp: number;
  blockNumber: number;
}) {
  try {
    const accounts = editorsAdded.flatMap(e => e.addresses.map(a => ({ id: getChecksumAddress(a) })));

    if (editorsAdded.length === 0) {
      // This should be handled by our zod parsing validation
      console.error('No editors added in editors granted event');
      return;
    }

    // Note that these _should_ all be the same for a given editorsAdded event
    const pluginAddress = editorsAdded[0]?.pluginAddress;

    if (!pluginAddress) {
      // This should be handled by our zod parsing validation
      console.error('No plugin address in editors granted event');
      return;
    }

    const spaceForPlugin = await db
      .selectOne('spaces', { main_voting_plugin_address: getChecksumAddress(pluginAddress) }, { columns: ['id'] })
      .run(pool);

    if (!spaceForPlugin) {
      // @TODO: Effectify and return specialized error
      throw new Error(`No space found for plugin address ${pluginAddress}`);
    }

    /**
     * Here we ensure that we create any relations for the role change before we create the
     * role change itself.
     */
    await db
      .upsert('accounts', accounts, ['id'], {
        updateColumns: db.doNothing,
      })
      .run(pool);

    // @TODO: Get a map of plugin address to space id
    const newEditors = editorsAdded.flatMap(({ addresses, pluginAddress }) =>
      addresses.map(a => ({
        space_id: getChecksumAddress(spaceForPlugin.id),
        account_id: getChecksumAddress(a),
        created_at: timestamp,
        created_at_block: blockNumber,
      }))
    );

    await db
      .upsert('space_editors_v2', newEditors, ['space_id', 'account_id'], { updateColumns: db.doNothing })
      .run(pool);
  } catch (error) {
    console.error('Error handling editors granted:', error);
  }
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
