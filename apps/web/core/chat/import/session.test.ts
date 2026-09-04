import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportSessions, sampleColumns } from './session';
import type { ParsedTable } from './types';

// Dexie needs a real IndexedDB, which jsdom does not provide. These tests cover
// the in-memory contract; `session-persistence.test.ts` covers what reaches disk.
vi.mock('~/core/database/indexeddb', () => ({
  db: {
    importSessions: {
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      where: () => ({ below: () => ({ delete: vi.fn(async () => 0) }) }),
    },
  },
}));

function table(headers: string[], rows: string[][]): ParsedTable {
  return { headers, rows, rowCount: rows.length };
}

afterEach(() => ImportSessions.clearAll());

describe('sampleColumns', () => {
  it('returns distinct values, not the first N rows', () => {
    // A column whose opening rows repeat would otherwise show the model one
    // value five times and tell it nothing about the column's range.
    const samples = sampleColumns(
      table(
        ['Sector'],
        [['Blockchain'], ['Blockchain'], ['Blockchain'], ['Blockchain'], ['Blockchain'], ['DeFi'], ['Gaming']]
      )
    );

    expect(samples[0].samples).toEqual(['Blockchain', 'DeFi', 'Gaming']);
  });

  it('caps how many values leave the browser', () => {
    const rows = Array.from({ length: 500 }, (_, i) => [`Project ${i}`]);

    const samples = sampleColumns(table(['Name'], rows));

    expect(samples[0].samples).toHaveLength(5);
  });

  it('counts every non-blank cell even though it only samples five', () => {
    // `filled` is how the model learns a column is mostly empty — a fact the
    // five samples alone would hide, since they are all non-blank by design.
    const samples = sampleColumns(table(['Founded'], [['2015'], [''], ['2020'], ['  '], ['2018']]));

    expect(samples[0].filled).toBe(3);
    expect(samples[0].samples).toEqual(['2015', '2020', '2018']);
  });

  it('skips blank cells when sampling', () => {
    const samples = sampleColumns(table(['Founded'], [[''], ['  '], ['2015']]));

    expect(samples[0].samples).toEqual(['2015']);
  });

  it('reports an entirely empty column as empty rather than omitting it', () => {
    // The model still needs to see the column exists — it has a header, and a
    // header alone may be enough to map it.
    const samples = sampleColumns(
      table(
        ['Name', 'Notes'],
        [
          ['Ethereum', ''],
          ['Polkadot', ''],
        ]
      )
    );

    expect(samples[1]).toMatchObject({ index: 1, header: 'Notes', samples: [], filled: 0 });
  });

  it('keeps column index aligned with the header position', () => {
    const samples = sampleColumns(table(['Name', 'URL', 'Founded'], [['Ethereum', 'https://e.org', '2015']]));

    expect(samples.map(s => s.index)).toEqual([0, 1, 2]);
    expect(samples.map(s => s.header)).toEqual(['Name', 'URL', 'Founded']);
  });

  it('trims sampled values so the model is not shown padding', () => {
    const samples = sampleColumns(table(['Name'], [['  Ethereum  ']]));

    expect(samples[0].samples).toEqual(['Ethereum']);
  });
});

describe('ImportSessions', () => {
  const session = {
    id: 'abc',
    fileName: 'projects.csv',
    fileSizeBytes: 1024,
    table: table(['Name'], [['Ethereum']]),
    spaceId: 'c9f267dcb0d270718c2a3c45a64afd32',
    raggedRows: 0,
  };

  it('round-trips a session', async () => {
    ImportSessions.set(session);

    // `createdAt` is added on the way in — it is what the TTL sweep reads.
    expect(await ImportSessions.get('abc')).toMatchObject(session);
  });

  it('returns null for an unknown id rather than an empty table', async () => {
    // An empty table would read as "the file had no rows" and import nothing,
    // silently. A missing session is a different failure and has to say so.
    await expect(ImportSessions.get('nope')).resolves.toBeNull();
  });

  it('keeps concurrent uploads apart', async () => {
    ImportSessions.set(session);
    ImportSessions.set({ ...session, id: 'def', fileName: 'people.csv' });

    expect((await ImportSessions.get('abc'))?.fileName).toBe('projects.csv');
    expect((await ImportSessions.get('def'))?.fileName).toBe('people.csv');
  });

  it('clears one session without touching the others', async () => {
    ImportSessions.set(session);
    ImportSessions.set({ ...session, id: 'def' });

    ImportSessions.clear('abc');

    await expect(ImportSessions.get('abc')).resolves.toBeNull();
    await expect(ImportSessions.get('def')).resolves.not.toBeNull();
  });

  it('lists live ids', () => {
    ImportSessions.set(session);
    ImportSessions.set({ ...session, id: 'def' });

    expect(ImportSessions.ids().sort()).toEqual(['abc', 'def']);
  });

  it('records the space the file was uploaded from', async () => {
    // Applying an import into a space the user has since navigated away from
    // is the same failure class as the wrong-space answers we fixed in the
    // geo-query round — the stamp is what makes it checkable at apply time.
    ImportSessions.set(session);

    expect((await ImportSessions.get('abc'))?.spaceId).toBe('c9f267dcb0d270718c2a3c45a64afd32');
  });
});
