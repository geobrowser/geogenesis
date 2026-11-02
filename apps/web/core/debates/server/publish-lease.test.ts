import { describe, expect, it, vi } from 'vitest';

import type { AcceptorLockStore } from './acceptor-lock';
import { DEBATE_PUBLISH_LEASE_MS, debatePublishLeaseKey, withDebatePublishLease } from './publish-lease';

/** One key's worth of Upstash: SET NX PX and compare-and-delete, against a clock the test moves. */
function memoryStore(clock: { now: number }): AcceptorLockStore & { held: () => string | null } {
  let value: string | null = null;
  let expiresAt = 0;
  const live = () => (value !== null && clock.now < expiresAt ? value : null);
  return {
    held: live,
    acquire: vi.fn(async (token: string, ttlMs: number) => {
      if (live() !== null) return false;
      value = token;
      expiresAt = clock.now + ttlMs;
      return true;
    }),
    release: vi.fn(async (token: string) => {
      if (live() === token) value = null;
    }),
  };
}

const DEBATE = '019f89dc-2124-7991-93da-afd5bc4ffa0a';

describe('withDebatePublishLease', () => {
  it('runs the publish and keeps the lease once something was submitted', async () => {
    const clock = { now: 0 };
    const store = memoryStore(clock);
    const outcome = await withDebatePublishLease(
      DEBATE,
      async markSubmitted => {
        markSubmitted();
        return 'published';
      },
      { store }
    );

    expect(outcome).toEqual({ ran: true, value: 'published' });
    expect(store.held()).not.toBeNull();
  });

  // The 2026-10-05 failure: every tick during an indexer stall published the same debate again.
  it('does not publish again while the lease is held, however many ticks the indexer lags', async () => {
    const clock = { now: 0 };
    const store = memoryStore(clock);
    const publish = vi.fn(async (markSubmitted: () => void) => {
      markSubmitted();
      return 'published';
    });

    await withDebatePublishLease(DEBATE, publish, { store });
    for (let tick = 1; tick <= 17; tick++) {
      clock.now = tick * 5 * 60 * 1000;
      await expect(withDebatePublishLease(DEBATE, publish, { store })).resolves.toEqual({ ran: false });
    }
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('publishes again once the lease expires, so a publish that never landed recovers', async () => {
    const clock = { now: 0 };
    const store = memoryStore(clock);
    const publish = vi.fn(async (markSubmitted: () => void) => {
      markSubmitted();
      return 'published';
    });

    await withDebatePublishLease(DEBATE, publish, { store });
    clock.now = DEBATE_PUBLISH_LEASE_MS - 1;
    await expect(withDebatePublishLease(DEBATE, publish, { store })).resolves.toEqual({ ran: false });
    clock.now = DEBATE_PUBLISH_LEASE_MS;
    await expect(withDebatePublishLease(DEBATE, publish, { store })).resolves.toEqual({
      ran: true,
      value: 'published',
    });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('releases the lease when the run ends without submitting, so the next tick tries again', async () => {
    const clock = { now: 0 };
    const store = memoryStore(clock);

    await withDebatePublishLease(DEBATE, async () => 'not_editor', { store });
    expect(store.held()).toBeNull();

    await expect(
      withDebatePublishLease(
        DEBATE,
        async () => {
          throw new Error('media is not ready');
        },
        { store }
      )
    ).rejects.toThrow('media is not ready');
    expect(store.held()).toBeNull();
  });

  it('keeps the lease when the run throws after submitting', async () => {
    const clock = { now: 0 };
    const store = memoryStore(clock);

    await expect(
      withDebatePublishLease(
        DEBATE,
        async markSubmitted => {
          markSubmitted();
          throw new Error('receipt timed out');
        },
        { store }
      )
    ).rejects.toThrow('receipt timed out');
    expect(store.held()).not.toBeNull();
  });

  it('publishes unguarded without a store, or when the store does not answer', async () => {
    await expect(withDebatePublishLease(DEBATE, async () => 'published', { store: null })).resolves.toEqual({
      ran: true,
      value: 'published',
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: AcceptorLockStore = {
      acquire: async () => {
        throw new Error('upstash down');
      },
      release: async () => {},
    };
    await expect(withDebatePublishLease(DEBATE, async () => 'published', { store: broken })).resolves.toEqual({
      ran: true,
      value: 'published',
    });
    warn.mockRestore();
  });

  it('keys the lease on the debate, dashed or not', () => {
    expect(debatePublishLeaseKey(DEBATE)).toBe(debatePublishLeaseKey(DEBATE.replace(/-/g, '').toUpperCase()));
    expect(debatePublishLeaseKey(DEBATE)).not.toBe(debatePublishLeaseKey('019f89dc-2124-7991-93da-afd5bc4ffa0b'));
  });
});
