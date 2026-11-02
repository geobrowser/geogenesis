import { describe, expect, it, vi } from 'vitest';

import {
  createLocalServerClock,
  keepServerClockSynchronized,
  selectBestServerTimeSample,
  synchronizeServerClock,
} from './server-clock';

describe('debate server clock', () => {
  it('selects the lowest round-trip sample and advances from a monotonic anchor', () => {
    let monotonicNow = 220;
    const clock = selectBestServerTimeSample(
      [
        { serverTimeMs: 10_000, startedAt: 100, endedAt: 180 },
        { serverTimeMs: 20_000, startedAt: 200, endedAt: 220 },
        { serverTimeMs: 30_000, startedAt: 300, endedAt: 350 },
      ],
      () => monotonicNow
    );

    expect(clock.roundTripMs).toBe(20);
    expect(clock.now()).toBe(20_010);
    monotonicNow = 1_220;
    expect(clock.now()).toBe(21_010);
  });

  it('starts three clock samples concurrently', async () => {
    const pending: Array<(value: { server_time_ms: number }) => void> = [];
    const fetchServerTime = vi.fn(
      () =>
        new Promise<{ server_time_ms: number }>(resolve => {
          pending.push(resolve);
        })
    );
    let monotonicNow = 0;
    const synchronization = synchronizeServerClock(fetchServerTime, () => monotonicNow++);

    expect(fetchServerTime).toHaveBeenCalledTimes(3);
    pending.forEach((resolve, index) => resolve({ server_time_ms: 10_000 + index }));

    await expect(synchronization).resolves.toMatchObject({ roundTripMs: expect.any(Number) });
  });

  it('falls back to the device clock when synchronization is unavailable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(42_000);

    expect(createLocalServerClock().now()).toBe(42_000);
  });

  it('finishes synchronization when time requests hang', async () => {
    vi.useFakeTimers();
    const synchronization = synchronizeServerClock(
      () => new Promise(() => undefined),
      () => 0,
      50
    );
    const rejection = expect(synchronization).rejects.toThrow('Could not synchronize the debate clock.');

    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    vi.useRealTimers();
  });

  describe('keepServerClockSynchronized (GEO-3407)', () => {
    const flush = () => vi.advanceTimersByTimeAsync(0);

    it('settles on the first attempt, then retries a failed sync until one succeeds', async () => {
      vi.useFakeTimers();
      try {
        const fetchServerTime = vi.fn().mockRejectedValue(new Error('offline'));
        const onSynchronized = vi.fn();
        const onFirstAttemptSettled = vi.fn();
        keepServerClockSynchronized(fetchServerTime, {
          isCurrent: () => true,
          onSynchronized,
          onFirstAttemptSettled,
          retryDelaysMs: [1_000, 2_000],
        });
        await flush();
        expect(onFirstAttemptSettled).toHaveBeenCalledOnce();
        expect(onSynchronized).not.toHaveBeenCalled();
        expect(fetchServerTime).toHaveBeenCalledTimes(3);

        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchServerTime).toHaveBeenCalledTimes(6);

        fetchServerTime.mockResolvedValue({ server_time_ms: 5_000 });
        await vi.advanceTimersByTimeAsync(2_000);
        expect(onSynchronized).toHaveBeenCalledOnce();
        expect(onFirstAttemptSettled).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports a sync that never succeeds, and stops retrying once the room has moved on', async () => {
      vi.useFakeTimers();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      try {
        const fetchServerTime = vi.fn().mockRejectedValue(new Error('offline'));
        let current = true;
        const options = { onSynchronized: vi.fn(), onFirstAttemptSettled: vi.fn(), retryDelaysMs: [1_000] };
        keepServerClockSynchronized(fetchServerTime, { ...options, isCurrent: () => true });
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchServerTime).toHaveBeenCalledTimes(6);
        expect(warn).toHaveBeenCalledOnce();

        fetchServerTime.mockClear();
        keepServerClockSynchronized(fetchServerTime, { ...options, isCurrent: () => current });
        await flush();
        current = false;
        await vi.advanceTimersByTimeAsync(1_000);
        expect(fetchServerTime).toHaveBeenCalledTimes(3);
      } finally {
        warn.mockRestore();
        vi.useRealTimers();
      }
    });
  });
});
