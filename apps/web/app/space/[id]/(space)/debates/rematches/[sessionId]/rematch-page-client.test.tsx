import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';

import { type ReactElement, StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { DebateRematchClaim, DebateRematchSession, MatchmakingClaim } from '~/core/debates/api';
import { clearDebateReturnDestination, rememberDebateReturnDestination } from '~/core/debates/debate-return-navigation';
import type { ParticipantPosition } from '~/core/debates/participant-positions';

import { DebateRematchPageClient } from './rematch-page-client';

const { SPACE_1, SPACE_2, CLAIM_SHARED, CLAIM_MORE, CLAIM_SOURCE, CRYPTO_SPACE, PODCASTS_SPACE, NAME_PROPERTY } =
  vi.hoisted(() => ({
    SPACE_1: '019fedae-72b6-7ab2-927a-df044d57c566',
    SPACE_2: '019fedae-72b6-7ab2-927a-df044d57c567',
    // Real ids from the hard-coded ranking table, so the ordering under test is the real one.
    CRYPTO_SPACE: 'c9f267dcb0d270718c2a3c45a64afd32',
    PODCASTS_SPACE: 'b5a31f8182b042437ede0f84ee02f104',
    NAME_PROPERTY: 'a126ca530c8e48d5b88882c734c38935',
    CLAIM_SHARED: '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419',
    CLAIM_MORE: '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520',
    CLAIM_SOURCE: '019fedb3-2e63-7b50-9c33-4e9f7a0d6621',
  }));

const mocks = vi.hoisted(() => ({
  session: null as DebateRematchSession | null,
  claims: [] as DebateRematchClaim[],
  replace: vi.fn(),
  back: vi.fn(),
  mutate: vi.fn(),
  leaveMutate: vi.fn(),
  acceptMutate: vi.fn(),
  rejectMutate: vi.fn(),
  submitResponse: vi.fn(),
  optimisticResponses: new Map<string, 'positive' | 'negative' | null>(),
  setReadiness: vi.fn(),
  joinQueue: vi.fn((_variables: { spaceId: string; claimId: string }) => Promise.resolve({ claim: null, match: null })),
  /** Which space each card wired its readiness machine to, in mount order. */
  joinQueueSpaceIds: [] as string[],
  leaveQueue: vi.fn((_variables: { spaceId: string; claimId: string }) =>
    Promise.resolve({ claim: null, match: null })
  ),
  openSidePanel: vi.fn(),
  /** Every query the All tab handed the hub's claims lookup, in render order. */
  entityQueries: [] as Array<{ search: string | null; spaceId: string | null }>,
  /** Every id list the opponent's claims were hydrated with, in render order. */
  entityIdLookups: [] as string[][],
  featuredClaims: [] as Array<{ claimEntityId: string; spaceId: string; name: string; description: string | null }>,
  featuredCatalogLoading: false,
  entityQueryHasNextPage: false,
  /** The hub's claims query (the All tab) is still in flight. */
  entityQueryLoading: false,
  /** The by-id hydration of the opponent's claims is still in flight. */
  entityHydrationLoading: false,
  fetchNextPage: vi.fn(),
  /** Graph entities available to hydrate by id. */
  entities: [] as Array<Record<string, unknown>>,
  /** The hub's claims rows the All tab lists. */
  matchmakingClaims: [] as MatchmakingClaim[],
  /** Overrides the single-page default when a test needs paging to accumulate. */
  entityQueryPages: null as MatchmakingClaim[][] | null,
  entityQueryFetchingNextPage: false,
  /** Both participants' graph positions. */
  positions: [] as ParticipantPosition[],
  positionsLoading: false,
  positionParticipants: [] as string[][],
  recommendedSections: [] as Array<{ id: string; name: string; claimIds: string[] }>,
  recommendedEntities: [] as Array<Record<string, unknown>>,
  recommendedLoading: false,
  rematchClaimIds: [] as string[][],
  curatedIds: [] as string[],
  savedClaims: null as DebateRematchClaim[] | null,
  browsedLookupLoading: false,
  currentUserId: 'user-local' as string | null,
  spaceAllowlist: null as Set<string> | null,
  allowlistLoading: false,
  spaceTypes: {} as Record<string, 'DAO' | 'PERSONAL'>,
  publishableSpaceIds: null as Set<string> | null,
  scrollSentinelIntoView: null as null | (() => void),
  claimReadinessLoading: false,
  claimReadinessError: false,
  /** Every group list the per-space readiness lookup was asked for, in render order. */
  perSpaceReadinessGroups: [] as Array<Array<{ spaceId: string; claimIds: string[] }>>,
  /** Every space-scope retention the picker asked the gateway for, in render order. */
  gatewaySpaceScopes: [] as Array<{ spaceIds: string[]; enabled: boolean }>,
  markEnteringDebate: vi.fn(),
  claimReadiness: [] as Array<{
    claim_entity_id: string;
    viewer_debate_ready: boolean;
    readiness_disabled_reason: string | null;
  }>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, back: mocks.back }),
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();
  return {
    ...actual,
    getCurrentGeoChatUserId: () => mocks.currentUserId,
    resolveCurrentGeoChatUserId: () => Promise.resolve(mocks.currentUserId),
  };
});

vi.mock('~/core/debates/hooks', () => ({
  useDebateRematch: () => ({ data: mocks.session, isLoading: false, error: null }),
  // The session's own saved claims. `savedClaims` lets a test empty this so a claim can only
  // arrive through the id lookup.
  useDebateRematchClaims: () => ({
    data: { claims: mocks.savedClaims ?? mocks.claims, excluded_claim_ids: [CLAIM_SOURCE] },
    isLoading: false,
    error: null,
  }),
  // Two lookups run: one for the curated ids, one for the browsed ones. `curatedIds` lets a test
  // stall the browsed lookup on its own, which is the whole point of their being separate.
  useDebateRematchClaimsForIds: (_sessionId: string, claimIds: string[]) => rematchClaimsLookup(claimIds),
  useDebate: () => ({ data: { claim: { claim_entity_id: CLAIM_SOURCE } } }),
  useDebateClaimsBySpaces: (groups: Array<{ spaceId: string; claimIds: string[] }>) => {
    mocks.perSpaceReadinessGroups.push(groups);
    return {
      claims: mocks.claimReadiness,
      isLoading: mocks.claimReadinessLoading,
      isError: mocks.claimReadinessError,
    };
  },
  useCreateDebateRematchRequest: () => mutation(),
  useLeaveDebateRematch: () => mutation(mocks.leaveMutate),
  useAcceptDebateRematchRequest: () => mutation(mocks.acceptMutate),
  useRejectDebateRematchRequest: () => mutation(mocks.rejectMutate),
  // Mirrors the real key factory: the readiness machine refetches these families before it
  // retries a `claim_response_required`.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-a', getPrivyIdentityToken: vi.fn() }),
  // The card's Debate switch shares the entity page's queue-backed readiness machine.
  useJoinDebateQueue: (spaceId: string) => {
    mocks.joinQueueSpaceIds.push(spaceId);
    return {
      mutateAsync: (variables: { claimId: string }) => mocks.joinQueue({ spaceId, ...variables }),
      reset: vi.fn(),
      isPending: false,
      error: null,
    };
  },
  useLeaveDebateQueue: (spaceId: string) => ({
    mutateAsync: (variables: { claimId: string }) => mocks.leaveQueue({ spaceId, ...variables }),
    isPending: false,
    error: null,
  }),
}));

function rematchClaimsLookup(claimIds: string[]) {
  mocks.rematchClaimIds.push(claimIds);
  const isCuratedLookup = mocks.curatedIds.length > 0 && claimIds.every(claimId => mocks.curatedIds.includes(claimId));
  if (mocks.browsedLookupLoading && !isCuratedLookup) {
    return { data: { claims: [], excluded_claim_ids: [] }, isLoading: true, error: null };
  }
  return {
    data: { claims: mocks.claims, excluded_claim_ids: [CLAIM_SOURCE] },
    isLoading: false,
    error: null,
  };
}

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return {
    ...view,
    rerender: (next: ReactElement) =>
      view.rerender(<QueryClientProvider client={queryClient}>{next}</QueryClientProvider>),
  };
}

// `debate.claims_changed` is delivered per space; the picker has to hold a scope on every space
// it shows regardless of where readiness comes from. Record what it retains.
vi.mock('~/core/debates/debate-gateway', () => ({
  useDebateGatewaySpaceScopes: (spaceIds: string[], enabled: boolean) => {
    mocks.gatewaySpaceScopes.push({ spaceIds, enabled });
  },
}));

vi.mock('~/core/debates/debate-entry-intent', () => ({
  markEnteringDebate: (debateId: string) => mocks.markEnteringDebate(debateId),
}));

