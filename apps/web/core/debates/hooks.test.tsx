import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';

import type { DebateActivity, DebateRematchSession } from './api';
import { debateQueryKeys, useClearTimedOutDebateActivity, useConsentToDebateRematch, useGeoChatAuth } from './hooks';

const mocks = vi.hoisted(() => ({
  getIdentityToken: vi.fn(),
  identityToken: vi.fn(),
  consentToDebateRematch: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: mocks.getIdentityToken,
  useIdentityToken: () => ({ identityToken: mocks.identityToken() }),
  usePrivy: () => ({ ready: true, authenticated: true }),
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, consentToDebateRematch: mocks.consentToDebateRematch };
});

function jwtExpiringIn(seconds: number) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }));
  return `header.${payload}.signature`;
}

describe('useGeoChatAuth', () => {
  beforeEach(() => {
    mocks.getIdentityToken.mockReset();
    mocks.identityToken.mockReset();
    mocks.consentToDebateRematch.mockReset();
    setCachedIdentityToken(null);
  });

  it('uses the Privy identity token for geo-chat session exchange', async () => {
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue('identity-token');

    const { result } = renderHook(() => useGeoChatAuth());

    await expect(result.current.getPrivyIdentityToken()).resolves.toBe('identity-token');
  });

  // getIdentityToken() is a `users/me` round-trip, not a local read, so calling it on
  // every poll is what got us rate limited by Privy.
  it('serves a live token from cache instead of calling Privy per request', async () => {
    mocks.identityToken.mockReturnValue(jwtExpiringIn(60 * 60));
    mocks.getIdentityToken.mockResolvedValue('refreshed-token');

    const { result } = renderHook(() => useGeoChatAuth());

    await result.current.getPrivyIdentityToken();
    await result.current.getPrivyIdentityToken();
    await result.current.getPrivyIdentityToken();

    expect(mocks.getIdentityToken).not.toHaveBeenCalled();
  });

  it('refreshes through Privy once the token nears expiry', async () => {
    mocks.identityToken.mockReturnValue(jwtExpiringIn(30));
    mocks.getIdentityToken.mockResolvedValue('refreshed-token');

    const { result } = renderHook(() => useGeoChatAuth());

    await expect(result.current.getPrivyIdentityToken()).resolves.toBe('refreshed-token');
    expect(mocks.getIdentityToken).toHaveBeenCalledTimes(1);
  });

  it('backs off instead of retrying a failed refresh on every poll', async () => {
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockRejectedValue(new Error('too_many_requests'));

    const { result } = renderHook(() => useGeoChatAuth());

    await expect(result.current.getPrivyIdentityToken()).resolves.toBeNull();
    await result.current.getPrivyIdentityToken();
    await result.current.getPrivyIdentityToken();

    expect(mocks.getIdentityToken).toHaveBeenCalledTimes(1);
  });

  it('does not ask Privy for a token on every poll while signed out', async () => {
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);

    const { result } = renderHook(() => useGeoChatAuth());

    await result.current.getPrivyIdentityToken();
    await result.current.getPrivyIdentityToken();
    await result.current.getPrivyIdentityToken();

    expect(mocks.getIdentityToken).toHaveBeenCalledTimes(1);
  });

  // A `users/me` sent before logout can resolve after it. Writing that result back would
  // repopulate the cache with the signed-out user's token, and nothing would clear it again
  // until it expired, because Privy's reactive token just stays null.
  it('discards a refresh that resolves after the user signs out', async () => {
    mocks.identityToken.mockReturnValue(null);

    let settleRefresh!: (token: string | null) => void;
    mocks.getIdentityToken.mockReturnValue(
      new Promise<string | null>(resolve => {
        settleRefresh = resolve;
      })
    );

    const { result } = renderHook(() => useGeoChatAuth());
    const pending = result.current.getPrivyIdentityToken();

    act(() => setCachedIdentityToken(null));
    settleRefresh('signed-out-user-token');

    await expect(pending).resolves.toBeNull();
  });

  it('shares a single refresh between concurrent callers', async () => {
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue('identity-token');

    const { result } = renderHook(() => useGeoChatAuth());

    await Promise.all([
      result.current.getPrivyIdentityToken(),
      result.current.getPrivyIdentityToken(),
      result.current.getPrivyIdentityToken(),
    ]);

    expect(mocks.getIdentityToken).toHaveBeenCalledTimes(1);
  });
});

describe('useConsentToDebateRematch', () => {
  it('replaces stale debate activity with the authoritative rematch session', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const staleActivity: DebateActivity = {
      online: true,
      cooldown_until: null,
      match: null,
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: null,
    };
    const session = rematchSession();
    queryClient.setQueryData(debateQueryKeys.activity, staleActivity);
    mocks.consentToDebateRematch.mockResolvedValue(session);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConsentToDebateRematch('debate-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(debateQueryKeys.activity)).toEqual({
      online: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: session,
    });
  });
});

describe('useClearTimedOutDebateActivity', () => {
  it('removes only the timed-out debate from the coordinator cache', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const activity: DebateActivity = {
      online: true,
      cooldown_until: '2026-07-02T00:10:00.000Z',
      match: null,
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: null,
    };
    queryClient.setQueryData(debateQueryKeys.activity, activity);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClearTimedOutDebateActivity(), { wrapper });

    act(() => result.current('debate-1'));

    expect(queryClient.getQueryData(debateQueryKeys.activity)).toEqual({
      ...activity,
      cooldown_until: null,
      debate: null,
    });
  });
});

function rematchSession(): DebateRematchSession {
  return {
    id: 'rematch-1',
    source_debate_id: 'debate-1',
    source_space_id: 'space-1',
    status: 'browsing',
    participants: [],
    decision_expires_at: '2026-07-02T00:00:20.000Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:01.000Z',
  };
}
