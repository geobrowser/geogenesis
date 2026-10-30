import { describe, expect, it, vi } from 'vitest';

import {
  MAX_ENTITIES,
  MAX_VIEWS_PER_ENTITY,
  SEEN_STORAGE_KEY,
  type SeenEntry,
  createSeenStore,
  isSeenWithoutEngagement,
  pruneSeenEntries,
} from './seen-store';

const DAY = 86_400;
const NOW = 1_800_000_000;
const id = (n: number) => n.toString(16).padStart(32, '0');

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  };
}

function harness(storage: ReturnType<typeof memoryStorage> | (() => never), now = NOW) {
  const tasks: (() => void)[] = [];
  const clock = { now };
  const store = createSeenStore({
    storage: typeof storage === 'function' ? storage : () => storage,
    nowSec: () => clock.now,
    schedule: task => void tasks.push(task),
  });
  const runIdle = () => {
    while (tasks.length > 0) tasks.shift()!();
  };
  return { store, tasks, runIdle, clock };
}

function stored(storage: ReturnType<typeof memoryStorage>) {
  return JSON.parse(storage.data.get(SEEN_STORAGE_KEY) ?? '{}') as { e: Record<string, { s: number[]; g?: number }> };
}

describe('pruneSeenEntries', () => {
  it('drops views and engagements older than 7 days, and entries left empty', () => {
    const entries = new Map<string, SeenEntry>([
      ['a', { views: [NOW - 8 * DAY, NOW - DAY], engagedAt: NOW - 8 * DAY }],
      ['b', { views: [NOW - 8 * DAY], engagedAt: null }],
      ['c', { views: [], engagedAt: NOW - 2 * DAY }],
    ]);

    expect(pruneSeenEntries(entries, NOW)).toEqual(
      new Map([
        ['a', { views: [NOW - DAY], engagedAt: null }],
        ['c', { views: [], engagedAt: NOW - 2 * DAY }],
      ])
    );
  });

  it('keeps the 2,000 most recently active entities', () => {
    const entries = new Map<string, SeenEntry>();
    for (let n = 0; n < MAX_ENTITIES + 50; n += 1) entries.set(id(n), { views: [NOW - 3_000 + n], engagedAt: null });

    const kept = pruneSeenEntries(entries, NOW);

    expect(kept.size).toBe(MAX_ENTITIES);
    expect(kept.has(id(49))).toBe(false);
    expect(kept.has(id(50))).toBe(true);
    expect(kept.has(id(MAX_ENTITIES + 49))).toBe(true);
  });

  it('keeps only the newest views of one entity', () => {
    const views = Array.from({ length: MAX_VIEWS_PER_ENTITY + 5 }, (_, n) => NOW - 100 + n);
    expect(pruneSeenEntries(new Map([['a', { views, engagedAt: null }]]), NOW).get('a')!.views).toEqual(
      views.slice(-MAX_VIEWS_PER_ENTITY)
    );
  });
});

describe('isSeenWithoutEngagement', () => {
  const config = { minViews: 2, days: 3 };

  it('needs N views inside the last D days', () => {
    const snapshot = new Map<string, SeenEntry>([
      [id(1), { views: [NOW - 2 * DAY, NOW - DAY], engagedAt: null }],
      [id(2), { views: [NOW - 4 * DAY, NOW - DAY], engagedAt: null }],
      [id(3), { views: [NOW - DAY], engagedAt: null }],
    ]);

    expect(isSeenWithoutEngagement(snapshot, id(1), config, NOW)).toBe(true);
    expect(isSeenWithoutEngagement(snapshot, id(2), config, NOW)).toBe(false);
    expect(isSeenWithoutEngagement(snapshot, id(3), config, NOW)).toBe(false);
    expect(isSeenWithoutEngagement(snapshot, id(4), config, NOW)).toBe(false);
    expect(isSeenWithoutEngagement(snapshot, id(2), { minViews: 2, days: 5 }, NOW)).toBe(true);
  });

  it('exempts a card the visitor engaged with, however often it was shown', () => {
    const snapshot = new Map<string, SeenEntry>([
      [id(1), { views: [NOW - 3, NOW - 2, NOW - 1], engagedAt: NOW - 6 * DAY }],
    ]);
    expect(isSeenWithoutEngagement(snapshot, id(1), config, NOW)).toBe(false);
  });

  it('matches dashed and upper-case ids', () => {
    const dashed = '0000000a-0000-0000-0000-000000000001'.toUpperCase();
    const snapshot = new Map<string, SeenEntry>([
      ['0000000a000000000000000000000001', { views: [NOW - 2, NOW - 1], engagedAt: null }],
    ]);
    expect(isSeenWithoutEngagement(snapshot, dashed, config, NOW)).toBe(true);
  });
});

