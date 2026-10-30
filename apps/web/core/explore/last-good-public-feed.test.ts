import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LAST_GOOD_PUBLIC_FEED_READ_TIMEOUT_MS,
  type LastGoodPublicFeedStore,
  readLastGoodPublicFeed,
  rememberPublicFeedPage,
  resetLastGoodPublicFeedForTests,
} from './last-good-public-feed';

const page = (id: string) => ({ items: [{ entityId: id }], nextCursor: 'c1' });

function memoryStore() {
  const values = new Map<string, string>();
  const store: LastGoodPublicFeedStore = {
    read: vi.fn(async (key: string) => values.get(key) ?? null),
    write: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
  return { store, values };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-16T09:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  resetLastGoodPublicFeedForTests(null);
});

describe('last good public feed', () => {
  it('has nothing before a page is remembered', async () => {
    resetLastGoodPublicFeedForTests(memoryStore().store);

    expect(await readLastGoodPublicFeed()).toBeNull();
  });

  it('hands back the page this instance remembered, with when', async () => {
    resetLastGoodPublicFeedForTests(null);
    await rememberPublicFeedPage(page('e1'));

    expect(await readLastGoodPublicFeed()).toEqual({ asOfMs: Date.now(), body: page('e1') });
  });

  it('reads the shared page on an instance that has none of its own', async () => {
    const { store, values } = memoryStore();
    resetLastGoodPublicFeedForTests(store);
    await rememberPublicFeedPage(page('e1'));
    const shared = [...values.entries()];

    // A cold instance: same shared store, nothing held.
    const cold = memoryStore();
    for (const [key, value] of shared) cold.values.set(key, value);
    resetLastGoodPublicFeedForTests(cold.store);

    expect((await readLastGoodPublicFeed())?.body).toEqual(page('e1'));
  });

  it('shares at most once a minute, but always holds the newest page itself', async () => {
    const { store } = memoryStore();
    resetLastGoodPublicFeedForTests(store);

    await rememberPublicFeedPage(page('e1'));
    vi.advanceTimersByTime(30_000);
    await rememberPublicFeedPage(page('e2'));

    expect(store.write).toHaveBeenCalledTimes(1);
    expect((await readLastGoodPublicFeed())?.body).toEqual(page('e2'));

    vi.advanceTimersByTime(31_000);
    await rememberPublicFeedPage(page('e3'));
    expect(store.write).toHaveBeenCalledTimes(2);
  });

  it('forgets a page older than a day', async () => {
    resetLastGoodPublicFeedForTests(null);
    await rememberPublicFeedPage(page('e1'));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    expect(await readLastGoodPublicFeed()).toBeNull();
  });

  it('ignores an empty or unreadable shared record', async () => {
    const { store, values } = memoryStore();
    resetLastGoodPublicFeedForTests(store);

    values.set('explore:feed:last-good-public', JSON.stringify({ asOfMs: Date.now(), body: { items: [] } }));
    expect(await readLastGoodPublicFeed()).toBeNull();

    values.set('explore:feed:last-good-public', 'not json');
    expect(await readLastGoodPublicFeed()).toBeNull();
  });

  it('reads as nothing when the shared store fails or is slow', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetLastGoodPublicFeedForTests({ read: async () => Promise.reject(new Error('down')), write: async () => {} });
    expect(await readLastGoodPublicFeed()).toBeNull();

    resetLastGoodPublicFeedForTests({ read: () => new Promise(() => {}), write: async () => {} });
    const read = readLastGoodPublicFeed();
    vi.advanceTimersByTime(LAST_GOOD_PUBLIC_FEED_READ_TIMEOUT_MS);
    expect(await read).toBeNull();
  });

  it('survives a failed shared write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    resetLastGoodPublicFeedForTests({ read: async () => null, write: async () => Promise.reject(new Error('down')) });

    await rememberPublicFeedPage(page('e1'));

    expect((await readLastGoodPublicFeed())?.body).toEqual(page('e1'));
  });
});
