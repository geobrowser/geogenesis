import { act, cleanup, render, renderHook } from '@testing-library/react';

import { useEffect } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsUserIdentifier } from './analytics-user-identifier';
import {
  authAttemptForAction,
  currentAuthAttempt,
  openAuthAttempt,
  readAuthAttempt,
  resetAuthAttempt,
  trackAuthOnboarding,
} from './auth-attempt';
import { usePrivySignIn } from './hooks/use-privy-sign-in';
import { useTrackedLogin } from './hooks/use-tracked-login';
import { beginPrivyAuth, completePrivyAuth, resetPrivyAuthSession } from './privy-auth-events';
import { PrivyAuthTracker } from './privy-auth-tracker';

type Completion = Parameters<typeof completePrivyAuth>[0];
type Handlers = { onComplete?: (args: Completion) => void; onError?: (error: string) => void };
const mocks = vi.hoisted(() => ({
  listeners: new Set<Handlers>(),
  authenticated: false,
  isModalOpen: false,
  user: null as null | { id: string; email?: { address: string }; createdAt?: Date },
  logout: undefined as undefined | (() => void),
  login: vi.fn(),
  trackPrivyAuth: vi.fn(),
  capture: vi.fn(),
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
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    isModalOpen: mocks.isModalOpen,
    user: mocks.user,
  }),
  usePrivyLogin: (handlers: Handlers) => useSubscription(handlers),
  useGeoLogin: (handlers: Handlers) => useSubscription(handlers),
  useLogout: (handlers: { onSuccess: () => void }) => {
    mocks.logout = handlers.onSuccess;
  },
}));
vi.mock('./analytics', () => ({
  trackPrivyAuth: mocks.trackPrivyAuth,
  capture: mocks.capture,
  restorePrivySession: mocks.restorePrivySession,
  identifyPrivyUser: mocks.identifyPrivyUser,
  reconcileAnonymousAnalyticsIdentity: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('~/partials/onboarding/dialog', async () => {
  const { atom } = await import('jotai');
  return {
    nameAtom: atom(''),
    topicIdAtom: atom(''),
    avatarAtom: atom(''),
    spaceIdAtom: atom(''),
    stepAtom: atom('start'),
    selectedTopicIdsAtom: atom<string[]>([]),
  };
});
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
  mocks.isModalOpen = false;
  window.history.replaceState(null, '', '/explore');
  mocks.user = null;
  resetPrivyAuthSession();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

const dismiss = () =>
  act(() => {
    for (const listener of mocks.listeners) listener.onError?.('exited_auth_flow');
  });

/**
 * A press's `onCancel` withdraws what it queued — a vote, a join — if the sign-in is dismissed.
 * Queued actions outlive the control that pressed them, so the withdrawal has to as well.
 */
/**
 * GEO-3243: Privy creates the account when the email code is accepted. Exiting its dialog after that
 * leaves the account behind, and Privy signs it back out, so the attempt is not a sign-in the visitor
 * gave up on. It used to be recorded as `closed`, hiding the account from the funnel.
 */
describe('a sign-in exited after Privy signed someone in', () => {
  const pressSignIn = () => {
    const tracker = render(<PrivyAuthTracker />);
    const control = renderHook(() => usePrivySignIn());
    act(() => {
      control.result.current({ component: 'navbar', auth_control: 'sign_in' });
    });
    return { attempt: currentAuthAttempt()!, rerender: () => tracker.rerender(<PrivyAuthTracker />) };
  };
  const completedOutcomes = () =>
    mocks.capture.mock.calls
      .filter(([event]) => event === 'auth_attempt_completed')
      .map(([, properties]) => (properties as { outcome: string }).outcome);

  it('is recorded as an account created and left, when the code created the account', () => {
    const { attempt, rerender } = pressSignIn();
    mocks.authenticated = true;
    mocks.user = { id: 'did:privy:new', createdAt: new Date() };
    rerender();
    dismiss();

    expect(readAuthAttempt(attempt.id)?.outcome).toBe('left_after_sign_up');
    expect(completedOutcomes()).toEqual(['left_after_sign_up']);
  });

  it('is recorded as a sign-in left, for an account that already existed', () => {
    const { attempt, rerender } = pressSignIn();
    mocks.authenticated = true;
    mocks.user = { id: 'did:privy:old', createdAt: new Date('2025-01-01T00:00:00Z') };
    rerender();
    dismiss();

    expect(readAuthAttempt(attempt.id)?.outcome).toBe('left_after_sign_in');
  });

  // Copilot on #2791 (round 2): Privy's sign-out of the exited account can be seen before the exit.
  it('is recorded the same way when the sign-out is seen before the exit', () => {
    const { attempt, rerender } = pressSignIn();
    mocks.authenticated = true;
    mocks.user = { id: 'did:privy:new', createdAt: new Date() };
    rerender();

    mocks.authenticated = false;
    mocks.user = null;
    rerender();
    dismiss();

    expect(readAuthAttempt(attempt.id)?.outcome).toBe('left_after_sign_up');
  });

  it('is recorded the same way when Privy’s logout callback comes first', () => {
    const { attempt, rerender } = pressSignIn();
    mocks.authenticated = true;
    mocks.user = { id: 'did:privy:new', createdAt: new Date() };
    rerender();

    act(() => mocks.logout?.());
    dismiss();

    expect(readAuthAttempt(attempt.id)?.outcome).toBe('left_after_sign_up');
  });

  it('forgets the account once its session ends, so a later sign-in closed unsigned stays closed', () => {
    const { rerender } = pressSignIn();
    mocks.authenticated = true;
    mocks.user = { id: 'did:privy:old', createdAt: new Date('2025-01-01T00:00:00Z') };
    rerender();
    mocks.authenticated = false;
    mocks.user = null;
    rerender();

    const control = renderHook(() => usePrivySignIn());
    act(() => {
      control.result.current({ component: 'navbar', auth_control: 'sign_in' });
    });
    const next = currentAuthAttempt()!;
    dismiss();

    expect(readAuthAttempt(next.id)?.outcome).toBe('closed');
  });

  it('is still closed when nobody had signed in', () => {
    const { attempt } = pressSignIn();
    dismiss();

    expect(readAuthAttempt(attempt.id)?.outcome).toBe('closed');
  });
});

describe('a press abandoned with the sign-in', () => {
  it('is withdrawn even after the control that pressed it unmounts', () => {
    const onCancel = vi.fn();
    render(<PrivyAuthTracker />);
    const control = renderHook(() => usePrivySignIn());

    act(() => {
      control.result.current(undefined, { onCancel });
    });
    control.unmount();
    dismiss();

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('is not withdrawn once the sign-in completes', () => {
    const onCancel = vi.fn();
    render(<PrivyAuthTracker />);
    const control = renderHook(() => usePrivySignIn());

    act(() => {
      control.result.current(undefined, { onCancel });
    });
    broadcast(completion('completes'));
    dismiss();

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('belongs to its own attempt, not a later one', () => {
    const first = vi.fn();
    render(<PrivyAuthTracker />);
    const control = renderHook(() => usePrivySignIn());

    act(() => {
      control.result.current(undefined, { onCancel: first });
    });
    dismiss();
    act(() => {
      control.result.current();
    });
    dismiss();

    expect(first).toHaveBeenCalledOnce();
  });
});

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
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(
      args,
      expect.objectContaining({ auth_flow: 'manual_login', auth_control: 'unknown' })
    );
  });

  it('records one signup with many mounted controls and duplicate completions', () => {
    render(<PrivyAuthTracker />);
    renderHook(() => useTrackedLogin({}));
    for (let i = 0; i < 49; i++) renderHook(() => useTrackedLogin({}));
    broadcast(completion('many-rows'));
    broadcast(completion('many-rows'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(
      completion('many-rows'),
      expect.objectContaining({
        auth_flow: 'manual_login',
      })
    );
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
      expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(
        completion(surface),
        expect.objectContaining({
          link_source: surface,
          auth_flow: 'manual_login',
        })
      );
    }
  );

  it('records a non-restored completion even without a local press (OAuth return)', () => {
    render(<PrivyAuthTracker />);
    broadcast(completion('oauth-return'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledOnce();
  });

  it.each(['copied pointer', 'unambiguous recovery'] as const)(
    'preserves OAuth attribution through the callback modal with %s',
    mode => {
      const attempt = beginPrivyAuth({ component: 'navbar', auth_control: 'sign_in', link_source: 'oauth-origin' });
      openAuthAttempt();
      // Simulate the new document: retain shared storage, discard memory/ownership.
      const pointer = sessionStorage.getItem('geo:auth-attempt:active')!;
      resetAuthAttempt();
      if (mode === 'copied pointer') sessionStorage.setItem('geo:auth-attempt:active', pointer);
      window.history.replaceState(
        null,
        '',
        '/explore?privy_oauth_code=code&privy_oauth_state=state&privy_oauth_provider=google'
      );
      const tracker = render(<PrivyAuthTracker />);
      // Privy consumes the callback URL before the modal's state settles.
      window.history.replaceState(null, '', '/explore');
      mocks.isModalOpen = true;
      tracker.rerender(<PrivyAuthTracker />);
      expect(currentAuthAttempt(true)?.id).toBe(attempt.id);
      broadcast({ ...completion(`oauth-${mode}`), loginMethod: 'google' });
      expect(readAuthAttempt(attempt.id)?.outcome).toBe('signed_up');
      expect(mocks.trackPrivyAuth).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ auth_attempt_id: attempt.id, link_source: 'oauth-origin' })
      );
      expect(mocks.capture.mock.calls.filter(([name]) => name === 'auth_prompt_viewed')).toHaveLength(1);
    }
  );

  it('still creates an independent modal attempt for an ordinary cloned document', () => {
    const attempt = beginPrivyAuth({ component: 'navbar', auth_control: 'sign_in' });
    const pointer = sessionStorage.getItem('geo:auth-attempt:active')!;
    resetAuthAttempt();
    sessionStorage.setItem('geo:auth-attempt:active', pointer);
    mocks.isModalOpen = true;
    render(<PrivyAuthTracker />);
    expect(currentAuthAttempt()?.id).not.toBe(attempt.id);
    expect(readAuthAttempt(attempt.id)?.outcome).toBeUndefined();
    expect(mocks.capture).toHaveBeenCalledWith('auth_prompt_viewed', expect.objectContaining({ component: 'unknown' }));
  });

  it.each(['completed', 'dismissed'] as const)('tracks a new modal after an OAuth callback has %s', outcome => {
    window.history.replaceState(
      null,
      '',
      '/explore?privy_oauth_code=code&privy_oauth_state=state&privy_oauth_provider=google'
    );
    mocks.isModalOpen = true;
    const tracker = render(<PrivyAuthTracker />);
    if (outcome === 'completed') broadcast({ ...completion('oauth-then-modal'), loginMethod: 'google' });
    else
      act(() => {
        for (const listener of mocks.listeners) listener.onError?.('exited_auth_flow');
      });
    window.history.replaceState(null, '', '/explore');
    mocks.isModalOpen = false;
    tracker.rerender(<PrivyAuthTracker />);
    mocks.capture.mockClear();
    mocks.isModalOpen = true;
    tracker.rerender(<PrivyAuthTracker />);
    expect(mocks.capture).toHaveBeenCalledWith('auth_prompt_viewed', expect.objectContaining({ component: 'unknown' }));
  });

  it('retains the email attempt when handing over to the modal after the session rotates', () => {
    window.lytics = { getContext: () => ({ anonymous_id: 'visitor', session_id: 'email-session' }) };
    try {
      render(<PrivyAuthTracker />);
      beginPrivyAuth({ signup_surface: 'explore_email_capture' });
      window.lytics.getContext = () => ({ anonymous_id: 'visitor', session_id: 'modal-session' });
      const button = renderHook(() => useTrackedLogin({}));
      act(() => button.result.current.login({ signup_surface: 'explore_email_capture' }, { resume: true }));
      broadcast(completion('email-to-modal'));
      expect(mocks.trackPrivyAuth).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signup_session_id: 'email-session',
          signup_context_source: 'auth_start',
        })
      );
    } finally {
      delete window.lytics;
    }
  });

  it('does not classify a restore as manual or consume the pending attribution', () => {
    render(<PrivyAuthTracker />);
    beginPrivyAuth({ link_source: 'deep-link' });
    broadcast({ ...completion('restored', false), wasAlreadyAuthenticated: true });
    expect(mocks.trackPrivyAuth).not.toHaveBeenCalled();
    broadcast(completion('actual-login', false));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(
      completion('actual-login', false),
      expect.objectContaining({
        link_source: 'deep-link',
        auth_flow: 'manual_login',
      })
    );
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
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(
      completion('retried-code'),
      expect.objectContaining({
        link_source: 'explore_email_capture',
        auth_flow: 'manual_login',
      })
    );
  });

  it('forgets attribution after dismissal', () => {
    render(<PrivyAuthTracker />);
    beginPrivyAuth({ link_source: 'abandoned' });
    act(() => {
      for (const listener of mocks.listeners) listener.onError?.('exited_auth_flow');
    });
    broadcast(completion('after-cancel'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(
      completion('after-cancel'),
      expect.objectContaining({
        auth_flow: 'manual_login',
      })
    );
  });

  it('shares deduplication with headless email completion and retains the email', () => {
    render(<PrivyAuthTracker />);
    completePrivyAuth(completion('email-capture'), { signup_surface: 'explore_email_capture' });
    broadcast(completion('email-capture'));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledExactlyOnceWith(
      completion('email-capture'),
      expect.objectContaining({
        signup_surface: 'explore_email_capture',
        auth_flow: 'manual_login',
      })
    );
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
  it.each([
    { name: 'signup after logout and remount', isNewUser: true, logout: true },
    { name: 'signup already completed in this session', isNewUser: true, logout: false },
    { name: 'login already completed in this session', isNewUser: false, logout: false },
  ])('settles a new attempt despite duplicate $name telemetry', ({ name, isNewUser, logout }) => {
    const tracker = render(<PrivyAuthTracker />);
    const args = completion(`repeat-${name}`, isNewUser);
    broadcast(args);
    if (logout) {
      act(() => mocks.logout?.());
      tracker.unmount();
      render(<PrivyAuthTracker />);
    }
    const attempt = beginPrivyAuth({
      component: 'entity_vote_buttons',
      auth_control: 'upvote',
      auth_intent: 'vote',
      auth_continuation: 'queued',
      target_id: 'claim',
      target_type: 'entity',
    });
    mocks.capture.mockClear();
    broadcast(args);
    broadcast(args);
    expect(mocks.trackPrivyAuth).toHaveBeenCalledOnce();
    expect(currentAuthAttempt()).toMatchObject({ id: attempt.id, outcome: 'signed_in', endedAt: expect.any(Number) });
    expect(authAttemptForAction('vote', 'claim', attempt.id)?.id).toBe(attempt.id);
    trackAuthOnboarding('start', 'viewed');
    expect(mocks.capture).toHaveBeenCalledWith(
      'auth_onboarding_progress',
      expect.objectContaining({ auth_attempt_id: attempt.id })
    );
    for (const event of ['auth_attempt_completed', 'auth_identity_linked']) {
      const rows = mocks.capture.mock.calls.filter(
        ([name, props]) => name === event && props.auth_attempt_id === attempt.id
      );
      expect(rows).toHaveLength(1);
    }
    beginPrivyAuth({ auth_control: 'later' });
    expect(readAuthAttempt(attempt.id)?.outcome).toBe('signed_in');
    expect(mocks.capture).not.toHaveBeenCalledWith(
      'auth_action_completed',
      expect.objectContaining({ auth_attempt_id: attempt.id, outcome: 'cancelled' })
    );
  });

  it('does not fabricate an attempt for a duplicate signup without a new press', () => {
    render(<PrivyAuthTracker />);
    const args = completion('duplicate-without-press');
    broadcast(args);
    act(() => mocks.logout?.());
    mocks.capture.mockClear();
    broadcast(args);
    expect(currentAuthAttempt()).toBeUndefined();
    expect(mocks.trackPrivyAuth).toHaveBeenCalledOnce();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('keeps an active attempt pending through repeated session restores', () => {
    render(<PrivyAuthTracker />);
    const args = { ...completion('repeated-restore', false), wasAlreadyAuthenticated: true };
    broadcast(args);
    const attempt = beginPrivyAuth({ auth_control: 'sign_in' });
    mocks.capture.mockClear();
    broadcast(args);
    expect(currentAuthAttempt()?.id).toBe(attempt.id);
    expect(currentAuthAttempt()?.outcome).toBeUndefined();
    expect(mocks.restorePrivySession).toHaveBeenCalledOnce();
    expect(mocks.trackPrivyAuth).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('still completes the latest control when persistent storage stops accepting writes', () => {
    render(<PrivyAuthTracker />);
    beginPrivyAuth({ auth_control: 'old' });
    const onComplete = vi.fn();
    const control = renderHook(() => useTrackedLogin({ onComplete }));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      act(() => control.result.current.login({ auth_control: 'latest' }));
      broadcast(completion('storage-full'));
      expect(onComplete).toHaveBeenCalledOnce();
      expect(mocks.trackPrivyAuth).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ auth_control: 'latest' })
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('delivers dismissal only to the latest initiating control', () => {
    render(<PrivyAuthTracker />);
    const first = vi.fn();
    const second = vi.fn();
    const controls = renderHook(() => ({
      first: useTrackedLogin({ onError: first }),
      second: useTrackedLogin({ onError: second }),
    }));
    act(() => controls.result.current.first.login());
    act(() => controls.result.current.second.login());
    act(() => {
      for (const listener of mocks.listeners) listener.onError?.('exited_auth_flow');
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith('exited_auth_flow');
  });

  it('runs only the control belonging to the completing attempt', () => {
    render(<PrivyAuthTracker />);
    const first = vi.fn();
    const second = vi.fn();
    const controls = renderHook(() => ({
      first: useTrackedLogin({ onComplete: first }),
      second: useTrackedLogin({ onComplete: second }),
    }));
    act(() => controls.result.current.first.login({ auth_control: 'agree' }));
    act(() => controls.result.current.second.login({ auth_control: 'disagree' }));
    broadcast(completion('superseded-controls'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(mocks.trackPrivyAuth).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ auth_control: 'disagree' })
    );
  });
});