describe('createSeenStore', () => {
  it('reads storage once per session, however often the feed asks', () => {
    const storage = memoryStorage({
      [SEEN_STORAGE_KEY]: JSON.stringify({ v: 1, e: { [id(1)]: { s: [NOW - 10, NOW - 5] } } }),
    });
    const { store } = harness(storage);

    for (let n = 0; n < 5; n += 1) expect(store.snapshot()!.get(id(1))!.views).toEqual([NOW - 10, NOW - 5]);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it('primes the read in an idle callback, not when called', () => {
    const storage = memoryStorage();
    const { store, runIdle } = harness(storage);

    store.prime();
    expect(storage.getItem).not.toHaveBeenCalled();
    runIdle();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    store.snapshot();
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it('writes impressions in one idle batch, never as they happen', () => {
    const storage = memoryStorage();
    const { store, tasks, runIdle } = harness(storage);

    store.recordImpression(id(1), 'view-1');
    store.recordImpression(id(2), 'view-1');
    store.recordEngagement(id(3));
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);

    runIdle();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(stored(storage).e).toEqual({
      [id(1)]: { s: [NOW] },
      [id(2)]: { s: [NOW] },
      [id(3)]: { s: [], g: NOW },
    });
  });

  it('counts one view per card per page view', () => {
    const storage = memoryStorage();
    const { store, runIdle, clock } = harness(storage);

    store.recordImpression(id(1), 'view-1');
    store.recordImpression(id(1), 'view-1');
    clock.now += 60;
    store.recordImpression(id(1), 'view-2');
    runIdle();

    expect(stored(storage).e[id(1)]!.s).toEqual([NOW, NOW + 60]);
  });

  it('keeps what another tab wrote since this one loaded', () => {
    const storage = memoryStorage();
    const { store, runIdle } = harness(storage);
    store.snapshot();
    storage.data.set(SEEN_STORAGE_KEY, JSON.stringify({ v: 1, e: { [id(9)]: { s: [NOW - 1] } } }));

    store.recordImpression(id(1), 'view-1');
    runIdle();

    expect(Object.keys(stored(storage).e).sort()).toEqual([id(1), id(9)]);
  });

  it('decides with the snapshot it loaded, so cards do not move while the visitor reads', () => {
    const storage = memoryStorage({
      [SEEN_STORAGE_KEY]: JSON.stringify({ v: 1, e: { [id(1)]: { s: [NOW - 10] } } }),
    });
    const { store, runIdle } = harness(storage);
    const before = store.snapshot();

    store.recordImpression(id(1), 'view-1');
    runIdle();

    expect(store.snapshot()).toBe(before);
    expect(store.snapshot()!.get(id(1))!.views).toEqual([NOW - 10]);
  });

  it('applies the cap and expiry when it writes', () => {
    const e: Record<string, { s: number[] }> = {};
    for (let n = 0; n < MAX_ENTITIES; n += 1) e[id(n)] = { s: [NOW - 3_000 + n] };
    e[id(99_999)] = { s: [NOW - 8 * DAY] };
    const storage = memoryStorage({ [SEEN_STORAGE_KEY]: JSON.stringify({ v: 1, e }) });
    const { store, runIdle } = harness(storage);

    store.recordImpression(id(MAX_ENTITIES), 'view-1');
    runIdle();

    const written = stored(storage).e;
    expect(Object.keys(written)).toHaveLength(MAX_ENTITIES);
    expect(written[id(99_999)]).toBeUndefined();
    expect(written[id(0)]).toBeUndefined();
    expect(written[id(MAX_ENTITIES)]).toEqual({ s: [NOW] });
  });

  it('treats a corrupt record as empty', () => {
    const { store } = harness(memoryStorage({ [SEEN_STORAGE_KEY]: '{not json' }));
    expect(store.snapshot()?.size).toBe(0);
  });

  it('is a no-op when storage is unavailable', () => {
    const { store, runIdle } = harness(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(store.snapshot()).toBeNull();
    expect(() => {
      store.prime();
      store.recordImpression(id(1), 'view-1');
      store.recordEngagement(id(1));
      runIdle();
      store.flush();
    }).not.toThrow();
  });

  it('drops a batch the storage refuses rather than throwing', () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { store, runIdle } = harness(storage);

    store.recordImpression(id(1), 'view-1');
    expect(runIdle).not.toThrow();
  });
});
