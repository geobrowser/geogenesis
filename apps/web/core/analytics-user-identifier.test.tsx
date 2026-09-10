import { act, cleanup, render, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privyState: {
    getAccessToken: vi.fn(),
    ready: false,
    authenticated: false,
    user: null as null | { id: string; email?: { address: string } },
  },
  personalSpaceState: {
    personalSpaceId: null as string | null,
    isFetched: false,
  },
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => mocks.privyState,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => mocks.personalSpaceState,
}));

describe('AnalyticsUserIdentifier', () => {
  beforeEach(() => {
    mocks.privyState.getAccessToken.mockReset();
    mocks.privyState.ready = false;
    mocks.privyState.authenticated = false;
    mocks.privyState.user = null;
    mocks.personalSpaceState.personalSpaceId = null;
    mocks.personalSpaceState.isFetched = false;
    document.head.innerHTML = '';
    (window as any).lytics = {
      capture: vi.fn(),
      identifyUser: vi.fn(),
      sessionRestored: vi.fn(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    delete (window as any).lytics;
    delete (window as any).lyticsConfig;
    delete (window as any).GeoAnalyticsConfig;
    delete (window as any).geoAnalytics;
  });

  it('emits a restored session when Privy is already authenticated on readiness', async () => {
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:existing-user', email: { address: 'person@example.com' } };

    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');

    render(<AnalyticsUserIdentifier />);

    await waitFor(() => {
      expect((window as any).lytics.sessionRestored).toHaveBeenCalledTimes(1);
    });

    expect((window as any).lytics.sessionRestored.mock.calls[0][0]).toMatchObject({
      user_id: 'did:privy:existing-user',
      privy_user_id: 'did:privy:existing-user',
    });
    expect((window as any).lytics.sessionRestored.mock.calls[0][1]).toMatchObject({
      auth_flow: 'session_restore',
      is_new_user: false,
      was_already_authenticated: true,
    });
    expect((window as any).lytics.identifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'did:privy:existing-user',
        privy_user_id: 'did:privy:existing-user',
      }),
      {}
    );
  });

  it('does not emit restored session when the user authenticates after a ready logged-out state', async () => {
    mocks.privyState.ready = true;

    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    const view = render(<AnalyticsUserIdentifier />);

    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:manual-login' };
    view.rerender(<AnalyticsUserIdentifier />);

    await waitFor(() => {
      expect((window as any).lytics.identifyUser).toHaveBeenCalledTimes(1);
    });
    expect((window as any).lytics.sessionRestored).not.toHaveBeenCalled();
  });

  it('waits for the Privy user object before restoring an authenticated boot session', async () => {
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;

    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    const view = render(<AnalyticsUserIdentifier />);

    mocks.privyState.user = { id: 'did:privy:late-user' };
    view.rerender(<AnalyticsUserIdentifier />);

    await waitFor(() => {
      expect((window as any).lytics.sessionRestored).toHaveBeenCalledTimes(1);
    });
  });

  it('refreshes identity traits without duplicating restored-session events', async () => {
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:with-space' };

    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    const view = render(<AnalyticsUserIdentifier />);

    await waitFor(() => {
      expect((window as any).lytics.sessionRestored).toHaveBeenCalledTimes(1);
    });

    mocks.personalSpaceState.personalSpaceId = 'space-1';
    mocks.personalSpaceState.isFetched = true;
    view.rerender(<AnalyticsUserIdentifier />);

    await waitFor(() => {
      expect((window as any).lytics.identifyUser).toHaveBeenCalledTimes(2);
    });
    expect((window as any).lytics.sessionRestored).toHaveBeenCalledTimes(1);
    expect((window as any).lytics.identifyUser.mock.calls[1][0]).toMatchObject({
      personal_space_id: 'space-1',
      personal_space_registered: true,
    });
  });
  it('retries a transient binding failure with a fresh token and stops after success', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_GEO_ANALYTICS_VERIFIED_IDENTITY', 'true');
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:retry-user' };
    mocks.privyState.getAccessToken.mockResolvedValueOnce('token-1').mockResolvedValue('token-2');
    const bindIdentity = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    (window as any).lytics.bindIdentity = bindIdentity;
    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    await act(async () => {
      render(<AnalyticsUserIdentifier />);
    });
    expect(bindIdentity).toHaveBeenCalledWith('token-1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(bindIdentity).toHaveBeenCalledTimes(2);
    expect(bindIdentity).toHaveBeenLastCalledWith('token-2');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(bindIdentity).toHaveBeenCalledTimes(2);
  });

  it('bounds failed attempts and cancels retry work on logout', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_GEO_ANALYTICS_VERIFIED_IDENTITY', 'true');
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:retry-user' };
    mocks.privyState.getAccessToken.mockResolvedValue('token');
    const bindIdentity = vi.fn().mockResolvedValue(false);
    (window as any).lytics.bindIdentity = bindIdentity;
    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(<AnalyticsUserIdentifier />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(bindIdentity).toHaveBeenCalledTimes(4);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(bindIdentity).toHaveBeenCalledTimes(5);
    mocks.privyState.authenticated = false;
    mocks.privyState.user = null;
    view!.rerender(<AnalyticsUserIdentifier />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
      window.dispatchEvent(new Event('online'));
    });
    expect(bindIdentity).toHaveBeenCalledTimes(5);
  });

  it('discards an old account token that resolves after switching accounts', async () => {
    vi.stubEnv('NEXT_PUBLIC_GEO_ANALYTICS_VERIFIED_IDENTITY', 'true');
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:first' };
    let resolveOld!: (token: string) => void;
    mocks.privyState.getAccessToken
      .mockReturnValueOnce(
        new Promise<string>(resolve => {
          resolveOld = resolve;
        })
      )
      .mockResolvedValue('new-token');
    const bindIdentity = vi.fn().mockResolvedValue(true);
    (window as any).lytics.bindIdentity = bindIdentity;
    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    const view = render(<AnalyticsUserIdentifier />);
    await waitFor(() => expect(mocks.privyState.getAccessToken).toHaveBeenCalledTimes(1));
    mocks.privyState.user = { id: 'did:privy:second' };
    view.rerender(<AnalyticsUserIdentifier />);
    await waitFor(() => expect(bindIdentity).toHaveBeenCalledWith('new-token'));
    await act(async () => {
      resolveOld('old-token');
    });
    expect(bindIdentity).toHaveBeenCalledTimes(1);
  });

  it('does not overlap recovery events with an in-flight binding or rebind after success', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_GEO_ANALYTICS_VERIFIED_IDENTITY', 'true');
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:pending' };
    mocks.privyState.getAccessToken.mockResolvedValue('token');
    let resolveBinding!: (bound: boolean) => void;
    const bindIdentity = vi.fn().mockReturnValue(
      new Promise<boolean>(resolve => {
        resolveBinding = resolve;
      })
    );
    (window as any).lytics.bindIdentity = bindIdentity;
    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    await act(async () => {
      render(<AnalyticsUserIdentifier />);
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(bindIdentity).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveBinding(true);
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(bindIdentity).toHaveBeenCalledTimes(1);
  });

  it('waits while offline or hidden and resumes without background token requests', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NEXT_PUBLIC_GEO_ANALYTICS_VERIFIED_IDENTITY', 'true');
    mocks.privyState.ready = true;
    mocks.privyState.authenticated = true;
    mocks.privyState.user = { id: 'did:privy:offline' };
    mocks.privyState.getAccessToken.mockResolvedValue('token');
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    (window as any).lytics.bindIdentity = vi.fn().mockResolvedValue(false);
    const { AnalyticsUserIdentifier } = await import('./analytics-user-identifier');
    await act(async () => {
      render(<AnalyticsUserIdentifier />);
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(mocks.privyState.getAccessToken).not.toHaveBeenCalled();
    online.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(mocks.privyState.getAccessToken).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(true);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(mocks.privyState.getAccessToken).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mocks.privyState.getAccessToken).toHaveBeenCalledTimes(2);
  });
});
