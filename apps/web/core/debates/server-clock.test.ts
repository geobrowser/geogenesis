import { describe, expect, it, vi } from 'vitest';

import { createLocalServerClock, selectBestServerTimeSample, synchronizeServerClock } from './server-clock';

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
});
