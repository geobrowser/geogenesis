import { pool } from './db';

export async function getCursor() {
  const { rows } = await pool.query(`select block_number from public.cursors`);
  const cursor = rows[0] as { block_number: number } | undefined;
  return cursor ?? null;
}
