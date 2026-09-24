import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from './api';
import {
  useCreateDebateChallenge,
  useDebate,
  useDebateActivity,
  useDebateClaims,
  useDebateMedia,
  useDebateProfile,
  useDebateRematch,
  useDebateRematchClaims,
  useDebateSharePrompts,
  useDebateTranscript,
  useRematchLiveKitJoin,
  useSpaceDebates,
  useUpdateDebateAvailability,
} from './hooks';

type QueryOptions = { queryKey: readonly unknown[] };

const mocks = vi.hoisted(() => ({
  authenticated: true,
  attention: true,
  visible: true,
  present: true,
  gatewayPaused: false,
  queryCache: { subscribe: vi.fn(() => vi.fn()) },
  queryClient: {
    getQueryCache: vi.fn(() => mocks.queryCache),
    getQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  },
  getDebateActivity: vi.fn(),
  queryRefetch: vi.fn(),
  useMutation: vi.fn((options: unknown) => options),
  useQuery: vi.fn((options: unknown) => ({ options, refetch: mocks.queryRefetch })),
  useScope: vi.fn(),
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  getDebateActivity: mocks.getDebateActivity,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: { id: 'user-a' } }),
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: () => mocks.queryClient,
}));

vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: vi.fn(),
  useIdentityTokenSync: vi.fn(),
}));

// geo-chat only indexes DAO spaces, and the debate hooks hold until they know the space is one.
// This file asserts which queries these hooks configure, and stubs `useQuery` to do it. The avatar
// enrichment rides `useQueries`, which the stub above leaves as the real implementation — so
// without this it reaches for a QueryClient no renderHook here provides. Its own behaviour is
// covered in `participant-avatars.test.ts`; what matters here is that it adds no `useQuery`.
vi.mock('./participant-avatars', () => ({
  useParticipantAvatars:
    () =>
    <T,>(participant: T) =>
      participant,
}));

vi.mock('./space-debate-support', () => ({
  useSpaceDebateSupport: () => 'indexed',
}));

vi.mock('./debate-gateway', () => ({
  useDebateGatewayScope: mocks.useScope,
  useDebateGatewaySnapshot: () => ({ status: mocks.gatewayPaused ? 'degraded' : 'ready', paused: mocks.gatewayPaused }),
}));

vi.mock('./debate-attention', () => ({
  useDebateAttention: () => mocks.attention,
  // GEO-2849 split these apart: polling is gated on *visibility*, while `debate_presence` — what
  // geo-chat turns into `is_online` — is now connection-backed and survives a hidden tab. These
  // tests are about polling cadence, so they drive the visibility signal.
  useDebateVisibility: () => mocks.visible,
  useDebatePresence: () => mocks.present,
}));

