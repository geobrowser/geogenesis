import { beforeEach, describe, expect, it } from 'vitest';

import { ImportSessionStore } from './import-session-store';

const SESSION_ID = 'test-session';

function seed(rows: string[][], headers: string[] = ['a', 'b', 'c', 'd']) {
  ImportSessionStore.set(SESSION_ID, {
    headers,
    rows,
    rowCount: rows.length,
  });
}

describe('ImportSessionStore.removeColumns', () => {
  beforeEach(() => {
    ImportSessionStore.clear(SESSION_ID);
  });

  it('removes a single column from headers and every row', () => {
    seed([
      ['a1', 'b1', 'c1', 'd1'],
      ['a2', 'b2', 'c2', 'd2'],
    ]);

    const ok = ImportSessionStore.removeColumns(SESSION_ID, [1]);

    expect(ok).toBe(true);
    const data = ImportSessionStore.get(SESSION_ID);
    expect(data.headers).toEqual(['a', 'c', 'd']);
    expect(data.rows).toEqual([
      ['a1', 'c1', 'd1'],
      ['a2', 'c2', 'd2'],
    ]);
    expect(data.rowCount).toBe(2);
  });

  it('removes multiple columns, deduping the indices', () => {
    seed([
      ['a1', 'b1', 'c1', 'd1'],
      ['a2', 'b2', 'c2', 'd2'],
    ]);

    // Duplicate `0` should be tolerated; order should not matter.
    const ok = ImportSessionStore.removeColumns(SESSION_ID, [2, 0, 0]);

    expect(ok).toBe(true);
    const data = ImportSessionStore.get(SESSION_ID);
    expect(data.headers).toEqual(['b', 'd']);
    expect(data.rows).toEqual([
      ['b1', 'd1'],
      ['b2', 'd2'],
    ]);
  });

  it('ignores out-of-range indices and returns false when nothing valid remains', () => {
    seed([['a1', 'b1', 'c1', 'd1']]);

    expect(ImportSessionStore.removeColumns(SESSION_ID, [-1])).toBe(false);
    expect(ImportSessionStore.removeColumns(SESSION_ID, [4])).toBe(false);
    expect(ImportSessionStore.removeColumns(SESSION_ID, [99, -3])).toBe(false);

    // Data must be untouched across the failed attempts.
    const data = ImportSessionStore.get(SESSION_ID);
    expect(data.headers).toEqual(['a', 'b', 'c', 'd']);
    expect(data.rows).toEqual([['a1', 'b1', 'c1', 'd1']]);
  });

  it('filters out-of-range indices but still removes valid ones in a mixed call', () => {
    seed([['a1', 'b1', 'c1', 'd1']]);

    const ok = ImportSessionStore.removeColumns(SESSION_ID, [1, 99, -1]);

    expect(ok).toBe(true);
    expect(ImportSessionStore.get(SESSION_ID).headers).toEqual(['a', 'c', 'd']);
  });

  it('pads short rows up to headers.length before removing columns', () => {
    // Second row is shorter than the headers — the store should treat the missing
    // cells as empty strings, then apply the removal so row widths stay consistent.
    seed([
      ['a1', 'b1', 'c1', 'd1'],
      ['a2'],
    ]);

    const ok = ImportSessionStore.removeColumns(SESSION_ID, [1]);

    expect(ok).toBe(true);
    const data = ImportSessionStore.get(SESSION_ID);
    expect(data.headers).toEqual(['a', 'c', 'd']);
    expect(data.rows).toEqual([
      ['a1', 'c1', 'd1'],
      ['a2', '', ''],
    ]);
  });

  it('truncates long rows to headers.length before removing columns', () => {
    // Row overflow — cells past headers.length should be discarded.
    seed([['a1', 'b1', 'c1', 'd1', 'EXTRA']]);

    const ok = ImportSessionStore.removeColumns(SESSION_ID, [1]);

    expect(ok).toBe(true);
    expect(ImportSessionStore.get(SESSION_ID).rows).toEqual([['a1', 'c1', 'd1']]);
  });

  it('returns false for an empty column list without mutating state', () => {
    seed([['a1', 'b1', 'c1', 'd1']]);

    expect(ImportSessionStore.removeColumns(SESSION_ID, [])).toBe(false);
    expect(ImportSessionStore.get(SESSION_ID).headers).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns false for an unknown session id', () => {
    expect(ImportSessionStore.removeColumns('does-not-exist', [0])).toBe(false);
  });
});
