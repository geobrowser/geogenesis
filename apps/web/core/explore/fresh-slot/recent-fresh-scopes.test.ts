import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RECENT_SCOPES_MAX_MEMBERS,
  type RecentFreshScope,
  type RecentFreshScopeStore,
  readRecentFreshScopes,
  recordRecentFreshScope,
  setRecentFreshScopeStoreForTests,
} from './recent-fresh-scopes';

const scope = (n: number): RecentFreshScope => ({
  spaceIds: [String(n).padStart(32, '0')],
  typeIds: ['t'.repeat(32)],
  time: 'all',
  requireName: true,
  requireDebateTagOnClaims: null,
  freshnessHours: 24,
});

function memoryStore() {
  const rows = new Map<string, number>();
  const trims: { minScoreMs: number; keep: number }[] = [];
  const store: RecentFreshScopeStore = {
    add: async (member, scoreMs) => {
      rows.set(member, scoreMs);
    },
    newest: async (minScoreMs, limit) =>
      [...rows.entries()]
        .filter(([, score]) => score >= minScoreMs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([member]) => member),
    trim: async (minScoreMs, keep) => {
      trims.push({ minScoreMs, keep });
      for (const [member, score] of rows) if (score < minScoreMs) rows.delete(member);
    },
  };
  return { rows, trims, store };
}

afterEach(() => setRecentFreshScopeStoreForTests(null));

describe('recording a requested scope', () => {
  it('stores the space, type and hour inputs scored by time, and nothing else', async () => {
    const { rows, store } = memoryStore();
    setRecentFreshScopeStoreForTests(store);
    await recordRecentFreshScope(scope(1), 1000);
    expect([...rows.entries()]).toEqual([[JSON.stringify(scope(1)), 1000]]);
    expect(Object.keys(JSON.parse([...rows.keys()][0]!)).sort()).toEqual([
      'freshnessHours',
      'requireDebateTagOnClaims',
      'requireName',
      'spaceIds',
      'time',
      'typeIds',
    ]);
  });

  it('does nothing without a store, and skips an oversized scope', async () => {
    setRecentFreshScopeStoreForTests(null);
    await expect(recordRecentFreshScope(scope(1), 1)).resolves.toBeUndefined();
    const { rows, store } = memoryStore();
    setRecentFreshScopeStoreForTests(store);
    await recordRecentFreshScope({ ...scope(1), spaceIds: Array(1000).fill('a'.repeat(32)) }, 1);
    expect(rows.size).toBe(0);
  });
});

describe('reading the recent scopes', () => {
  it('returns the newest within the window, at most the limit, and trims the rest', async () => {
    const { store, trims } = memoryStore();
    setRecentFreshScopeStoreForTests(store);
    const now = 10_000_000;
    await recordRecentFreshScope(scope(1), now - 40 * 60_000); // outside the window
    for (let n = 2; n <= 6; n += 1) await recordRecentFreshScope(scope(n), now - n * 60_000);

    const read = await readRecentFreshScopes({ nowMs: now, windowMs: 30 * 60_000, limit: 3 });
    expect(read).toEqual([scope(2), scope(3), scope(4)]);
    expect(trims).toEqual([{ minScoreMs: now - 30 * 60_000, keep: RECENT_SCOPES_MAX_MEMBERS }]);
  });

  it('skips members it cannot read, and reads as empty when the store fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setRecentFreshScopeStoreForTests({
      add: async () => {},
      trim: async () => {
        throw new Error('down');
      },
      newest: async () => ['not json', JSON.stringify({ spaceIds: [] }), JSON.stringify(scope(1))],
    });
    expect(await readRecentFreshScopes({ nowMs: 1, windowMs: 1, limit: 5 })).toEqual([scope(1)]);

    setRecentFreshScopeStoreForTests({
      add: async () => {},
      trim: async () => {},
      newest: async () => {
        throw new Error('down');
      },
    });
    expect(await readRecentFreshScopes({ nowMs: 1, windowMs: 1, limit: 5 })).toEqual([]);
    warn.mockRestore();
  });
});
