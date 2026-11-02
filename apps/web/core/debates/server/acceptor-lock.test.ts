import { describe, expect, it, vi } from 'vitest';

import { type AcceptorLockStore, withAcceptorLock } from './acceptor-lock';

function memoryStore(): AcceptorLockStore & { holder: string | null } {
  const store = {
    holder: null as string | null,
    acquire: vi.fn(async (token: string) => {
      if (store.holder !== null) return false;
      store.holder = token;
      return true;
    }),
    release: vi.fn(async (token: string) => {
      if (store.holder === token) store.holder = null;
    }),
  };
  return store;
}

describe('withAcceptorLock', () => {
  it('runs while holding the lock, and releases it after', async () => {
    const store = memoryStore();
    const outcome = await withAcceptorLock(
      async () => {
        expect(store.holder).not.toBeNull();
        return 'done';
      },
      { ttlMs: 1000, store }
    );
    expect(outcome).toEqual({ ran: true, value: 'done' });
    expect(store.holder).toBeNull();
  });

  it('releases the lock when the run throws', async () => {
    const store = memoryStore();
    await expect(
      withAcceptorLock(
        async () => {
          throw new Error('boom');
        },
        { ttlMs: 1000, store }
      )
    ).rejects.toThrow('boom');
    expect(store.holder).toBeNull();
  });

  it('does not run while another run holds the lock', async () => {
    const store = memoryStore();
    store.holder = 'someone-else';
    const fn = vi.fn(async () => 'done');
    expect(await withAcceptorLock(fn, { ttlMs: 1000, store })).toEqual({ ran: false });
    expect(fn).not.toHaveBeenCalled();
    // And never releases a lock it does not hold.
    expect(store.holder).toBe('someone-else');
  });

  it('waits for the holder to finish when asked to', async () => {
    const store = memoryStore();
    store.holder = 'someone-else';
    let polls = 0;
    const sleep = vi.fn(async () => {
      polls += 1;
      if (polls === 2) store.holder = null;
    });
    const outcome = await withAcceptorLock(async () => 'done', { ttlMs: 1000, waitMs: 60_000, store, sleep });
    expect(outcome).toEqual({ ran: true, value: 'done' });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('runs without the lock when no store is configured, or the store fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await withAcceptorLock(async () => 1, { ttlMs: 1000, store: null })).toEqual({ ran: true, value: 1 });
    const failing: AcceptorLockStore = {
      acquire: async () => {
        throw new Error('upstash down');
      },
      release: async () => {},
    };
    expect(await withAcceptorLock(async () => 2, { ttlMs: 1000, store: failing })).toEqual({ ran: true, value: 2 });
    warn.mockRestore();
  });
});
