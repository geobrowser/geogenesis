import { afterEach, describe, expect, it, vi } from 'vitest';

import { timeoutSignal } from './timeout-signal';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Runs `body` with `AbortSignal.timeout` removed, as on Safari before 16. */
function withoutStaticTimeout<T>(body: () => T): T {
  const original = AbortSignal.timeout;
  // @ts-expect-error -- deleting a standard static is the whole point of the test.
  delete AbortSignal.timeout;
  try {
    return body();
  } finally {
    AbortSignal.timeout = original;
  }
}

describe('timeoutSignal', () => {
  it('uses the native signal where it exists', () => {
    expect(timeoutSignal(1_000)).toBeInstanceOf(AbortSignal);
  });

  // The failure this exists to prevent: called unconditionally, the static throws a TypeError while
  // fetch options are being built, which the caller's catch reports as the request having failed.
  it('does not throw on a browser without the static method', () => {
    withoutStaticTimeout(() => {
      expect(() => timeoutSignal(1_000)).not.toThrow();
      expect(timeoutSignal(1_000)).toBeInstanceOf(AbortSignal);
    });
  });

  it('still aborts on the fallback path, after the time it was given', () => {
    vi.useFakeTimers();
    withoutStaticTimeout(() => {
      const signal = timeoutSignal(5_000);
      expect(signal.aborted).toBe(false);

      vi.advanceTimersByTime(4_999);
      expect(signal.aborted).toBe(false);

      vi.advanceTimersByTime(1);
      expect(signal.aborted).toBe(true);
    });
  });
});
