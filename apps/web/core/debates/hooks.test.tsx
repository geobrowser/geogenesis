import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setCachedIdentityToken } from '~/core/auth/identity-token';
import { entityResponseIndexingQueryKey } from '~/core/responses/entity-response';

import { type Debate, type DebateActivity, type DebateRematchSession, GeoChatRequestError } from './api';
import { DebateCoordinator } from './debate-coordinator';
import { clearEnteringDebate, useEnteringDebateId } from './debate-entry-intent';
import { useDebateGatewayScope, useDebateGatewaySpaceScopes } from './debate-gateway';
import {
  debateQueryKeys,
  useAcceptDebateRematchRequest,
  useClearDebateActivity,
  useClearTimedOutDebateActivity,
  useConsentToDebateRematch,
  useDebate,
  useDebateActivity,
  useDebateClaims,
  useDebateClaimsBySpaces,
  useDebateRematchClaims,
  useDebateRematchClaimsForIds,
  useEndDebateTurn,
  useGeoChatAuth,
  useLeaveDebateRematch,
  useMarkDebateReady,
  useSpaceDebates,
  useUpdateDebateAvailability,
} from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  spaceSupport: 'indexed' as 'indexed' | 'not-indexed' | 'unknown',
  acceptDebateRematchRequest: vi.fn(),
  getIdentityToken: vi.fn(),
  identityToken: vi.fn(),
  consentToDebateRematch: vi.fn(),
  endDebateTurn: vi.fn(),
  leaveDebateRematch: vi.fn(),
  listDebateClaims: vi.fn(),
  listDebateRematchClaims: vi.fn(),
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

// The coordinator reads `debateDebugging` to decide whether to draw the paused banner. Nothing here
// asserts on it, so it stays off, and the rest of the module is kept rather than blanked.
vi.mock('~/core/state/feature-flags', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/state/feature-flags')>()),
  useFeatureFlag: () => false,
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: mocks.getIdentityToken,
  useIdentityToken: () => ({ identityToken: mocks.identityToken() }),
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: { id: 'user-a' } }),
}));

// geo-chat only indexes DAO spaces, and the debate hooks hold until they know the space is one.
// Three-valued: `unknown` is the window before the space type resolves, which the hooks have to
// report as loading rather than as a settled empty answer. Most tests here are about a space that
// does have debates, so `indexed` is the default.
vi.mock('./space-debate-support', () => ({
  useSpaceDebateSupport: () => mocks.spaceSupport,
}));

vi.mock('./debate-gateway', () => ({
  useDebateGateway: () => ({ status: 'ready', paused: false }),
  useDebateGatewayScope: vi.fn(),
  useDebateGatewaySnapshot: () => ({ status: 'ready', paused: false }),
  useDebateGatewaySpaceScopes: vi.fn(),
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    acceptDebateRematchRequest: mocks.acceptDebateRematchRequest,
    consentToDebateRematch: mocks.consentToDebateRematch,
    endDebateTurn: mocks.endDebateTurn,
    leaveDebateRematch: mocks.leaveDebateRematch,
    listDebateClaims: mocks.listDebateClaims,
    listDebateRematchClaims: mocks.listDebateRematchClaims,
    listDebateSharePrompts: mocks.listDebateSharePrompts,
    markDebateReady: mocks.markDebateReady,
    updateDebateAvailability: mocks.updateDebateAvailability,
  };
});

describe('useDebateRematchClaimsForIds', () => {
  beforeEach(() => {
    mocks.authenticated = true;
    mocks.acceptDebateRematchRequest.mockReset();
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    mocks.listDebateRematchClaims.mockReset();
    setCachedIdentityToken(null);
  });

  // geo-chat rejects a request naming more than 100 claims outright, and losing that response
  // takes every claim's positions with it — not only the ones past the limit.
  it('splits an over-long id list across requests and merges the responses', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `claim-${index}`);
    mocks.listDebateRematchClaims.mockImplementation((_sessionId: string, claimIds: string[]) =>
      Promise.resolve({
        claims: claimIds.map(claimId => ({ claim: { claim_entity_id: claimId } })),
        excluded_claim_ids: [`excluded-${claimIds.length}`],
      })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useDebateRematchClaimsForIds('session-1', ids), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.data.claims).toHaveLength(150));
    const batchSizes = mocks.listDebateRematchClaims.mock.calls.map(([, claimIds]) => claimIds.length);
    expect(batchSizes.length).toBeGreaterThan(1);
    expect(batchSizes.every(size => size <= 100)).toBe(true);
    expect(batchSizes.reduce((sum, size) => sum + size, 0)).toBe(150);
    // Exclusions from every batch count, deduped.
    expect(result.current.data.excluded_claim_ids.sort()).toEqual(
      [...new Set(batchSizes.map(size => `excluded-${size}`))].sort()
    );
  });

  it('asks once for a list that fits', async () => {
    mocks.listDebateRematchClaims.mockResolvedValue({ claims: [], excluded_claim_ids: [] });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderHook(() => useDebateRematchClaimsForIds('session-1', ['claim-a', 'claim-b']), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(mocks.listDebateRematchClaims).toHaveBeenCalledTimes(1));
    expect(mocks.listDebateRematchClaims.mock.calls[0]![1]).toEqual(['claim-a', 'claim-b']);
  });
});

