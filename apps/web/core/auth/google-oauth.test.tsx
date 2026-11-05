import { act, render, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeSignInBox, openSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { GoogleOAuthHost, useGoogleOAuthSignIn } from './google-oauth';

type OAuthState = { status: 'initial' | 'loading' | 'done' } | { status: 'error'; error: Error | null };

const mocks = vi.hoisted(() => ({
  state: { status: 'initial' } as OAuthState,
  initOAuth: vi.fn(async (): Promise<void> => undefined),
  useLoginWithOAuth: vi.fn(),
  setToast: vi.fn(),
  failRedirectedPrivyAuth: vi.fn(),
  attemptId: undefined as string | undefined,
  cancelPrivyAuth: vi.fn(),
  beginPrivyAuth: vi.fn(),
  prepareOnboarding: vi.fn(),
  steps: [] as { step: string; extra: Record<string, unknown> }[],
  tags: [] as { id: string | undefined; tags: Record<string, unknown> }[],
}));

vi.mock('~/core/wallet/auth-hooks', () => ({ useLoginWithOAuth: mocks.useLoginWithOAuth }));
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
  return {
    /** Re-renders with Privy's flow state moved on, as the host would publish it. */
    setState(state: OAuthState) {
      mocks.state = state;
      view.rerender(
        <Provider store={store}>
          <GoogleOAuthHost />
        </Provider>
      );
    },
    store,
  };
}

beforeEach(() => {
  mocks.state = { status: 'initial' };
  mocks.attemptId = 'attempt-a';
  mocks.steps = [];
  mocks.tags = [];
  mocks.useLoginWithOAuth.mockImplementation(() => ({ initOAuth: mocks.initOAuth, state: mocks.state }));
});

afterEach(() => {
  window.localStorage.clear();
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
