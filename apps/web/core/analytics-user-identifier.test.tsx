import { render, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  privyState: {
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
});
