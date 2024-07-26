import * as db from 'zapatos/db';

import { pool } from './utils/pool';

export async function readCursor() {
  const cursor = await db.selectOne('cursors', { id: 0 }).run(pool);
  return cursor?.cursor;
}

export async function writeCursor(cursor: string, block_number: number, block_hash: string, block_timestamp: number) {
  if (!block_hash.startsWith('0x')) {
    block_hash = `0x${block_hash}`;
  }

  try {
    await db.upsert('cursors', { id: 0, cursor, block_number, block_hash, block_timestamp }, 'id').run(pool);
  } catch (error) {
    console.error('Error writing cursor:', error);
  }
}
