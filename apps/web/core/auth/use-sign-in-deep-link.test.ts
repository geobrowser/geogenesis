import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  via: null as string | null,
  options: undefined as { analytics?: Record<string, unknown> } | undefined,
}));

vi.mock('@geogenesis/auth', () => ({ usePrivy: () => ({ ready: true, authenticated: false }) }));
vi.mock('~/core/deep-links/use-deep-link', () => ({
  useDeepLinkParams: () => ({ via: mocks.via, cleanUrl: window.location.pathname }),
  useDeepLinkEffect: () => undefined,
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (_: unknown, options: typeof mocks.options) => {
    mocks.options = options;
    return vi.fn();
  },
}));

const { useSignInDeepLink } = await import('./use-sign-in-deep-link');

const LOBBY = '5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  mocks.via = null;
  mocks.options = undefined;
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
});
