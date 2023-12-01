import fs from 'fs';

import { pool } from './pool.js';

// We don't handle errors here since we allow the callers to handle the errors
// specific to the context of their use case.
export async function runSqlFile(filePath: string) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
}
