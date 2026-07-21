import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';

import type { Debate, DebateActivity, DebateRematchSession } from './api';
import {
  debateQueryKeys,
  useClearTimedOutDebateActivity,
  useConsentToDebateRematch,
  useDebate,
  useDebateActivity,
  useGeoChatAuth,
  useMarkDebateReady,
} from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getIdentityToken: vi.fn(),
  identityToken: vi.fn(),
  consentToDebateRematch: vi.fn(),
  markDebateReady: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: mocks.getIdentityToken,
  useIdentityToken: () => ({ identityToken: mocks.identityToken() }),
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: { id: 'user-a' } }),
}));

vi.mock('./debate-gateway', () => ({
  useDebateGatewayScope: vi.fn(),
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    consentToDebateRematch: mocks.consentToDebateRematch,
    markDebateReady: mocks.markDebateReady,
  };
});

function jwtExpiringIn(seconds: number) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }));
  return `header.${payload}.signature`;
}

describe('useGeoChatAuth', () => {
  beforeEach(() => {
    mocks.authenticated = true;
    mocks.getIdentityToken.mockReset();
    mocks.identityToken.mockReset();
    mocks.consentToDebateRematch.mockReset();
    mocks.markDebateReady.mockReset();
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
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const staleActivity: DebateActivity = {
      online: true,
      cooldown_until: null,
      match: null,
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: null,
    };
    const session = rematchSession();
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), staleActivity);
    mocks.consentToDebateRematch.mockResolvedValue(session);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConsentToDebateRematch('debate-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual({
      online: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: session,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.activity('user-a') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.rematch('user-a', session.id) });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.debate('debate-1') });
  });
});

describe('authoritative mutation reconciliation', () => {
  it('invalidates debate detail after applying the mutation response', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const debate = { id: 'debate-1', status: 'ready' } as unknown as Debate;
    mocks.markDebateReady.mockResolvedValue(debate);
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useMarkDebateReady('debate-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(setQueryData).toHaveBeenCalledWith(debateQueryKeys.debate('debate-1'), debate);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.debate('debate-1') });
    expect(setQueryData.mock.invocationCallOrder[0]).toBeLessThan(invalidateQueries.mock.invocationCallOrder[0]!);
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
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), activity);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClearTimedOutDebateActivity(), { wrapper });

    act(() => result.current('debate-1'));

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual({
      ...activity,
      cooldown_until: null,
      debate: null,
    });
  });
});

describe('debate query refresh behavior', () => {
  it('does not issue periodic debate reads while time advances', async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      'geo:chat-session',
      JSON.stringify({
        account_key: 'user-a',
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      })
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ online: true, cooldown_until: null, match: null, debate: null, rematch: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useDebateActivity(), { wrapper });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('does not refetch active debate queries on focus or generic reconnect', async () => {
    const wasFocused = focusManager.isFocused();
    const wasOnline = onlineManager.isOnline();
    window.localStorage.setItem(
      'geo:chat-session',
      JSON.stringify({
        account_key: 'user-a',
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      })
    );
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'debate-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useDebate('debate-1', true), { wrapper });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await Promise.resolve();

    expect(fetch).toHaveBeenCalledTimes(1);
    focusManager.setFocused(wasFocused);
    onlineManager.setOnline(wasOnline);
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('performs only one failed public snapshot request while signed out', async () => {
    mocks.authenticated = false;
    setCachedIdentityToken(null);
    window.localStorage.clear();
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 503, statusText: 'Service Unavailable' }));
    vi.stubGlobal('fetch', fetch);
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDebate('public-debate', true), { wrapper });
    await vi.waitFor(() => expect(result.current.isError).toBe(true));

    expect(fetch).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
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
