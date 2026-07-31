import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';

import { type Debate, type DebateActivity, type DebateRematchSession, GeoChatRequestError } from './api';
import { DebateCoordinator } from './debate-coordinator';
import {
  debateQueryKeys,
  useClearDebateActivity,
  useClearTimedOutDebateActivity,
  useConsentToDebateRematch,
  useDebate,
  useDebateActivity,
  useEndDebateTurn,
  useGeoChatAuth,
  useLeaveDebateRematch,
  useMarkDebateReady,
  useUpdateDebateAvailability,
} from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getIdentityToken: vi.fn(),
  identityToken: vi.fn(),
  consentToDebateRematch: vi.fn(),
  endDebateTurn: vi.fn(),
  leaveDebateRematch: vi.fn(),
  listDebateSharePrompts: vi.fn(),
  markDebateReady: vi.fn(),
  pathname: '/space/space-1/debates/debate-1',
  push: vi.fn(),
  back: vi.fn(),
  updateDebateAvailability: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useDebatesEnabled: () => true,
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: mocks.getIdentityToken,
  useIdentityToken: () => ({ identityToken: mocks.identityToken() }),
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: { id: 'user-a' } }),
}));

vi.mock('./debate-gateway', () => ({
  useDebateGateway: () => ({ status: 'ready', paused: false }),
  useDebateGatewayScope: vi.fn(),
}));

vi.mock('./match-prompt', () => ({
  DebateMatchPrompt: () => null,
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    consentToDebateRematch: mocks.consentToDebateRematch,
    endDebateTurn: mocks.endDebateTurn,
    leaveDebateRematch: mocks.leaveDebateRematch,
    listDebateSharePrompts: mocks.listDebateSharePrompts,
    markDebateReady: mocks.markDebateReady,
    updateDebateAvailability: mocks.updateDebateAvailability,
  };
});

function jwtExpiringIn(seconds: number) {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }));
  return `header.${payload}.signature`;
}

function DebateExitHarness() {
  const leaveRematch = useLeaveDebateRematch('rematch-1');
  const clearDebateActivity = useClearDebateActivity();

  const leave = () => {
    void leaveRematch.mutateAsync().then(() => {
      clearDebateActivity('debate-1');
      mocks.back();
    });
  };

  return (
    <>
      <DebateCoordinator />
      <button type="button" onClick={leave}>
        Leave debate
      </button>
    </>
  );
}

describe('useGeoChatAuth', () => {
  beforeEach(() => {
    mocks.authenticated = true;
    mocks.getIdentityToken.mockReset();
    mocks.identityToken.mockReset();
    mocks.consentToDebateRematch.mockReset();
    mocks.endDebateTurn.mockReset();
    mocks.leaveDebateRematch.mockReset();
    mocks.listDebateSharePrompts.mockReset();
    mocks.markDebateReady.mockReset();
    mocks.push.mockReset();
    mocks.back.mockReset();
    mocks.pathname = '/space/space-1/debates/debate-1';
    mocks.updateDebateAvailability.mockReset();
    mocks.listDebateSharePrompts.mockResolvedValue({ prompts: [] });
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

describe('useUpdateDebateAvailability', () => {
  const availableActivity: DebateActivity = {
    online: true,
    available_to_debate: true,
    cooldown_until: null,
    match: null,
    debate: null,
    rematch: null,
  };

  it('optimistically updates then reconciles the authoritative activity', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), availableActivity);
    let resolveUpdate!: (activity: DebateActivity) => void;
    mocks.updateDebateAvailability.mockReturnValue(
      new Promise<DebateActivity>(resolve => {
        resolveUpdate = resolve;
      })
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateDebateAvailability(), { wrapper });

    let mutation!: Promise<DebateActivity>;
    act(() => {
      mutation = result.current.mutateAsync(false);
    });
    await waitFor(() =>
      expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual({
        ...availableActivity,
        available_to_debate: false,
      })
    );

    const authoritative = { ...availableActivity, online: false, available_to_debate: false };
    resolveUpdate(authoritative);
    await act(async () => mutation);

    expect(mocks.updateDebateAvailability).toHaveBeenCalledWith(false, expect.any(Function), 'user-a');
    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual(authoritative);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['debates'] });
  });

  it('rolls the optimistic activity back when the request fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), availableActivity);
    mocks.updateDebateAvailability.mockRejectedValue(new Error('unavailable'));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateDebateAvailability(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(false)).rejects.toThrow('unavailable');
    });

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual(availableActivity);
  });
});

