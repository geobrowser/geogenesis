import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { featureFlagsStorageKey } from '~/core/state/feature-flags';
import { pendingActionsAtom } from '~/core/state/pending-actions';

import { useTrackedLogin } from './use-tracked-login';

const mocks = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('@geogenesis/auth', () => ({
  useGeoLogin: () => ({ login: mocks.login }),
  usePrivy: () => ({ authenticated: false }),
}));
vi.mock('~/core/privy-auth-events', () => ({ beginPrivyAuth: () => ({ id: 'attempt' }) }));

function renderLogin() {
  const store = createStore();
  const { result } = renderHook(() => useTrackedLogin({}), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  return { store, login: result.current.login };
}

beforeEach(() => window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ googleSignIn: true })));
afterEach(() => {
  window.localStorage.clear();
  mocks.login.mockClear();
});

// GEO-3139: Privy's login() is only called here, so the flag here is the one gate on the Google redirect.
describe('useTrackedLogin', () => {
  it('adds Google with the flag on', () => {
    const { login } = renderLogin();
    login({ component: 'test' });
    expect(mocks.login).toHaveBeenCalledWith({ loginMethods: ['email', 'google'] });
  });

  // Google redirects and drops the queue; the flag accepts that rather than hiding Google.
  it('adds Google with a pending action queued', () => {
    const { store, login } = renderLogin();
    store.set(pendingActionsAtom, [{ id: 'vote', label: 'Vote', requires: 'auth', run: () => {} }]);
    login({ component: 'test' });
    expect(mocks.login).toHaveBeenCalledWith({ loginMethods: ['email', 'google'] });
  });

  it('opens the config modal with no arguments with the flag off', () => {
    window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ googleSignIn: false }));
    const { login } = renderLogin();
    login({ component: 'test' });
    expect(mocks.login.mock.calls[0]).toEqual([]);
  });
});
