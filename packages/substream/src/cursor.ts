import * as db from 'zapatos/db';

import { pool } from './utils/pool';

export async function readCursor() {
  const cursor = await db.selectOne('cursors', { id: 0 }).run(pool);
  console.log('Using cursor with start block:', cursor?.block_number);
  return cursor?.cursor;
}

export async function writeCursor(cursor: string, block_number: number) {
  try {
    await db.upsert('cursors', { id: 0, cursor, block_number }, 'id').run(pool);
  } catch (error) {
    console.error('Error writing cursor:', error);
  }
}