// GEO-2683. Featured stands in for Recommended when no curator page exists, which is what most of
// these suites run under — so without this every case here would reach the graph for the tag.
vi.mock('~/core/debates/featured-claims', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/featured-claims')>()),
  useFeaturedClaims: (enabled: boolean) => {
    const claims = enabled ? mocks.featuredClaims : [];
    return {
      claims,
      claimIds: claims.map(claim => claim.claimEntityId),
      isLoading: enabled && mocks.featuredCatalogLoading,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

// The opponent's claims are hydrated from the graph by id, through the picker's narrow projection.
vi.mock('~/core/debates/claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => {
    mocks.entityIdLookups.push(ids);
    return {
      entities: mocks.entities.filter(entity => ids.includes(entity.id as string)),
      isLoading: mocks.entityHydrationLoading,
      error: null,
    };
  },
}));

// Both participants' sides, straight from the graph. `positions` is the rows the query returns.
vi.mock('~/core/debates/participant-positions', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/participant-positions')>();
  return {
    ...actual,
    useParticipantPositions: (participants: Array<{ profile_space_id: string }>) => {
      mocks.positionParticipants.push(participants.map(participant => participant.profile_space_id));
      return {
        byClaim: actual.groupParticipantPositions(mocks.positions),
        isLoading: mocks.positionsLoading,
        error: null,
      };
    },
  };
});

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: ({ entityId }: { entityId: string }) => ({
    submitResponse: (direction: 'positive' | 'negative' | 'clear') => mocks.submitResponse(entityId, direction),
    optimisticResponse: mocks.optimisticResponses.get(entityId),
    isConnected: true,
    personalSpaceId: 'personal-space',
  }),
  // In production `optimisticResponse` is derived from this snapshot, so the two can't disagree.
  // Mocking them independently let a test assert an optimistic side the snapshot denied.
  useEntityResponseIndexingSnapshot: ({ entityId }: { entityId: string }) => {
    const expectedResponse = mocks.optimisticResponses.get(entityId);
    if (expectedResponse === undefined) return { status: 'idle', pending: null, runId: null };
    return { status: 'reconciling', pending: { entityId, expectedResponse }, runId: `run-${entityId}` };
  },
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

// The card's Debate toggle publishes readiness through this.
vi.mock('~/core/debates/matchmaking/hooks', () => ({
  useClaimReadiness: () => ({ mutate: mocks.setReadiness, isPending: false, error: null }),
  // The All tab is the hub's Claims query. Its arguments are what the tests below inspect.
  useMatchmakingClaims: (query: { search: string | null; spaceId: string | null }) => {
    mocks.entityQueries.push(query);
    return {
      data: {
        pages: (mocks.entityQueryPages ?? [mocks.matchmakingClaims]).map(claims => ({
          claims,
          next_cursor: null,
          facets: undefined,
        })),
      },
      isLoading: mocks.entityQueryLoading,
      error: null,
      hasNextPage: mocks.entityQueryHasNextPage,
      isFetchingNextPage: mocks.entityQueryFetchingNextPage,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
}));

// The curated lookup has its own tests; these cover the picker around it.
vi.mock('~/core/debates/recommended-claims', () => ({
  useRecommendedClaimSections: () => ({
    sections: mocks.recommendedSections,
    claimEntities: mocks.recommendedEntities,
    isLoading: mocks.recommendedLoading,
  }),
}));

// The acceptor's editor spaces. Null is "unknown", which does not filter — so every case that
// isn't about this gate behaves as before.
vi.mock('~/core/debates/use-debate-publishable-spaces', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/use-debate-publishable-spaces')>();
  return {
    ...actual,
    useDebatePublishableSpaces: () => ({ publishableSpaceIds: mocks.publishableSpaceIds, isLoading: false }),
  };
});

// Null is "the allowlist hasn't resolved", which every case that isn't about it runs under.
vi.mock('~/core/debates/use-claim-space-allowlist', () => ({
  useClaimSpaceAllowlist: () => ({ allowlist: mocks.spaceAllowlist, isLoading: mocks.allowlistLoading }),
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel, sidePanelTarget: null, closeSidePanel: vi.fn() }),
}));

// useSpaceLabels reads the browse sidebar's cache before falling back to the mock below. These
// suites render without a QueryClientProvider, so the read is stubbed as "nothing cached yet".
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => null,
}));

// `type` is load-bearing, not decoration: the picker refuses to offer a claim whose home space is
// personal, because a debate there could never be published. `mocks.spaceTypes` overrides it per
// space; anything unlisted is a DAO space, which is what the rest of these suites assume.
vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: (spaceIds: string[] = []) => ({
    spaces: [],
    spacesById: new Map(
      [
        // Anything the picker asked about resolves, so the type lookup can answer for it. The two
        // named spaces come last so their real labels win over the generic fallback.
        ...spaceIds.map(id => [id, `Space ${id.slice(0, 8)}`] as const),
        [SPACE_1, 'Crypto'] as const,
        [SPACE_2, 'Governance space'] as const,
      ].map(([id, name]) => [id, { type: mocks.spaceTypes[id] ?? 'DAO', entity: { name, image: null } }])
    ),
    isLoading: false,
  }),
}));

function mutation(mutate = mocks.mutate) {
  return { mutate, mutateAsync: mutate, isPending: false, error: null };
}

