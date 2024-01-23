import * as db from 'zapatos/db';

import { pool } from './utils/pool';
import { type RoleChange } from './zod';

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
