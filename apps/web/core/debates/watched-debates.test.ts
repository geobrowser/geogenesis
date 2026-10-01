import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { markDebateWatched, readWatchedDebateIds, useWatchedDebateIds } from './watched-debates';

// Node's own webstorage can shadow jsdom's with an object that has no methods, so the suite installs
// a plain Map-backed Storage rather than depending on which one it gets.
function installStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  return storage;
}

describe('watched debates', () => {
  beforeEach(() => {
    installStorage();
  });

  it('remembers a watched debate in graph spelling, whichever spelling it was marked in', () => {
    markDebateWatched('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA');

    expect(readWatchedDebateIds()).toEqual(new Set(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']));
  });

  it('keeps one entry per debate however many times it was watched', () => {
    markDebateWatched('one');
    markDebateWatched('two');
    markDebateWatched('one');

    expect([...readWatchedDebateIds()]).toEqual(['two', 'one']);
  });

  it('forgets the oldest once it holds five hundred', () => {
    for (let index = 0; index < 501; index++) markDebateWatched(`debate${index}`);

    const ids = readWatchedDebateIds();
    expect(ids.size).toBe(500);
    expect(ids.has('debate0')).toBe(false);
    expect(ids.has('debate500')).toBe(true);
  });

  it('reads as nothing watched when storage holds something it did not write', () => {
    window.localStorage.setItem('geogenesis.debates.watched.v1', '{"not":"a list"}');
    expect(readWatchedDebateIds()).toEqual(new Set());

    window.localStorage.setItem('geogenesis.debates.watched.v1', 'not json');
    expect(readWatchedDebateIds()).toEqual(new Set());
  });

  it('does not throw when storage refuses the write', () => {
    const storage = installStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => markDebateWatched('one')).not.toThrow();
  });

  describe('useWatchedDebateIds', () => {
    it('updates when a debate is marked watched in this tab', () => {
      const { result } = renderHook(() => useWatchedDebateIds());
      expect(result.current.has('one')).toBe(false);

      act(() => markDebateWatched('one'));

      expect(result.current.has('one')).toBe(true);
    });

    it('updates when another tab marks one', () => {
      const { result } = renderHook(() => useWatchedDebateIds());

      // What another tab's write looks like here: the value changes underneath, then `storage` fires.
      window.localStorage.setItem('geogenesis.debates.watched.v1', JSON.stringify(['elsewhere']));
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'geogenesis.debates.watched.v1' }));
      });

      expect(result.current.has('elsewhere')).toBe(true);
    });

    it('hands back the same set until the list changes, so it can sit in a dependency list', () => {
      const { result, rerender } = renderHook(() => useWatchedDebateIds());
      const first = result.current;

      rerender();
      expect(result.current).toBe(first);
    });
  });
});
