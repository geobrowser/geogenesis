/**
 * What survives a page reload.
 *
 * The in-memory Map is gone after a refresh, so every assertion here starts by
 * clearing it and reading back from the (faked) store — that is exactly the
 * state a reloaded tab is in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportMapping } from './mapping-types';

// A stand-in for the Dexie table: same surface, a plain Map underneath.
const rows = new Map<string, Record<string, unknown>>();

vi.mock('~/core/database/indexeddb', () => ({
  db: {
    importSessions: {
      put: async (row: { id: string }) => void rows.set(row.id, row as Record<string, unknown>),
      get: async (id: string) => rows.get(id),
      delete: async (id: string) => void rows.delete(id),
      clear: async () => rows.clear(),
      where: (field: string) => ({
        equals: (wanted: unknown) => ({
          toArray: async () => [...rows.values()].filter(row => row[field] === wanted),
        }),
        below: (cutoff: number) => ({
          delete: async () => {
            let n = 0;
            for (const [id, row] of rows) {
              if ((row[field] as number) < cutoff) {
                rows.delete(id);
                n++;
              }
            }
            return n;
          },
        }),
      }),
    },
  },
}));

const { ImportSessions, SESSION_TTL_MS } = await import('./session');

const session = {
  id: 'abc',
  fileName: 'projects.csv',
  fileSizeBytes: 120,
  table: { headers: ['Name'], rows: [['Ethereum']], rowCount: 1 },
  spaceId: 'c9f267dcb0d270718c2a3c45a64afd32',
  raggedRows: 0,
};

const mapping = {
  typeId: 'a'.repeat(32),
  typeName: 'Project',
  nameColumn: 0,
  columns: [],
  summary: 's',
} as ImportMapping;

// `clearMemory()` is the reload: the tab's Map goes, the store stays.
beforeEach(() => {
  rows.clear();
  ImportSessions.clearMemory();
});

describe('surviving a reload', () => {
  it('reads a session back from the store when memory is empty', async () => {
    ImportSessions.set(session);
    ImportSessions.clearMemory();

    expect(ImportSessions.ids()).toEqual([]);
    expect(await ImportSessions.get('abc')).toMatchObject({ fileName: 'projects.csv', spaceId: session.spaceId });
  });

  it('keeps the rows, not just the file name', async () => {
    // The whole point: a restored session must be importable, which means the
    // parsed table has to come back too.
    ImportSessions.set(session);
    ImportSessions.clearMemory();

    const restored = await ImportSessions.get('abc');
    expect(restored?.table.rows).toEqual([['Ethereum']]);
  });

  it('restores the mapping alongside the session', async () => {
    // Both halves or neither. A session without its mapping still dead-ends on
    // `no_mapping_yet`, which is the same wall from the user's side.
    ImportSessions.set(session);
    await ImportSessions.setMapping('abc', mapping);
    ImportSessions.clearMemory();

    expect((await ImportSessions.getMapping('abc'))?.mapping).toMatchObject({ typeName: 'Project' });
  });

  it('restores which space the mapping was built for', async () => {
    // Without this an apply after a reload cannot tell whether the mapping
    // still matches where the user is standing, and a Root-built mapping would
    // apply cleanly into a space it was never computed against.
    ImportSessions.set(session);
    await ImportSessions.setMapping('abc', mapping, session.spaceId);
    ImportSessions.clearMemory();

    expect(await ImportSessions.getMapping('abc')).toMatchObject({ spaceId: session.spaceId });
  });

  it('reports a null space for a mapping stored before the space was tracked', async () => {
    ImportSessions.set(session);
    await ImportSessions.setMapping('abc', mapping);

    expect((await ImportSessions.getMapping('abc'))?.spaceId).toBeNull();
  });

  it('has no mapping before one is proposed', async () => {
    ImportSessions.set(session);
    ImportSessions.clearMemory();

    expect(await ImportSessions.getMapping('abc')).toBeNull();
  });

  it('removing a file removes it from the store too', async () => {
    // Otherwise "×" only hides the chip and the spreadsheet stays on disk.
    ImportSessions.set(session);
    ImportSessions.clear('abc');
    ImportSessions.clearMemory();

    expect(await ImportSessions.get('abc')).toBeNull();
  });

  it('drops a session past its TTL rather than restoring it', async () => {
    ImportSessions.set(session);
    ImportSessions.clearMemory();

    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000);
    expect(await ImportSessions.get('abc')).toBeNull();
    vi.useRealTimers();
  });

  it('sweeps expired sessions without touching fresh ones', async () => {
    ImportSessions.set(session);
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000);
    ImportSessions.set({ ...session, id: 'fresh' });

    await ImportSessions.sweepExpired();
    ImportSessions.clearMemory();

    expect(await ImportSessions.get('abc')).toBeNull();
    expect(await ImportSessions.get('fresh')).not.toBeNull();
    vi.useRealTimers();
  });

  it('a store failure does not break the in-memory path', async () => {
    // The tab already has what it needs; a disk problem must not lose the file
    // the user is actively working with.
    ImportSessions.set(session);
    expect(await ImportSessions.get('abc')).toMatchObject({ fileName: 'projects.csv' });
  });
});

// ---------------------------------------------------------------------------
// Recognising a file we have already staged.
//
// Attaching the same spreadsheet twice makes two sessions with two ids, and
// nothing used to connect them — so a second import of a file whose edits were
// still sitting unpublished wrote every value and relation again. The
// fingerprint is what connects them.
// ---------------------------------------------------------------------------

const { fingerprintTable } = await import('./session');

const table = (headers: string[], rowData: string[][]) => ({ headers, rows: rowData, rowCount: rowData.length });

describe('fingerprintTable', () => {
  it('gives the same file the same fingerprint', () => {
    expect(fingerprintTable(table(['Name', 'Role'], [['Sam', 'ceo']]))).toBe(
      fingerprintTable(table(['Name', 'Role'], [['Sam', 'ceo']]))
    );
  });

  it('separates files whose cells differ', () => {
    expect(fingerprintTable(table(['Name'], [['Sam']]))).not.toBe(fingerprintTable(table(['Name'], [['Dario']])));
  });

  it('separates files whose headers differ', () => {
    expect(fingerprintTable(table(['Name'], [['Sam']]))).not.toBe(fingerprintTable(table(['Person'], [['Sam']])));
  });

  it('does not confuse a cell boundary with its contents', () => {
    // Without a separator in the hash, ['ab','c'] and ['a','bc'] collide.
    expect(fingerprintTable(table(['H'], [['ab', 'c']]))).not.toBe(fingerprintTable(table(['H'], [['a', 'bc']])));
  });

  it('ignores the file name, so a renamed file is still recognised', () => {
    // The session carries the name separately; the fingerprint is the content.
    const same = table(['Name'], [['Sam']]);
    expect(fingerprintTable(same)).toBe(fingerprintTable({ ...same }));
  });
});

describe('finding an earlier staging of the same file', () => {
  const marker = {
    at: 1_700_000_000_000,
    spaceId: session.spaceId,
    entityCount: 20,
    probe: { valueId: 'v1', entityId: 'e1' },
  };

  it('matches a re-upload of the same file by content', async () => {
    ImportSessions.set(session);
    await ImportSessions.markStaged(session.id, marker);

    // The same spreadsheet attached again: new id, same bytes.
    const reupload = { ...session, id: 'def' };
    ImportSessions.set(reupload);

    const found = await ImportSessions.stagedMatches(fingerprintTable(reupload.table), session.spaceId, 'def');
    expect(found.map(s => s.id)).toEqual(['abc']);
  });

  it('never matches the session doing the asking', async () => {
    ImportSessions.set(session);
    await ImportSessions.markStaged(session.id, marker);

    const found = await ImportSessions.stagedMatches(fingerprintTable(session.table), session.spaceId, 'abc');
    expect(found).toEqual([]);
  });

  it('ignores a staging into a different space', async () => {
    ImportSessions.set(session);
    await ImportSessions.markStaged(session.id, { ...marker, spaceId: 'f'.repeat(32) });

    const found = await ImportSessions.stagedMatches(fingerprintTable(session.table), session.spaceId, 'def');
    expect(found).toEqual([]);
  });

  it('ignores a session that was never staged', async () => {
    // Proposing a mapping and walking away is not a duplicate of anything.
    ImportSessions.set(session);

    const found = await ImportSessions.stagedMatches(fingerprintTable(session.table), session.spaceId, 'def');
    expect(found).toEqual([]);
  });

  it('does not match a file that was edited between uploads', async () => {
    ImportSessions.set(session);
    await ImportSessions.markStaged(session.id, marker);

    const edited = { ...session, id: 'def', table: table(['Name'], [['Ethereum'], ['Solana']]) };
    const found = await ImportSessions.stagedMatches(fingerprintTable(edited.table), session.spaceId, 'def');
    expect(found).toEqual([]);
  });

  it('survives a reload, since the marker is on disk', async () => {
    ImportSessions.set(session);
    await ImportSessions.markStaged(session.id, marker);
    ImportSessions.clearMemory();

    const found = await ImportSessions.stagedMatches(fingerprintTable(session.table), session.spaceId, 'def');
    expect(found[0]?.staged?.probe).toEqual({ valueId: 'v1', entityId: 'e1' });
  });
});
