import { act, cleanup, render, renderHook } from '@testing-library/react';

import { useEffect } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsUserIdentifier } from './analytics-user-identifier';
import { useTrackedLogin } from './hooks/use-tracked-login';
import { beginPrivyAuth, completePrivyAuth, resetPrivyAuthSession } from './privy-auth-events';
import { PrivyAuthTracker } from './privy-auth-tracker';

type Completion = Parameters<typeof completePrivyAuth>[0];
type Handlers = { onComplete?: (args: Completion) => void; onError?: (error: string) => void };
const mocks = vi.hoisted(() => ({
  listeners: new Set<Handlers>(),
  authenticated: false,
  user: null as null | { id: string; email?: { address: string } },
  logout: undefined as undefined | (() => void),
  login: vi.fn(),
  trackPrivyAuth: vi.fn(),
  restorePrivySession: vi.fn(),
  identifyPrivyUser: vi.fn(),
}));

// Match Privy's shared modal emitter: every mounted subscription receives completion.
function useSubscription(handlers: Handlers) {
  useEffect(() => {
    mocks.listeners.add(handlers);
    return () => {
      mocks.listeners.delete(handlers);
    };
  }, [handlers]);
  return { login: mocks.login };
}
vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: mocks.user }),
  usePrivyLogin: (handlers: Handlers) => useSubscription(handlers),
  useGeoLogin: (handlers: Handlers) => useSubscription(handlers),
  useLogout: (handlers: { onSuccess: () => void }) => {
    mocks.logout = handlers.onSuccess;
  },
}));
vi.mock('./analytics', () => ({
  trackPrivyAuth: mocks.trackPrivyAuth,
  restorePrivySession: mocks.restorePrivySession,
  identifyPrivyUser: mocks.identifyPrivyUser,
  reconcileAnonymousAnalyticsIdentity: vi.fn(),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: null, isFetched: false }),
}));

const completion = (id: string, isNewUser = true): Completion => ({
  user: { id, email: { address: 'reader@example.com' } },
  isNewUser,
  wasAlreadyAuthenticated: false,
  loginMethod: 'email',
  loginAccount: { type: 'email' },
});
const broadcast = (args: Completion) =>
  act(() => {
    for (const listener of mocks.listeners) listener.onComplete?.(args);
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = false;
  mocks.user = null;
  resetPrivyAuthSession();
});
afterEach(cleanup);

