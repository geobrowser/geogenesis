/// <reference lib="webworker" />
import { parse } from 'csv/sync';

export type ParseSuccess = { ok: true; headers: string[]; rows: string[][]; rowCount: number };
export type ParseError = { ok: false; message: string };
export type ParseResult = ParseSuccess | ParseError;

self.onmessage = (e: MessageEvent<string>) => {
  try {
    const records: string[][] = parse(e.data, {
      delimiter: ',',
      skip_empty_lines: true,
      trim: true,
    });

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

    self.postMessage({ ok: true, headers, rows, rowCount: rows.length } satisfies ParseSuccess);
  } catch (err) {
    self.postMessage({
      ok: false,
      message: err instanceof Error ? err.message : 'CSV parse failed',
    } satisfies ParseError);
  }
};
