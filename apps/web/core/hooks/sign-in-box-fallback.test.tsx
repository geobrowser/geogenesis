import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentAuthAttempt, finishAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';
import { closeSignInBox, isSignInBoxOpen, readSignInBox } from '~/core/auth/sign-in-box/sign-in-box-store';
import { cancelPrivyAuth } from '~/core/privy-auth-events';

import { SignInBoxHost } from '~/partials/sign-in/sign-in-box';
import { SIGN_IN_BOX_COPY } from '~/partials/sign-in/sign-in-box-copy';

import { usePrivySignIn } from './use-privy-sign-in';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  prepareOnboarding: vi.fn(),
  isModalOpen: false,
}));

vi.mock('~/core/analytics', () => ({
  capture: vi.fn(),
  captureExperimental: vi.fn(),
  restorePrivySession: vi.fn(),
  startAnalyticsSoon: vi.fn(),
  trackPrivyAuth: vi.fn(),
}));
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: true, authenticated: false, isModalOpen: mocks.isModalOpen }),
  useGeoLogin: () => ({ login: mocks.login }),
}));
// The box stays on its email step here; the code step is not under test.
vi.mock('~/partials/explore/email-capture-account-step', () => ({
  AccountStep: () => null,
  SIGN_IN_UNAVAILABLE_COPY: 'Couldn’t reach sign-in. Try again.',
}));
vi.mock('./use-prepare-onboarding', () => ({ usePrepareOnboarding: () => mocks.prepareOnboarding }));

const store = createStore();
const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

// What `PrivyAuthTracker` and the code step do with Privy's outcome: end the current attempt.
const signsIn = () => act(() => finishAuthAttempt('signed_in'));
const dismisses = () => act(() => cancelPrivyAuth());

/** A press, as a follow button makes it, with its continuation and its own withdrawal. */
function press() {
  const onComplete = vi.fn();
  const onError = vi.fn();
  const onCancel = vi.fn();
  const control = renderHook(() => usePrivySignIn(onComplete, { onError }), { wrapper });
  act(() => void control.result.current({ component: 'follow_button' }, { onCancel }));
  return { onComplete, onError, onCancel, control };
}

/** The box's code step could not send, so Privy's dialog takes over its attempt, as `AccountStep` does. */
function fallBack(attemptId: string | undefined) {
  const fallback = renderHook(
    () => usePrivySignIn(undefined, { analytics: { component: 'follow_button' }, resumeAuthAttempt: true }),
    { wrapper }
  );
  let opened: unknown;
  act(() => void (opened = fallback.result.current(undefined, { fallbackFor: attemptId })));
  return opened;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAuthAttempt();
  mocks.login.mockReset();
  mocks.prepareOnboarding.mockReset();
  mocks.isModalOpen = false;
});
afterEach(() => {
  cleanup();
  closeSignInBox();
});

describe("a press's continuation", () => {
  describe('on the box', () => {
    it('runs once on sign-in, although the control unmounted', () => {
      render(<SignInBoxHost />, { wrapper });
      const { onComplete, onCancel, control } = press();
      control.unmount();
      signsIn();
      signsIn();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(isSignInBoxOpen()).toBe(false);
    });

    it('withdraws once when the box is closed, although the control unmounted', () => {
      render(<SignInBoxHost />, { wrapper });
      const { onComplete, onError, onCancel, control } = press();
      control.unmount();
      fireEvent.click(screen.getByRole('button', { name: SIGN_IN_BOX_COPY.close }));
      dismisses();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe("on Privy's fallback dialog", () => {
    function pressThenFallBack() {
      const host = render(<SignInBoxHost />, { wrapper });
      const pressed = press();
      const boxAttempt = readSignInBox()?.attemptId;
      fallBack(boxAttempt);
      mocks.isModalOpen = true;
      host.rerender(<SignInBoxHost />);
      return { ...pressed, boxAttempt };
    }

    it("carries on the box's attempt, without preparing onboarding again, and the box closes", () => {
      const { boxAttempt } = pressThenFallBack();
      expect(mocks.login).toHaveBeenCalledTimes(1);
      expect(currentAuthAttempt()).toMatchObject({ id: boxAttempt });
      expect(currentAuthAttempt()?.endedAt).toBeUndefined();
      expect(mocks.prepareOnboarding).toHaveBeenCalledTimes(1);
      expect(isSignInBoxOpen()).toBe(false);
    });

    it('runs once on sign-in, although the control unmounted', () => {
      const { onComplete, onCancel, control } = pressThenFallBack();
      control.unmount();
      signsIn();
      signsIn();
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('withdraws once on dismissal, although the control unmounted', () => {
      const { onComplete, onError, onCancel, control } = pressThenFallBack();
      control.unmount();
      dismisses();
      dismisses();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  it('is dropped, not run, for a press a newer one replaced', () => {
    const first = press();
    const second = press();
    signsIn();
    expect(first.onComplete).not.toHaveBeenCalled();
    expect(first.onCancel).not.toHaveBeenCalled();
    expect(second.onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('a fallback whose press was replaced', () => {
  it('opens nothing and leaves the newer press alone', () => {
    press();
    const stale = readSignInBox()?.attemptId;
    press();
    const newer = currentAuthAttempt()?.id;
    mocks.prepareOnboarding.mockClear();

    expect(fallBack(stale)).toBeUndefined();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.prepareOnboarding).not.toHaveBeenCalled();
    expect(currentAuthAttempt()).toMatchObject({ id: newer });
    expect(currentAuthAttempt()?.endedAt).toBeUndefined();
    expect(readSignInBox()?.attemptId).toBe(newer);
  });
});