beforeEach(() => {
  clearDebateReturnDestination();
  mocks.replace.mockReset();
  mocks.back.mockReset();
  mocks.mutate.mockReset();
  mocks.leaveMutate.mockReset();
  mocks.acceptMutate.mockReset();
  mocks.rejectMutate.mockReset();
  mocks.submitResponse.mockReset();
  mocks.optimisticResponses.clear();
  mocks.claimReadiness = [];
  mocks.claimReadinessLoading = false;
  mocks.claimReadinessError = false;
  mocks.setReadiness.mockReset();
  mocks.joinQueue.mockClear();
  mocks.leaveQueue.mockClear();
  mocks.joinQueueSpaceIds.length = 0;
  mocks.openSidePanel.mockReset();
  mocks.entityQueries.length = 0;
  mocks.entityIdLookups.length = 0;
  mocks.featuredClaims = [];
  mocks.featuredCatalogLoading = false;
  mocks.entityQueryHasNextPage = false;
  mocks.entityQueryLoading = false;
  mocks.entityHydrationLoading = false;
  mocks.fetchNextPage.mockReset();
  mocks.entities = [sharedEntity(), publishedEntity()];
  mocks.matchmakingClaims = [matchmakingClaim()];
  mocks.entityQueryPages = null;
  mocks.entityQueryFetchingNextPage = false;
  mocks.positions = [
    position('profile-local', CLAIM_SHARED, SPACE_1, true),
    position('profile-remote', CLAIM_SHARED, SPACE_1, false),
  ];
  mocks.positionsLoading = false;
  mocks.positionParticipants.length = 0;
  mocks.recommendedSections = [];
  mocks.recommendedEntities = [];
  mocks.recommendedLoading = false;
  mocks.rematchClaimIds.length = 0;
  mocks.curatedIds = [];
  mocks.savedClaims = null;
  mocks.browsedLookupLoading = false;
  mocks.currentUserId = 'user-local';
  mocks.spaceAllowlist = null;
  mocks.allowlistLoading = false;
  mocks.spaceTypes = {};
  mocks.publishableSpaceIds = null;
  // jsdom has no IntersectionObserver, which the infinite-scroll sentinel builds. This one records
  // the callback so a test can say the sentinel scrolled into view.
  mocks.scrollSentinelIntoView = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        mocks.scrollSentinelIntoView = () =>
          this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
  // The hub's filter menus measure their dropdown.
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  mocks.session = session();
  mocks.claims = [sharedClaim()];
  mocks.perSpaceReadinessGroups = [];
  mocks.gatewaySpaceScopes = [];
  mocks.markEnteringDebate.mockReset();
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(() => {
  clearDebateReturnDestination();
  vi.restoreAllMocks();
  cleanup();
});

describe('DebateRematchPageClient', () => {
  it('does not leave a browsing rematch during the Strict Mode effect rehearsal', async () => {
    render(
      <StrictMode>
        <DebateRematchPageClient sessionId="rematch-1" />
      </StrictMode>
    );
    await showOpponentClaims();

    expect(await screen.findByText('A claim both participants chose')).toBeInTheDocument();
    await new Promise(resolve => window.setTimeout(resolve, 0));
    expect(mocks.leaveMutate).not.toHaveBeenCalled();
  });

  it('does not end a browsing rematch when the page unmounts', async () => {
    const { unmount } = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    unmount();
    await new Promise(resolve => window.setTimeout(resolve, 0));

    expect(mocks.leaveMutate).not.toHaveBeenCalled();
  });

  it('ends a browsing rematch only through the explicit leave action', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.leaveMutate).toHaveBeenCalledOnce();
  });

  it('returns a profile challenge to the page before the debate flow after leaving', async () => {
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(2);
    const endedSession = session({ source_debate_id: null, status: 'ended' });
    mocks.session = session({ source_debate_id: null });
    mocks.leaveMutate.mockImplementation(
      (_input: undefined, options: { onSuccess?: (ended: DebateRematchSession) => void }) => {
        options.onSuccess?.(endedSession);
      }
    );

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.back).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalledWith(`/space/${SPACE_1}/debates`);
  });

  it('preserves the debates-page exit for rematches started from a prior debate', async () => {
    const endedSession = session({ status: 'ended' });
    mocks.leaveMutate.mockImplementation(
      (_input: undefined, options: { onSuccess?: (ended: DebateRematchSession) => void }) => {
        options.onSuccess?.(endedSession);
      }
    );

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.replace).toHaveBeenCalledWith(`/space/${SPACE_1}/debates`);
    expect(mocks.back).not.toHaveBeenCalled();
  });

  it('returns a debate-again session to the page that opened the flow', async () => {
    rememberDebateReturnDestination('/space/my-space?tab=activity#latest');
    const endedSession = session({ status: 'ended' });
    mocks.leaveMutate.mockImplementation(
      (_input: undefined, options: { onSuccess?: (ended: DebateRematchSession) => void }) => {
        options.onSuccess?.(endedSession);
      }
    );

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave debate' }));

    expect(mocks.replace).toHaveBeenCalledWith('/space/my-space?tab=activity#latest');
    expect(mocks.back).not.toHaveBeenCalled();
  });

  // The pin this used to assert is gone (GEO-2647); what matters is that both claims are listed
  // and a shared preference is still the one you can act on.
  it("lists the session's own claims alongside published ones and enables opposing requests", async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled();
  });

  it('renders active semantic response buttons with holder avatars', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const sharedClaimCard = screen.getByText('A claim both participants chose').closest('article');
    expect(sharedClaimCard).not.toBeNull();
    expect(within(sharedClaimCard!).getByRole('button', { name: /^Agree/ })).toBeEnabled();
    expect(within(sharedClaimCard!).getByRole('button', { name: /^Disagree/ })).toBeEnabled();
    expect(
      within(sharedClaimCard!)
        .getByRole('button', { name: /^Agree/ })
        .querySelector('img, svg')
    ).not.toBeNull();
    expect(
      within(sharedClaimCard!)
        .getByRole('button', { name: /^Disagree/ })
        .querySelector('img, svg')
    ).not.toBeNull();
  });

  it('changes responses through the semantic buttons without rendering a second response area', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: true, position_label: 'Agree' },
        ],
      },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    const sharedClaimCard = screen.getByText('A claim both participants chose').closest('article');
    expect(sharedClaimCard).not.toBeNull();
    fireEvent.click(within(sharedClaimCard!).getByRole('button', { name: /^Disagree/ }));
    expect(mocks.submitResponse).toHaveBeenCalledWith(CLAIM_SHARED, 'negative');
    expect(screen.queryByText('You both have the same response. Change yours to request this debate.')).toBeNull();
    const syntheticClaimCard = screen.getByText('A newly published claim').closest('article');
    expect(syntheticClaimCard).not.toBeNull();
    expect(within(syntheticClaimCard!).queryByText('Respond before requesting')).toBeNull();
    expect(within(syntheticClaimCard!).getByRole('button', { name: /^Agree/ })).toBeEnabled();
    expect(within(syntheticClaimCard!).getByRole('button', { name: /^Disagree/ })).toBeEnabled();
  });

  it('uses Verify and Dispute for factual claims', async () => {
    mocks.claims = [{ ...sharedClaim(), response_kind: 'veracity' }];
    mocks.positions = [
      { ...position('profile-local', CLAIM_SHARED, SPACE_1, true), responseKind: 'veracity' },
      { ...position('profile-remote', CLAIM_SHARED, SPACE_1, false), responseKind: 'veracity' },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const claimCard = screen.getByText('A claim both participants chose').closest('article');
    expect(claimCard).not.toBeNull();
    expect(within(claimCard!).getByRole('button', { name: /^Verify/ })).toBeEnabled();
    expect(within(claimCard!).getByRole('button', { name: /^Dispute/ })).toBeEnabled();
  });

  it('shows authoritative stance labels in the incoming request dialog and preserves rematch actions', async () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-remote',
        recipient_user_id: 'user-local',
        requester_position: false,
        requester_position_label: 'Disagree',
        recipient_position: true,
        recipient_position_label: 'Agree',
        response_kind: 'stance',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    const { unmount } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    const dialog = screen.getByRole('dialog', { name: 'A claim both participants chose' });
    expect(within(dialog).getByText('Debate request')).toBeInTheDocument();
    expect(within(dialog).getByText('You')).toBeInTheDocument();
    expect(within(dialog).getByText('Salina')).toBeInTheDocument();
    expect(within(dialog).getByText('VS')).toBeInTheDocument();
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Agree')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Salina').parentElement!).getByText('Disagree')).toBeInTheDocument();
    expect(within(dialog).getAllByText('1m')).toHaveLength(2);
    expect(within(dialog).getAllByText('45s')).toHaveLength(2);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accept' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith('request-1');
    expect(mocks.rejectMutate).toHaveBeenCalledWith('request-1');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('falls back to Agree and Disagree for incoming requests without response metadata', async () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-legacy',
        status: 'pending',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-remote',
        recipient_user_id: 'user-local',
        requester_position: false,
        recipient_position: true,
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    const dialog = screen.getByRole('dialog', { name: 'A claim both participants chose' });
    expect(within(within(dialog).getByText('You').parentElement!).getByText('Agree')).toBeInTheDocument();
    expect(within(within(dialog).getByText('Salina').parentElement!).getByText('Disagree')).toBeInTheDocument();
  });

  it('disables debate requests while a rematch request is pending', async () => {
    mocks.session = session({
      status: 'request_pending',
      request: {
        id: 'request-1',
        status: 'pending',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-local',
        recipient_user_id: 'user-remote',
        requester_position: true,
        requester_position_label: 'Agree',
        recipient_position: false,
        recipient_position_label: 'Disagree',
        response_kind: 'stance',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.getByRole('button', { name: 'Requesting…' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /^(Agree|Disagree)/ })).toHaveLength(4);
  });

  it('explains when response changes cancel a rematch request', async () => {
    mocks.session = session({
      request: {
        id: 'request-1',
        status: 'expired',
        claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
        requester_user_id: 'user-local',
        recipient_user_id: 'user-remote',
        requester_position: true,
        requester_position_label: 'Agree',
        recipient_position: false,
        recipient_position_label: 'Disagree',
        response_kind: 'stance',
        cancellation_reason: 'claim_response_position_changed',
        turn_format_id: 'standard',
        created_at: '2026-07-10T10:00:00.000Z',
        expires_at: '2026-07-10T10:02:00.000Z',
      },
    });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(
      screen.getByText('This request was cancelled because the responses no longer oppose each other.')
    ).toBeInTheDocument();
  });

  // GEO-2683. Claims is the landing tab now, whatever its source turns out to be — the strip no
  // longer reshuffles as the curated lookup lands, because which claims Claims shows is the source
  // menu's business.
  it('opens on Claims, with the opponent’s positions counted alongside', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-selected', 'true');
    const tab = screen.getByRole('button', { name: /Salina’s positions/ });
    // Only the shared claim carries a side from Salina, and the badge says so from the other tab.
    expect(within(tab).getByText('1')).toBeInTheDocument();

    await showOpponentClaims();

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.queryByText('A newly published claim')).toBeNull();
  });

  // A curator's page for this pairing is the best thing to land on; without one the tab has no
  // reason to exist.
  it('hides the Recommended tab when nothing is curated for this pairing', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('button', { name: 'Recommended' })).toBeNull();
    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toBeInTheDocument();
  });

  // GEO-2683. Recommended, Featured and the whole corpus are three answers to one question --
  // "which claims?" -- so they are a menu on the Claims tab rather than tabs of their own.
  describe('the Claims source menu', () => {
    const FEATURED = '019fedb8-6ca7-7f94-8a77-8cd3be5faa64';

    function featuredEntity(id = FEATURED, name = 'A featured claim') {
      return { ...publishedEntity(id, name), spaces: [SPACE_2] };
    }

    function featuredTag(id = FEATURED, name = 'A featured claim', spaceId = SPACE_2) {
      return { claimEntityId: id, spaceId, name, description: null };
    }

    function curatedPage() {
      mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] }];
      mocks.recommendedEntities = [sharedEntity()];
    }

    it('opens on Featured when no curator has a page for this pairing', async () => {
      mocks.featuredClaims = [featuredTag()];
      mocks.entities = [sharedEntity(), featuredEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      expect(screen.getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
      expect(screen.getByText('A featured claim')).toBeInTheDocument();
    });

    // A curator's page for this exact pairing beats a tag anyone's space can carry.
    it('opens on Recommended when a curator has a page, keeping Featured a pick away', async () => {
      curatedPage();
      mocks.featuredClaims = [featuredTag()];
      mocks.entities = [sharedEntity(), featuredEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      expect(screen.getByRole('heading', { name: 'Geopolitics & chips' })).toBeInTheDocument();

      await chooseSource('Featured');

      expect(screen.getByText('A featured claim')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Geopolitics & chips' })).toBeNull();
    });

    // A fixed order, so a source that appears doesn't reshuffle the ones already in the menu.
    it('offers the sources in a fixed order, Recommended first', async () => {
      curatedPage();
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      openSourceMenu();

      const labels = ['Recommended', 'Featured', 'All claims'];
      const options = screen.getAllByRole('button').filter(button => labels.includes(button.textContent?.trim() ?? ''));
      // The trigger carries the current label too, and it is rendered ahead of the options.
      expect(options.slice(-3).map(button => button.textContent?.trim())).toEqual(labels);
    });

    it('leaves Recommended out of the menu when there is no curated page', async () => {
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      openSourceMenu();

      expect(screen.queryByRole('button', { name: 'Recommended' })).toBeNull();
      expect(screen.getByRole('button', { name: 'All claims' })).toBeInTheDocument();
    });

    // Unlike Recommended, Featured is a tag any space can carry, so it fans out across the corpus
    // the way All claims does -- and is bounded the same way.
    it('drops tagged claims from spaces outside the viewer’s allowed set', async () => {
      mocks.spaceAllowlist = new Set([SPACE_1.replace(/-/g, '')]);
      mocks.featuredClaims = [featuredTag()];
      mocks.entities = [sharedEntity(), featuredEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await settleTabSwap();

      expect(screen.queryByText('A featured claim')).toBeNull();
      expect(screen.getByText('No featured claims are available to debate yet.')).toBeInTheDocument();
    });

    it('says nothing is featured rather than nothing is debatable', async () => {
      mocks.featuredClaims = [featuredTag()];
      // Tagged, but the graph has no entity for it -- so the source has nothing to show.
      mocks.entities = [sharedEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await settleTabSwap();

      expect(screen.getByText('No featured claims are available to debate yet.')).toBeInTheDocument();
    });
  });

  it('opens on Recommended when a curator has, grouping each block into its own section', async () => {
    mocks.recommendedSections = [
      { id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] },
      { id: 'block-2', name: 'Open weight AI', claimIds: [CLAIM_MORE] },
    ];
    mocks.recommendedEntities = [sharedEntity(), publishedEntity()];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: 'Recommended' })).toBeInTheDocument();
    const geopolitics = screen.getByRole('heading', { name: 'Geopolitics & chips' });
    const openWeight = screen.getByRole('heading', { name: 'Open weight AI' });
    expect(geopolitics.compareDocumentPosition(openWeight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Each block lists its own claims.
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  it('collapses a section without touching the others', async () => {
    mocks.recommendedSections = [
      { id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] },
      { id: 'block-2', name: 'Open weight AI', claimIds: [CLAIM_MORE] },
    ];
    mocks.recommendedEntities = [sharedEntity(), publishedEntity()];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Geopolitics & chips/ }));

    expect(screen.queryByText('A claim both participants chose')).toBeNull();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  // The opponent's tab is what the graph says they have responded to, not what geo-chat has a
  // session row for. A side they took that geo-chat hasn't heard about yet still lists — and the
  // graph's list is one query, so it doesn't wait on the allowlist or any geo-chat lookup.
  it('lists a claim the opponent answered that geo-chat has no row for', async () => {
    const FRESH = '019fedb7-5b96-7e83-9f66-7bc2ad4f9953';
    mocks.savedClaims = [];
    mocks.claims = [];
    mocks.entities = [sharedEntity(), { ...sharedEntity(), id: FRESH, name: 'A claim Salina just answered' }];
    mocks.positions = [
      position('profile-remote', CLAIM_SHARED, SPACE_1, false),
      position('profile-remote', FRESH, SPACE_1, true),
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByText('A claim Salina just answered')).toBeInTheDocument();
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    const tab = screen.getByRole('button', { name: /Salina’s positions/ });
    expect(within(tab).getByText('2')).toBeInTheDocument();
    // geo-chat's settled batch has no row for it, so it has no readiness row: not ready, drawn
    // without spending a per-space request to find that out.
    expect(screen.getAllByRole('switch', { name: 'Ready to debate this claim' })).toHaveLength(2);
    expect(mocks.perSpaceReadinessGroups.every(groups => groups.length === 0)).toBe(true);
    // Hydrated by id — exactly the claims the graph named, nothing paged.
    // Empty lookups skipped: the Featured slot hydrates through the same hook and asks for nothing
    // when no claim is tagged, which would otherwise be the last call recorded.
    expect(mocks.entityIdLookups.filter(ids => ids.length > 0).at(-1)).toEqual([CLAIM_SHARED, FRESH]);
    // And the graph was asked about exactly these two people.
    expect(mocks.positionParticipants.at(-1)).toEqual(['profile-local', 'profile-remote']);
  });

  // A curated claim the session hasn't heard of still has to render, so it joins the same pool the
  // browsed pages feed rather than being listed separately.
  it('drops a section whose claims all fall out of the filters', async () => {
    mocks.recommendedSections = [
      { id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] },
      { id: 'block-2', name: 'Open weight AI', claimIds: [CLAIM_MORE] },
    ];
    mocks.recommendedEntities = [sharedEntity(), publishedEntity()];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claims' }), { target: { value: 'newly' } });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Geopolitics & chips' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Open weight AI' })).toBeInTheDocument();
  });

  // Recommended comes from the curator's page whole, so paging the browsed corpus means nothing
  // there — offering it implies there are more recommendations waiting.
  // Nor on the opponent's tab: that list is the session's own from geo-chat, and paging the graph-wide
  // scan from it walked the corpus hoping a browsed claim happened to carry their side.
  it('keeps the paging sentinel off the Recommended and opponent tabs, placing it on All', async () => {
    mocks.entityQueryHasNextPage = true;
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] }];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));
    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();

    await showAllClaims();
    expect(screen.getByTestId('claims-scroll-sentinel')).toBeInTheDocument();
  });

  // No button to press any more; reaching the end of the list is what asks for the next page.
  it('does not offer a Keep looking button while the sentinel is still paging', async () => {
    mocks.entityQueryHasNextPage = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.queryByRole('button', { name: 'Keep looking' })).toBeNull();
  });

  // The picker pages by cursor rather than through an infinite query, so the sentinel firing has
  // to be shown to advance that cursor — a sentinel that renders but is wired to nothing would
  // satisfy every other test here.
  it('asks the hub query for its next page when the end of the list scrolls into view', async () => {
    mocks.entityQueryHasNextPage = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(mocks.fetchNextPage).not.toHaveBeenCalled();

    act(() => mocks.scrollSentinelIntoView?.());

    expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
  });

  it('leaves the sentinel out once there is no page left to fetch', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();
  });

  // Curated claims are picked by hand, so they can be ones the browsed pages never reach. They
  // have to land in the same pool, or a recommendation would head a section with nothing under it.
  it('renders a curated claim the browsed pages never returned', async () => {
    const CURATED = '019fedb59a8f7d728e556ab19c3e8841';
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CURATED] }];
    mocks.recommendedEntities = [publishedEntity(CURATED, 'A curated claim from elsewhere')];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByText('A curated claim from elsewhere')).toBeInTheDocument();
    // And it goes into the id lookup, so the session can report positions on it.
    expect(mocks.rematchClaimIds.flat()).toContain(CURATED);
  });

  // The browsed scan reads every Claim in the graph and is the slowest thing here. The curated tab
  // draws nothing from it, so waiting on it was pure delay.
  it('shows curated sections without waiting on the browsed claim scan', async () => {
    mocks.entityQueryLoading = true;
    // The browsed half of the session lookup is still in flight too — the curated half is not,
    // and only stays independent while the two are asked for separately.
    mocks.browsedLookupLoading = true;
    mocks.curatedIds = [CLAIM_SHARED];
    // Not among the session's saved claims, so the curated lookup is its only source of positions.
    mocks.savedClaims = [];
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_SHARED] }];
    mocks.recommendedEntities = [sharedEntity()];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('heading', { name: 'Geopolitics & chips' })).toBeInTheDocument();
    // Not just the card: its sides come from the graph, so nothing here waits on the browsed list.
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeInTheDocument();
  });

  // The session's own claims arrive in one round trip; they shouldn't sit behind the scan either.
  it('shows the opponent’s claims without waiting on the browsed claim scan', async () => {
    mocks.entityQueryLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
  });

  // GEO-2656. The badge counted a list that is empty until three dependent round trips land, so it
  // opened on `0` — which is not a placeholder but a claim, and a wrong one, on the one tab that is
  // about the opponent's positions.
  it('counts nothing until the opponent’s positions are actually known', async () => {
    // First load: in flight with nothing back yet. Both halves matter — the count is only unknown
    // while the query is running *and* has produced no rows.
    mocks.positions = [];
    mocks.positionsLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByLabelText('Counting positions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Salina’s positions/ })).not.toHaveTextContent('0');
  });

  // The count is derived from ids that come *from* positions, so while that query is in flight the
  // id list is empty and the two claim lookups are disabled rather than loading. Nothing downstream
  // reports as pending, which is why the badge has to consult the positions query itself.
  it('shows the count once it is known', async () => {
    mocks.positionsLoading = false;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByLabelText('Counting positions')).toBeNull();
    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toHaveTextContent('1');
  });

  // A new response from the opponent restarts the lookups while `useLastSettled` still holds a list
  // that is right for every claim already on it. Dropping back to a skeleton would flicker the badge
  // on precisely the event that should be invisible.
  it('keeps showing a known count while a refetch is in flight', async () => {
    const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toHaveTextContent('1');

    // Same instance, so `useLastSettled` is holding the list it already drew. A fresh render would
    // have no settled value to hold and would legitimately show the skeleton.
    mocks.entityHydrationLoading = true;
    rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByLabelText('Counting positions')).toBeNull();
    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toHaveTextContent('1');
  });

  // Until the curated lookup settles there is no telling "no curator page" from "not yet", and the
  // default source turns on exactly that. So the list waits rather than showing Featured and
  // swapping it for Recommended a moment later.
  it('waits on the curated lookup rather than defaulting to Featured and swapping', async () => {
    mocks.recommendedLoading = true;
    const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: 'Claims' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('No featured claims are available to debate yet.')).toBeNull();

    mocks.recommendedLoading = false;
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_MORE] }];
    mocks.recommendedEntities = [publishedEntity()];
    rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(await screen.findByRole('heading', { name: 'Geopolitics & chips' })).toBeInTheDocument();
  });

  // A viewer who has picked a source keeps it: the curated lookup settling afterwards is not a
  // reason to move the list under them.
  it('keeps the source the viewer picked when the curated lookup settles later', async () => {
    mocks.recommendedLoading = true;
    const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    await chooseSource('All claims');
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();

    mocks.recommendedLoading = false;
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [CLAIM_MORE] }];
    mocks.recommendedEntities = [publishedEntity()];
    rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('heading', { name: 'Geopolitics & chips' })).toBeNull();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  // A claim either side turned down recently still lists — with its request disabled and saying
  // why — whether the row came from geo-chat or from the hub's index, which knows nothing of it.
  it('keeps a recently rejected claim listed with its request disabled', async () => {
    mocks.claims = [];
    mocks.session = session({ recently_rejected_claim_ids: [CLAIM_SHARED] });
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.getByText('Recently rejected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request debate' })).toBeDisabled();
  });

  // The hub's query takes a space, so the space filter runs server-side on the All tab; topics are
  // knowledge-graph data geo-chat doesn't model, so that one stays a cut over the loaded rows.
  it('sends the selected space to the hub query', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    selectFilter('Any space', 'Crypto');
    await waitFor(() => expect(browsedClaimsQueryOptions()?.spaceId).toBe(SPACE_1));
  });

  // On a phone the three tabs are wider than the screen. They were laid out in a row that could
  // neither shrink them nor scroll, inside a layer that could scroll sideways — so a swipe at the
  // tabs panned the whole session instead of moving the tabs.
  describe('tab strip overflow', () => {
    /** The row holding the tab buttons. */
    function tabStrip() {
      const tab = screen.getByRole('button', { name: 'Claims' });
      const strip = tab.parentElement;
      expect(strip).not.toBeNull();
      return strip!;
    }

    it('scrolls the tabs on their own rather than the page', async () => {
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      expect(tabStrip().className).toContain('overflow-x-auto');
      // Without this the row is only as wide as its content allows, and there is nothing to scroll.
      expect(tabStrip().className).toContain('min-w-0');
    });

    // A swipe that reaches the end of the strip would otherwise chain outward, which on iOS is the
    // browser's back gesture — leaving the debate.
    it('keeps an overscrolling swipe inside the strip', async () => {
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      expect(tabStrip().className).toContain('overscroll-x-contain');
    });

    // The tabs have to keep their own width for the strip to have anything to scroll; squeezed
    // flex children just get narrower and stay on screen.
    it('lets each tab keep its natural width', async () => {
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      for (const name of ['Claims', /positions/]) {
        expect(screen.getByRole('button', { name }).className).toContain('shrink-0');
      }
    });

    // `overflow-y-auto` alone leaves the other axis computing to `auto`, which is what let the
    // whole fixed layer pan sideways.
    it('does not let the page itself scroll sideways', async () => {
      const { container } = render(<DebateRematchPageClient sessionId="rematch-1" />);

      const shell = container.querySelector('.fixed.inset-0');
      expect(shell).not.toBeNull();
      expect(shell!.className).toContain('overflow-x-hidden');
    });
  });

  it('shortens the opponent tab to their first name', async () => {
    const base = session();
    mocks.session = session({
      participants: [base.participants[0], { ...base.participants[1], display_name: 'Salina Okonkwo' }],
    });
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByRole('button', { name: /Salina’s positions/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Okonkwo/ })).toBeNull();
  });

  it('lists every eligible claim on the All tab', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
  });

  it('shows the opponent-specific empty state when no claim is debate-ready', async () => {
    mocks.claims = [];
    mocks.positions = [];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByText(/Salina hasn’t responded yet/)).toBeInTheDocument();
  });

  it('narrows the list to the selected topic', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    selectFilter('Any topic', 'Governance');

    // Only the Governance-tagged published claim survives; the untagged shared claim drops out.
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
  });

  it('matches the topic filter on any of a claim topics, not just the first', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    // The published claim is tagged Governance and Ethics; filtering on the second still matches.
    selectFilter('Any topic', 'Ethics');

    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  it('narrows the list to the selected space', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    // The shared claim sits in Crypto; the published one is in Governance space.
    selectFilter('Any space', 'Crypto');

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
  });

  // Featured spaces plus the ones the viewer belongs to. The picker browses the whole published
  // corpus, so without this it offers claims from spaces the viewer has nothing to do with.
  it('drops claims from spaces outside the viewer’s allowed set', async () => {
    mocks.spaceAllowlist = new Set([SPACE_1.replace(/-/g, '')]);
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    // The shared claim sits in Crypto (allowed); the published one is in Governance space.
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
  });

  // Applied to the All tab alone. The opponent's tab is bounded by one person's own responses, and
  // a debater's claims live in their personal space, which nobody else is a member of — narrowing
  // it by the viewer's own memberships emptied the tab, and zeroed its count, for everyone but the
  // debater who published the claims.
  it('keeps the opponent’s claims from spaces outside the viewer’s allowed set', async () => {
    mocks.claims = [sharedClaim()];
    mocks.spaceAllowlist = new Set([SPACE_2.replace(/-/g, '')]);
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    const tab = screen.getByRole('button', { name: /Salina’s positions/ });
    expect(within(tab).getByText('1')).toBeInTheDocument();
  });

  // Same reasoning, and the case that made it visible: a curator's page is trusted by the space it
  // was published in, so the claims on it are vouched for wherever they live. The other debater
  // saw the tab with nothing under it.
  it('keeps curated claims from spaces outside the viewer’s allowed set', async () => {
    mocks.recommendedSections = [{ id: 'block-1', name: 'Politics', claimIds: [CLAIM_MORE] }];
    mocks.recommendedEntities = [publishedEntity()];
    mocks.curatedIds = [CLAIM_MORE];
    mocks.spaceAllowlist = new Set([SPACE_1.replace(/-/g, '')]);
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    // The published claim sits in Governance space, which the allowlist leaves out.
    expect(await screen.findByText('A newly published claim')).toBeInTheDocument();
    expect(screen.getByText('Politics')).toBeInTheDocument();
  });

  // A debate is published into the claim's home space by the acceptor, and editor rights on a
  // personal space belong to its owner alone — so a claim living in one can never carry a published
  // debate. Offering it spends a debate on a result that evaporates, which is worse than leaving it
  // out. Unlike the allowlist this is a property of the claim, so both debaters see the same answer.
  describe('when a claim’s home space could never receive the published debate', () => {
    it('leaves it out of the opponent’s tab, and out of the count', async () => {
      mocks.claims = [sharedClaim()];
      mocks.spaceTypes = { [SPACE_1]: 'PERSONAL' };
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
      const tab = screen.getByRole('button', { name: /Salina’s positions/ });
      expect(within(tab).getByText('0')).toBeInTheDocument();
    });

    it('leaves it out of the curated tab', async () => {
      mocks.recommendedSections = [{ id: 'block-1', name: 'Politics', claimIds: [CLAIM_MORE] }];
      mocks.recommendedEntities = [publishedEntity()];
      mocks.curatedIds = [CLAIM_MORE];
      mocks.spaceTypes = { [SPACE_2]: 'PERSONAL' };
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      // The section would have been the only one, so the tab has nothing left to head.
      await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
      expect(screen.queryByText('Politics')).toBeNull();
    });

    it('leaves it out of the All tab', async () => {
      mocks.spaceTypes = { [SPACE_2]: 'PERSONAL' };
      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showAllClaims();

      await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
    });

    // A curated page holding some claims in a personal space and some in a public one keeps the
    // public ones. The filter is per claim, on that claim's own home space — a section drops out
    // only when every claim in it was unpublishable.
    it('keeps the publishable claims in a mixed section and drops only the rest', async () => {
      const PERSONAL_CLAIM = '019fedb8-6ca7-7f94-a077-8cd3be5a0a64';
      mocks.recommendedSections = [{ id: 'block-1', name: 'Politics', claimIds: [PERSONAL_CLAIM, CLAIM_MORE] }];
      mocks.recommendedEntities = [
        { ...publishedEntity(PERSONAL_CLAIM, 'A claim in someone’s own space'), spaces: [SPACE_1] },
        publishedEntity(),
      ];
      mocks.curatedIds = [PERSONAL_CLAIM, CLAIM_MORE];
      mocks.spaceTypes = { [SPACE_1]: 'PERSONAL' };
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      expect(await screen.findByText('A newly published claim')).toBeInTheDocument();
      expect(screen.getByText('Politics')).toBeInTheDocument();
      expect(screen.queryByText('A claim in someone’s own space')).toBeNull();
    });

    // A debater publishes a claim into their own space; a curator later adds it to a shared one, so
    // it is named in both. The space ranking has no opinion between them — neither is in its table,
    // so the tie falls to array order — and picking the personal one would lose a claim that is
    // perfectly debatable in the public space, since the home space is what decides where the
    // debate is published.
    it('resolves a claim named in both a personal and a public space to the public one', async () => {
      const BOTH = '019fedb9-7db8-70a5-b188-9de4cf6b1b75';
      mocks.recommendedSections = [{ id: 'block-1', name: 'Politics', claimIds: [BOTH] }];
      mocks.recommendedEntities = [
        {
          ...publishedEntity(BOTH, 'A claim in two spaces'),
          // Personal space first, so array order alone would have picked it: neither id is in the
          // ranking table, so the tie falls through to order.
          spaces: [SPACE_1, SPACE_2],
          values: [
            { property: { id: NAME_PROPERTY }, spaceId: SPACE_1, value: 'A claim in two spaces' },
            { property: { id: NAME_PROPERTY }, spaceId: SPACE_2, value: 'A claim in two spaces' },
          ],
        },
      ];
      mocks.curatedIds = [BOTH];
      mocks.spaceTypes = { [SPACE_1]: 'PERSONAL' };
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      // Resolving to the personal space would have filtered it out entirely.
      expect(await screen.findByText('A claim in two spaces')).toBeInTheDocument();
    });

    // Preston's refinement, on top of the space-type test: the authoritative constraint is the
    // set of spaces the acceptor is an *editor* of, which is the same set the publish sweep works
    // from. This catches an ordinary public space the acceptor simply does not edit — invisible to
    // the type test, and a debate there fails on-chain exactly as a personal space does.
    it('drops a claim from a public space the acceptor does not edit', async () => {
      mocks.claims = [sharedClaim()];
      mocks.spaceTypes = { [SPACE_1]: 'DAO' };
      mocks.publishableSpaceIds = new Set([SPACE_2.replace(/-/g, '')]);
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
    });

    it('keeps a claim from a space the acceptor does edit', async () => {
      mocks.claims = [sharedClaim()];
      mocks.spaceTypes = { [SPACE_1]: 'DAO' };
      mocks.publishableSpaceIds = new Set([SPACE_1.replace(/-/g, '')]);
      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();

      expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    });

    // The two gates fail differently, which is why both are kept. With the editor list unknown,
    // the type test still rules out the case that actually caused the incident.
    it('still drops a personal-space claim when the editor list is unknown', async () => {
      mocks.claims = [sharedClaim()];
      mocks.spaceTypes = { [SPACE_1]: 'PERSONAL' };
      mocks.publishableSpaceIds = null;
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
    });

    it('keeps a claim in a DAO space, which the acceptor can publish into', async () => {
      mocks.claims = [sharedClaim()];
      mocks.spaceTypes = { [SPACE_1]: 'DAO' };
      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();

      expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    });

    // Same convention as the allowlist: filtering on a half-resolved lookup would list the claim
    // and then pull it back out from under the viewer.
    it('keeps a claim whose space type has not resolved yet', async () => {
      mocks.claims = [sharedClaim()];
      mocks.spaceTypes = {};
      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();

      expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    });
  });

  // Listing a pool and trimming it once the allowlist lands means claims appear and then vanish
  // under the viewer. The All tab, which the allowlist narrows, waits for it. The other two don't
  // narrow on it any more, so they have nothing to wait for — and the opponent's list arriving in
  // one round trip is the whole point of not holding it behind a lookup it doesn't use.
  it('holds the browsed list, but not the opponent’s, while the allowlist is still resolving', async () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /Salina’s positions/ })).getByText('1')).toBeInTheDocument();

    await showAllClaims();
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
  });

  // A new response from the opponent adds an id to the list, and the lookups keyed on that list
  // start over. Dropping the tab to nothing — and its count to zero — while they catch up read as
  // the opponent's positions vanishing every time they took another one.
  it('keeps the opponent’s list and count up while a new response is being looked up', async () => {
    const FRESH = '019fedb7-5b96-7e83-9f66-7bc2ad4f9953';
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();

    // The graph reports another side; the id-keyed lookups are back in flight.
    mocks.positions = [...mocks.positions, position('profile-remote', FRESH, SPACE_1, true)];
    mocks.browsedLookupLoading = true;
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
    const tab = screen.getByRole('button', { name: /Salina’s positions/ });
    expect(within(tab).getByText('1')).toBeInTheDocument();

    // They land, and the new claim joins the list.
    mocks.browsedLookupLoading = false;
    mocks.entities = [...mocks.entities, { ...sharedEntity(), id: FRESH, name: 'A claim Salina just answered' }];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.getByText('A claim Salina just answered')).toBeInTheDocument();
    expect(within(tab).getByText('2')).toBeInTheDocument();
  });

  // Same for the session's exclusions: the source debate's claim and a recently rejected one are
  // known only once geo-chat answers for the opponent's ids, and listing them first would flash.
  it('holds the opponent’s list until the session’s exclusions are known', async () => {
    mocks.browsedLookupLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByText('A claim both participants chose')).toBeNull();
  });

  // A lookup that settles without an answer must not leave the picker permanently empty.
  it('falls through to the unfiltered list when the allowlist lookup comes back empty', async () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = false;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(await screen.findByText('A newly published claim')).toBeInTheDocument();
  });

  it('searches claim text, and keeps searching across a tab switch', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claims' }), {
      target: { value: 'newly published' },
    });

    // The All tab searches server-side, through the hub's query — debounced.
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
    await waitFor(() => expect(browsedClaimsQueryOptions()?.search).toBe('newly published'));

    // The opponent's tab is the graph's list, so the term is applied here — where it leaves nothing.
    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());
    expect(screen.getByText('No claims match these filters.')).toBeInTheDocument();
  });

  // Following a link to the entity page would navigate out of the app shell and abandon the live
  // session, so the claim opens beside the picker instead.
  it('opens a claim in the side panel rather than navigating to it', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const claim = screen.getByText('A claim both participants chose');
    expect(claim.closest('a')).toBeNull();

    fireEvent.click(claim);

    expect(mocks.openSidePanel).toHaveBeenCalledWith(CLAIM_SHARED, SPACE_1, false);
  });

  // A switch drawn from a guess is worse than one that waits: reading an unresolved lookup as
  // "not ready" would report the opposite of the truth on a claim the viewer is standing ready on.
  it('leaves the Debate toggle out until readiness is known', async () => {
    mocks.claimReadinessLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('switch', { name: 'Ready to debate this claim' })).toBeNull();
  });

  it('leaves it out when the readiness lookup failed', async () => {
    mocks.claimReadinessError = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('switch', { name: 'Ready to debate this claim' })).toBeNull();
  });

  // A settled lookup with no row for the claim genuinely means not ready, so the switch belongs.
  it('shows the toggle off once a settled lookup reports nothing for the claim', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).not.toBeChecked();
  });

  // geo-chat now carries readiness on the rematch claims themselves — the rows the picker already
  // asked for. The per-space lookup used to cost one request per space on screen; when the rematch
  // response has the answer, that fan-out must not run at all.
  describe('when the rematch response carries readiness', () => {
    it('draws the toggle from it and skips the per-space lookup', async () => {
      mocks.claims = [{ ...sharedClaim(), viewer_debate_ready: true, readiness_disabled_reason: null }];
      // Left empty on purpose: if the card read this the switch would be off.
      mocks.claimReadiness = [];

      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();

      expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeChecked();
      expect(mocks.perSpaceReadinessGroups.every(groups => groups.length === 0)).toBe(true);
    });

    // The per-space lookup used to be what retained the gateway's space scopes, and
    // `debate.claims_changed` is delivered per space: skip the lookup without keeping the scopes
    // and the opponent's responses only ever show up after a reconnect.
    //
    // Every list's spaces, not the visible tab's — keyed on the tab, switching tabs dropped the
    // scopes the other lists depend on — plus both participants' personal spaces, which is where a
    // debater's own claims live and the only way to hear about their *first* position: the tab is
    // empty then, so there is no claim to derive a scope from.
    it('holds a gateway scope on every list’s spaces and both debaters’ own', async () => {
      mocks.claims = [{ ...sharedClaim(), viewer_debate_ready: true, readiness_disabled_reason: null }];
      mocks.claimReadiness = [];

      render(<DebateRematchPageClient sessionId="rematch-1" />);
      const scoped = () => mocks.gatewaySpaceScopes.filter(scope => scope.enabled).at(-1)?.spaceIds;
      expect(scoped()).toEqual([SPACE_1, SPACE_2, 'profile-local', 'profile-remote']);

      await showAllClaims();
      expect(scoped()).toEqual([SPACE_1, SPACE_2, 'profile-local', 'profile-remote']);
    });

    it('shows the toggle off for a claim it reports as not ready', async () => {
      mocks.claims = [{ ...sharedClaim(), viewer_debate_ready: false, readiness_disabled_reason: null }];
      mocks.claimReadiness = [];

      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();

      expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).not.toBeChecked();
    });

    it('treats a claim the response omits as settled not-ready', async () => {
      // A published claim the graph knows about but geo-chat has no row for: it can hold no
      // readiness, so `false` is the truth and the switch belongs on screen, off. The saved claim
      // carries the field so the response counts as one that has readiness at all.
      mocks.claims = [{ ...sharedClaim(), viewer_debate_ready: true, readiness_disabled_reason: null }];
      mocks.claimReadiness = [];

      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showAllClaims();

      const switches = screen.getAllByRole('switch', { name: 'Ready to debate this claim' });
      expect(switches).toHaveLength(2);
      // The saved claim's switch reads its own field; the graph-only claim's is settled off.
      expect(switches.filter(element => element.getAttribute('aria-checked') === 'true')).toHaveLength(1);
      expect(switches.filter(element => element.getAttribute('aria-checked') === 'false')).toHaveLength(1);
    });
  });

  // geo-chat answers the browsed lookup in id-sorted batches, so a list laid out in response order
  // would reshuffle every time a new page's ids landed in the middle of the sorted range.
  it('keeps the All tab in the order the page returned the claims', async () => {
    const FIRST = '019fedb4-3f74-7c61-8d44-5fa08b1e7a01';
    const SECOND = '019fedb4-3f74-7c61-8d44-5fa08b1e7a02';
    const THIRD = '019fedb4-3f74-7c61-8d44-5fa08b1e7a03';
    mocks.matchmakingClaims = [
      matchmakingClaim(FIRST, 'Ordered claim one'),
      matchmakingClaim(SECOND, 'Ordered claim two'),
      matchmakingClaim(THIRD, 'Ordered claim three'),
    ];
    mocks.savedClaims = [];
    mocks.claims = [
      { ...sharedClaim(), shared_preference: false, claim: claimSummary(THIRD, 'Ordered claim three') },
      { ...sharedClaim(), shared_preference: false, claim: claimSummary(FIRST, 'Ordered claim one') },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    const names = screen.getAllByText(/^Ordered claim/).map(element => element.textContent);
    expect(names).toEqual(['Ordered claim one', 'Ordered claim two', 'Ordered claim three']);
  });

  // GEO-2671. Rows the index hasn't paged to — a claim the opponent answered, a saved or curated
  // one — used to be appended after every paged row, so each new batch inserted rows above them
  // and slid them further down. A claim the viewer already held a position on was still sinking
  // after ten pages. Their slot is fixed after the first page now.
  it('holds a claim the pages have not reached in place when the next page lands', async () => {
    const PAGE_ONE = '019fedb4-3f74-7c61-8d44-5fa08b1e7b01';
    const PAGE_TWO = '019fedb4-3f74-7c61-8d44-5fa08b1e7b02';
    const ANSWERED = '019fedb7-5b96-7e83-9f66-7bc2ad4f9953';
    mocks.savedClaims = [];
    mocks.claims = [];
    mocks.entityQueryPages = [
      [matchmakingClaim(PAGE_ONE, 'Paged claim one')],
      [matchmakingClaim(PAGE_TWO, 'Paged claim two')],
    ];
    // Answered by the opponent, so it joins the All tab without the index having paged to it.
    mocks.entities = [{ ...sharedEntity(), id: ANSWERED, name: 'Claim the pages have not reached' }];
    mocks.positions = [position('profile-remote', ANSWERED, SPACE_1, true)];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    // Its slot is after the first page and before the second — not swept to the end behind
    // every row paging has since produced.
    expect(appearsBefore('Paged claim one', 'Claim the pages have not reached')).toBe(true);
    expect(appearsBefore('Claim the pages have not reached', 'Paged claim two')).toBe(true);
  });

  // Reaching the end of the list is what asks for the next page, so without this the sentinel
  // fires silently and the list sits there looking finished.
  it('shows a loading skeleton while the next page is on its way', async () => {
    mocks.entityQueryHasNextPage = true;
    mocks.entityQueryFetchingNextPage = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    // Not on the tabs that don't page — they load whole.
    expect(screen.queryByTestId('claims-next-page-skeleton')).toBeNull();
    await showAllClaims();
    expect(screen.getByTestId('claims-next-page-skeleton')).toBeInTheDocument();
  });

  it('shows no skeleton once the page has landed', async () => {
    mocks.entityQueryHasNextPage = true;
    mocks.entityQueryFetchingNextPage = false;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.getByTestId('claims-scroll-sentinel')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-next-page-skeleton')).toBeNull();
  });

  // GEO-2647. A shared preference used to be pinned to the top of the All tab, which put it ahead
  // of what the viewer had typed and pushed their search results down. Matched claims stay
  // legible without the pin — they are the ones offering "Request debate", and the Matches tab
  // lists them on their own.
  it('leaves a matched claim where the page returned it rather than pinning it first', async () => {
    const FIRST = '019fedb4-3f74-7c61-8d44-5fa08b1e7a01';
    const SECOND = '019fedb4-3f74-7c61-8d44-5fa08b1e7a02';
    const MATCHED = '019fedb4-3f74-7c61-8d44-5fa08b1e7a03';
    mocks.matchmakingClaims = [
      matchmakingClaim(FIRST, 'Ordered claim one'),
      matchmakingClaim(SECOND, 'Ordered claim two'),
      matchmakingClaim(MATCHED, 'Ordered claim three'),
    ];
    mocks.savedClaims = [];
    // The last of the three is the one both participants have answered.
    mocks.claims = [{ ...sharedClaim(), shared_preference: true, claim: claimSummary(MATCHED, 'Ordered claim three') }];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    const names = screen.getAllByText(/^Ordered claim/).map(element => element.textContent);
    expect(names).toEqual(['Ordered claim one', 'Ordered claim two', 'Ordered claim three']);
  });

  it('marks the requester as entering the debate before routing into the room', async () => {
    mocks.session = session({ status: 'converted', converted_debate_id: 'debate-9' });

    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.markEnteringDebate).toHaveBeenCalledWith('debate-9');
    expect(mocks.replace).toHaveBeenCalledWith(`/space/${SPACE_1}/debates/debate-9`);
    expect(mocks.markEnteringDebate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.replace.mock.invocationCallOrder[0]!
    );
  });

  // A backend that predates the fields answers `undefined`, and the picker must keep working
  // exactly as before against it.
  it('falls back to the per-space lookup when the rematch response has no readiness', async () => {
    mocks.claimReadiness = [
      { claim_entity_id: CLAIM_SHARED, viewer_debate_ready: true, readiness_disabled_reason: null },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeChecked();
    expect(mocks.perSpaceReadinessGroups.some(groups => groups.length > 0)).toBe(true);
  });

  // Taking a side here means you want to debate it, so readiness shouldn't be a second step.
  // A position can appear without anyone picking one — here because geo-chat's copy of a claim the
  // viewer had already answered lands after the card is on screen. That looks identical to a fresh
  // pick, and standing them ready for it reverses a stand-down they made elsewhere.
  it('does not stand the viewer ready when geo-chat reports a position they already held', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);

    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).not.toHaveBeenCalled();
  });

  // Standing down elsewhere is deliberate; arriving here mustn't quietly reverse it.
  it('leaves readiness alone for positions already held on arrival', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).not.toHaveBeenCalled();
  });

  it('does not re-publish readiness that is already on', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.claimReadiness = [
      { claim_entity_id: CLAIM_SHARED, viewer_debate_ready: true, readiness_disabled_reason: null },
    ];
    const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);

    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.setReadiness).not.toHaveBeenCalled();
  });

  // The All tab browses every published claim a page at a time, so filtering the loaded pages
  // only ever searched what had been paged in. The hub's Claims tab searches server-side.
  it('searches the whole claim corpus rather than the loaded pages', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search claims' }), { target: { value: 'Fast fashion' } });

    await waitFor(() => expect(browsedClaimsQueryOptions()?.search).toBe('Fast fashion'));
  });

  it('renders the card’s Debate toggle against real readiness', async () => {
    mocks.claimReadiness = [
      { claim_entity_id: CLAIM_SHARED, viewer_debate_ready: true, readiness_disabled_reason: null },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByRole('switch', { name: 'Ready to debate this claim' })).toBeChecked();
  });

  // Waiting for geo-chat to echo the response back would leave the side you just picked
  // unhighlighted and Request debate missing for seconds.
  it('reflects a just-picked side and offers the debate straight away', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const card = screen.getByText('A claim both participants chose').closest('article');
    expect(within(card!).getByRole('button', { name: /^Agree/ })).toHaveAttribute('aria-pressed', 'true');
  });

  // geo-chat rejects a request for a claim it has no position for — "respond to this claim before
  // requesting a rematch" — so the button waits for geo-chat's copy, not the optimistic one. It
  // stays hidden rather than disabled: an unpressable button reads as broken.
  it('withholds the request until the graph has the position it will be validated against', async () => {
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
  });

  // GEO-2652. The wait above is real — a publish, an index and a notification — and rendering
  // nothing while it runs is what Preston reported: no idea what he was waiting on. The button still
  // waits, because geo-chat would reject an early request; what changes is that the wait is named.
  it('says what it is waiting for while the position is being confirmed', async () => {
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByRole('status')).toHaveTextContent('Confirming your position…');
    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
  });

  // And nothing is said before the viewer has taken a side — there is nothing being confirmed, so a
  // spinner would be claiming work that is not happening.
  it('says nothing while the viewer has taken no side', async () => {
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByText('Confirming your position…')).not.toBeInTheDocument();
  });

  it('sends the request once geo-chat agrees with the side on screen', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const request = screen.getByRole('button', { name: 'Request debate' });
    expect(request).toBeEnabled();
    fireEvent.click(request);
    expect(mocks.mutate).toHaveBeenCalled();
  });

  // Switching sides leaves geo-chat holding the side you just moved off, which is no more valid to
  // request against than holding none.
  it('withholds the request while a side switch is still publishing', async () => {
    mocks.positions = [
      position('profile-local', CLAIM_SHARED, SPACE_1, false),
      position('profile-remote', CLAIM_SHARED, SPACE_1, false),
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
  });

  // Readiness is rejected for a claim geo-chat has no response for, and `useClaimReadiness` rolls
  // the switch back when that happens — so opting in off the optimistic position made the toggle
  // visibly flip on and straight back off.
  it('waits for the response to settle before standing the viewer ready', async () => {
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();
    expect(mocks.joinQueue).not.toHaveBeenCalled();

    // The side is picked: optimistic only, the graph still has nothing.
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);
    expect(mocks.joinQueue).not.toHaveBeenCalled();

    // The graph indexes it, and only now is readiness sent.
    mocks.positions = [
      position('profile-local', CLAIM_SHARED, SPACE_1, true),
      position('profile-remote', CLAIM_SHARED, SPACE_1, false),
    ];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    await waitFor(() => expect(mocks.joinQueue).toHaveBeenCalledWith({ spaceId: SPACE_1, claimId: CLAIM_SHARED }));
  });

  // `entity.spaces` is rank-ordered and counts any space that merely references the claim, so
  // `spaces[0]` is a citing space whenever it outranks the claim's own. Responding in one space and
  // asking to debate in another is what the server answers with "respond to this claim in this
  // space before enabling debate readiness".
  it('scopes a claim to the space it is named in, not the highest-ranked one citing it', async () => {
    mocks.entities = [
      {
        ...publishedEntity(CLAIM_MORE, 'A claim that lives in Podcasts'),
        // Crypto (rank 2) outranks Podcasts (rank 8), but only Podcasts names the claim.
        spaces: [CRYPTO_SPACE, PODCASTS_SPACE],
        values: [
          {
            isDeleted: false,
            property: { id: NAME_PROPERTY },
            spaceId: PODCASTS_SPACE,
            value: 'A claim that lives in Podcasts',
          },
        ],
      },
    ];
    // The opponent answered it in Podcasts, which is where the graph has the claim.
    mocks.positions = [position('profile-remote', CLAIM_MORE, PODCASTS_SPACE, false)];
    // The toggle only offers itself once the viewer holds a position.
    mocks.optimisticResponses.set(CLAIM_MORE, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    // The space is fixed when the card wires its readiness machine, not when the request goes out —
    // the viewer has no indexed response yet, so the machine holds the request until geo-chat has
    // one. What matters here is which space it is bound to.
    expect(screen.getByText('A claim that lives in Podcasts')).toBeInTheDocument();
    expect(mocks.joinQueueSpaceIds).toContain(PODCASTS_SPACE);
    expect(mocks.joinQueueSpaceIds).not.toContain(CRYPTO_SPACE);
  });

  it('stands the viewer ready only once, even as the claim keeps refetching', async () => {
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    mocks.positions = [
      position('profile-local', CLAIM_SHARED, SPACE_1, true),
      position('profile-remote', CLAIM_SHARED, SPACE_1, false),
    ];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    await waitFor(() => expect(mocks.joinQueue).toHaveBeenCalledOnce());
  });
});

