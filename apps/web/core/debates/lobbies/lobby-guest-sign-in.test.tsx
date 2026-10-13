import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  options: undefined as { redirectTo?: string; analytics?: () => Record<string, unknown> } | undefined,
}));

vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_onComplete: unknown, options: typeof mocks.options) => {
    mocks.options = options;
    return mocks.signIn;
  },
}));

const { claimLobbySignInPrompt, useLobbySignInPrompt } = await import('./lobby-guest-sign-in');

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.signIn.mockReset();
});

afterEach(() => cleanup());

describe('useLobbySignInPrompt', () => {
  it('opens the prompt once, back to the lobby, attributed to it', () => {
    renderHook(() => useLobbySignInPrompt('lobby-a', true));

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).toHaveBeenCalledWith(
      { component: 'lobby_sign_in_prompt', auth_trigger: 'page_load' },
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
});
