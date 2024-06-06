import * as pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 97,
});

pool.on('error', err => console.error('Pool Error', err));