/** The latest arguments the picker handed its browsed-claims page query. */
function browsedClaimsQueryOptions() {
  return mocks.entityQueries.at(-1);
}

/**
 * The tab region cross-fades with `mode="wait"`, so the incoming list is not in the DOM until the
 * outgoing one has finished leaving. Comfortably longer than the 100ms swap.
 */
async function settleTabSwap() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
  });
}

/** Opens the source menu on whichever option it is currently showing. */
function openSourceMenu() {
  const label = (['Recommended', 'Featured', 'All claims'] as const).find(
    name => screen.queryAllByRole('button', { name }).length > 0
  );
  fireEvent.click(screen.getAllByRole('button', { name: label! })[0]!);
}

/** The picker opens on Claims, sourced from Recommended or Featured; most assertions want the index. */
async function showAllClaims() {
  fireEvent.click(screen.getByRole('button', { name: 'Claims' }));
  openSourceMenu();
  fireEvent.click(screen.getByRole('button', { name: 'All claims' }));
  await settleTabSwap();
}

/** The opponent's own responses, which are a tab of their own rather than a source of Claims. */
async function showOpponentClaims() {
  fireEvent.click(screen.getByRole('button', { name: /positions/ }));
  await settleTabSwap();
}

/** Picks a source out of the Claims menu. */
async function chooseSource(next: string) {
  openSourceMenu();
  fireEvent.click(screen.getByRole('button', { name: next }));
  await settleTabSwap();
}

