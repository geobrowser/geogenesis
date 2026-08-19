import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatCountdown } from './use-request-countdown';

const mocks = vi.hoisted(() => ({
  serverTimeMs: 0,
}));

// The clock is synchronized against the server so a skewed client still counts down correctly.
vi.mock('../api', () => ({
  getServerTime: vi.fn(async () => ({ server_time_ms: mocks.serverTimeMs })),
}));

vi.mock('../server-clock', () => ({
  createLocalServerClock: () => ({ now: () => Date.now(), roundTripMs: null }),
  // The synchronized clock keeps advancing with (fake) time; only its offset comes from the server.
  synchronizeServerClock: vi.fn(async () => {
    const offsetMs = mocks.serverTimeMs - Date.now();
    return { now: () => Date.now() + offsetMs, roundTripMs: 0 };
  }),
}));

describe('formatCountdown', () => {
  it('rounds up to whole minutes above a minute', () => {
    expect(formatCountdown(25 * 60_000)).toBe('Expires in 25m');
    expect(formatCountdown(61_000)).toBe('Expires in 2m');
  });

  it('switches to seconds inside the final minute', () => {
    expect(formatCountdown(45_000)).toBe('Expires in 45s');
  });

  it('reports expiry at zero and below', () => {
    expect(formatCountdown(0)).toBe('Expired');
    expect(formatCountdown(-1_000)).toBe('Expired');
  });
});

describe('useRequestCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.serverTimeMs = new Date('2026-08-05T12:00:00.000Z').getTime();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('counts down against the server clock rather than the local one', async () => {
    // The local clock is an hour ahead; without correction the request would look long expired.
    vi.setSystemTime(new Date('2026-08-05T13:00:00.000Z'));
    const { useRequestCountdown } = await import('./use-request-countdown');

    const { result } = renderHook(() => useRequestCountdown('2026-08-05T12:25:00.000Z'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.expired).toBe(false);
    expect(result.current.label).toBe('Expires in 25m');
  });

  it('marks a request expired once the deadline passes', async () => {
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const { useRequestCountdown } = await import('./use-request-countdown');

    const { result } = renderHook(() => useRequestCountdown('2026-08-05T11:59:00.000Z'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.expired).toBe(true);
    expect(result.current.label).toBe('Expired');
  });

  it('stops ticking once the countdown expires while mounted', async () => {
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const { useRequestCountdown } = await import('./use-request-countdown');

    const { result } = renderHook(() => useRequestCountdown('2026-08-05T12:00:30.000Z'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });

    expect(result.current.expired).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never arms a timer for an unparseable expiry', async () => {
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const { useRequestCountdown } = await import('./use-request-countdown');

    const { result } = renderHook(() => useRequestCountdown('not-a-date'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.expired).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useUnexpiredRequests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.serverTimeMs = new Date('2026-08-05T12:00:00.000Z').getTime();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('drops each request the moment it expires and re-arms for the next one', async () => {
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const { useUnexpiredRequests } = await import('./use-request-countdown');

    const requests = [
      { id: 'soon', expires_at: '2026-08-05T12:00:10.000Z' },
      { id: 'later', expires_at: '2026-08-05T12:30:00.000Z' },
    ];
    const { result } = renderHook(() => useUnexpiredRequests(requests));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.map(request => request.id)).toEqual(['soon', 'later']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(result.current.map(request => request.id)).toEqual(['later']);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('filters requests that are already expired on mount and keeps unparseable ones', async () => {
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'));
    const { useUnexpiredRequests } = await import('./use-request-countdown');

    const requests = [
      { id: 'dead', expires_at: '2026-08-05T11:00:00.000Z' },
      { id: 'malformed', expires_at: 'not-a-date' },
    ];
    const { result } = renderHook(() => useUnexpiredRequests(requests));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.map(request => request.id)).toEqual(['malformed']);
    expect(vi.getTimerCount()).toBe(0);
  });
});