beforeEach(() => {
  mocks.authenticated = true;
  mocks.attention = true;
  mocks.visible = true;
  mocks.present = true;
  mocks.gatewayPaused = false;
  mocks.queryClient.invalidateQueries.mockClear();
  mocks.queryClient.getQueryData.mockReset();
  mocks.queryClient.getQueryCache.mockClear();
  mocks.queryCache.subscribe.mockClear();
  mocks.queryClient.setQueryData.mockClear();
  mocks.queryRefetch.mockClear();
  mocks.useMutation.mockClear();
  mocks.useQuery.mockClear();
  mocks.useScope.mockClear();
  mocks.getDebateActivity.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('debate query network ownership', () => {
  // The gateway owns freshness; a poll is an exception each query has to earn. Profile eligibility
  // and account activity are the two that have, and each is pinned by its own case below.
  it('disables polling and generic browser refetches for every debate query', () => {
    renderHook(() => {
      useDebateClaims('space-1', ['claim-1'], true);
      useSpaceDebates('space-1', true);
      useDebate('debate-1', true);
      useDebateRematchClaims('rematch-1', ['claim-1']);
      useDebateSharePrompts();
      useDebateMedia('debate-1', true);
      useDebateTranscript('debate-1');
    });

    expect(mocks.useQuery).toHaveBeenCalledTimes(7);
    for (const [options] of mocks.useQuery.mock.calls) {
      expect(options).toMatchObject({ retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false });
      expect(options).not.toHaveProperty('refetchInterval');
    }
  });

  // GEO-2650. The rematch session had no polling at all, so a push that never arrived meant the
  // request never appeared — and the push has a 30-second failure budget, because a silently dead
  // socket is not noticed until the next heartbeat. Every other link measures far below that: the
  // outbox publishes rematch events in 1.28s average and 2.27s worst over the last week, and the
  // client coalesces invalidations for 50ms.
  //
  // Gated on presence rather than attention for the reason the activity poll already learned: a
  // visible tab behind the focused window is exactly where someone waits for an opponent.
  it('polls the rematch session on a visible tab, including one that is not focused', () => {
    mocks.attention = false;
    mocks.visible = true;

    const { rerender } = renderHook(() => useDebateRematch('rematch-1'));
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: 5_000 });

    // A hidden tab has nobody watching the picker.
    mocks.visible = false;
    rerender();
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: false });
  });

  // Activity gates the incoming-request popup, and the socket has two ways to be deaf: reconnect
  // backoff, and an ERROR frame that pauses live updates without scheduling a reconnect. Neither
  // recovers on its own, and the shared options switch off React Query's focus and reconnect
  // refetches — so without this a request waited on a remount to appear (GEO-2638).
  it('polls activity while on screen, faster while the gateway is paused, and refetches on return', () => {
    const { rerender } = renderHook(() => useDebateActivity());
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: 30_000 });
    expect(mocks.queryRefetch).not.toHaveBeenCalled();

    // A paused gateway means this is the only thing still asking, so it asks more often.
    mocks.gatewayPaused = true;
    rerender();
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: 10_000 });

    // A hidden tab has no popup to draw, paused or not.
    mocks.visible = false;
    rerender();
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: false });

    mocks.visible = true;
    rerender();
    expect(mocks.queryRefetch).toHaveBeenCalledTimes(1);
  });

  // GEO-2650. The gate used to be attention, which additionally requires `document.hasFocus()`, so
  // a tab sitting open on screen behind whatever window the viewer was typing in did not poll at
  // all — and the incoming-request popup is by definition the thing that arrives while you are
  // looking somewhere else. That left the socket as the sole delivery path for the exact case this
  // poll exists to cover, which is how a request still took ~36 seconds after GEO-2638.
  it('keeps polling activity on a visible tab that is not the focused window', () => {
    mocks.attention = false;
    mocks.visible = true;

    renderHook(() => useDebateActivity());

    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: 30_000 });
  });

  // Regaining focus without a visibility change is its own return: the poll was already running, but
  // someone who just clicked back in is the most likely person to be waiting on a popup.
  it('refetches activity when focus returns to an already-visible tab', () => {
    mocks.attention = false;
    const { rerender } = renderHook(() => useDebateActivity());
    expect(mocks.queryRefetch).not.toHaveBeenCalled();

    mocks.attention = true;
    rerender();

    expect(mocks.queryRefetch).toHaveBeenCalledTimes(1);
  });

  it('polls profile eligibility every thirty seconds only while foregrounded and refetches on return', () => {
    const { rerender } = renderHook(() => useDebateProfile('profile-b'));
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: 30_000 });
    expect(mocks.queryRefetch).not.toHaveBeenCalled();

    mocks.attention = false;
    rerender();
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: false });

    mocks.attention = true;
    rerender();
    expect(mocks.queryRefetch).toHaveBeenCalledTimes(1);
  });

  it('preserves a retained outbound challenge when availability success replaces wire activity', () => {
    const { result } = renderHook(() => useUpdateDebateAvailability());
    const mutation = result.current as unknown as {
      onSuccess(activity: Record<string, unknown>): void;
    };
    const outbound = { id: 'challenge-outbound' };
    const wireActivity = { online: true, available_to_debate: false, challenge: null };
    const current = {
      ...wireActivity,
      outbound_challenge: outbound,
      outbound_challenge_cached_at_monotonic_ms: 12_345,
    };

    mutation.onSuccess(wireActivity);

    const write = mocks.queryClient.setQueryData.mock.calls.at(-1)?.[1] as
      Record<string, unknown> | ((cached: Record<string, unknown>) => Record<string, unknown>);
    const next = typeof write === 'function' ? write(current) : write;
    expect(next).toEqual(current);
  });

  it('preserves a challenge created while a failed availability update was in flight', () => {
    const { result } = renderHook(() => useUpdateDebateAvailability());
    const mutation = result.current as unknown as {
      onError(error: Error, availableToDebate: boolean, context: { previous: Record<string, unknown> }): void;
    };
    const previous = { online: true, available_to_debate: true, challenge: null };
    const current = {
      ...previous,
      available_to_debate: false,
      outbound_challenge: { id: 'challenge-outbound' },
      outbound_challenge_cached_at_monotonic_ms: 12_345,
    };

    mutation.onError(new Error('nope'), false, { previous });

    const write = mocks.queryClient.setQueryData.mock.calls.at(-1)?.[1] as
      Record<string, unknown> | ((cached: Record<string, unknown>) => Record<string, unknown>);
    const next = typeof write === 'function' ? write(current) : write;
    expect(next).toEqual({
      ...previous,
      outbound_challenge: current.outbound_challenge,
      outbound_challenge_cached_at_monotonic_ms: 12_345,
    });
  });

  it('invalidates the challenged profile after an availability rejection', () => {
    const { result } = renderHook(() => useCreateDebateChallenge());
    const mutation = result.current as unknown as {
      onError(error: Error, request: { recipient_profile_space_id: string }): void;
    };

    mutation.onError(new GeoChatRequestError('Unavailable', 'challenge_unavailable', 400), {
      recipient_profile_space_id: 'profile-b',
    });

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['debates', 'account', 'user-a', 'profile', 'profile-b'],
    });
  });

  it('registers person challenge creation in the account outbound-request gate', () => {
    const { result } = renderHook(() => useCreateDebateChallenge());

    expect(result.current).toMatchObject({
      mutationKey: ['debates', 'account', 'user-a', 'create-outbound-request'],
    });
  });

  it('keeps a newly created outbound challenge cached instead of refetching stale activity over it', () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(12_345);
    const { result } = renderHook(() => useCreateDebateChallenge());
    const mutation = result.current as unknown as {
      onSuccess(challenge: { id: string }): void;
    };
    const challenge = { id: 'challenge-1' };

    mutation.onSuccess(challenge);

    expect(mocks.queryClient.setQueryData).toHaveBeenCalledWith(
      ['debates', 'account', 'user-a', 'activity'],
      expect.any(Function)
    );
    const update = mocks.queryClient.setQueryData.mock.calls.at(-1)?.[1] as (
      current: Record<string, unknown> | undefined
    ) => unknown;
    const warmActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: null,
      challenge: null,
      incoming_request_count: 2,
    };
    expect(update(warmActivity)).toEqual({
      ...warmActivity,
      challenge,
      outbound_challenge: challenge,
      outbound_challenge_cached_at_monotonic_ms: 12_345,
    });
    expect(update(undefined)).toEqual({
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: null,
      challenge,
      outbound_challenge: challenge,
      outbound_challenge_cached_at_monotonic_ms: 12_345,
    });
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['debates', 'account', 'user-a', 'activity'],
    });
  });

  it('reconciles activity when the outbound propagation grace expires', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCreateDebateChallenge());
    const mutation = result.current as unknown as {
      onSuccess(challenge: { id: string }): void;
    };

    mutation.onSuccess({ id: 'challenge-1' });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(mocks.queryClient.invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ['debates', 'account', 'user-a', 'activity'],
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['debates', 'account', 'user-a', 'activity'],
    });
  });

  it('retains an outbound challenge while activity reports a simultaneous inbound challenge', async () => {
    const outbound = {
      id: 'challenge-outbound',
      status: 'pending',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    const inbound = { id: 'challenge-inbound', status: 'pending', expires_at: '2099-01-01T00:00:00.000Z' };
    const activity = { challenge: inbound, debate: null, rematch: null };
    mocks.queryClient.getQueryData.mockReturnValue({ outbound_challenge: outbound });
    mocks.getDebateActivity.mockResolvedValue(activity);
    renderHook(() => useDebateActivity());

    const query = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (context: { signal: AbortSignal }) => Promise<Record<string, unknown>>;
    };
    const result = await query.queryFn({ signal: new AbortController().signal });

    expect(result).toEqual({ ...activity, outbound_challenge: outbound });
  });

  it('drops a retained outbound challenge once activity reports no live challenge', async () => {
    const outbound = {
      id: 'challenge-outbound',
      status: 'pending',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    const activity = { challenge: null, debate: null, rematch: null };
    mocks.queryClient.getQueryData.mockReturnValue({ outbound_challenge: outbound });
    mocks.getDebateActivity.mockResolvedValue(activity);
    renderHook(() => useDebateActivity());

    const query = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (context: { signal: AbortSignal }) => Promise<Record<string, unknown>>;
    };
    const result = await query.queryFn({ signal: new AbortController().signal });

    expect(result).toEqual(activity);
  });

  it('briefly retains a newly created outbound challenge while activity propagation catches up', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(9_999);
    const outbound = {
      id: 'challenge-outbound',
      status: 'pending',
      created_at: new Date().toISOString(),
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    const activity = { challenge: null, debate: null, rematch: null };
    mocks.queryClient.getQueryData.mockReturnValue({
      outbound_challenge: outbound,
      outbound_challenge_cached_at_monotonic_ms: 0,
    });
    mocks.getDebateActivity.mockResolvedValue(activity);
    renderHook(() => useDebateActivity());

    const query = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (context: { signal: AbortSignal }) => Promise<Record<string, unknown>>;
    };
    const result = await query.queryFn({ signal: new AbortController().signal });

    expect(result).toEqual({
      ...activity,
      outbound_challenge: outbound,
      outbound_challenge_cached_at_monotonic_ms: 0,
    });
  });

  it('ends the propagation grace on monotonic time when the device clock trails the server', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(20_001);
    const outbound = {
      id: 'challenge-outbound',
      status: 'pending',
      // Five minutes ahead of this device. Wall-clock subtraction would keep the ten-second grace
      // open for more than five minutes even though eleven monotonic seconds have elapsed.
      created_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    const activity = { challenge: null, debate: null, rematch: null };
    mocks.queryClient.getQueryData.mockReturnValue({
      outbound_challenge: outbound,
      outbound_challenge_cached_at_monotonic_ms: 10_000,
    });
    mocks.getDebateActivity.mockResolvedValue(activity);
    renderHook(() => useDebateActivity());

    const query = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (context: { signal: AbortSignal }) => Promise<Record<string, unknown>>;
    };
    const result = await query.queryFn({ signal: new AbortController().signal });

    expect(result).toEqual(activity);
  });

  it('leaves server-timestamp expiry to the synchronized request filter', async () => {
    const serverNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(serverNow + 60 * 60_000);
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const outbound = {
      id: 'challenge-outbound',
      status: 'pending',
      created_at: new Date(serverNow).toISOString(),
      expires_at: new Date(serverNow + 60_000).toISOString(),
    };
    const inbound = {
      id: 'challenge-inbound',
      status: 'pending',
      expires_at: new Date(serverNow + 60_000).toISOString(),
    };
    const activity = { challenge: inbound, debate: null, rematch: null };
    mocks.queryClient.getQueryData.mockReturnValue({
      outbound_challenge: outbound,
      outbound_challenge_cached_at_monotonic_ms: 0,
    });
    mocks.getDebateActivity.mockResolvedValue(activity);
    renderHook(() => useDebateActivity());

    const query = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (context: { signal: AbortSignal }) => Promise<Record<string, unknown>>;
    };
    const result = await query.queryFn({ signal: new AbortController().signal });

    expect(result).toEqual({
      ...activity,
      outbound_challenge: outbound,
      outbound_challenge_cached_at_monotonic_ms: 0,
    });
  });

  // The rematch voice token is the one query whose cache policy is load-bearing rather than a
  // freshness preference: `<LiveKitRoom>` cannot be handed a new token while it is mounted, so the
  // token has to be stable for as long as the room lives — and gone the moment the dock stops using
  // it, because the backend mints these with a five-minute expiry.
  it('holds the rematch voice token for the life of the room and drops it on the way out', () => {
    renderHook(() => useRematchLiveKitJoin('rematch-1', true));

    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({
      queryKey: ['debates', 'account', 'user-a', 'rematch-livekit', 'rematch-1'],
      staleTime: Infinity,
      gcTime: 0,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      enabled: true,
    });
  });

  // The key deliberately sits outside the `rematch` prefix the gateway invalidates on every rematch
  // change: a refetch there would swap the token under a live room and disconnect the call.
  it('keeps the voice token clear of the rematch invalidation prefix', () => {
    renderHook(() => {
      useDebateRematch('rematch-1');
      useRematchLiveKitJoin('rematch-1', true);
    });

    const [rematchKey, tokenKey] = mocks.useQuery.mock.calls.map(([options]) => (options as QueryOptions).queryKey);
    expect(tokenKey.slice(0, rematchKey.length)).not.toEqual(rematchKey);
  });

  // Every one of these is a permanent answer: no LiveKit config, no such session, not a participant,
  // or a session past the point where voice is offered. Retrying only delays the fallback UI.
  it('does not retry a voice token the backend has refused outright', () => {
    renderHook(() => useRematchLiveKitJoin('rematch-1', true));
    const { retry } = mocks.useQuery.mock.calls.at(-1)?.[0] as {
      retry: (failureCount: number, error: Error) => boolean;
    };

    for (const status of [400, 403, 404, 503]) {
      expect(retry(0, new GeoChatRequestError('nope', null, status))).toBe(false);
    }
    // A transient failure still gets its two attempts.
    expect(retry(0, new GeoChatRequestError('boom', null, 500))).toBe(true);
    expect(retry(2, new GeoChatRequestError('boom', null, 500))).toBe(false);
  });

  it('never asks for a voice token the dock has not enabled', () => {
    renderHook(() => useRematchLiveKitJoin('rematch-1', false));
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });

    mocks.authenticated = false;
    renderHook(() => useRematchLiveKitJoin('rematch-1', true));
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });
  });

  it('registers only authenticated space and debate scopes', () => {
    const { rerender } = renderHook(() => {
      useDebateClaims('space-1', ['claim-1'], true);
      useSpaceDebates('space-1', true);
      useDebate('debate-1', true);
      useDebateMedia('debate-1', true);
      useDebateTranscript('debate-1');
    });

    expect(mocks.useScope.mock.calls).toEqual([
      [{ scope: 'space', space_id: 'space-1' }, true],
      [{ scope: 'space', space_id: 'space-1' }, true],
      [{ scope: 'debate', debate_id: 'debate-1' }, true],
      [{ scope: 'debate', debate_id: 'debate-1' }, true],
      [{ scope: 'debate', debate_id: 'debate-1' }, true],
    ]);

    mocks.authenticated = false;
    mocks.useScope.mockClear();
    rerender();
    expect(mocks.useScope.mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
  });
});
