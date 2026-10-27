import { act, render, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { GoogleOAuthHost, useGoogleOAuthSignIn } from './google-oauth';

type OAuthState = { status: 'initial' | 'loading' | 'done' } | { status: 'error'; error: Error | null };

const mocks = vi.hoisted(() => ({
  state: { status: 'initial' } as OAuthState,
  initOAuth: vi.fn(async () => undefined),
  useLoginWithOAuth: vi.fn(),
  setToast: vi.fn(),
  failRedirectedPrivyAuth: vi.fn(),
  attemptId: undefined as string | undefined,
}));

vi.mock('~/core/wallet/auth-hooks', () => ({ useLoginWithOAuth: mocks.useLoginWithOAuth }));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => vi.fn() }));
vi.mock('~/core/auth-attempt', () => ({
  currentAuthAttempt: () => (mocks.attemptId ? { id: mocks.attemptId } : undefined),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/privy-auth-events', () => ({
  beginPrivyAuth: vi.fn(),
  cancelPrivyAuth: vi.fn(),
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
  mocks.useLoginWithOAuth.mockImplementation(() => ({ initOAuth: mocks.initOAuth, state: mocks.state }));
});

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
  vi.restoreAllMocks();
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
