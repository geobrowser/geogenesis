import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveWithin } from './resolve-within';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('resolveWithin', () => {
  it('passes a value through when the work settles in time', async () => {
    await expect(resolveWithin(() => Promise.resolve('done'), 1000, 'fallback')).resolves.toBe('done');
  });

  it('falls back when the work never settles', async () => {
    // The case that matters, and the one a `.catch()` does nothing about: `core/io/subgraph/graphql`
    // sets no timeout of its own, so a request against a wedged upstream hangs forever. Nothing
    // rejects, so the catch never runs and every `await` behind it hangs too.
    const result = resolveWithin(() => new Promise<string>(() => {}), 1000, 'fallback');

    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe('fallback');
  });

  it('aborts the work it gave up on rather than abandoning it', async () => {
    // Without this a timed-out request keeps its socket and its retries, so during an outage every
    // page view leaves another one alive — a stalled render becoming accumulating in-flight work.
    let seen: AbortSignal | undefined;
    const result = resolveWithin(
      signal => {
        seen = signal;
        return new Promise<string>(() => {});
      },
      1000,
      'fallback'
    );

    expect(seen?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('fallback');

    expect(seen?.aborted).toBe(true);
  });

  it('reports the deadline as a fallback, not as a failure', async () => {
    // A fetcher that honours the signal rejects when aborted. That rejection is this helper's own
    // doing, so it must not reach the caller — otherwise the error tracker fills up during exactly
    // the outage the deadline exists to survive.
    const result = resolveWithin(
      signal =>
        new Promise<string>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
      1000,
      'fallback'
    );

    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe('fallback');
  });

  it('still rejects when the work fails for its own reasons', async () => {
    // Bounding is not swallowing: a caller that wants to report a real failure still can.
    await expect(resolveWithin(() => Promise.reject(new Error('upstream')), 1000, 'fallback')).rejects.toThrow(
      'upstream'
    );
  });

  it('does not raise an unhandled rejection when the work fails after the deadline', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    let fail: (error: Error) => void = () => {};
    const result = resolveWithin(
      () =>
        new Promise<string>((_, reject) => {
          fail = reject;
        }),
      1000,
      'fallback'
    );

    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('fallback');

    // The request nobody is waiting on any more finally gives up. That must not take a server down,
    // which is why the helper subscribes a no-op catch of its own.
    fail(new Error('too late'));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });

  it('clears its timer once the work settles', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');

    await resolveWithin(() => Promise.resolve('done'), 60_000, 'fallback');

    // Otherwise a long deadline keeps a timer alive well past the request it was guarding.
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
