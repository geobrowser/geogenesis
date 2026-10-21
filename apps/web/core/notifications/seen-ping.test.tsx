import { act, cleanup, render, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true },
  stored: 'stored-token' as string | null,
  fresh: vi.fn(),
  ping: vi.fn(),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ...mocks.auth, getAccessToken: () => mocks.fresh() }),
}));
vi.mock('~/core/wallet/privy-session', () => ({
  storedPrivyAccessToken: () => mocks.stored,
}));
vi.mock('~/core/debates/browser-timezone', () => ({
  browserTimezone: () => 'America/Los_Angeles',
}));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  geoNotificationsApiUrl: () => 'https://n.example',
  sendSeenPing: (...args: unknown[]) => mocks.ping(...args),
}));

const { SEEN_REQUEST_TIMEOUT_MS, SeenPing } = await import('./seen-ping');
const { NotificationsRequestError } = await import('./api');

function returnToTab() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // Offsets are Los Angeles (the mocked browser zone), so the day boundaries don't depend on the runner's zone.
  vi.setSystemTime(new Date('2026-10-25T18:00:00-07:00'));
  mocks.auth = { ready: true, authenticated: true };
  mocks.stored = 'stored-token';
  mocks.fresh = vi.fn(async () => 'fresh-token');
  mocks.ping = vi.fn(async () => ({ local_date: '2026-10-25', new_day: true }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SeenPing', () => {
  it('pings on page load with the stored token and the browser zone, without waiting for Privy', async () => {
    mocks.auth = { ready: false, authenticated: false };
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));
    expect(mocks.ping).toHaveBeenCalledWith(
      'https://n.example',
      'stored-token',
      'America/Los_Angeles',
      expect.any(AbortSignal)
    );
    expect(mocks.fresh).not.toHaveBeenCalled();
  });

  it('pings again when the tab comes back on a new local day, not the same day', async () => {
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date('2026-10-25T23:30:00-07:00'));
    returnToTab();
    await act(async () => undefined);
    expect(mocks.ping).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-26T08:00:00-07:00'));
    returnToTab();
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(2));
  });

  it('pings again on a new UTC day within the same local day, since visits are counted per UTC day', async () => {
    // 8am in Los Angeles is 15:00 UTC on the 25th; 6pm is already 01:00 UTC on the 26th.
    vi.setSystemTime(new Date('2026-10-25T08:00:00-07:00'));
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date('2026-10-25T18:00:00-07:00'));
    returnToTab();
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(2));

    // Same local day and same UTC day: nothing.
    vi.setSystemTime(new Date('2026-10-25T20:00:00-07:00'));
    returnToTab();
    await act(async () => undefined);
    expect(mocks.ping).toHaveBeenCalledTimes(2);
  });

  it('asks Privy for a fresh token when the stored one is refused', async () => {
    mocks.ping = vi.fn(async (_url: string, token: string) => {
      if (token !== 'fresh-token') throw new NotificationsRequestError('invalid token', 401);
      return { local_date: '2026-10-25', new_day: true };
    });
    render(<SeenPing />);
    await waitFor(() =>
      expect(mocks.ping).toHaveBeenCalledWith(
        'https://n.example',
        'fresh-token',
        'America/Los_Angeles',
        expect.any(AbortSignal)
      )
    );
  });

  it('tries again on the next return after a failed ping', async () => {
    mocks.ping = vi.fn(async () => {
      throw new TypeError('offline');
    });
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));

    mocks.ping = vi.fn(async () => ({ local_date: '2026-10-25', new_day: true }));
    returnToTab();
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));
  });

  it('does not ask Privy when the service is down rather than refusing the token', async () => {
    mocks.ping = vi.fn(async () => {
      throw new NotificationsRequestError('geo-notifications 503', 503);
    });
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));
    await act(async () => undefined);
    expect(mocks.fresh).not.toHaveBeenCalled();
  });

  it('gives up on a ping that hangs, so the next return can retry', async () => {
    let signal: AbortSignal | undefined;
    mocks.ping = vi.fn((_url: string, _token: string, _zone: string, s?: AbortSignal) => {
      signal = s;
      return new Promise(() => undefined);
    });
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));

    await act(async () => {
      vi.advanceTimersByTime(SEEN_REQUEST_TIMEOUT_MS);
    });
    expect(signal?.aborted).toBe(true);

    mocks.ping = vi.fn(async () => ({ local_date: '2026-10-25', new_day: true }));
    returnToTab();
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));
  });

  it('does nothing for a signed-out reader', async () => {
    mocks.stored = null;
    mocks.auth = { ready: true, authenticated: false };
    render(<SeenPing />);
    returnToTab();
    await act(async () => undefined);
    expect(mocks.ping).not.toHaveBeenCalled();
    expect(mocks.fresh).not.toHaveBeenCalled();
  });

  it('pings when someone signs in on the page', async () => {
    mocks.stored = null;
    mocks.auth = { ready: true, authenticated: false };
    const { rerender } = render(<SeenPing />);
    mocks.auth = { ready: true, authenticated: true };
    rerender(<SeenPing />);
    await waitFor(() =>
      expect(mocks.ping).toHaveBeenCalledWith(
        'https://n.example',
        'fresh-token',
        'America/Los_Angeles',
        expect.any(AbortSignal)
      )
    );
  });
});
