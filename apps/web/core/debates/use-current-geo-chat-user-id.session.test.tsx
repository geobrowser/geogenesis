import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetGeoChatSession } from './api';
import { useCurrentGeoChatUserId } from './use-current-geo-chat-user-id';

// The real session store and its notifications; only the Privy side is stubbed.
vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: true,
    accountKey: 'account-a',
    getPrivyIdentityToken: async () => 'privy-token',
  }),
}));

const jwt = (userId: string) => `x.${btoa(JSON.stringify({ user_id: userId }))}.y`;
const session = (userId: string) => ({
  access_token: jwt(userId),
  refresh_token: 'refresh',
  expires_at: '2099-01-01T00:00:00Z',
  profile: null,
});

function Probe() {
  return <span data-testid="id">{useCurrentGeoChatUserId() ?? 'unknown'}</span>;
}
const readId = () => screen.getByTestId('id').textContent;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('useCurrentGeoChatUserId over the real session store', () => {
  it('rides through a reset on the last id, then takes the new session’s', async () => {
    window.localStorage.setItem(
      'geo:chat-session',
      JSON.stringify({ account_key: 'account-a', session: session('user-a') })
    );
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(resolve => (answer = resolve)))
    );
    render(<Probe />);
    expect(readId()).toBe('user-a');

    act(() => resetGeoChatSession());
    expect(readId()).toBe('user-a');
    await waitFor(() => expect(fetch).toHaveBeenCalled());

    await act(async () => {
      answer(new Response(JSON.stringify(session('user-a2')), { status: 200 }));
    });
    await waitFor(() => expect(readId()).toBe('user-a2'));
  });
});
