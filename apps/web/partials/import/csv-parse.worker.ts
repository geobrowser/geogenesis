/// <reference lib="webworker" />
import { parse } from 'csv/sync';

export type ParseSuccess = { ok: true; headers: string[]; rows: string[][]; rowCount: number };
export type ParseError = { ok: false; message: string };
export type ParseResult = ParseSuccess | ParseError;

self.onmessage = (e: MessageEvent<string>) => {
  console.log(`[csv-worker] received ${(e.data.length / 1024).toFixed(0)}KB to parse`);
  const t0 = performance.now();
  try {
    const records: string[][] = parse(e.data, {
      delimiter: ',',
      skip_empty_lines: true,
      trim: true,
    });
    console.log(`[csv-worker] parsed ${records.length} records in ${(performance.now() - t0).toFixed(1)}ms`);

    const headers: string[] = records[0] ?? [];
    const rows: string[][] = [];

    for (let i = 1; i < records.length; i++) {
      const row = records[i];
      if (!Array.isArray(row)) continue;
      for (let j = 0; j < row.length; j++) {
        if (row[j]?.trim()) {
          rows.push(row);
          break;
        }
      }
    }

    console.log(`[csv-worker] filtered to ${rows.length} data rows in ${(performance.now() - t0).toFixed(1)}ms`);
    self.postMessage({ ok: true, headers, rows, rowCount: rows.length } satisfies ParseSuccess);
  } catch (err) {
    self.postMessage({
      ok: false,
      message: err instanceof Error ? err.message : 'CSV parse failed',
    } satisfies ParseError);
  }
};
