import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPromiseTtlCache } from './promise-ttl-cache';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createPromiseTtlCache', () => {
  it('shares one in-flight load between concurrent callers of a key', async () => {
    const cache = createPromiseTtlCache<number>({ ttlMs: 1_000, maxEntries: 4 });
    const load = vi.fn(() => Promise.resolve(7));

    await expect(Promise.all([cache.get('a', load), cache.get('a', load)])).resolves.toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reuses a settled result until the TTL passes, then loads again', async () => {
    const cache = createPromiseTtlCache<number>({ ttlMs: 1_000, maxEntries: 4 });
    const load = vi.fn(() => Promise.resolve(1));

    await cache.get('a', load);
    vi.advanceTimersByTime(999);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await cache.get('a', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never serves a failure to the next caller', async () => {
    const cache = createPromiseTtlCache<number>({ ttlMs: 1_000, maxEntries: 4 });

    await expect(cache.get('a', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await expect(cache.get('a', () => Promise.resolve(2))).resolves.toBe(2);
  });

  it('evicts the least recently used key past the size bound', async () => {
    const cache = createPromiseTtlCache<string>({ ttlMs: 1_000, maxEntries: 2 });
    const load = vi.fn((value: string) => Promise.resolve(value));

    await cache.get('a', () => load('a'));
    await cache.get('b', () => load('b'));
    await cache.get('a', () => load('a')); // touches a, so b is now the oldest
    await cache.get('c', () => load('c'));
    expect(load).toHaveBeenCalledTimes(3);

    await cache.get('a', () => load('a'));
    expect(load).toHaveBeenCalledTimes(3);
    await cache.get('b', () => load('b'));
    expect(load).toHaveBeenCalledTimes(4);
  });
});
