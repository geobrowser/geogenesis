import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePrivySignIn } from './use-privy-sign-in';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  /** Whatever the hook handed Privy, so a restore can be fired without a login. */
  privyOnComplete: undefined as undefined | ((args: unknown) => void),
  trackPrivyAuth: vi.fn(),
  setStep: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  useGeoLogin: ({ onComplete }: { onComplete: (args: unknown) => void }) => {
    mocks.privyOnComplete = onComplete;
    return { login: mocks.login };
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/space/space-1/debates',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('~/core/analytics', () => ({ trackPrivyAuth: mocks.trackPrivyAuth }));

vi.mock('~/partials/onboarding/dialog', async () => {
  const { atom } = await import('jotai');
  return {
    nameAtom: atom(''),
    topicIdAtom: atom(''),
    avatarAtom: atom(''),
    spaceIdAtom: atom(''),
    stepAtom: atom('enter-profile'),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.privyOnComplete = undefined;
});

describe('usePrivySignIn', () => {
  // Privy fires onComplete when it restores an existing session — opening a second tab does it —
  // so an unarmed callback would run the consumer's intent with nobody having pressed anything.
  it('ignores a completion the caller never asked for', () => {
    const onComplete = vi.fn();
    renderHook(() => usePrivySignIn(onComplete));

    act(() => mocks.privyOnComplete?.({}));

    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('runs the callback for a sign-in it started, once', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePrivySignIn(onComplete));

    act(() => result.current());
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();

    act(() => mocks.privyOnComplete?.({}));
    expect(onComplete).toHaveBeenCalledOnce();

    // Disarmed again, so a later restore in this tab does not replay the intent.
    act(() => mocks.privyOnComplete?.({}));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
