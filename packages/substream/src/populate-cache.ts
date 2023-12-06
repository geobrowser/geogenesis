import * as db from 'zapatos/db';
import type * as s from 'zapatos/schema';

import { START_BLOCK } from './constants/constants';
import { populateWithFullEntries } from './populate-entries';
import { handleRoleGranted, handleRoleRevoked } from './populate-roles';
import { pool } from './utils/pool';
import { type FullEntry, type RoleChange, ZodRoleChange } from './zod';

export async function populateFromCache() {
  try {
    let isDone = false;
    let id = 1;
    let tries = 0;
    let blockNumber = START_BLOCK;

    while (!isDone) {
      console.log('processing id ', id);
      const maybeCachedEntry = await db.selectOne('cache.entries', { id }).run(pool);

      if (maybeCachedEntry) {
        tries = 0;
        console.log(
          `Processing cachedEntry at block: ${JSON.stringify({
            entry: maybeCachedEntry.block_number.toString(),
          })}`
        );

        await populateWithFullEntries({
          fullEntries: maybeCachedEntry.data as any, // TODO: Zod typecheck this JSON
          blockNumber: maybeCachedEntry.block_number,
          timestamp: maybeCachedEntry.timestamp,
          cursor: maybeCachedEntry.cursor,
        });

        blockNumber = maybeCachedEntry.block_number;
      }

      const maybeCachedRole = await db.selectOne('cache.roles', { id }).run(pool);

      // Increment the id to check the next cached row. If neither maybeCachedEntry nor maybeCachedRole
      // exists at the next id we know we've reached the end of the cache
      id = id + 1;

      if (!maybeCachedEntry && !maybeCachedRole && tries > 10) {
        console.log('Ending cache processing. Found final cache.');
        isDone = true;
        break;
      }

      if (!maybeCachedEntry && !maybeCachedRole) {
        console.log('incrementing id to try again');
        tries = tries + 1;
        continue;
      }

      if (maybeCachedRole) {
        tries = 0;

        console.log(
          `Processing cachedRole at block, ${JSON.stringify({
            blockNumber: maybeCachedRole.created_at_block,
            maybeCachedRole,
          })}`
        );

        const roleChange = ZodRoleChange.safeParse({
          role: maybeCachedRole.role,
          space: maybeCachedRole.space,
          account: maybeCachedRole.account,
          sender: maybeCachedRole.sender,
        });

        if (!roleChange.success) {
          console.error('Failed to parse cached role change');
          console.error(roleChange);
          console.error(roleChange.error);
          continue;
        }

        switch (maybeCachedRole.type) {
          case 'GRANTED':
            await handleRoleGranted({
              roleGranted: roleChange.data,
              blockNumber: maybeCachedRole.created_at_block,
              timestamp: maybeCachedRole.created_at,
              cursor: maybeCachedRole.cursor,
            });
            break;
          case 'REVOKED':
            await handleRoleRevoked({
              roleRevoked: roleChange.data,
              blockNumber: maybeCachedRole.created_at_block,
              cursor: maybeCachedRole.cursor,
              timestamp: maybeCachedRole.created_at,
            });
        }

        if (maybeCachedRole.created_at_block > blockNumber) {
          blockNumber = maybeCachedRole.created_at_block;
        }
      }
    }

    return blockNumber;
  } catch (error) {
    console.error('Error in populateFromCache:', error);
    return START_BLOCK;
  }
}

export async function upsertCachedEntries({
  fullEntries,
  blockNumber,
  cursor,
  timestamp,
}: {
  fullEntries: FullEntry[];
  blockNumber: number;
  cursor: string;
  timestamp: number;
}) {
  try {
    const cachedEntry: s.cache.entries.Insertable = {
      block_number: blockNumber,
      cursor,
      data: JSON.stringify(fullEntries),
      timestamp,
    };

    await db
      .upsert('cache.entries', cachedEntry, ['cursor'], {
        updateColumns: db.doNothing,
      })
      .run(pool);
  } catch (error) {
    console.error('Error upserting cached entry:', error);
  }
}

export async function upsertCachedRoles({
  roleChange,
  blockNumber,
  cursor,
  type,
  timestamp,
}: {
  roleChange: RoleChange;
  timestamp: number;
  blockNumber: number;
  cursor: string;
  type: 'GRANTED' | 'REVOKED';
}) {
  try {
    await db
      .upsert(
        'cache.roles',
        {
          created_at: timestamp,
          created_at_block: blockNumber,
          role: roleChange.role,
          space: roleChange.space,
          account: roleChange.account,
          cursor,
          sender: roleChange.sender,
          type,
        },
        ['role', 'account', 'sender', 'space', 'type', 'created_at_block', 'cursor'],
        {
          updateColumns: db.doNothing,
        }
      )
      .run(pool);
  } catch (error) {
    console.error('Error upserting cached role:', error);
  }
}

export async function streamCacheEntries() {
  return await db
    .select('cache.entries', db.all, {
      order: { by: 'block_number', direction: 'ASC' },
    })
    .run(pool);
}

export async function readCacheRoles() {
  const cachedEntries = await db
    .select('cache.roles', db.all, {
      order: { by: 'created_at_block', direction: 'ASC' },
    })
    .run(pool);

  return cachedEntries;
}
