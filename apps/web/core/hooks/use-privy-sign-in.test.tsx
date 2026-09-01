import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePrivySignIn } from './use-privy-sign-in';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  /** Whatever the hook handed Privy, so a restore can be fired without a login. */
  privyOnComplete: undefined as undefined | ((args: unknown) => void),
  /** Privy's exit path: a failed attempt, or the viewer dismissing the modal. */
  privyOnError: undefined as undefined | ((error: unknown) => void),
  trackPrivyAuth: vi.fn(),
  setStep: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  useGeoLogin: ({
    onComplete,
    onError,
  }: {
    onComplete: (args: unknown) => void;
    onError?: (error: unknown) => void;
  }) => {
    mocks.privyOnComplete = onComplete;
    mocks.privyOnError = onError;
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
  mocks.privyOnError = undefined;
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

  // `AnalyticsUserIdentifier` already reports restores, as restores. Recording one here as a
  // manual login double-counted it and mislabelled it — and since this hook is now mounted
  // app-wide for the sign-in deep link, that would have been every page load with a live session.
  it('records a login only for a sign-in it started', () => {
    const { result } = renderHook(() => usePrivySignIn());

    act(() => mocks.privyOnComplete?.({}));
    expect(mocks.trackPrivyAuth).not.toHaveBeenCalled();

    act(() => result.current());
    act(() => mocks.privyOnComplete?.({}));
    expect(mocks.trackPrivyAuth).toHaveBeenCalledOnce();
    expect(mocks.trackPrivyAuth.mock.calls[0]?.[1]).toMatchObject({ auth_flow: 'manual_login' });
  });

  // The deep link strips its own params as it opens the dialog, so the render that sees the
  // completion no longer knows where the viewer came from. Reading the attribution then would
  // lose it in exactly the case it exists for.
  it('keeps the attribution from the press, not from whatever the page says later', () => {
    const { result, rerender } = renderHook(
      (props: { analytics?: Record<string, unknown> }) => usePrivySignIn(undefined, props),
      { initialProps: { analytics: { link_source: 'marketing' } } }
    );

    act(() => result.current());

    // The URL is cleaned, the handler rerenders, the source is gone.
    rerender({ analytics: { link_source: undefined } });

    act(() => mocks.privyOnComplete?.({}));

    expect(mocks.trackPrivyAuth.mock.calls[0]?.[1]).toMatchObject({
      auth_flow: 'manual_login',
      link_source: 'marketing',
    });
  });

  it('does not carry attribution from one attempt into the next', () => {
    const { result, rerender } = renderHook(
      (props: { analytics?: Record<string, unknown> }) => usePrivySignIn(undefined, props),
      { initialProps: { analytics: { link_source: 'marketing' } as Record<string, unknown> | undefined } }
    );

    act(() => result.current());
    act(() => mocks.privyOnError?.('exited_auth_flow'));

    rerender({ analytics: undefined });
    act(() => result.current());
    act(() => mocks.privyOnComplete?.({}));

    expect(mocks.trackPrivyAuth.mock.calls[0]?.[1]).not.toHaveProperty('link_source');
  });

  // Dismissing the modal abandons the press. Staying armed would hand it to whatever completion
  // came next — a restore, or a login started elsewhere on the page.
  it('forgets an abandoned sign-in rather than replaying it later', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePrivySignIn(onComplete));

    act(() => result.current());
    act(() => mocks.privyOnError?.('exited_auth_flow'));
    act(() => mocks.privyOnComplete?.({}));

    expect(onComplete).not.toHaveBeenCalled();
  });
});
