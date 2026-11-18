import { act, render, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeSignInBox, openSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { featureFlagsStorageKey } from '~/core/state/feature-flags';
import { type RedirectedPendingAction, pendingActionsAtom, restorePendingActions } from '~/core/state/pending-actions';
import { pendingCommentComposerAtom } from '~/core/state/pending-comment-intents';
import { REDIRECT_PENDING_ACTIONS_KEY, saveRedirectPendingActions } from '~/core/state/redirect-pending-actions';

import { GoogleOAuthHost, useGoogleOAuthSignIn } from './google-oauth';

type OAuthState = { status: 'initial' | 'loading' | 'done' } | { status: 'error'; error: Error | null };

const mocks = vi.hoisted(() => ({
  state: { status: 'initial' } as OAuthState,
  initOAuth: vi.fn(async (): Promise<void> => undefined),
  useLoginWithOAuth: vi.fn(),
  setToast: vi.fn(),
  failRedirectedPrivyAuth: vi.fn(),
  attemptId: undefined as string | undefined,
  authenticated: false,
  cancelPrivyAuth: vi.fn(),
  beginPrivyAuth: vi.fn(),
  prepareOnboarding: vi.fn(),
  steps: [] as { step: string; extra: Record<string, unknown> }[],
  tags: [] as { id: string | undefined; tags: Record<string, unknown> }[],
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  useLoginWithOAuth: mocks.useLoginWithOAuth,
  usePrivy: () => ({ authenticated: mocks.authenticated }),
}));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => mocks.prepareOnboarding }));
vi.mock('~/core/auth-attempt', () => ({
  currentAuthAttempt: () => (mocks.attemptId ? { id: mocks.attemptId } : undefined),
  tagAuthAttempt: (id: string | undefined, tags: Record<string, unknown>) => mocks.tags.push({ id, tags }),
}));
vi.mock('~/core/auth/code-step', () => ({
  captureAuthStep: (step: string, extra: Record<string, unknown> = {}) => mocks.steps.push({ step, extra }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/privy-auth-events', () => ({
  beginPrivyAuth: (...args: unknown[]) => {
    mocks.beginPrivyAuth(...args);
    return { id: mocks.attemptId };
  },
  cancelPrivyAuth: mocks.cancelPrivyAuth,
  failRedirectedPrivyAuth: mocks.failRedirectedPrivyAuth,
}));

const RETURN_URL = '/explore?privy_oauth_code=c&privy_oauth_state=s&privy_oauth_provider=google';

function renderHost(flag: boolean) {
  window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ googleSignIn: flag }));
  const store = createStore();
  const view = render(
    <Provider store={store}>
      <GoogleOAuthHost />
    </Provider>
  );
  const rerender = () =>
    view.rerender(
      <Provider store={store}>
        <GoogleOAuthHost />
      </Provider>
    );
  return {
    /** Re-renders with Privy's flow state moved on, as the host would publish it. */
    setState(state: OAuthState) {
      mocks.state = state;
      rerender();
    },
    /** Re-renders with Privy signed in, as the return's code exchange completes. */
    signIn() {
      mocks.authenticated = true;
      rerender();
    },
    store,
    unmount: view.unmount,
  };
}

beforeEach(() => {
  mocks.state = { status: 'initial' };
  mocks.attemptId = 'attempt-a';
  mocks.authenticated = false;
  mocks.steps = [];
  mocks.tags = [];
  mocks.useLoginWithOAuth.mockImplementation(() => ({ initOAuth: mocks.initOAuth, state: mocks.state }));
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
  vi.restoreAllMocks();
  closeSignInBox();
});

describe('GoogleOAuthHost', () => {
  it('mounts no OAuth hook with the flag off', () => {
    renderHost(false);
    expect(mocks.useLoginWithOAuth).not.toHaveBeenCalled();
  });

  // The page Google returns to is a fresh load: the flag comes from storage after hydration, and the
  // hook must still mount while Privy's callback parameters are in the URL.
  it('mounts the OAuth hook on the return from Google with the flag stored on', () => {
    window.history.replaceState({}, '', RETURN_URL);
    renderHost(true);

    expect(mocks.useLoginWithOAuth).toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get('privy_oauth_code')).toBe('c');
  });
});

