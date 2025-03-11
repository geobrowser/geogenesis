import { from as copyFrom } from 'pg-copy-streams';
import { Readable, pipeline } from 'stream';

import { pool } from '../utils/pool';

export async function copyBulk(table: string, data: unknown[]) {
  const maybeFirstRow = data[0];

  if (!maybeFirstRow) {
    return;
  }

  const headers = Object.keys(maybeFirstRow);
  const csvHeader = headers.join(',');

  const csvRows = data.map(row =>
    headers
      .map(field => {
        // @ts-expect-error type mismatch
        const value = row[field];
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
      })
      .join(',')
  );

  const csvContent = [csvHeader, ...csvRows];
  const client = await pool.connect();

  const readableStream = Readable.from(
    csvContent.map(row => `${row}\n`) // CSV format
  );

  const copyQuery = `COPY ${table} (${headers.join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER true)`;
  const stream = await client.query(copyFrom(copyQuery)); // Execute COPY

  // Pipe the in-memory data to PostgreSQL
  await new Promise((resolve, reject) => {
    pipeline(readableStream, stream, err => {
      if (err) {
        reject(err);
      } else {
        resolve(void 0);
      }
    });
  });

  client.release();
}