describe('useConsentToDebateRematch', () => {
  it('replaces stale debate activity with the authoritative rematch session', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const staleActivity: DebateActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: null,
    };
    const session = rematchSession();
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), staleActivity);
    queryClient.setQueryData(debateQueryKeys.debate('debate-1'), {
      id: 'debate-1',
      rematch_session_id: null,
    } as Debate);
    mocks.consentToDebateRematch.mockResolvedValue(session);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConsentToDebateRematch('debate-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual({
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: session,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.activity('user-a') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.rematch('user-a', session.id) });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.debate('debate-1') });
    expect(queryClient.getQueryData<Debate>(debateQueryKeys.debate('debate-1'))?.rematch_session_id).toBe(session.id);
  });
});

describe('useLeaveDebateRematch', () => {
  it('clears coordinator activity before returning to the previous page', async () => {
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
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false, staleTime: Infinity } },
    });
    const decidingSession = { ...rematchSession(), status: 'deciding' as const };
    const endedSession = { ...decidingSession, status: 'ended' as const };
    const staleActivity: DebateActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: {
        id: 'debate-1',
        status: 'thanking',
        claim: { space_id: 'space-1' },
      } as NonNullable<DebateActivity['debate']>,
      rematch: decidingSession,
    };
    const clearedActivity: DebateActivity = { ...staleActivity, debate: null, rematch: null };
    let activityAtBack: DebateActivity | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(clearedActivity), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    mocks.leaveDebateRematch.mockResolvedValue(endedSession);
    mocks.back.mockImplementation(() => {
      activityAtBack = queryClient.getQueryData<DebateActivity>(debateQueryKeys.activity('user-a'));
      mocks.pathname = '/space/space-1/claims';
    });
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), staleActivity);

    render(
      <QueryClientProvider client={queryClient}>
        <DebateExitHarness />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    await waitFor(() => expect(mocks.back).toHaveBeenCalledOnce());
    expect(activityAtBack).toEqual(clearedActivity);
    await waitFor(() => expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual(clearedActivity));
    expect(mocks.push).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('clears the ended rematch flow before reconciling activity', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const decidingSession = { ...rematchSession(), status: 'deciding' as const };
    const endedSession = { ...decidingSession, status: 'ended' as const };
    const staleActivity: DebateActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: '2026-07-02T00:02:00.000Z',
      match: null,
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: decidingSession,
    };
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), staleActivity);
    mocks.leaveDebateRematch.mockResolvedValue(endedSession);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLeaveDebateRematch('rematch-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual({
      ...staleActivity,
      debate: null,
      rematch: null,
    });
    expect(queryClient.getQueryData(debateQueryKeys.rematch('user-a', 'rematch-1'))).toEqual(endedSession);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.activity('user-a') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.rematch('user-a', 'rematch-1') });
  });

  it('preserves a newer unrelated debate flow', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const endedSession = { ...rematchSession(), status: 'ended' as const };
    const currentActivity: DebateActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: { id: 'debate-2' } as NonNullable<DebateActivity['debate']>,
      rematch: {
        ...rematchSession(),
        id: 'rematch-2',
        source_debate_id: 'debate-2',
        status: 'deciding',
      },
    };
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), currentActivity);
    mocks.leaveDebateRematch.mockResolvedValue(endedSession);
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLeaveDebateRematch('rematch-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual(currentActivity);
    expect(setQueryData).not.toHaveBeenCalledWith(debateQueryKeys.activity('user-a'), expect.anything());
  });

  it.each([
    {
      name: 'debate',
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: { ...rematchSession(), id: 'rematch-2', source_debate_id: 'debate-2', status: 'deciding' as const },
      expectedDebate: null,
      expectedRematchId: 'rematch-2',
    },
    {
      name: 'rematch',
      debate: { id: 'debate-2' } as NonNullable<DebateActivity['debate']>,
      rematch: { ...rematchSession(), status: 'deciding' as const },
      expectedDebate: { id: 'debate-2' } as NonNullable<DebateActivity['debate']>,
      expectedRematchId: undefined,
    },
  ])('clears only the matching $name from activity', async ({ debate, rematch, expectedDebate, expectedRematchId }) => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const endedSession = { ...rematchSession(), status: 'ended' as const };
    queryClient.setQueryData<DebateActivity>(debateQueryKeys.activity('user-a'), {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate,
      rematch,
    });
    mocks.leaveDebateRematch.mockResolvedValue(endedSession);
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLeaveDebateRematch('rematch-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    const activity = queryClient.getQueryData<DebateActivity>(debateQueryKeys.activity('user-a'));
    expect(activity?.debate).toEqual(expectedDebate);
    expect(activity?.rematch?.id).toBe(expectedRematchId);
  });

  it('leaves an absent activity cache empty', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const endedSession = { ...rematchSession(), status: 'ended' as const };
    mocks.leaveDebateRematch.mockResolvedValue(endedSession);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLeaveDebateRematch('rematch-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toBeUndefined();
    expect(queryClient.getQueryData(debateQueryKeys.rematch('user-a', 'rematch-1'))).toEqual(endedSession);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.activity('user-a') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.rematch('user-a', 'rematch-1') });
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

  it('reconciles an ended turn from the authoritative debate response', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const debate = {
      id: 'debate-1',
      status: 'in_progress',
      turn_yields: [{ turn_index: 0 }],
    } as unknown as Debate;
    mocks.endDebateTurn.mockResolvedValue(debate);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEndDebateTurn('debate-1'), { wrapper });

    await act(() => result.current.mutateAsync({ turnIndex: 0, endedAtMs: 1_784_542_272_505 }));

    expect(mocks.endDebateTurn).toHaveBeenCalledWith('debate-1', 0, 1_784_542_272_505, expect.any(Function), 'user-a');
    expect(queryClient.getQueryData(debateQueryKeys.debate('debate-1'))).toEqual(debate);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.debate('debate-1') });
  });

  it('retries transient end-turn failures with the same cutoff', async () => {
    mocks.endDebateTurn.mockClear();
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retryDelay: 0 }, queries: { retry: false } },
    });
    const debate = { id: 'debate-1', status: 'in_progress', turn_yields: [{ turn_index: 0 }] } as unknown as Debate;
    mocks.endDebateTurn
      .mockRejectedValueOnce(new GeoChatRequestError('Unavailable', 'service_unavailable', 503))
      .mockRejectedValueOnce(new GeoChatRequestError('Unavailable', 'service_unavailable', 503))
      .mockResolvedValue(debate);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEndDebateTurn('debate-1'), { wrapper });

    await act(() => result.current.mutateAsync({ turnIndex: 0, endedAtMs: 1_784_542_272_505 }));

    expect(mocks.endDebateTurn).toHaveBeenCalledTimes(3);
    expect(mocks.endDebateTurn.mock.calls.map(call => call.slice(0, 3))).toEqual([
      ['debate-1', 0, 1_784_542_272_505],
      ['debate-1', 0, 1_784_542_272_505],
      ['debate-1', 0, 1_784_542_272_505],
    ]);
  });

  it('does not retry a rejected end-turn request', async () => {
    mocks.endDebateTurn.mockClear();
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retryDelay: 0 }, queries: { retry: false } },
    });
    mocks.endDebateTurn.mockRejectedValue(new GeoChatRequestError('Stale turn', 'turn_yield_stale', 400));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useEndDebateTurn('debate-1'), { wrapper });

    await expect(
      act(() => result.current.mutateAsync({ turnIndex: 0, endedAtMs: 1_784_542_272_505 }))
    ).rejects.toMatchObject({ code: 'turn_yield_stale', status: 400 });
    expect(mocks.endDebateTurn).toHaveBeenCalledOnce();
  });
});