describe('a failed return from Google', () => {
  const failed: OAuthState = { status: 'error', error: new Error('invalid code') };

  it('closes the attempt and says so, once', () => {
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    host.setState({ status: 'loading' });
    // Privy strips its parameters as it finishes.
    window.history.replaceState({}, '', '/explore');
    host.setState(failed);
    host.setState({ ...failed });

    expect(mocks.failRedirectedPrivyAuth).toHaveBeenCalledTimes(1);
    expect(mocks.failRedirectedPrivyAuth).toHaveBeenCalledWith('attempt-a');
    expect(mocks.setToast).toHaveBeenCalledTimes(1);
  });

  it('closes the attempt the return loaded with, not one started since', () => {
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    mocks.attemptId = 'attempt-b';
    host.setState(failed);

    expect(mocks.failRedirectedPrivyAuth).toHaveBeenCalledWith('attempt-a');
    expect(mocks.setToast).toHaveBeenCalledTimes(1);
  });

  it('still says so when no attempt was recorded', () => {
    mocks.attemptId = undefined;
    window.history.replaceState({}, '', RETURN_URL);
    renderHost(true).setState(failed);

    expect(mocks.failRedirectedPrivyAuth).not.toHaveBeenCalled();
    expect(mocks.setToast).toHaveBeenCalledTimes(1);
  });

  it('reports nothing when the return completes', () => {
    window.history.replaceState({}, '', RETURN_URL);
    renderHost(true).setState({ status: 'done' });

    expect(mocks.failRedirectedPrivyAuth).not.toHaveBeenCalled();
    expect(mocks.setToast).not.toHaveBeenCalled();
  });

  it('leaves a failed start to its caller', () => {
    renderHost(true).setState(failed);

    expect(mocks.failRedirectedPrivyAuth).not.toHaveBeenCalled();
    expect(mocks.setToast).not.toHaveBeenCalled();
  });

  it('leaves a new start from the return page to its caller', async () => {
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    const { result } = renderHook(() => useGoogleOAuthSignIn(), {
      wrapper: ({ children }) => <Provider store={host.store}>{children}</Provider>,
    });
    await act(() => result.current!({}));
    host.setState(failed);

    expect(mocks.initOAuth).toHaveBeenCalledWith({ provider: 'google' });
    expect(mocks.failRedirectedPrivyAuth).not.toHaveBeenCalled();
  });
});

describe('a failed Google start', () => {
  it.each(['attempt-a', 'newer-attempt'])('only cancels its own attempt when %s is current', async currentId => {
    let failStart!: (error: Error) => void;
    mocks.initOAuth.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          failStart = reject;
        })
    );
    const host = renderHost(true);
    const { result } = renderHook(() => useGoogleOAuthSignIn(), {
      wrapper: ({ children }) => <Provider store={host.store}>{children}</Provider>,
    });
    let started!: Promise<void>;
    act(() => {
      started = result.current!({});
    });
    const failed = expect(started).rejects.toThrow('blocked');
    mocks.attemptId = currentId;
    await act(async () => {
      failStart(new Error('blocked'));
      await failed;
    });
    expect(mocks.cancelPrivyAuth).toHaveBeenCalledTimes(currentId === 'attempt-a' ? 1 : 0);
  });
});

