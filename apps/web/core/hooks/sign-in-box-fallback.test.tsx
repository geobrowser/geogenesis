import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';
import { closeSignInBox, readSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { cancelPrivyAuth } from '~/core/privy-auth-events';
import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { usePrivySignIn } from './use-privy-sign-in';

type LoginCallbacks = {
  onComplete?: (args: { wasAlreadyAuthenticated: boolean }) => void;
  onError?: (error: string) => void;
};

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  prepareOnboarding: vi.fn(),
  listeners: new Set<{ current: LoginCallbacks }>(),
}));

vi.mock('~/core/analytics', () => ({
  capture: vi.fn(),
  captureExperimental: vi.fn(),
  restorePrivySession: vi.fn(),
  trackPrivyAuth: vi.fn(),
}));
// Privy calls every mounted `useLogin` listener when its dialog finishes.
vi.mock('~/core/wallet/auth-hooks', async () => {
  const { useEffect, useRef } = await import('react');
  return {
    usePrivy: () => ({ authenticated: false }),
    useGeoLogin: (callbacks: LoginCallbacks) => {
      const ref = useRef(callbacks);
      ref.current = callbacks;
      useEffect(() => {
        mocks.listeners.add(ref);
        return () => void mocks.listeners.delete(ref);
      }, []);
      return { login: mocks.login };
    },
  };
});
vi.mock('./use-prepare-onboarding', () => ({ usePrepareOnboarding: () => mocks.prepareOnboarding }));

const store = createStore();
const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

function broadcast(call: (callbacks: LoginCallbacks) => void) {
  for (const listener of [...mocks.listeners]) call(listener.current);
}

/** A press opens the box; its code step's send fails and falls back to Privy's dialog, as `AccountStep` does. */
function pressThenFallBack() {
  const onComplete = vi.fn();
  const onError = vi.fn();
  const onCancel = vi.fn();
  const press = renderHook(() => usePrivySignIn(onComplete, { onError }), { wrapper });
  act(() => void press.result.current({ component: 'follow_button' }, { onCancel }));
  const boxAttempt = readSignInBox()?.attemptId;

  const fallback = renderHook(
    () =>
      usePrivySignIn(undefined, {
        analytics: { component: 'follow_button' },
        resumeAuthAttempt: true,
        surface: 'privy',
      }),
    { wrapper }
  );
  act(() => void fallback.result.current());
  return { boxAttempt, onComplete, onError, onCancel };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ ourSignInBox: true }));
  resetAuthAttempt();
  mocks.login.mockReset();
  mocks.prepareOnboarding.mockReset();
});
afterEach(() => closeSignInBox());

describe("the sign-in box's fallback to Privy's dialog", () => {
  it("carries on the box's attempt, without preparing onboarding again", () => {
    const { boxAttempt } = pressThenFallBack();
    expect(boxAttempt).toBeDefined();
    expect(mocks.login).toHaveBeenCalledTimes(1);
    expect(currentAuthAttempt()).toMatchObject({ id: boxAttempt });
    expect(currentAuthAttempt()?.endedAt).toBeUndefined();
    expect(mocks.prepareOnboarding).toHaveBeenCalledTimes(1);
  });

  it("runs the press's continuation once when Privy signs them in", () => {
    const { onComplete } = pressThenFallBack();
    act(() => broadcast(callbacks => callbacks.onComplete?.({ wasAlreadyAuthenticated: false })));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('withdraws the press once when the dialog is dismissed', () => {
    const { onError, onCancel } = pressThenFallBack();
    act(() => {
      broadcast(callbacks => callbacks.onError?.('exited_auth_flow'));
      cancelPrivyAuth();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
