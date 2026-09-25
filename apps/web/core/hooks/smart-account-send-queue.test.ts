import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  QueuedSendTimeoutError,
  enqueueFor,
  queueDepthFor,
  waitForQueuedSends,
  withSubmissionRetry,
} from './smart-account-send-queue';

const { reportError, reportEvent } = vi.hoisted(() => ({ reportError: vi.fn(), reportEvent: vi.fn() }));
vi.mock('~/core/telemetry/logger', () => ({ reportError, reportEvent }));

const deferred = <T>() => {
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
    reportError.mockClear();
    reportEvent.mockClear();
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

    enqueueFor(address, () => slow.promise);
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

  describe('queue timeout telemetry', () => {
    it('reports an abandoned send with the wait and the depth it queued behind', async () => {
      const address = nextAddress();
      const slow = deferred<string>();

      void enqueueFor(address, () => slow.promise);
      const abandoned = enqueueFor(address, async () => 'never', { maxQueueWaitMs: 120_000 });
      const assertion = expect(abandoned).rejects.toMatchObject({ queueDepth: 1 });

      await vi.advanceTimersByTimeAsync(121_000);
      slow.resolve('done');
      await assertion;

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(expect.any(QueuedSendTimeoutError), {
        tags: { area: 'smart-account', phase: 'queue', outcome: 'queue-timeout' },
        contexts: { queue: { waitedMs: expect.any(Number), queueDepth: 1, maxQueueWaitMs: 120_000 } },
      });
      const [error] = reportError.mock.calls[0];
      expect((error as QueuedSendTimeoutError).waitedMs).toBeGreaterThan(120_000);
    });

    it('returns the queue depth to zero after successes and failures', async () => {
      const address = nextAddress();
      const first = deferred<string>();

      const p1 = enqueueFor(address, () => first.promise);
      const p2 = enqueueFor(address, () => Promise.reject(new Error('boom')));
      const p3 = enqueueFor(address, async () => 'ok');
      expect(queueDepthFor(address)).toBe(3);

      first.resolve('done');
      await p1;
      await expect(p2).rejects.toThrow('boom');
      await p3;
      expect(queueDepthFor(address)).toBe(0);
    });

    it('cascades: once the head holds past the budget, every send behind it is abandoned unrun', async () => {
      const address = nextAddress();
      const head = deferred<string>();
      const behind = [vi.fn(async () => 'a'), vi.fn(async () => 'b'), vi.fn(async () => 'c')];

      void enqueueFor(address, () => head.promise);
      const queued = behind.map(task => enqueueFor(address, task, { maxQueueWaitMs: 120_000 }));
      const assertions = queued.map(p => expect(p).rejects.toBeInstanceOf(QueuedSendTimeoutError));

      await vi.advanceTimersByTimeAsync(121_000);
      head.resolve('done');
      await Promise.all(assertions);

      for (const task of behind) expect(task).not.toHaveBeenCalled();
      expect(reportError).toHaveBeenCalledTimes(3);
      expect(queueDepthFor(address)).toBe(0);
    });

    it('warns when a send starts past half its budget, at most once a minute per address', async () => {
      const address = nextAddress();
      const slowStarts = async (headHoldMs: number, queued: number) => {
        const head = deferred<string>();
        void enqueueFor(address, () => head.promise);
        const late = Array.from({ length: queued }, () =>
          enqueueFor(address, async () => 'ran', { maxQueueWaitMs: 120_000 })
        );
        await vi.advanceTimersByTimeAsync(headHoldMs);
        head.resolve('done');
        await Promise.all(late);
      };

      await slowStarts(30_000, 1);
      expect(reportEvent).not.toHaveBeenCalled();

      // Two late starts in the same instant: one warning.
      await slowStarts(61_000, 2);
      expect(reportEvent).toHaveBeenCalledTimes(1);
      expect(reportEvent).toHaveBeenCalledWith({
        name: 'smart-account.queue-wait-high',
        level: 'warning',
        tags: { area: 'smart-account', phase: 'queue', outcome: 'queue-wait-high' },
        extra: { waitedMs: expect.any(Number), queueDepth: 1, maxQueueWaitMs: 120_000 },
      });

      // Past the throttle window: warns again.
      await slowStarts(61_000, 1);
      expect(reportEvent).toHaveBeenCalledTimes(2);
    });

    it('does not warn for unbounded sends', async () => {
      const address = nextAddress();
      const hold = deferred<string>();
      void enqueueFor(address, () => hold.promise);
      const late = enqueueFor(address, async () => 'ran');
      await vi.advanceTimersByTimeAsync(200_000);
      hold.resolve('done');
      await late;
      expect(reportEvent).not.toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
    });

    it('waitForQueuedSends resolves once queued sends settle, failures included', async () => {
      const address = nextAddress();
      const hold = deferred<string>();
      const failing = enqueueFor(address, () => hold.promise);
      void failing.catch(() => undefined);

      let idle = false;
      void waitForQueuedSends().then(() => {
        idle = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(idle).toBe(false);

      hold.reject(new Error('boom'));
      await vi.advanceTimersByTimeAsync(0);
      expect(idle).toBe(true);
    });
  });

  describe('withSubmissionRetry', () => {
    // Mirrors the real shape: viem throws UserOperationExecutionError with an
    // InvalidAccountNonceError cause, exposed via BaseError's .walk(predicate).
    const nonceError = () => {
      const err = new Error('Invalid Smart Account nonce used for User Operation.');
      (err as unknown as { walk: (fn: (e: unknown) => boolean) => unknown }).walk = fn => {
        const cause = new Error('Invalid Smart Account nonce used for User Operation.');
        cause.name = 'InvalidAccountNonceError';
        return fn(cause) ? cause : undefined;
      };
      return err;
    };

    it('retries a nonce-rejected send and succeeds once the nonce is fresh', async () => {
      let attempts = 0;
      const task = vi.fn(async () => {
        attempts++;
        if (attempts < 2) throw nonceError();
        return 'ok';
      });

      const result = withSubmissionRetry(task);
      await vi.advanceTimersByTimeAsync(500);
      await expect(result).resolves.toBe('ok');
      expect(task).toHaveBeenCalledTimes(2);
    });

    it('gives up after the retry budget and surfaces the nonce error', async () => {
      const task = vi.fn(async () => {
        throw nonceError();
      });

      const result = withSubmissionRetry(task);
      const assertion = expect(result).rejects.toThrow('Invalid Smart Account nonce');
      // 500 + 1000 + 2000 + 4000 of backoff across five attempts.
      await vi.advanceTimersByTimeAsync(7_500);
      await assertion;
      expect(task).toHaveBeenCalledTimes(5);
    });

    it('reports to telemetry only once the budget is exhausted', async () => {
      const recovering = vi.fn(async () => {
        if (recovering.mock.calls.length < 2) throw nonceError();
        return 'ok';
      });
      const recovered = withSubmissionRetry(recovering);
      await vi.advanceTimersByTimeAsync(500);
      await expect(recovered).resolves.toBe('ok');
      // A retry that succeeded is not an incident — reporting it would drown the signal.
      expect(reportError).not.toHaveBeenCalled();

      const failing = vi.fn(async () => {
        throw nonceError();
      });
      const result = withSubmissionRetry(failing);
      const assertion = expect(result).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(7_500);
      await assertion;
      expect(reportError).toHaveBeenCalledTimes(1);
    });

    // GEO-2810: this class reached two users as a raw dialog because the predicate
    // matched only InvalidAccountNonceError.
    it('retries an EntryPoint simulateValidation rejection', async () => {
      const rejection = () => {
        const err = new Error("User Operation rejected by EntryPoint's `simulateValidation`");
        (err as unknown as { walk: (fn: (e: unknown) => boolean) => unknown }).walk = fn => {
          const cause = new Error("User Operation rejected by EntryPoint's `simulateValidation`");
          cause.name = 'UserOperationRejectedByEntryPointError';
          return fn(cause) ? cause : undefined;
        };
        return err;
      };

      const task = vi.fn(async () => {
        if (task.mock.calls.length < 2) throw rejection();
        return 'ok';
      });

      const result = withSubmissionRetry(task);
      await vi.advanceTimersByTimeAsync(500);
      await expect(result).resolves.toBe('ok');
      expect(task).toHaveBeenCalledTimes(2);
    });

    it('does not retry errors outside the validation phase', async () => {
      const task = vi.fn(async () => {
        throw new Error('boom');
      });

      await expect(withSubmissionRetry(task)).rejects.toThrow('boom');
      expect(task).toHaveBeenCalledTimes(1);
    });

    // The safety property the whole retry rests on: anything that can only happen after
    // a hash exists must never re-run the send, or a retry duplicates an on-chain op.
    it('does not retry a receipt-phase failure', async () => {
      const receiptTimeout = vi.fn(async () => {
        throw new Error('UserOperation 0xabc was submitted but its receipt did not arrive within 90s.');
      });

      await expect(withSubmissionRetry(receiptTimeout)).rejects.toThrow('receipt did not arrive');
      expect(receiptTimeout).toHaveBeenCalledTimes(1);
    });
  });
});