describe('Google sign-in steps (GEO-3550)', () => {
  it('reports the start under its surface, and a rejected start by its code only', async () => {
    mocks.attemptId = 'attempt-a';
    mocks.initOAuth.mockRejectedValueOnce(
      Object.assign(new Error('popup blocked for ann@example.com'), { privyErrorCode: 'oauth_init_failed' })
    );
    const host = renderHost(true);
    const { result } = renderHook(() => useGoogleOAuthSignIn(), {
      wrapper: ({ children }) => <Provider store={host.store}>{children}</Provider>,
    });
    await act(() => expect(result.current!({}, { surface: 'box' })).rejects.toThrow());
    expect(mocks.tags[0]).toEqual({ id: 'attempt-a', tags: { signInMethod: 'google', signInSurface: 'box' } });
    expect(mocks.steps).toEqual([
      { step: 'google_started', extra: { sign_in_method: 'google' } },
      { step: 'google_failed', extra: { sign_in_method: 'google', auth_error: 'oauth_init_failed' } },
    ]);
    expect(JSON.stringify(mocks.steps)).not.toContain('@');
  });

  // The box's press must hear the outcome, and a failed start leaves the box open to say so.
  it("carries on the sign-in box's open attempt, and leaves it open when the start fails", async () => {
    mocks.attemptId = 'box-attempt';
    openSignInBox({ attemptId: 'box-attempt', attribution: { component: 'navbar' } });
    mocks.initOAuth.mockRejectedValueOnce(Object.assign(new Error('blocked'), { privyErrorCode: 'oauth_init_failed' }));
    const host = renderHost(true);
    const { result } = renderHook(() => useGoogleOAuthSignIn(), {
      wrapper: ({ children }) => <Provider store={host.store}>{children}</Provider>,
    });
    await act(() => expect(result.current!({}, { surface: 'box', attemptId: 'box-attempt' })).rejects.toThrow());
    expect(mocks.beginPrivyAuth).not.toHaveBeenCalled();
    expect(mocks.prepareOnboarding).not.toHaveBeenCalled();
    expect(mocks.cancelPrivyAuth).not.toHaveBeenCalled();
    expect(mocks.tags.map(tag => tag.id)).toEqual(['box-attempt', 'box-attempt']);
    expect(mocks.steps.map(entry => entry.step)).toEqual(['google_started', 'google_failed']);
  });

  // The box's close skips cancelling while Google starts; a failed start must then end the attempt.
  it("cancels the box's attempt when the start fails after the box was closed", async () => {
    mocks.attemptId = 'box-attempt';
    openSignInBox({ attemptId: 'box-attempt', attribution: { component: 'navbar' } });
    let failStart!: (error: Error) => void;
    mocks.initOAuth.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          failStart = reject;
        })
    );
    const host = renderHost(true);
    const { result } = renderHook(() => useGoogleOAuthSignIn(), {
      wrapper: ({ children }) => <Provider store={host.store}>{children}</Provider>,
    });
    let started!: Promise<void>;
    act(() => {
      started = result.current!({}, { surface: 'box', attemptId: 'box-attempt' });
    });
    const failed = expect(started).rejects.toThrow('blocked');
    closeSignInBox('box-attempt');
    await act(async () => {
      failStart(new Error('blocked'));
      await failed;
    });
    expect(mocks.cancelPrivyAuth).toHaveBeenCalledTimes(1);
  });

  it('starts its own attempt when the one named has been replaced', async () => {
    mocks.attemptId = 'newer';
    const host = renderHost(true);
    const { result } = renderHook(() => useGoogleOAuthSignIn(), {
      wrapper: ({ children }) => <Provider store={host.store}>{children}</Provider>,
    });
    await act(() => result.current!({ component: 'navbar' }, { surface: 'box', attemptId: 'box-attempt' }));
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith({ component: 'navbar' });
    expect(mocks.prepareOnboarding).toHaveBeenCalledTimes(1);
  });

  it('reports a failed return to the attempt it returned to', () => {
    mocks.attemptId = 'returned';
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    host.setState({ status: 'error', error: new Error('denied') });
    expect(mocks.steps).toEqual([
      { step: 'google_failed', extra: { sign_in_method: 'google', auth_error: 'unknown_error' } },
    ]);
  });
});

