import * as db from 'zapatos/db'
import type * as s from 'zapatos/schema'
import { START_BLOCK } from './constants/constants'
import { populateWithFullEntries } from './populate-entries'
import { handleRoleGranted, handleRoleRevoked } from './populate-roles'
import { pool } from './utils/pool'
import { type FullEntry, type RoleChange, ZodRoleChange } from './zod'

export async function populateFromCache() {
  try {
    const [cachedEntries, cachedRoles] = await Promise.all([
      readCacheEntries(),
      readCacheRoles(),
    ])

    console.log('Cached entries:', cachedEntries.length)
    console.log('Cached roles:', cachedRoles.length)

    let blockNumber = START_BLOCK

    for (let cachedEntry of cachedEntries) {
      console.log(
        `Processing cachedEntry at block: ${JSON.stringify({
          entry: cachedEntry.block_number,
        })}`
      )

      await populateWithFullEntries({
        fullEntries: cachedEntry.data as any, // TODO: Zod typecheck this JSON
        blockNumber: cachedEntry.block_number,
        timestamp: cachedEntry.timestamp,
        cursor: cachedEntry.cursor,
      })

      blockNumber = cachedEntry.block_number
    }

    for (let cachedRole of cachedRoles) {
      console.log(
        `Processing cachedRole at block, ${JSON.stringify({
          blockNumber: cachedRole.created_at_block,
          cachedRole,
        })}`
      )

      const roleChange = ZodRoleChange.safeParse({
        role: cachedRole.role,
        space: cachedRole.space,
        account: cachedRole.account,
        sender: cachedRole.sender,
      })

      if (!roleChange.success) {
        console.error('Failed to parse cached role change')
        console.error(roleChange)
        console.error(roleChange.error)
        continue
      }

      switch (cachedRole.type) {
        case 'GRANTED':
          await handleRoleGranted({
            roleGranted: roleChange.data,
            blockNumber: cachedRole.created_at_block,
            timestamp: cachedRole.created_at,
            cursor: cachedRole.cursor,
          })
          break
        case 'REVOKED':
          await handleRoleRevoked({
            roleRevoked: roleChange.data,
            blockNumber: cachedRole.created_at_block,
            cursor: cachedRole.cursor,
            timestamp: cachedRole.created_at,
          })
      }

      if (cachedRole.created_at_block > blockNumber) {
        blockNumber = cachedRole.created_at_block
      }
    }

    return blockNumber
  } catch (error) {
    console.error('Error in populateFromCache:', error)
    return START_BLOCK
  }
}

export async function upsertCachedEntries({
  fullEntries,
  blockNumber,
  cursor,
  timestamp,
}: {
  fullEntries: FullEntry[]
  blockNumber: number
  cursor: string
  timestamp: number
}) {
  try {
    const cachedEntry: s.cache.entries.Insertable = {
      block_number: blockNumber,
      cursor,
      data: JSON.stringify(fullEntries),
      timestamp,
    }

    await db
      .upsert('cache.entries', cachedEntry, ['cursor'], {
        updateColumns: db.doNothing,
      })
      .run(pool)
  } catch (error) {
    console.error('Error upserting cached entry:', error)
  }
}

export async function upsertCachedRoles({
  roleChange,
  blockNumber,
  cursor,
  type,
  timestamp,
}: {
  roleChange: RoleChange
  timestamp: number
  blockNumber: number
  cursor: string
  type: 'GRANTED' | 'REVOKED'
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
        [
          'role',
          'account',
          'sender',
          'space',
          'type',
          'created_at_block',
          'cursor',
        ],
        {
          updateColumns: db.doNothing,
        }
      )
      .run(pool)
  } catch (error) {
    console.error('Error upserting cached role:', error)
  }
}

export const readCacheEntries = async () => {
  const cachedEntries = await db
    .select('cache.entries', db.all, {
      order: { by: 'block_number', direction: 'ASC' },
    })
    .run(pool)

  return cachedEntries
}

export async function readCacheRoles() {
  const cachedEntries = await db
    .select('cache.roles', db.all, {
      order: { by: 'created_at_block', direction: 'ASC' },
    })
    .run(pool)

  return cachedEntries
}