describe('PrivyAuthTracker', () => {
  describe.each(['modal-login', 'modal-signup', 'headless-signup'] as const)('%s with both observers', flow => {
    it.each(['before', 'after'] as const)('does not infer a restore when identity mounts %s completion', order => {
      const id = `${flow}-${order}`;
      const args = completion(id, flow !== 'modal-login');
      mocks.authenticated = true;
      mocks.user = { id, email: { address: 'reader@example.com' } };
      render(<PrivyAuthTracker />);
      if (order === 'before') render(<AnalyticsUserIdentifier />);

      if (flow === 'headless-signup') {
        act(() => completePrivyAuth(args, { signup_surface: 'explore_email_capture' }));
      } else {
        broadcast(args);
      }
      if (order === 'after') render(<AnalyticsUserIdentifier />);

      expect(mocks.trackPrivyAuth).toHaveBeenCalledOnce();
      expect(mocks.trackPrivyAuth.mock.calls[0]?.[0]).toEqual(args);
      expect(mocks.restorePrivySession).not.toHaveBeenCalled();
      expect(mocks.identifyPrivyUser).toHaveBeenCalledOnce();
    });
  });

  it('records a genuine restored session once before the identity observer mounts or remounts', () => {
    const args = { ...completion('genuine-restore', false), wasAlreadyAuthenticated: true };
    render(<PrivyAuthTracker />);
    broadcast(args);
    expect(mocks.restorePrivySession).toHaveBeenCalledExactlyOnceWith(args.user);
    expect(mocks.trackPrivyAuth).not.toHaveBeenCalled();

    mocks.authenticated = true;
    mocks.user = { id: 'genuine-restore' };
    const identifier = render(<AnalyticsUserIdentifier />);
    identifier.unmount();
    render(<AnalyticsUserIdentifier />);
    broadcast(args);
    expect(mocks.restorePrivySession).toHaveBeenCalledOnce();
  });

  it('counts login after a restored session has been logged out', () => {
    render(<PrivyAuthTracker />);
    const args = completion('restore-then-login', false);
    broadcast({ ...args, wasAlreadyAuthenticated: true });
    act(() => mocks.logout?.());
    broadcast(args);
    expect(mocks.restorePrivySession).toHaveBeenCalledExactlyOnceWith(args.user);
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(args, { auth_flow: 'manual_login' });
  });

  it('records one signup with many mounted controls and duplicate completions', () => {
    render(<PrivyAuthTracker />);
    renderHook(() => useTrackedLogin({}));
    for (let i = 0; i < 49; i++) renderHook(() => useTrackedLogin({}));
    broadcast(completion('many-rows'));
    broadcast(completion('many-rows'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(completion('many-rows'), {
      auth_flow: 'manual_login',
    });
  });

  it.each(['navbar', 'explore-card', 'deep-link'])(
    'keeps %s attribution when the initiating control unmounts',
    surface => {
      render(<PrivyAuthTracker />);
      const button = renderHook(() => useTrackedLogin({}));
      const properties = { link_source: surface };
      act(() => button.result.current.login(properties));
      properties.link_source = 'changed';
      button.unmount();
      broadcast(completion(surface));
      expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(completion(surface), {
        link_source: surface,
        auth_flow: 'manual_login',
      });
    }
  );

  it('records a non-restored completion even without a local press (OAuth return)', () => {
    render(<PrivyAuthTracker />);
    broadcast(completion('oauth-return'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledOnce();
  });

  it('does not classify a restore as manual or consume the pending attribution', () => {
    render(<PrivyAuthTracker />);
    beginPrivyAuth({ link_source: 'deep-link' });
    broadcast({ ...completion('restored', false), wasAlreadyAuthenticated: true });
    expect(mocks.trackPrivyAuth).not.toHaveBeenCalled();
    broadcast(completion('actual-login', false));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(completion('actual-login', false), {
      link_source: 'deep-link',
      auth_flow: 'manual_login',
    });
  });

  it('records each deliberate login after logout, without duplicating callbacks in a session', () => {
    render(<PrivyAuthTracker />);
    broadcast(completion('returning', false));
    broadcast(completion('returning', false));
    act(() => mocks.logout?.());
    broadcast(completion('returning', false));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledTimes(2);
  });

  it('allows a new login after expiry or logout in another tab', () => {
    mocks.authenticated = true;
    const tracker = render(<PrivyAuthTracker />);
    broadcast(completion('expired-session', false));
    mocks.authenticated = false;
    tracker.rerender(<PrivyAuthTracker />);
    broadcast(completion('expired-session', false));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledTimes(2);
  });

  it('keeps attribution through an invalid code and successful retry', () => {
    render(<PrivyAuthTracker />);
    beginPrivyAuth({ link_source: 'explore_email_capture' });
    act(() => {
      for (const listener of mocks.listeners) listener.onError?.('invalid_credentials');
    });
    broadcast(completion('retried-code'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(completion('retried-code'), {
      link_source: 'explore_email_capture',
      auth_flow: 'manual_login',
    });
  });

  it('forgets attribution after dismissal', () => {
    render(<PrivyAuthTracker />);
    beginPrivyAuth({ link_source: 'abandoned' });
    act(() => {
      for (const listener of mocks.listeners) listener.onError?.('exited_auth_flow');
    });
    broadcast(completion('after-cancel'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(completion('after-cancel'), {
      auth_flow: 'manual_login',
    });
  });

  it('shares deduplication with headless email completion and retains the email', () => {
    render(<PrivyAuthTracker />);
    completePrivyAuth(completion('email-capture'), { signup_surface: 'explore_email_capture' });
    broadcast(completion('email-capture'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(completion('email-capture'), {
      signup_surface: 'explore_email_capture',
      auth_flow: 'manual_login',
    });
  });

  it('does not send a second signup for the same account after logout or tracker remount', () => {
    const tracker = render(<PrivyAuthTracker />);
    broadcast(completion('signup-once'));
    act(() => mocks.logout?.());
    tracker.unmount();
    render(<PrivyAuthTracker />);
    broadcast(completion('signup-once'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledOnce();
  });
});
