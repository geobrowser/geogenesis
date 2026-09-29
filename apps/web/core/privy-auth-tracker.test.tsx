import { act, cleanup, render, renderHook } from '@testing-library/react';

import { useEffect } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTrackedLogin } from './hooks/use-tracked-login';
import { beginPrivyAuth, completePrivyAuth, resetPrivyAuthSession } from './privy-auth-events';
import { PrivyAuthTracker } from './privy-auth-tracker';

type Completion = Parameters<typeof completePrivyAuth>[0];
type Handlers = { onComplete?: (args: Completion) => void; onError?: () => void };
const mocks = vi.hoisted(() => ({
  listeners: new Set<Handlers>(),
  authenticated: false,
  logout: undefined as undefined | (() => void),
  login: vi.fn(),
  trackPrivyAuth: vi.fn(),
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
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated }),
  usePrivyLogin: (handlers: Handlers) => useSubscription(handlers),
  useGeoLogin: (handlers: Handlers) => useSubscription(handlers),
  useLogout: (handlers: { onSuccess: () => void }) => {
    mocks.logout = handlers.onSuccess;
  },
}));
vi.mock('./analytics', () => ({ trackPrivyAuth: mocks.trackPrivyAuth }));

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
  resetPrivyAuthSession();
});
afterEach(cleanup);

describe('PrivyAuthTracker', () => {
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

  it('ignores restores even with an armed manual login, without consuming its attribution', () => {
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

  it('forgets attribution after dismissal or failure', () => {
    render(<PrivyAuthTracker />);
    beginPrivyAuth({ link_source: 'abandoned' });
    act(() => {
      for (const listener of mocks.listeners) listener.onError?.();
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