describe('presses queued before a Google sign-in', () => {
  const vote: RedirectedPendingAction = {
    id: 'entity-vote:claim-1:space-1',
    label: 'your vote',
    requires: 'personalSpace',
    intent: 'positive',
    context: {
      component: 'entity_vote_buttons',
      page_path: '/explore',
      page_type: 'explore',
      page_view_id: 'pv-1',
      target_id: 'claim-1',
      target_type: 'entity',
    },
  };
  const savedRecord = () => window.sessionStorage.getItem(REDIRECT_PENDING_ACTIONS_KEY);
  const queuedIds = (store: ReturnType<typeof renderHost>['store']) => store.get(pendingActionsAtom).map(a => a.id);

  it('are saved as the page is left for Google, under the attempt open then', () => {
    const { store } = renderHost(true);
    restorePendingActions(store, [vote]);

    window.dispatchEvent(new Event('pagehide'));

    expect(JSON.parse(savedRecord()!)).toEqual(expect.objectContaining({ attemptId: 'attempt-a', actions: [vote] }));
  });

  it('come back once on the return to that attempt, and only once someone is signed in', () => {
    saveRedirectPendingActions('attempt-a', [vote]);
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    expect(queuedIds(host.store)).toEqual([]);

    host.signIn();

    expect(queuedIds(host.store)).toEqual([vote.id]);
    expect(host.store.get(pendingActionsAtom)[0]?.intent).toBe('positive');
    expect(savedRecord()).toBeNull();
  });

  it('do not come back on a reload of the return once carried out', () => {
    saveRedirectPendingActions('attempt-a', [vote]);
    window.history.replaceState({}, '', RETURN_URL);
    const first = renderHost(true);
    first.signIn();
    // Carried out: the runner takes it off the queue.
    first.store.set(pendingActionsAtom, []);
    window.dispatchEvent(new Event('pagehide'));
    first.unmount();

    const reloaded = renderHost(true);
    reloaded.signIn();

    expect(queuedIds(reloaded.store)).toEqual([]);
  });

  it('are left behind on a return to another attempt', () => {
    saveRedirectPendingActions('attempt-z', [vote]);
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    host.signIn();

    expect(queuedIds(host.store)).toEqual([]);
    expect(savedRecord()).toBeNull();
  });

  it('are forgotten when the return fails, so a later sign-in does not carry them out', () => {
    saveRedirectPendingActions('attempt-a', [vote]);
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    host.setState({ status: 'error', error: new Error('invalid code') });
    host.signIn();

    expect(queuedIds(host.store)).toEqual([]);
    expect(savedRecord()).toBeNull();
  });

  it('are forgotten on a load that is not a return from Google', () => {
    saveRedirectPendingActions('attempt-a', [vote]);
    renderHost(true).signIn();

    expect(savedRecord()).toBeNull();
  });

  it('are neither saved nor restored with the flag off', () => {
    saveRedirectPendingActions('attempt-a', [vote]);
    window.history.replaceState({}, '', RETURN_URL);
    mocks.authenticated = true;
    const { store } = renderHost(false);

    expect(queuedIds(store)).toEqual([]);
    expect(savedRecord()).not.toBeNull();
  });
});

describe('a comment box asked for before a Google sign-in', () => {
  const reply = { entityId: 'debate-1', replyToCommentId: 'comment-1' };

  it('is saved as the page is left for Google', () => {
    const { store } = renderHost(true);
    store.set(pendingCommentComposerAtom, reply);

    window.dispatchEvent(new Event('pagehide'));

    const saved = JSON.parse(window.sessionStorage.getItem(REDIRECT_PENDING_ACTIONS_KEY)!);
    expect(saved).toEqual(expect.objectContaining({ attemptId: 'attempt-a', actions: [], commentComposer: reply }));
  });

  it('is asked for again on the return, once signed in, and only once', () => {
    saveRedirectPendingActions('attempt-a', [], reply);
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    expect(host.store.get(pendingCommentComposerAtom)).toBeNull();

    host.signIn();

    expect(host.store.get(pendingCommentComposerAtom)).toEqual(reply);
    expect(window.sessionStorage.getItem(REDIRECT_PENDING_ACTIONS_KEY)).toBeNull();
  });

  it('gives way to a comment box pressed on the return page since', () => {
    saveRedirectPendingActions('attempt-a', [], reply);
    window.history.replaceState({}, '', RETURN_URL);
    const host = renderHost(true);
    const newer = { entityId: 'debate-2', replyToCommentId: null };
    host.store.set(pendingCommentComposerAtom, newer);

    host.signIn();

    expect(host.store.get(pendingCommentComposerAtom)).toEqual(newer);
  });
});
