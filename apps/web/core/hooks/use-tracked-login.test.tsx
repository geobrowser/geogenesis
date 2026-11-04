import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeSignInBox, readSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { featureFlagsStorageKey } from '~/core/state/feature-flags';
import { pendingActionsAtom } from '~/core/state/pending-actions';

import { useTrackedLogin } from './use-tracked-login';

const mocks = vi.hoisted(() => ({ login: vi.fn(), cancelPrivyAuth: vi.fn() }));

vi.mock('~/core/wallet/auth-hooks', () => ({
  useGeoLogin: () => ({ login: mocks.login }),
  usePrivy: () => ({ authenticated: false }),
}));
vi.mock('~/core/privy-auth-events', () => ({
  beginPrivyAuth: () => ({ id: 'attempt', properties: { component: 'test', auth_trigger: 'control' } }),
  cancelPrivyAuth: () => mocks.cancelPrivyAuth(),
}));
vi.mock('~/core/auth-attempt', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/auth-attempt')>()),
  currentAuthAttempt: () => ({ id: 'attempt' }),
}));

function renderLogin(params: Parameters<typeof useTrackedLogin>[0] = {}) {
  const store = createStore();
  const { result } = renderHook(() => useTrackedLogin(params), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  return { store, login: result.current.login };
}

beforeEach(() => window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ googleSignIn: true })));
afterEach(() => {
  window.localStorage.clear();
  mocks.login.mockClear();
  mocks.cancelPrivyAuth.mockClear();
  closeSignInBox();
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

  // GEO-3573: a sign-in picked up after a reload fills the address back in.
  it('prefills the email beside Google', () => {
    const { login } = renderLogin();
    login({ component: 'test' }, undefined, { prefillEmail: 'a@b.co' });
    expect(mocks.login).toHaveBeenCalledWith({
      loginMethods: ['email', 'google'],
      prefill: { type: 'email', value: 'a@b.co' },
    });
  });

  it('prefills the email with the flag off', () => {
    window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ googleSignIn: false }));
    const { login } = renderLogin();
    login({ component: 'test' }, undefined, { prefillEmail: 'a@b.co' });
    expect(mocks.login).toHaveBeenCalledWith({ prefill: { type: 'email', value: 'a@b.co' } });
  });
});

describe('useTrackedLogin with ourSignInBox on', () => {
  beforeEach(() => window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ ourSignInBox: true })));

  it("opens our box with the attempt, its attribution, the prefill and the heading, not Privy's dialog", () => {
    const { login } = renderLogin();
    login({ component: 'test' }, undefined, { prefillEmail: 'a@b.co', heading: 'Join the discussion' });
    expect(mocks.login).not.toHaveBeenCalled();
    expect(readSignInBox()).toMatchObject({
      attemptId: 'attempt',
      attribution: { component: 'test', auth_trigger: 'control' },
      prefillEmail: 'a@b.co',
      heading: 'Join the discussion',
    });
  });

  it("opens Privy's dialog for the box's own fallback", () => {
    const { login } = renderLogin();
    login({ component: 'test' }, undefined, { surface: 'privy' });
    expect(mocks.login).toHaveBeenCalled();
    expect(readSignInBox()).toBeNull();
  });

  it("runs the press's continuation once, when the box completes", () => {
    const onComplete = vi.fn();
    const { login } = renderLogin({ onComplete });
    login({ component: 'test' });
    readSignInBox()?.onComplete?.();
    readSignInBox()?.onComplete?.();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('closes the attempt and reports the exit when the box is dismissed', () => {
    const onError = vi.fn();
    const { login } = renderLogin({ onError });
    login({ component: 'test' });
    readSignInBox()?.onDismiss?.();
    expect(onError).toHaveBeenCalledWith('exited_auth_flow');
    expect(mocks.cancelPrivyAuth).toHaveBeenCalledTimes(1);
  });
});
