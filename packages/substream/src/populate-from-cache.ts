import * as db from 'zapatos/db';
import type * as Schema from 'zapatos/schema';

import { START_BLOCK } from './constants/constants';
import { populateWithFullEntries } from './populate-entries';
import { handleRoleGranted, handleRoleRevoked } from './populate-roles';
import type { Roles } from './types';
import { pool } from './utils/pool';
import { type FullEntry, type RoleChange, ZodRoleChange } from './zod';

export async function populateFromCache() {
  try {
    let id = 1;
    let tries = 0;
    let blockNumber = START_BLOCK;

    while (tries < 100) {
      console.log(`Processing cache id ${id}`);

      // Cached entry are data entries resulting from proposals. Cached roles are
      // processed later.
      const maybeCachedEntry: Schema.cache.entries.Selectable | undefined = await db
        .selectOne('cache.entries', { id })
        .run(pool);

      if (maybeCachedEntry) {
        tries = 0;

        console.log(`Processing cached entry at block: ${maybeCachedEntry.block_number}`);

        // All entries in the cache are the valid full entries. We validate all data during
        // streaming and only write to the cache the final parsed and validated data. So we
        // don't need to re-validate here.
        await populateWithFullEntries({
          fullEntries: maybeCachedEntry.data as any, // TODO: Zod typecheck this JSON
          blockNumber: maybeCachedEntry.block_number,
          timestamp: maybeCachedEntry.timestamp,
          cursor: maybeCachedEntry.cursor,
        });

        if (maybeCachedEntry.block_number > blockNumber) {
          blockNumber = maybeCachedEntry.block_number;
        }
      }

      const maybeCachedRole: Schema.cache.roles.Selectable | undefined = await db
        .selectOne('cache.roles', { id })
        .run(pool);

      // Increment the id to check the next cached row in the next tick. If an id for either
      // maybeCachedEntry or maybeCachedRole exists in the look-ahead window we will continue
      // processing.
      id = id + 1;

      if (!maybeCachedEntry && !maybeCachedRole) {
        console.log('Checking ahead in cache for next entry');
        // Tries is a way to "look-ahead" in the cache to see if there are any more cache entries.
        //
        // ids in the cache are incremental, but there may be missing ids (@baiirun why?). We use
        // a look-ahead to check future ids for potential cache entries.
        tries = tries + 1;
        continue;
      }

      if (maybeCachedRole) {
        tries = 0;

        console.log(`Processing cached role at block ${maybeCachedRole.created_at_block}`);

        switch (maybeCachedRole.type) {
          case 'GRANTED':
            await handleRoleGranted({
              roleGranted: {
                account: maybeCachedRole.account,
                id: maybeCachedRole.id.toString(),
                role: maybeCachedRole.role as Roles,
                sender: maybeCachedRole.sender,
                space: maybeCachedRole.space,
              },
              blockNumber: maybeCachedRole.created_at_block,
              timestamp: maybeCachedRole.created_at,
            });
            break;
          case 'REVOKED':
            await handleRoleRevoked({
              roleRevoked: {
                account: maybeCachedRole.account,
                id: maybeCachedRole.id.toString(),
                role: maybeCachedRole.role as Roles,
                sender: maybeCachedRole.sender,
                space: maybeCachedRole.space,
              },
            });
        }

        if (maybeCachedRole.created_at_block > blockNumber) {
          blockNumber = maybeCachedRole.created_at_block;
        }
      }
    }

    console.log('Cache processing complete');
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
    const cachedEntry: Schema.cache.entries.Insertable = {
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