describe('useClearTimedOutDebateActivity', () => {
  it('removes only the timed-out debate from the coordinator cache', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const activity: DebateActivity = {
      online: true,
      available_to_debate: true,
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

describe('useClearDebateActivity', () => {
  it('removes only the specified debate from the coordinator cache', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const activity: DebateActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: '2026-07-02T00:10:00.000Z',
      match: null,
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: null,
    };
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), activity);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClearDebateActivity(), { wrapper });

    act(() => result.current('debate-1'));

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual({
      ...activity,
      debate: null,
    });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('debate query refresh behavior', () => {
  it('hydrates debate and rematch detail caches from activity responses', async () => {
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
    const debate = { id: 'debate-1' } as Debate;
    const rematch = rematchSession();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            online: true,
            available_to_debate: true,
            cooldown_until: null,
            match: null,
            debate,
            rematch: null,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            online: true,
            available_to_debate: true,
            cooldown_until: null,
            match: null,
            debate: null,
            rematch,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDebateActivity(), { wrapper });

    await waitFor(() => expect(queryClient.getQueryData(debateQueryKeys.debate('debate-1'))).toEqual(debate));

    await act(async () => {
      await result.current.refetch();
    });

    expect(queryClient.getQueryData(debateQueryKeys.rematch('user-a', 'rematch-1'))).toEqual(rematch);
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

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
      new Response(
        JSON.stringify({
          online: true,
          available_to_debate: true,
          cooldown_until: null,
          match: null,
          debate: null,
          rematch: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
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
