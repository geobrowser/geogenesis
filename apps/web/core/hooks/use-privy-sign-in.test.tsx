import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionContextProvider } from '~/core/action-context-provider';
import { beginAuthAttempt, finishAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';

import { usePrivySignIn } from './use-privy-sign-in';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  beginPrivyAuth: vi.fn(),
  setStep: vi.fn(),
  takeCodeRecovery: vi.fn(),
  codeRecoveryOffered: vi.fn(),
}));

vi.mock('~/core/auth/code-step', () => ({
  takeCodeRecovery: mocks.takeCodeRecovery,
  codeRecoveryOffered: mocks.codeRecoveryOffered,
  codeRecoveryProperties: (pending: { attemptId?: string }) => ({
    auth_recovery: 'reloaded_code_step',
    recovered_attempt_id: pending.attemptId,
  }),
}));

vi.mock('~/core/wallet/auth-hooks', () => ({
  // `usePrepareOnboarding` reads it to leave a signed-in user's onboarding alone.
  usePrivy: () => ({ authenticated: false }),
  useGeoLogin: () => ({ login: mocks.login }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/space/space-1/debates',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('~/core/analytics', () => ({ capture: vi.fn(), captureExperimental: vi.fn() }));

vi.mock('~/core/privy-auth-events', () => ({ beginPrivyAuth: mocks.beginPrivyAuth }));

vi.mock('~/partials/onboarding/onboarding-atoms', async () => {
  const { atom } = await import('jotai');
  return {
    nameAtom: atom(''),
    topicIdAtom: atom(''),
    avatarAtom: atom(''),
    spaceIdAtom: atom(''),
    stepAtom: atom('enter-profile'),
    // Persisted onboarding state like the rest, and the one every hand-written reset forgot —
    // `PendingPersonalSpaceRunner` turns it into membership proposals for the new personal space.
    selectedTopicIdsAtom: atom<string[]>([]),
    onboardingNameOnlyAtom: atom(false),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.takeCodeRecovery.mockReset();
  mocks.beginPrivyAuth.mockReset();
  mocks.beginPrivyAuth.mockImplementation(properties => beginAuthAttempt(properties));
  localStorage.clear();
  sessionStorage.clear();
  resetAuthAttempt();
});

// What `PrivyAuthTracker` does with Privy's callbacks: a sign-in or a dismissal ends the attempt.
const privySignsIn = () => finishAuthAttempt('signed_in');
const privyReports = (error: string) => {
  if (error === 'exited_auth_flow') finishAuthAttempt('closed');
};

describe('usePrivySignIn', () => {
  // GEO-3573: the first sign-in a new page opens picks up a code step left by an earlier page.
  it('picks up a code step from an earlier page, keeping its own attribution and destination', () => {
    const pending = {
      attemptId: 'original',
      email: 'a@b.co',
      properties: { component: 'save_votes', link_source: 'x' },
    };
    mocks.takeCodeRecovery.mockReturnValue(pending);
    mocks.beginPrivyAuth.mockReturnValue({ id: 'recovery' });
    const { result } = renderHook(() => usePrivySignIn(undefined, { analytics: { component: 'debate_matchmaking' } }));

    act(() => void result.current());
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'debate_matchmaking',
        link_source: 'x',
        auth_recovery: 'reloaded_code_step',
        recovered_attempt_id: 'original',
      }),
      { resume: undefined }
    );
    expect(mocks.login).toHaveBeenCalledWith(expect.objectContaining({ prefill: { type: 'email', value: 'a@b.co' } }));
    expect(mocks.codeRecoveryOffered).toHaveBeenCalledWith(pending, 'recovery');
    // Whether this sign-in may pick it up depends on its own trigger, so it is handed its properties.
    expect(mocks.takeCodeRecovery).toHaveBeenCalledWith({ component: 'debate_matchmaking' });
  });

  // Privy fires onComplete when it restores an existing session — opening a second tab does it —
  // so an unarmed callback would run the consumer's intent with nobody having pressed anything.
  it('ignores a completion the caller never asked for', () => {
    const onComplete = vi.fn();
    renderHook(() => usePrivySignIn(onComplete));

    act(() => privySignsIn());

    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('runs the callback for a sign-in it started, once', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePrivySignIn(onComplete));

    act(() => result.current());
    expect(mocks.login).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();

    act(() => privySignsIn());
    expect(onComplete).toHaveBeenCalledOnce();

    // Disarmed again, so a later restore in this tab does not replay the intent.
    act(() => privySignsIn());
    expect(onComplete).toHaveBeenCalledOnce();
  });

  // PrivyAuthTracker owns auth events. This hook only snapshots attribution at the press.
  it('starts tracking only when sign-in is requested', () => {
    const { result } = renderHook(() => usePrivySignIn());

    act(() => privySignsIn());
    expect(mocks.beginPrivyAuth).not.toHaveBeenCalled();

    act(() => result.current());
    act(() => privySignsIn());
    expect(mocks.beginPrivyAuth).toHaveBeenCalledOnce();
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'sign_in_prompt', auth_trigger: 'control' }),
      { resume: undefined }
    );
  });

  // The deep link strips its own params as it opens the dialog, so the render that sees the
  // completion no longer knows where the viewer came from. Reading the attribution then would
  // lose it in exactly the case it exists for.
  it('keeps the attribution from the press, not from whatever the page says later', () => {
    // Typed, because inference reads `initialProps` as `{ link_source: string }` and the rerender
    // below deliberately clears it.
    type Props = { analytics?: Record<string, unknown> };
    const { result, rerender } = renderHook<ReturnType<typeof usePrivySignIn>, Props>(
      props => usePrivySignIn(undefined, props),
      { initialProps: { analytics: { link_source: 'marketing' } } }
    );

    act(() => result.current());

    // The URL is cleaned, the handler rerenders, the source is gone.
    rerender({ analytics: { link_source: undefined } });

    act(() => privySignsIn());

    expect(mocks.beginPrivyAuth.mock.calls[0]?.[0]).toMatchObject({
      link_source: 'marketing',
    });
  });

  it('does not carry attribution from one attempt into the next', () => {
    const { result, rerender } = renderHook(
      (props: { analytics?: Record<string, unknown> }) => usePrivySignIn(undefined, props),
      { initialProps: { analytics: { link_source: 'marketing' } as Record<string, unknown> | undefined } }
    );

    act(() => result.current());
    act(() => privyReports('exited_auth_flow'));

    rerender({ analytics: undefined });
    act(() => result.current());
    act(() => privySignsIn());

    expect(mocks.beginPrivyAuth).toHaveBeenLastCalledWith(expect.not.objectContaining({ link_source: 'marketing' }), {
      resume: undefined,
    });
  });

  // Dismissing the modal abandons the press. Staying armed would hand it to whatever completion
  // came next — a restore, or a login started elsewhere on the page.
  it('forgets an abandoned sign-in rather than replaying it later', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePrivySignIn(onComplete));

    act(() => result.current());
    act(() => privyReports('exited_auth_flow'));
    act(() => privySignsIn());

    expect(onComplete).not.toHaveBeenCalled();
  });

  // A control that queued the viewer's choice at the press withdraws it if they walk away, even
  // after it unmounted.
  it("withdraws a press's own cancel once its attempt is dismissed, after the control unmounted", () => {
    const onCancel = vi.fn();
    const { result, unmount } = renderHook(() => usePrivySignIn());

    act(() => result.current(undefined, { onCancel }));
    unmount();
    expect(onCancel).not.toHaveBeenCalled();

    act(() => privyReports('exited_auth_flow'));
    act(() => privyReports('exited_auth_flow'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("drops a press's cancel when it signs in, or a newer press replaces it", () => {
    const onCancel = vi.fn();
    const { result } = renderHook(() => usePrivySignIn());

    act(() => result.current(undefined, { onCancel }));
    act(() => privySignsIn());
    act(() => result.current(undefined, { onCancel }));
    act(() => result.current());
    act(() => privyReports('exited_auth_flow'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('runs the continuation once although the control unmounted while Privy was open', () => {
    const onComplete = vi.fn();
    const { result, unmount } = renderHook(() => usePrivySignIn(onComplete));

    act(() => result.current());
    unmount();
    act(() => privySignsIn());
    act(() => privySignsIn());
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('notifies the initiating surface when the modal is dismissed or fails', () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      usePrivySignIn(undefined, { onError } as Parameters<typeof usePrivySignIn>[1] & { onError: () => void })
    );

    act(() => result.current());
    act(() => privyReports('exited_auth_flow'));

    expect(onError).toHaveBeenCalledOnce();
  });

  it('ignores an error from a login attempt this hook did not start', () => {
    const onError = vi.fn();
    renderHook(() => usePrivySignIn(undefined, { onError }));

    act(() => privyReports('exited_auth_flow'));

    expect(onError).not.toHaveBeenCalled();
  });
  it('keeps the initiating callback armed after a rejected code', () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => usePrivySignIn(onComplete));
    act(() => result.current());
    act(() => privyReports('invalid_credentials'));
    act(() => privySignsIn());
    expect(onComplete).toHaveBeenCalledOnce();
  });
  it('uses the same inherited surface as the signed-in action', () => {
    const { result } = renderHook(
      () =>
        usePrivySignIn(undefined, {
          analytics: {
            component: 'comment_composer',
            auth_control: 'comment',
            target_id: 'claim',
            target_type: 'claim',
          },
        }),
      {
        wrapper: ({ children }) => (
          <ActionContextProvider
            value={{
              component: 'explore_feed_card',
              target_id: 'claim',
              target_type: 'claim',
              origin_entity_ids: ['debate'],
              item_position: 4,
            }}
          >
            {children}
          </ActionContextProvider>
        ),
      }
    );
    act(() => result.current());
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'explore_feed_card',
        auth_control: 'comment',
        target_id: 'claim',
        origin_entity_ids: ['debate'],
        item_position: 4,
      }),
      { resume: undefined }
    );
  });
  it('passes the resume option when opening the modal for an email attempt', () => {
    const { result } = renderHook(() => usePrivySignIn(undefined, { resumeAuthAttempt: true }));
    act(() => result.current());
    expect(mocks.beginPrivyAuth).toHaveBeenCalledWith(expect.any(Object), { resume: true });
    expect(mocks.login).toHaveBeenCalledOnce();
  });
});
