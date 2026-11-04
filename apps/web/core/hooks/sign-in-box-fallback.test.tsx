import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentAuthAttempt, finishAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';
import { closeSignInBox, isSignInBoxOpen, readSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { cancelPrivyAuth } from '~/core/privy-auth-events';
import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { SignInBoxHost } from '~/partials/sign-in/sign-in-box';

import { usePrivySignIn } from './use-privy-sign-in';

type LoginCallbacks = {
  onComplete?: (args: { wasAlreadyAuthenticated: boolean }) => void;
  onError?: (error: string) => void;
};

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  prepareOnboarding: vi.fn(),
  isModalOpen: false,
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
    usePrivy: () => ({ ready: true, authenticated: false, isModalOpen: mocks.isModalOpen }),
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
// The box stays on its email step here; the code step is not under test.
vi.mock('~/partials/explore/email-capture-account-step', () => ({
  AccountStep: () => null,
  SIGN_IN_UNAVAILABLE_COPY: 'Couldn’t reach sign-in. Try again.',
}));
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
  const host = render(<SignInBoxHost />, { wrapper });
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
  act(() => void fallback.result.current(undefined, { attemptId: boxAttempt }));
  // Privy's dialog opens over the box.
  mocks.isModalOpen = true;
  host.rerender(<SignInBoxHost />);
  return { boxAttempt, onComplete, onError, onCancel, press, fallback };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ ourSignInBox: true }));
  resetAuthAttempt();
  mocks.login.mockReset();
  mocks.prepareOnboarding.mockReset();
  mocks.isModalOpen = false;
});
afterEach(() => {
  cleanup();
  closeSignInBox();
});

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

describe("the sign-in box while Privy's dialog stands in", () => {
  it('steps aside, keeping the press open', () => {
    pressThenFallBack();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(isSignInBoxOpen()).toBe(true);
  });

  it("runs the continuation once although the control unmounted while Privy's dialog was open", () => {
    const { onComplete, press } = pressThenFallBack();
    press.unmount();
    act(() => {
      broadcast(callbacks => callbacks.onComplete?.({ wasAlreadyAuthenticated: false }));
      finishAuthAttempt('signed_in');
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(isSignInBoxOpen()).toBe(false);
  });

  it("withdraws once although the control unmounted while Privy's dialog was open", () => {
    const { onError, onCancel, press } = pressThenFallBack();
    press.unmount();
    act(() => {
      broadcast(callbacks => callbacks.onError?.('exited_auth_flow'));
      cancelPrivyAuth();
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(isSignInBoxOpen()).toBe(false);
  });

  it('runs the continuation once when both the control and the box hear it', () => {
    const { onComplete } = pressThenFallBack();
    act(() => {
      broadcast(callbacks => callbacks.onComplete?.({ wasAlreadyAuthenticated: false }));
      finishAuthAttempt('signed_in');
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('a fallback whose press was replaced', () => {
  it('opens nothing and leaves the newer press alone', () => {
    const press = renderHook(() => usePrivySignIn(), { wrapper });
    act(() => void press.result.current({ component: 'follow_button' }));
    const stale = readSignInBox()?.attemptId;
    act(() => void press.result.current({ component: 'vote_button' }));
    const newer = currentAuthAttempt()?.id;
    mocks.prepareOnboarding.mockClear();

    const fallback = renderHook(() => usePrivySignIn(undefined, { surface: 'privy' }), { wrapper });
    let opened: unknown;
    act(() => void (opened = fallback.result.current(undefined, { attemptId: stale })));

    expect(opened).toBeUndefined();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.prepareOnboarding).not.toHaveBeenCalled();
    expect(currentAuthAttempt()).toMatchObject({ id: newer });
    expect(currentAuthAttempt()?.endedAt).toBeUndefined();
    expect(readSignInBox()?.attemptId).toBe(newer);
  });
});
