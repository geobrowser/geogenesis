import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  options: undefined as { redirectTo?: string; analytics?: () => Record<string, unknown> } | undefined,
  search: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/debate/lobbyg',
  useSearchParams: () => mocks.search,
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_onComplete: unknown, options: typeof mocks.options) => {
    mocks.options = options;
    return mocks.signIn;
  },
}));

const { claimLobbySignInPrompt, useLobbySignInPrompt } = await import('./lobby-guest-sign-in');
const { markLobbyEntry, resetLobbyAnalytics } = await import('./lobby-analytics');

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.signIn.mockReset();
  mocks.search = new URLSearchParams();
  resetLobbyAnalytics();
});

afterEach(() => cleanup());

describe('useLobbySignInPrompt', () => {
  it('opens the prompt once, back to the lobby, attributed to it', () => {
    renderHook(() => useLobbySignInPrompt('lobby-a', true));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).toHaveBeenCalledWith(
      { component: 'lobby_sign_in_prompt', auth_trigger: 'page_load', lobby_entry: 'link' },
      { redirectTo: '/debate/lobbya' }
    );
    expect(mocks.options?.analytics?.()).toMatchObject({
      link_source: 'lobby',
      auth_control: 'join_lobby',
      target_type: 'debate_lobby',
      target_id: 'lobbya',
    });
  });

  it('waits until asked', () => {
    const { rerender } = renderHook(({ open }) => useLobbySignInPrompt('lobby-b', open), {
      initialProps: { open: false },
    });
    expect(mocks.signIn).not.toHaveBeenCalled();

    rerender({ open: true });
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });

  // Closing it and reloading should not put it straight back.
  it('does not reopen for the same lobby in this tab', () => {
    renderHook(() => useLobbySignInPrompt('lobby-c', true));
    cleanup();
    renderHook(() => useLobbySignInPrompt('lobby-c', true));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.length).toBe(1);
  });

  it('opens again for another lobby', () => {
    renderHook(() => useLobbySignInPrompt('lobby-d', true));
    renderHook(() => useLobbySignInPrompt('lobby-e', true));

    expect(mocks.signIn).toHaveBeenCalledTimes(2);
  });

  it('does not open for a lobby the sign-in link already prompted for', () => {
    claimLobbySignInPrompt('lobby-f');
    renderHook(() => useLobbySignInPrompt('lobby-f', true));

    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  // The link opens its own prompt once Privy is ready; which effect runs first is not fixed.
  it('waits while the sign-in link is in the URL, without using up the lobby’s prompt', () => {
    mocks.search = new URLSearchParams('modal=signin&via=lobby');
    const { rerender } = renderHook(() => useLobbySignInPrompt('lobby-g', true));
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);

    mocks.search = new URLSearchParams();
    rerender();
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });

  // Callers still share the record, so the deep link and the page do not both open it.
  it('still claims once per lobby when storage is unavailable', () => {
    const storage = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      expect(claimLobbySignInPrompt('lobby-h')).toBe(true);
      expect(claimLobbySignInPrompt('lobby-h')).toBe(false);
    } finally {
      if (storage) Object.defineProperty(window, 'sessionStorage', storage);
    }
  });

  // GEO-3289. Pressed in the navbar or the debates panel: the entry goes with the attempt, and the
  // press asks again in a tab that was already asked.
  it('asks again for a press in the navbar or panel, naming where it came from', () => {
    renderHook(() => useLobbySignInPrompt('lobby-i', true));
    cleanup();
    markLobbyEntry('lobby-i', 'side_panel');
    renderHook(() => useLobbySignInPrompt('lobby-i', true));

    expect(mocks.signIn).toHaveBeenCalledTimes(2);
    expect(mocks.signIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ lobby_entry: 'side_panel' }),
      expect.anything()
    );
  });

  it('does not ask again for a press marked for another lobby', () => {
    renderHook(() => useLobbySignInPrompt('lobby-j', true));
    cleanup();
    markLobbyEntry('lobby-k', 'nav');
    renderHook(() => useLobbySignInPrompt('lobby-j', true));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });

  // Copilot on #2863: the press is answered once. Back to the lobby within the marker's minute is
  // not another press, and must not reopen a prompt the visitor dismissed.
  it('answers a press once, so coming back with Back does not ask again', () => {
    markLobbyEntry('lobby-l', 'nav');
    renderHook(() => useLobbySignInPrompt('lobby-l', true));
    cleanup();
    renderHook(() => useLobbySignInPrompt('lobby-l', true));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });

  // And pressing Join for the lobby already on screen asks, though its page stays mounted.
  it('asks for a press on the lobby whose page is open', () => {
    renderHook(() => useLobbySignInPrompt('lobby-m', true));
    expect(mocks.signIn).toHaveBeenCalledTimes(1);

    act(() => markLobbyEntry('lobby-m', 'side_panel'));
    expect(mocks.signIn).toHaveBeenCalledTimes(2);
    expect(mocks.signIn).toHaveBeenLastCalledWith(
      expect.objectContaining({ lobby_entry: 'side_panel' }),
      expect.anything()
    );
  });
});
