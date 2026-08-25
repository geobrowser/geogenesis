import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  useSpaceDebates,
} from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  attention: true,
  presence: true,
  gatewayPaused: false,
  queryCache: { subscribe: vi.fn(() => vi.fn()) },
  queryClient: {
    getQueryCache: vi.fn(() => mocks.queryCache),
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  },
  queryRefetch: vi.fn(),
  useMutation: vi.fn((options: unknown) => options),
  useQuery: vi.fn((options: unknown) => ({ options, refetch: mocks.queryRefetch })),
  useScope: vi.fn(),
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

vi.mock('./debate-gateway', () => ({
  useDebateGatewayScope: mocks.useScope,
  useDebateGatewaySnapshot: () => ({ status: mocks.gatewayPaused ? 'degraded' : 'ready', paused: mocks.gatewayPaused }),
}));

vi.mock('./debate-attention', () => ({
  useDebateAttention: () => mocks.attention,
  useDebatePresence: () => mocks.presence,
}));

beforeEach(() => {
  mocks.authenticated = true;
  mocks.attention = true;
  mocks.presence = true;
  mocks.gatewayPaused = false;
  mocks.queryClient.invalidateQueries.mockClear();
  mocks.queryClient.getQueryCache.mockClear();
  mocks.queryCache.subscribe.mockClear();
  mocks.queryClient.setQueryData.mockClear();
  mocks.queryRefetch.mockClear();
  mocks.useMutation.mockClear();
  mocks.useQuery.mockClear();
  mocks.useScope.mockClear();
});

describe('debate query network ownership', () => {
  // The gateway owns freshness; a poll is an exception each query has to earn. Profile eligibility
  // and account activity are the two that have, and each is pinned by its own case below.
  it('disables polling and generic browser refetches for every debate query', () => {
    renderHook(() => {
      useDebateClaims('space-1', ['claim-1'], true);
      useSpaceDebates('space-1', true);
      useDebate('debate-1', true);
      useDebateRematch('rematch-1');
      useDebateRematchClaims('rematch-1', ['claim-1']);
      useDebateSharePrompts();
      useDebateMedia('debate-1', true);
      useDebateTranscript('debate-1');
    });

    expect(mocks.useQuery).toHaveBeenCalledTimes(8);
    for (const [options] of mocks.useQuery.mock.calls) {
      expect(options).toMatchObject({ retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false });
      expect(options).not.toHaveProperty('refetchInterval');
    }
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
    mocks.presence = false;
    rerender();
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: false });

    mocks.presence = true;
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
    mocks.presence = true;

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
