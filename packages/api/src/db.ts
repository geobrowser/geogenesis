import * as pg from 'pg';
import { DATABASE_URL } from './config';

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 97,
});

pool.on('error', err => console.error('Pool Error', err));
