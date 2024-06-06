import * as pg from 'pg';

export const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 97,
});
