import { afterEach, describe, expect, it, vi } from 'vitest';

import { waitForIndexedValue } from './wait-for-indexed-value';

afterEach(() => vi.useRealTimers());

describe('waitForIndexedValue', () => {
  it('stops immediately when canceled between probes', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchValue = vi.fn().mockResolvedValue(false);
    let settled = false;
    const waiting = waitForIndexedValue(fetchValue, true, 3, 1000, 100, controller.signal).then(result => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(0);

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(true);
    await expect(waiting).resolves.toBe(false);
    expect(fetchValue).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not sleep past its deadline after a slow probe', async () => {
    vi.useFakeTimers();
    const fetchValue = vi.fn(() => new Promise<boolean>(resolve => setTimeout(() => resolve(false), 180)));
    let settled = false;
    const waiting = waitForIndexedValue(fetchValue, true, 2, 50, 200).then(result => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(200);

    expect(settled).toBe(true);
    await expect(waiting).resolves.toBe(false);
    expect(fetchValue).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not accept a matching result from a canceled reconciliation', async () => {
    const controller = new AbortController();
    await expect(
      waitForIndexedValue(
        async () => {
          controller.abort();
          return true;
        },
        true,
        1,
        0,
        100,
        controller.signal
      )
    ).resolves.toBe(false);
  });
});