/** Whether `first` is rendered ahead of `second` in the document. */
function appearsBefore(first: string, second: string) {
  const a = screen.getByText(first);
  const b = screen.getByText(second);
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * Opens one of the hub filter menus and picks an option. Names are matched loosely: a space
 * option's accessible name picks up its avatar initial ("CCrypto").
 */
function selectFilter(trigger: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(trigger) }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(option) }));
}

function session(overrides: Partial<DebateRematchSession> = {}): DebateRematchSession {
  return {
    id: 'rematch-1',
    source_debate_id: 'debate-1',
    source_space_id: SPACE_1,
    status: 'browsing',
    participants: [
      {
        user_id: 'user-local',
        profile_space_id: 'profile-local',
        display_name: 'You',
        avatar_cid: null,
        participant_slot: 1,
        consented_at: '2026-07-10T10:00:00.000Z',
      },
      {
        user_id: 'user-remote',
        profile_space_id: 'profile-remote',
        display_name: 'Salina',
        avatar_cid: null,
        participant_slot: 2,
        consented_at: '2026-07-10T10:00:01.000Z',
      },
    ],
    decision_expires_at: '2026-07-10T10:00:20.000Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-07-10T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:01.000Z',
    ...overrides,
  };
}

function sharedClaim(): DebateRematchClaim {
  return {
    claim: claimSummary(CLAIM_SHARED, 'A claim both participants chose'),
    response_kind: 'stance',
    participants: [
      { user_id: 'user-local', position: true, position_label: 'Agree' },
      { user_id: 'user-remote', position: false, position_label: 'Disagree' },
    ],
    shared_preference: true,
    recently_rejected: false,
    previously_debated: false,
  };
}