describe('useDebateClaimsBySpaces', () => {
  beforeEach(() => {
    mocks.authenticated = true;
    mocks.spaceSupport = 'indexed';
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    mocks.listDebateClaims.mockReset();
    setCachedIdentityToken(null);
  });

  it('deduplicates and splits each space into requests of at most fifty ids', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `claim-${index}`);
    mocks.listDebateClaims.mockImplementation((_spaceId: string, claimIds: string[]) =>
      Promise.resolve({ claims: claimIds.map(claim_entity_id => ({ claim_entity_id })) })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => useDebateClaimsBySpaces([{ spaceId: 'space-1', claimIds: [...ids, ids[0]!] }]),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    await waitFor(() => expect(result.current.claims).toHaveLength(101));
    const requestedIds = mocks.listDebateClaims.mock.calls.map(([, claimIds]) => claimIds as string[]);
    expect(requestedIds.every(claimIds => claimIds.length <= 50)).toBe(true);
    expect(new Set(requestedIds.flat())).toEqual(new Set(ids));
    expect(requestedIds.flat()).toHaveLength(101);
    expect(new Set(result.current.claims.map(claim => claim.claim_entity_id))).toEqual(new Set(ids));
  });

  it('keeps existing batches cached when a claim is inserted ahead of them', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `claim-${String(index).padStart(3, '0')}`);
    mocks.listDebateClaims.mockImplementation((_spaceId: string, claimIds: string[]) =>
      Promise.resolve({ claims: claimIds.map(claim_entity_id => ({ claim_entity_id })) })
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result, rerender } = renderHook(
      ({ claimIds }: { claimIds: string[] }) => useDebateClaimsBySpaces([{ spaceId: 'space-1', claimIds }]),
      {
        initialProps: { claimIds: ids },
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );

    await waitFor(() => expect(result.current.claims).toHaveLength(101));
    const firstPassBatches = mocks.listDebateClaims.mock.calls.map(([, claimIds]) => (claimIds as string[]).join(','));
    mocks.listDebateClaims.mockClear();

    // Sorts ahead of every existing id, which under fixed-size slicing would shift every boundary
    // and re-request all 102 ids.
    rerender({ claimIds: ['claim-000-a', ...ids] });

    await waitFor(() => expect(result.current.claims).toHaveLength(102));
    const refetchedIds = mocks.listDebateClaims.mock.calls.flatMap(([, claimIds]) => claimIds as string[]);
    expect(refetchedIds.length).toBeLessThan(101);
    const untouchedBatches = firstPassBatches.filter(batch =>
      mocks.listDebateClaims.mock.calls.every(([, claimIds]) => (claimIds as string[]).join(',') !== batch)
    );
    expect(untouchedBatches.length).toBeGreaterThan(0);
  });
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
    mocks.spaceSupport = 'indexed';
    vi.mocked(useDebateGatewayScope).mockClear();
    mocks.getIdentityToken.mockReset();
    mocks.identityToken.mockReset();
    mocks.consentToDebateRematch.mockReset();
    mocks.endDebateTurn.mockReset();
    mocks.leaveDebateRematch.mockReset();
    mocks.listDebateClaims.mockReset();
    mocks.listDebateRematchClaims.mockReset();
    mocks.listDebateSharePrompts.mockReset();
    mocks.markDebateReady.mockReset();
    mocks.push.mockReset();
    mocks.back.mockReset();
    mocks.pathname = '/space/space-1/debates/debate-1';
    mocks.updateDebateAvailability.mockReset();
    mocks.listDebateClaims.mockResolvedValue({ claims: [] });
    mocks.listDebateRematchClaims.mockResolvedValue({ claims: [], excluded_claim_ids: [] });
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

  /**
   * geo-chat indexes DAO spaces only. Asked about a personal space it answers `space_not_found` and
   * the gateway rejects the matching SUBSCRIBE, which pauses the socket with no reconnect scheduled
   * — the "Live debate updates are paused while reconnecting" banner that never clears. A claim
   * curated onto a personal page, or one whose own home space is personal, arrives here as exactly
   * that space.
   */
  it('asks geo-chat nothing about a personal space', async () => {
    mocks.spaceSupport = 'not-indexed';
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useDebateClaims('space-1', ['claim-1'], true), { wrapper });

    await waitFor(() => expect(useDebateGatewayScope).toHaveBeenCalled());
    expect(mocks.listDebateClaims).not.toHaveBeenCalled();
    // Every call must be disabled — one enabled subscribe is all it takes to pause the socket.
    expect(vi.mocked(useDebateGatewayScope).mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
  });

  /**
   * The gate can't disable the query and stop there. A disabled react-query reports
   * `isLoading: false` with no data, which every consumer reads as a settled empty answer: the
   * browse feed paints the ordinary entity page in place of the video takeover and the join panel
   * says "No claims are available to debate yet", each for one round trip. The wait has to reach
   * them as a wait.
   */
  it('reports itself loading while the space type is still resolving', async () => {
    mocks.spaceSupport = 'unknown';
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(() => useDebateClaims('space-1', ['claim-1'], true), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(mocks.listDebateClaims).not.toHaveBeenCalled();

    // And once it settles as a space with no debates, the wait ends rather than running forever.
    mocks.spaceSupport = 'not-indexed';
    rerender();
    expect(result.current.isLoading).toBe(false);
    expect(mocks.listDebateClaims).not.toHaveBeenCalled();
  });

  // The browse feed subscribes the same way, and opening it on a personal space raised the banner
  // on its own — so the gate has to cover this hook too, not only the claims one.
  it('asks geo-chat nothing about a personal space from the browse feed', async () => {
    mocks.spaceSupport = 'not-indexed';
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSpaceDebates('space-1', true), { wrapper });

    await waitFor(() => expect(useDebateGatewayScope).toHaveBeenCalled());
    expect(result.current.isLoading).toBe(false);
    expect(vi.mocked(useDebateGatewayScope).mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
  });

  it('holds the browse feed loading while the space type is still resolving', () => {
    mocks.spaceSupport = 'unknown';
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useSpaceDebates('space-1', true), { wrapper });

    expect(result.current.isLoading).toBe(true);
  });

  it('leaves indexed-response claim refreshes to the gateway notification path', async () => {
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useDebateClaims('space-1', ['claim-1'], true), { wrapper });
    await waitFor(() => expect(mocks.listDebateClaims).toHaveBeenCalled());
    invalidateQueries.mockClear();

    act(() => {
      queryClient.setQueryData(['user-entity-response', 'profile-1', 'claim-1', 'space-1', 0, 'stance'], 'positive');
    });
    expect(invalidateQueries).not.toHaveBeenCalled();

    act(() => {
      queryClient.setQueryData(entityResponseIndexingQueryKey('profile-1', 'claim-1', 'space-1', 'stance'), {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'positive',
          personalSpaceId: 'profile-1',
          responseKind: 'stance',
          spaceId: 'space-1',
        },
        runId: 'run-1',
      });
    });

    await Promise.resolve();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('refetches rematch snapshots when response reconciliation is fully indexed', async () => {
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    renderHook(() => useDebateRematchClaims('rematch-1', ['claim-1']), { wrapper });
    await waitFor(() => expect(mocks.listDebateRematchClaims).toHaveBeenCalled());
    invalidateQueries.mockClear();

    act(() => {
      queryClient.setQueryData(entityResponseIndexingQueryKey('profile-1', 'claim-1', 'space-1', 'veracity'), {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'negative',
          personalSpaceId: 'profile-1',
          responseKind: 'veracity',
          spaceId: 'space-1',
        },
        runId: 'run-1',
      });
    });

    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({ predicate: expect.any(Function) }, { cancelRefetch: false })
    );

    // Only the batches naming the claim, plus the id-less session list any response can add a
    // row to. The picker holds a batch per page on screen; refetching all of them for one
    // response is what left its positions trailing.
    const predicate = invalidateQueries.mock.calls.at(-1)![0]!.predicate!;
    const batch = (claimIds: string[]) =>
      ({ queryKey: ['debates', 'account', 'user-a', 'rematch', 'rematch-1', 'claims', claimIds] }) as never;
    expect(predicate(batch(['claim-1']))).toBe(true);
    expect(predicate(batch(['claim-0', 'claim-1', 'claim-2']))).toBe(true);
    expect(predicate(batch([]))).toBe(true);
    expect(predicate(batch(['claim-2']))).toBe(false);
    expect(
      predicate({ queryKey: ['debates', 'account', 'user-a', 'rematch', 'rematch-2', 'claims', ['claim-1']] } as never)
    ).toBe(false);
  });

  // Cancelling a batch that is about to answer throws the request away, and when responses keep
  // arriving it means none of them ever land — the starvation this family is invalidated around.
  // The request in flight is left to land, then asked again so the answer postdates the response.
  it('lets a rematch batch in flight land and asks it again once an indexed response arrives', async () => {
    mocks.identityToken.mockReturnValue(null);
    mocks.getIdentityToken.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    let landFirst!: () => void;
    mocks.listDebateRematchClaims.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          landFirst = () => resolve({ claims: [], excluded_claim_ids: [] });
        })
    );

    renderHook(() => useDebateRematchClaims('rematch-1', ['claim-1']), { wrapper });
    await waitFor(() => expect(mocks.listDebateRematchClaims).toHaveBeenCalledTimes(1));

    act(() => {
      queryClient.setQueryData(entityResponseIndexingQueryKey('profile-1', 'claim-1', 'space-1', 'veracity'), {
        status: 'indexed',
        pending: {
          entityId: 'claim-1',
          expectedResponse: 'negative',
          personalSpaceId: 'profile-1',
          responseKind: 'veracity',
          spaceId: 'space-1',
        },
        runId: 'run-1',
      });
    });

    // The request that was already on its way is not restarted out from under itself.
    const batch = queryClient
      .getQueryCache()
      .find({ queryKey: debateQueryKeys.rematchClaims('user-a', 'rematch-1', ['claim-1']) })!;
    expect(batch.state.fetchStatus).toBe('fetching');
    expect(mocks.listDebateRematchClaims).toHaveBeenCalledTimes(1);

    act(() => landFirst());

    // ...and once it has landed, it is asked again, so what ends up on screen knows the response.
    await waitFor(() => expect(mocks.listDebateRematchClaims).toHaveBeenCalledTimes(2));
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
    challenge: null,
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
    // Everything under `'debates'` bar the rematch picker's positions batches, which availability
    // says nothing about and which cost a request per page of claims on screen.
    expect(invalidateQueries).toHaveBeenCalledWith({ predicate: expect.any(Function) });
    const predicate = invalidateQueries.mock.calls.at(-1)![0]!.predicate!;
    expect(predicate({ queryKey: ['debates', 'account', 'user-a', 'activity'] } as never)).toBe(true);
    expect(predicate({ queryKey: ['debates', 'claims', 'space-1', 'all'] } as never)).toBe(true);
    expect(
      predicate({ queryKey: ['debates', 'account', 'user-a', 'rematch', 'rematch-1', 'claims', ['claim-1']] } as never)
    ).toBe(false);
    expect(predicate({ queryKey: ['claim-picker', 'page'] } as never)).toBe(false);
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
      challenge: null,
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
      challenge: null,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.activity('user-a') });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.rematch('user-a', session.id) });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: debateQueryKeys.debate('debate-1') });
    expect(queryClient.getQueryData<Debate>(debateQueryKeys.debate('debate-1'))?.rematch_session_id).toBe(session.id);
  });
});

