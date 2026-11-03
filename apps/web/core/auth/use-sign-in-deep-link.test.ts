import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  via: null as string | null,
  options: undefined as { analytics?: Record<string, unknown> } | undefined,
  run: undefined as (() => void) | undefined,
  openSignIn: vi.fn(),
  privy: { ready: true, authenticated: false, isModalOpen: false },
  recovering: false,
}));

vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => mocks.privy }));
vi.mock('~/core/auth/code-step', () => ({ recoveringCodeStep: () => mocks.recovering }));
vi.mock('~/core/deep-links/use-deep-link', () => ({
  useDeepLinkParams: () => ({ via: mocks.via, cleanUrl: window.location.pathname }),
  useDeepLinkEffect: ({ run }: { run: () => void }) => void (mocks.run = run),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_: unknown, options: typeof mocks.options) => {
    mocks.options = options;
    return mocks.openSignIn;
  },
}));

const { OPENING_NOTICE_TIMEOUT_MS, useSignInDeepLink } = await import('./use-sign-in-deep-link');
const { SIGN_IN_PENDING_ATTRIBUTE, SIGN_IN_PENDING_SCRIPT } = await import('./sign-in-pending');
const { claimLobbySignInPrompt } = await import('~/core/debates/lobbies/lobby-guest-sign-in');

const LOBBY = '5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
// The prompt record outlives `sessionStorage.clear()` (it is per page load), so each test that
// claims one uses its own room.
const PROMPTED_LOBBY = '6a1d2b3c-4d5e-4f60-9b0c-1d2e3f4a5b6c';
const ROOM_LINKED_LOBBY = '7b2e3c4d-5e6f-4071-8c1d-2e3f4a5b6c7d';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  mocks.via = null;
  mocks.options = undefined;
  mocks.run = undefined;
  mocks.openSignIn.mockReset();
  mocks.privy = { ready: true, authenticated: false, isModalOpen: false };
  mocks.recovering = false;
  document.documentElement.removeAttribute(SIGN_IN_PENDING_ATTRIBUTE);
  window.sessionStorage.clear();
});

describe('useSignInDeepLink', () => {
  it('attributes a sign-in from a debate room to the room', () => {
    window.history.replaceState(null, '', '/debate/room-1');
    mocks.via = 'room';
    renderHook(() => useSignInDeepLink());
    expect(mocks.options?.analytics).toMatchObject({
      link_source: 'room',
      auth_control: 'join_debate',
      auth_intent: 'join_debate',
      target_type: 'debate_room',
      target_id: 'room-1',
    });
  });

  // GEO-3126: sign-ups from inside a lobby, by its dashless id.
  it('attributes a sign-in from a lobby’s shared link to the lobby, with no action to resume', () => {
    window.history.replaceState(null, '', `/debate/${LOBBY}`);
    mocks.via = 'lobby';
    renderHook(() => useSignInDeepLink());
    const analytics = mocks.options?.analytics;
    expect(analytics).toMatchObject({
      link_source: 'lobby',
      auth_control: 'join_lobby',
      target_type: 'debate_lobby',
      target_id: LOBBY.replaceAll('-', ''),
      page_entity_type: 'debate_lobby',
    });
    expect(analytics).not.toHaveProperty('auth_intent');
  });

  // GEO-3270. The lobby page prompts on arrival too; one prompt per lobby per tab between them.
  it('records the lobby as prompted, so the lobby page does not open a second one', () => {
    window.history.replaceState(null, '', `/debate/${PROMPTED_LOBBY}`);
    mocks.via = 'lobby';
    renderHook(() => useSignInDeepLink());
    mocks.run?.();

    expect(mocks.openSignIn).toHaveBeenCalledTimes(1);
    expect(claimLobbySignInPrompt(PROMPTED_LOBBY)).toBe(false);
  });

  // A bare lobby link's fallback notice signs in as `via=room`; the lobby page may still load after.
  it('records the prompt for a room link without the lobby attribution too', () => {
    window.history.replaceState(null, '', `/debate/${ROOM_LINKED_LOBBY}`);
    mocks.via = 'room';
    renderHook(() => useSignInDeepLink());
    mocks.run?.();

    expect(claimLobbySignInPrompt(ROOM_LINKED_LOBBY)).toBe(false);
  });

  // GEO-3569: the dialog can take seconds to start; the visitor sees that it is coming.
  it('reports opening from the press until the dialog is up', () => {
    const { result, rerender } = renderHook(() => useSignInDeepLink());
    expect(result.current.opening).toBe(false);
    act(() => mocks.run?.());
    expect(result.current.opening).toBe(true);
    expect(document.documentElement.hasAttribute(SIGN_IN_PENDING_ATTRIBUTE)).toBe(true);
    mocks.privy = { ...mocks.privy, isModalOpen: true };
    rerender();
    expect(result.current.opening).toBe(false);
    expect(document.documentElement.hasAttribute(SIGN_IN_PENDING_ATTRIBUTE)).toBe(false);
  });

  it('stops reporting opening if the dialog never comes', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSignInDeepLink());
    act(() => mocks.run?.());
    act(() => void vi.advanceTimersByTime(OPENING_NOTICE_TIMEOUT_MS));
    expect(result.current.opening).toBe(false);
    vi.useRealTimers();
  });

  // GEO-3573: a tab reloaded at the code step reopens sign-in itself, prefilled.
  it('leaves a reloaded code step to its recovery', () => {
    mocks.recovering = true;
    document.documentElement.setAttribute(SIGN_IN_PENDING_ATTRIBUTE, '');
    const { result } = renderHook(() => useSignInDeepLink());
    act(() => mocks.run?.());
    expect(mocks.openSignIn).not.toHaveBeenCalled();
    expect(result.current.opening).toBe(false);
    // The layout's overlay, set before the app ran, comes down too.
    expect(document.documentElement.hasAttribute(SIGN_IN_PENDING_ATTRIBUTE)).toBe(false);
  });

  // The inline script runs before React; it must recognise only the sign-in link.
  it('marks the page from the inline script for the sign-in link only, and unmarks it on its own', () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/explore?modal=debates');
    new Function(SIGN_IN_PENDING_SCRIPT)();
    expect(document.documentElement.hasAttribute(SIGN_IN_PENDING_ATTRIBUTE)).toBe(false);

    window.history.replaceState(null, '', '/explore?modal=signin&via=marketing');
    new Function(SIGN_IN_PENDING_SCRIPT)();
    expect(document.documentElement.hasAttribute(SIGN_IN_PENDING_ATTRIBUTE)).toBe(true);
    vi.advanceTimersByTime(20_000);
    expect(document.documentElement.hasAttribute(SIGN_IN_PENDING_ATTRIBUTE)).toBe(false);
    vi.useRealTimers();
  });
});
