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
vi.mock('./api', () => ({
  geoNotificationsApiUrl: () => 'https://n.example',
  sendSeenPing: (...args: unknown[]) => mocks.ping(...args),
}));

const { SeenPing } = await import('./seen-ping');

function returnToTab() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-25T18:00:00'));
  mocks.auth = { ready: true, authenticated: true };
  mocks.stored = 'stored-token';
  mocks.fresh = vi.fn(async () => 'fresh-token');
  mocks.ping = vi.fn(async () => 200);
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
    expect(mocks.ping).toHaveBeenCalledWith('https://n.example', 'stored-token', 'America/Los_Angeles');
    expect(mocks.fresh).not.toHaveBeenCalled();
  });

  it('pings again when the tab comes back on a new local day, not the same day', async () => {
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));

    vi.setSystemTime(new Date('2026-10-25T23:30:00'));
    returnToTab();
    await act(async () => undefined);
    expect(mocks.ping).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-10-26T08:00:00'));
    returnToTab();
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(2));
  });

  it('asks Privy for a fresh token when the stored one is refused', async () => {
    mocks.ping = vi.fn(async (_url: string, token: string) => (token === 'fresh-token' ? 200 : 401));
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledWith('https://n.example', 'fresh-token', 'America/Los_Angeles'));
  });

  it('tries again on the next return after a failed ping', async () => {
    mocks.ping = vi.fn(async () => {
      throw new TypeError('offline');
    });
    render(<SeenPing />);
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledTimes(1));

    mocks.ping = vi.fn(async () => 200);
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
    await waitFor(() => expect(mocks.ping).toHaveBeenCalledWith('https://n.example', 'fresh-token', 'America/Los_Angeles'));
  });
});
