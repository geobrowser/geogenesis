import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueuedSendTimeoutError, enqueueFor } from './smart-account-send-queue';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Unique address per test — the queue map is module-level state shared across tests.
let addressCounter = 0;
const nextAddress = () => `0xeoa${addressCounter++}`;

describe('smart-account send queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serializes sends for the same address across separate enqueueFor calls', async () => {
    const address = nextAddress();
    const first = deferred<string>();
    const started: string[] = [];

    const p1 = enqueueFor(address, () => {
      started.push('first');
      return first.promise;
    });
    // Simulates a second wrapped-client instance (react-query refetch): a different
    // call site, same EOA, must still queue behind the in-flight send.
    const p2 = enqueueFor(address, async () => {
      started.push('second');
      return 'second-result';
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(['first']);

    first.resolve('first-result');
    await expect(p1).resolves.toBe('first-result');
    await expect(p2).resolves.toBe('second-result');
    expect(started).toEqual(['first', 'second']);
  });

  it('does not serialize sends for different addresses', async () => {
    const blocker = deferred<string>();
    const started: string[] = [];

    void enqueueFor(nextAddress(), () => {
      started.push('blocked');
      return blocker.promise;
    });
    const other = enqueueFor(nextAddress(), async () => {
      started.push('other');
      return 'done';
    });

    await expect(other).resolves.toBe('done');
    expect(started).toEqual(['blocked', 'other']);
    blocker.resolve('unblock');
  });

  it('a failed send does not block the next one', async () => {
    const address = nextAddress();

    const failing = enqueueFor(address, () => Promise.reject(new Error('boom')));
    const next = enqueueFor(address, async () => 'after-failure');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('after-failure');
  });

  it('never runs a task that exceeded maxQueueWaitMs, and rejects with the retry-safe error', async () => {
    const address = nextAddress();
    const slow = deferred<string>();
    const guardedTask = vi.fn(async () => 'should-never-run');

    const holding = enqueueFor(address, () => slow.promise);
    const abandoned = enqueueFor(address, guardedTask, { maxQueueWaitMs: 45_000 });
    // Attach the rejection expectation before the turn arrives so the rejection is
    // never unhandled.
    const abandonedAssertion = expect(abandoned).rejects.toBeInstanceOf(QueuedSendTimeoutError);

    // The earlier send holds the queue past the guard window (e.g. a 90s receipt wait).
    await vi.advanceTimersByTimeAsync(46_000);
    slow.resolve('finally');

    await abandonedAssertion;
    // The invariant useSmartAccountTransaction's timeout relies on: an abandoned send
    // must never submit later, otherwise a user retry double-submits.
    expect(guardedTask).not.toHaveBeenCalled();

    // And the queue keeps draining afterwards.
    await expect(enqueueFor(address, async () => 'still-works')).resolves.toBe('still-works');
  });

  it('runs the task when its turn arrives within maxQueueWaitMs', async () => {
    const address = nextAddress();
    const slow = deferred<string>();

    const holding = enqueueFor(address, () => slow.promise);
    const queued = enqueueFor(address, async () => 'ran', { maxQueueWaitMs: 45_000 });

    await vi.advanceTimersByTimeAsync(30_000);
    slow.resolve('done');

    await expect(holding).resolves.toBe('done');
    await expect(queued).resolves.toBe('ran');
  });
});
