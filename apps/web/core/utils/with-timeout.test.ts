import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withTimeout } from './with-timeout';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('passes a value through when the work settles in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000, 'fallback')).resolves.toBe('done');
  });

  it('falls back when the work never settles', async () => {
    // The case that matters: `core/io/subgraph/graphql` sets no timeout and passes no signal, so a
    // request against a wedged upstream hangs forever and every `await` behind it hangs with it.
    // A `.catch()` on that promise never runs, because nothing ever rejects.
    const result = withTimeout(new Promise<string>(() => {}), 1000, 'fallback');

    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe('fallback');
  });

  it('still rejects when the work rejects before the deadline', async () => {
    // Bounding is not swallowing: a caller that wants to report a real failure still can.
    await expect(withTimeout(Promise.reject(new Error('upstream')), 1000, 'fallback')).rejects.toThrow('upstream');
  });

  it('does not raise an unhandled rejection when the work fails after the deadline', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    let fail: (error: Error) => void = () => {};
    const late = new Promise<string>((_, reject) => {
      fail = reject;
    });
    const result = withTimeout(late, 1000, 'fallback');

    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBe('fallback');

    // The request nobody is waiting on any more finally gives up. That must not take the server
    // down, which is why the helper subscribes a no-op catch of its own.
    fail(new Error('too late'));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(unhandled).not.toHaveBeenCalled();
    process.off('unhandledRejection', unhandled);
  });

  it('clears its timer once the work settles', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');

    await withTimeout(Promise.resolve('done'), 60_000, 'fallback');

    // Otherwise a long deadline keeps a timer alive well past the request it was guarding.
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
