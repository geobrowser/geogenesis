import { pool } from './db';

export async function getCursor() {
  const { rows } = await pool.query(`select * from public.cursors`);
  const cursor = rows[0] as { cursor: string, block_number: number, block_hash: string, block_timestamp: number } | undefined;
  return cursor ?? null;
}