describe('useAcceptDebateRematchRequest', () => {
  it('holds an entry intent while the converted debate route is loading', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const session = { ...rematchSession(), status: 'converted' as const, converted_debate_id: 'debate-2' };
    const debate = { id: 'debate-2' } as Debate;
    mocks.acceptDebateRematchRequest.mockResolvedValue({ session, debate });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => ({ accept: useAcceptDebateRematchRequest(), enteringDebateId: useEnteringDebateId() }),
      { wrapper }
    );

    await act(() => result.current.accept.mutateAsync('request-1'));

    await waitFor(() => expect(result.current.enteringDebateId).toBe('debate-2'));
    expect(queryClient.getQueryData(debateQueryKeys.debate('debate-2'))).toEqual(debate);
    clearEnteringDebate('debate-2');
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
      challenge: null,
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
      challenge: null,
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
      challenge: null,
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
      challenge: null,
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
      challenge: null,
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
      challenge: null,
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

  // DebateCoordinator routes into `source_debate_id` for as long as a session is deciding. Leaving
  // the room while the session sat in activity sent the viewer straight back into the room they
  // had just left, which is what made the screen flicker after a cancelled recording.
  it('clears a rematch anchored to the debate being left', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const activity: DebateActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: { ...rematchSession(), status: 'deciding' },
      challenge: null,
    };
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), activity);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClearDebateActivity(), { wrapper });

    act(() => result.current('debate-1'));

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual({ ...activity, rematch: null });
  });

  it('leaves a rematch anchored to a different debate alone', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const activity: DebateActivity = {
      online: true,
      available_to_debate: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: { ...rematchSession(), source_debate_id: 'debate-2' },
      challenge: null,
    };
    queryClient.setQueryData(debateQueryKeys.activity('user-a'), activity);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useClearDebateActivity(), { wrapper });

    act(() => result.current('debate-1'));

    expect(queryClient.getQueryData(debateQueryKeys.activity('user-a'))).toEqual(activity);
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

  // The gateway owns freshness for these, so time passing must not cost a request. Account activity
  // is deliberately not among them any more — it gates the incoming-request popup and polls to
  // survive a deaf socket (GEO-2638); its cadence is pinned in `hooks-query-network.test.tsx`,
  // where the two focus gates a real interval depends on can be stated directly.
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