/** The shared claim as the graph holds it: named in Crypto, where both sides responded. */
function sharedEntity() {
  return {
    id: CLAIM_SHARED,
    name: 'A claim both participants chose',
    description: null,
    spaces: [SPACE_1],
    values: [{ property: { id: NAME_PROPERTY }, spaceId: SPACE_1, value: 'A claim both participants chose' }],
    relations: [],
  };
}

function position(profileSpaceId: string, claimId: string, spaceId: string, side: boolean): ParticipantPosition {
  return { profileSpaceId, claimId, spaceId, responseKind: 'stance', position: side };
}

/** The published claim as the hub's claims query lists it: in Governance space, tagged twice. */
function matchmakingClaim(id = CLAIM_MORE, claim = 'A newly published claim'): MatchmakingClaim {
  return {
    claim: { id, space_id: SPACE_2, claim_entity_id: id, claim, description: null },
    response_kind: 'stance',
    viewer_response: null,
    viewer_debate_ready: false,
    readiness_disabled_reason: null,
    viewer_position: null,
    topics: [
      { id: 'topic-gov', name: 'Governance' },
      { id: 'topic-eth', name: 'Ethics' },
    ],
    positions: [],
    score: 0,
    active_debate: false,
  };
}

function publishedEntity(id = CLAIM_MORE, name = 'A newly published claim') {
  return {
    id,
    name,
    description: null,
    spaces: [SPACE_2],
    relations: [
      { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-gov', name: 'Governance' }, isDeleted: false },
      { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-eth', name: 'Ethics' }, isDeleted: false },
    ],
  };
}

function claimSummary(id: string, claim: string) {
  return { id, space_id: SPACE_1, claim_entity_id: id, claim, description: null };
}
