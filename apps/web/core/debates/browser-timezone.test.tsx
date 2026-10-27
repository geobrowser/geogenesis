import { render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { ready: true, authenticated: true, accountKey: 'did:privy:1' as string | null },
  report: vi.fn(),
}));

vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({ ...mocks.auth, getPrivyIdentityToken: async () => 'tok' }),
}));
vi.mock('./api', () => ({
  reportBrowserTimezone: (...args: unknown[]) => mocks.report(...args),
}));

const { BrowserTimezoneReporter, browserTimezone } = await import('./browser-timezone');

beforeEach(() => {
  mocks.auth = { ready: true, authenticated: true, accountKey: 'did:privy:1' };
  mocks.report = vi.fn(async () => undefined);
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    () => ({ resolvedOptions: () => ({ timeZone: 'America/Los_Angeles' }) }) as Intl.DateTimeFormat
  );
});
afterEach(() => vi.restoreAllMocks());

describe('BrowserTimezoneReporter', () => {
  it("reports the browser's zone once for the signed-in account", () => {
    const { rerender } = render(<BrowserTimezoneReporter />);
    rerender(<BrowserTimezoneReporter />);

    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(mocks.report).toHaveBeenCalledWith(expect.any(Function), 'did:privy:1', 'America/Los_Angeles');
  });

  it('reports again when a different account signs in', () => {
    const { rerender } = render(<BrowserTimezoneReporter />);
    mocks.auth = { ...mocks.auth, accountKey: 'did:privy:2' };
    rerender(<BrowserTimezoneReporter />);

    expect(mocks.report).toHaveBeenCalledTimes(2);
    expect(mocks.report).toHaveBeenLastCalledWith(expect.any(Function), 'did:privy:2', 'America/Los_Angeles');
  });

  it('sends nothing while signed out', () => {
    mocks.auth = { ready: true, authenticated: false, accountKey: null };
    render(<BrowserTimezoneReporter />);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('swallows a failed report', async () => {
    mocks.report = vi.fn(async () => {
      throw new Error('geo-chat 404');
    });
    expect(() => render(<BrowserTimezoneReporter />)).not.toThrow();
    await Promise.resolve();
  });
});

describe('browserTimezone', () => {
  it('is null when the runtime reports no zone', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: '' }) }) as unknown as Intl.DateTimeFormat
    );
    expect(browserTimezone()).toBeNull();
  });
});
