import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';

import { type ReactElement, StrictMode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import type { DebateRematchClaim, DebateRematchSession, MatchmakingClaim } from '~/core/debates/api';
import { clearDebateReturnDestination, rememberDebateReturnDestination } from '~/core/debates/debate-return-navigation';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import type { ParticipantPosition } from '~/core/debates/participant-positions';

import { DebateRematchPageClient, RELATED_CLAIMS_LIMIT } from './rematch-page-client';

const {
  SPACE_1,
  SPACE_2,
  CLAIM_SHARED,
  CLAIM_MORE,
  CLAIM_SOURCE,
  CLAIM_FRESH,
  CRYPTO_SPACE,
  PODCASTS_SPACE,
  NAME_PROPERTY,
} = vi.hoisted(() => ({
  SPACE_1: '019fedae-72b6-7ab2-927a-df044d57c566',
  SPACE_2: '019fedae-72b6-7ab2-927a-df044d57c567',
  // Real ids from the hard-coded ranking table, so the ordering under test is the real one.
  CRYPTO_SPACE: 'c9f267dcb0d270718c2a3c45a64afd32',
  PODCASTS_SPACE: 'b5a31f8182b042437ede0f84ee02f104',
  NAME_PROPERTY: 'a126ca530c8e48d5b88882c734c38935',
  CLAIM_SHARED: '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419',
  CLAIM_MORE: '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520',
  CLAIM_SOURCE: '019fedb3-2e63-7b50-9c33-4e9f7a0d6621',
  // A claim the opponent answers mid-session. Not CLAIM_SOURCE: that is the session's own
  // claim, which the picker excludes.
  CLAIM_FRESH: '019fedb4-3f74-7c61-8d44-5fa08b1e7722',
}));

/** What the source trigger announces while the default is still being decided. */
const SOURCE_PENDING = 'Choosing which claims to show';

/** Ids are compared canonically here for the same reason the app does: two spellings, one id. */
function sameSpelling(left: string, right: string) {
  return left.replace(/-/g, '').toLowerCase() === right.replace(/-/g, '').toLowerCase();
}

const mocks = vi.hoisted(() => ({
  session: null as DebateRematchSession | null,
  /** The session lookup itself is in flight — everything below it is keyed on what it returns. */
  sessionLoading: false,
  claims: [] as DebateRematchClaim[],
  replace: vi.fn(),
  back: vi.fn(),
  mutate: vi.fn(),
  leaveMutate: vi.fn(),
  acceptMutate: vi.fn(),
  rejectMutate: vi.fn(),
  /** The last rematch request error and its variables. */
  requestError: null as Error | null,
  requestVariables: undefined as { claim_id: string } | undefined,
  submitResponse: vi.fn(),
  optimisticResponses: new Map<string, 'positive' | 'negative' | null>(),
  /** Overrides the snapshot status, so the window where it is `indexed` is reachable. */
  responseIndexingStatus: null as 'reconciling' | 'delayed' | 'indexed' | null,
  /** Drives the indexing machine's own "taking longer than it should" signal. */
  responseIndexingDelayed: false,
  setReadiness: vi.fn(),
  joinQueue: vi.fn((_variables: { spaceId: string; claimId: string }) => Promise.resolve({ claim: null, match: null })),
  /** Which space each card wired its readiness machine to, in mount order. */
  joinQueueSpaceIds: [] as string[],
  leaveQueue: vi.fn((_variables: { spaceId: string; claimId: string }) =>
    Promise.resolve({ claim: null, match: null })
  ),
  openSidePanel: vi.fn(),
  /** Every query the All tab handed the hub's claims lookup, in render order. */
  entityQueries: [] as Array<{ search: string | null; spaceIds?: string[] | null; topicIds?: string[] | null }>,
  /** Every id list the opponent's claims were hydrated with, in render order. */
  entityIdLookups: [] as string[][],
  /** The Debate tag's catalog, which is the All tab's corpus. */
  debateTagClaims: [] as Array<{
    claimEntityId: string;
    spaceId: string;
    name: string;
    description: string | null;
    rankingScore: number | null;
  }>,
  featuredClaims: [] as Array<{
    claimEntityId: string;
    spaceId: string;
    name: string;
    description: string | null;
    rankingScore: number | null;
  }>,
  featuredCatalogLoading: false,
  featuredCatalogError: null as Error | null,
  // Independent of the catalog on purpose: the facet is its own query, and the whole hazard is the
  // catalog answering first. A mock that derives one from the other cannot reach it.
  topicFacetSettled: true,
  // Topics the server aggregate knows about from claims on pages this list has not loaded. The
  // facet counts the whole tag while the page is one page of it (GEO-2798), so without a knob for
  // this the mock could only ever offer topics already on screen — and a menu wrongly derived from
  // the loaded rows would look correct.
  facetOnlyTopics: [] as Array<{ id: string; name: string; count: number }>,
  /** Fails the entity lookup whose id list contains this claim, leaving the others answering. */
  entityHydrationErrorFor: null as string | null,
  /** The session's saved-claims request — the parent of the saved rows, their ids and the exclusions. */
  savedClaimsLoading: false,
  savedClaimsError: null as Error | null,
  featuredEnabledWith: [] as boolean[],
  /** Which tag each render asked the graph for, in order. */
  taggedClaimsAskedFor: [] as string[],
  /** What each render asked the server to narrow by. */
  taggedFiltersAskedFor: [] as any[],
  taggedHasNextPage: false,
  fetchNextTaggedPage: vi.fn(),
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
  // What `keepPreviousData` would still be holding once the query goes disabled.
  lastEnabledData: undefined as { pages: unknown[] } | undefined,
  spacesHeldOver: false,
  scopeHeldOver: false,
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
  observerTriggers: [] as (() => void)[],
  /** Scrolls everything observed into view — the sentinel among it. */
  scrollSentinelIntoView: () => mocks.observerTriggers.forEach(fire => fire()),
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
  /**
   * GEO-2758. The debate this session came out of, which is what makes Related claims available at
   * all. `null` is the profile-challenge case: no source debate, so no claim to be related to.
   */
  sourceDebate: null as { claim: { claim_entity_id: string; space_id: string } } | null,
  sourceDebateLoading: false,
  /** Graph claims sharing a topic with the source claim -- what the Related source lists. */
  relatedEntities: [] as Array<Record<string, unknown>>,
  relatedEntitiesLoading: false,
  /**
   * The remote discovery failed. `useQueryEntities` still answers from the local store in that
   * case, so rows and an error arrive together — which is the state that decides whether a failed
   * lookup falls back to Featured or takes over the picker.
   */
  relatedEntitiesError: null as Error | null,
  /** Claim ids geo-chat says this session has ruled out, in geo-chat's own spelling. */
  rematchExcludedIds: [] as string[],
  /** Every `where` the related-claims query was built with, in render order. */
  relatedWheres: [] as unknown[],
  /** Every `first` it asked for, in render order. */
  relatedFirsts: [] as Array<number | undefined>,
  /** Whether each call deferred to the fetch rather than answering from the local store. */
  relatedDefers: [] as Array<boolean | undefined>,
  /** Whether each call asked to warm the next cursor page. */
  relatedPrefetches: [] as Array<boolean | undefined>,
  /** Every `{ id, spaceId }` the single-entity hydration was asked for, in render order. */
  entityHydrations: [] as Array<{ id: string; spaceId?: string }>,
  /**
   * Fails the by-id claim lookup, but only for the batch containing this id. Scoped rather than
   * global because the source claim and the neighbours go through the same hook: failing both
   * would trip the discovery guard, and the fallback would happen for the wrong reason.
   */
  /** As {@link entityHydrationErrorFor}, for a batch still in flight rather than failed. */
  entityLookupLoadingId: null as string | null,
}));

// `pending-personal-space` reads localStorage at module scope (`atomWithStorage` with
// `getOnInit`), and the storage jsdom hands back here has no `getItem`. The throw happens while
// the module graph is still being built, so it takes this whole file down at collection — every
// test in it, on master and in CI alike. Reached through the claim card.
vi.mock('~/core/state/pending-personal-space', () => ({
  PENDING_PERSONAL_SPACE_PREFIX: 'pending:',
  pendingPersonalSpaceAtom: { toString: () => 'pendingPersonalSpaceAtom' },
  pendingPersonalSpaceId: (topicId: string) => `pending:${topicId}`,
  isPendingPersonalSpaceId: (spaceId: string | null | undefined) =>
    typeof spaceId === 'string' && spaceId.startsWith('pending:'),
  usePendingPersonalSpace: () => ({ isPending: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, back: mocks.back }),
}));

// The voice channel has its own colocated suite (rematch-voice.test.tsx); rendering it here would
// drag the LiveKit stack into every page test.
vi.mock('./rematch-voice', () => ({
  RematchVoicePill: () => null,
}));

vi.mock('~/core/debates/api', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/debates/api')>();
  return {
    ...actual,
    getCurrentGeoChatUserId: () => mocks.currentUserId,
    resolveCurrentGeoChatUserId: () => Promise.resolve(mocks.currentUserId),
  };
});

// The card reports its own responses, which reaches the personal-space lookup and through it
// Wagmi. This suite is about the picker's claim list and its request flow.
vi.mock('~/core/claims/browse/claim-response-summary', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/claims/browse/claim-response-summary')>()),
  useClaimResponseSummary: () => ({
    positive: 0,
    negative: 0,
    total: 0,
    percent: null,
    meetsFloor: false,
    isControversial: false,
    isLoading: false,
    isViewerResponseLoading: false,
    hasCounts: true,
    viewerDirection: null,
    viewerSpaceId: null,
  }),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateRematch: () => ({ data: mocks.session, isLoading: mocks.sessionLoading, error: null }),
  // Read by the match lookup above; the picker never shows an offer, so this only answers "no".
  useDebateActivity: () => ({ data: null, isLoading: false, error: null }),
  // The session's own saved claims. `savedClaims` lets a test empty this so a claim can only
  // arrive through the id lookup.
  useDebateRematchClaims: () => ({
    // Answerless while loading or failed, as react-query is — the id list below is built from this,
    // and handing back rows in either state hides the window this parent's absence opens.
    data:
      mocks.savedClaimsLoading || mocks.savedClaimsError
        ? undefined
        : { claims: mocks.savedClaims ?? mocks.claims, excluded_claim_ids: [CLAIM_SOURCE] },
    isLoading: mocks.savedClaimsLoading,
    error: mocks.savedClaimsError,
  }),
  // Two lookups run: one for the curated ids, one for the browsed ones. `curatedIds` lets a test
  // stall the browsed lookup on its own, which is the whole point of their being separate.
  useDebateRematchClaimsForIds: (_sessionId: string, claimIds: string[]) => rematchClaimsLookup(claimIds),
  useDebate: (debateId: string, enabled: boolean) => ({
    data: enabled && debateId ? mocks.sourceDebate : undefined,
    isLoading: enabled && debateId ? mocks.sourceDebateLoading : false,
  }),
  useDebateClaimsBySpaces: (groups: Array<{ spaceId: string; claimIds: string[] }>) => {
    mocks.perSpaceReadinessGroups.push(groups);
    return {
      claims: mocks.claimReadiness,
      isLoading: mocks.claimReadinessLoading,
      isError: mocks.claimReadinessError,
    };
  },
  useCreateDebateRematchRequest: () => ({
    ...mutation(),
    error: mocks.requestError,
    variables: mocks.requestVariables,
  }),
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
    data: { claims: mocks.claims, excluded_claim_ids: [CLAIM_SOURCE, ...mocks.rematchExcludedIds] },
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
/**
 * The tag query, which pages and filters on the server now (GEO-2798).
 *
 * The mock does the join the server does: the catalog fixtures say which claims carry the tag and
 * in which space, `mocks.entities` says what each one contains, and this puts them together into
 * the row shape the picker reads. The filters are applied here too, because a mock that ignored
 * them would let the page claim to filter while doing nothing.
 */
function taggedRowsFor(tagId: string) {
  const DEBATE = '55c95b2626f8482cb9739ea99dfde438';
  const catalog = tagId === DEBATE ? mocks.debateTagClaims : mocks.featuredClaims;

  const byClaim = new Map<string, { entity: any; tagSpaceIds: string[]; rankingScore: number | null }>();
  for (const entry of catalog) {
    const existing = byClaim.get(entry.claimEntityId);
    if (existing) {
      existing.tagSpaceIds.push(entry.spaceId);
      continue;
    }
    byClaim.set(entry.claimEntityId, {
      entity: mocks.entities.find(candidate => candidate.id === entry.claimEntityId) ?? {
        id: entry.claimEntityId,
        name: entry.name,
        description: entry.description,
        spaces: [entry.spaceId],
        values: [],
        relations: [],
      },
      tagSpaceIds: [entry.spaceId],
      rankingScore: entry.rankingScore,
    });
  }
  return [...byClaim.values()];
}

function applyServerFilters(rows: ReturnType<typeof taggedRowsFor>, filters: any, narrowBySpace = true) {
  const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
  const spaces: string[] | null =
    narrowBySpace && filters.spaceIds.length > 0 ? filters.spaceIds : filters.eligibleSpaceIds;
  const kept = rows.filter(row => {
    const name = (row.entity.name ?? '') as string;
    // Word at a time, ANDed, which is what the server does — a phrase match here would let a test
    // pass on a narrowing the real query never performs.
    const words = filters.search.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (!words.every((word: string) => name.toLowerCase().includes(word.toLowerCase()))) return false;
    if (
      !filters.topicIds.every((topicId: string) =>
        (row.entity.relations ?? []).some((relation: any) => relation.toEntity.id === topicId)
      )
    ) {
      return false;
    }
    if (spaces && !row.tagSpaceIds.some(spaceId => spaces.some(picked => norm(picked) === norm(spaceId)))) return false;
    return true;
  });
  return kept;
}

vi.mock('~/core/debates/tagged-claims', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/tagged-claims')>()),
  useTaggedClaims: (tagId: string, filters: any, enabled: boolean) => {
    mocks.featuredEnabledWith.push(enabled);
    mocks.taggedClaimsAskedFor.push(tagId);
    mocks.taggedFiltersAskedFor.push(filters);
    // Disabled means no answer, not the last one. react-query would hand back the warm cache the
    // hub left under this key — which is exactly why the hook masks it, so the mock masks it too.
    const claims = enabled && !mocks.featuredCatalogError ? applyServerFilters(taggedRowsFor(tagId), filters) : [];
    return {
      claims,
      isLoading: enabled && mocks.featuredCatalogLoading,
      error: enabled ? mocks.featuredCatalogError : null,
      hasNextPage: enabled && mocks.taggedHasNextPage,
      fetchNextPage: enabled ? mocks.fetchNextTaggedPage : async () => undefined,
      isFetchingNextPage: false,
      refetch: vi.fn(),
    };
  },
  useTaggedTopicFacet: (tagId: string, filters: any, enabled: boolean) => {
    // Co-occurrence: counted over the claims that already carry every picked topic.
    const rows = enabled ? applyServerFilters(taggedRowsFor(tagId), filters) : [];
    const counts = new Map<string, { id: string; name: string | null; count: number }>();
    for (const row of rows) {
      for (const relation of row.entity.relations ?? []) {
        const seen = counts.get(relation.toEntity.id);
        if (seen) seen.count += 1;
        else counts.set(relation.toEntity.id, { id: relation.toEntity.id, name: relation.toEntity.name, count: 1 });
      }
    }
    return {
      // An unsettled facet has no counts to give — `keepPreviousData` holds the *previous* key's,
      // and on a first fetch of a new key there is no previous. That empty menu arriving beside an
      // answered catalog is the whole hazard, so the mock has to be able to produce it.
      topics: mocks.topicFacetSettled ? [...counts.values(), ...(enabled ? mocks.facetOnlyTopics : [])] : [],
      isLoading: false,
      settled: enabled && !mocks.featuredCatalogError && mocks.topicFacetSettled,
      error: null,
    };
  },
  useTaggedSpaceFacet: (tagId: string, filters: any, enabled: boolean) => {
    // Narrowed by everything except the space selection.
    const rows = enabled ? applyServerFilters(taggedRowsFor(tagId), filters, false) : [];
    const counts = new Map<string, { id: string; count: number }>();
    for (const row of rows) {
      for (const spaceId of row.tagSpaceIds) {
        const seen = counts.get(spaceId);
        if (seen) seen.count += 1;
        else counts.set(spaceId, { id: spaceId, count: 1 });
      }
    }
    return {
      spaces: [...counts.values()],
      isLoading: false,
      settled: enabled && !mocks.featuredCatalogError,
      error: null,
    };
  },
}));

const HYDRATION_ERROR = new Error('hydration exploded');

// The opponent's claims are hydrated from the graph by id, through the picker's narrow projection.
// GEO-2758. Related claims come from the graph through the sync store, which needs a
// SyncEngineProvider this file deliberately doesn't mount -- every other data source here is
// mocked the same way. `enabled: false` returns nothing, which is what the real hook does.
vi.mock('~/core/sync/use-store', () => ({
  // Topics are assigned per space, so the source claim is hydrated with the debate's space. This
  // records what it was asked for; the scoping itself happens in `store.getEntity`, outside the
  // component.
  useQueryEntity: ({ id, spaceId, enabled }: { id: string; spaceId?: string; enabled?: boolean }) => {
    if (enabled !== false && id) mocks.entityHydrations.push({ id, spaceId });
    // Matched canonically, as the store is: a strict compare here would be stricter than the thing
    // this stands in for and would fail a caller that correctly normalized before asking.
    const wanted = id.replace(/-/g, '').toLowerCase();
    const entity =
      enabled === false
        ? null
        : (mocks.entities.find(candidate => (candidate.id as string).replace(/-/g, '').toLowerCase() === wanted) ??
          null);
    return { entity, isLoading: enabled !== false && Boolean(id) && mocks.entityHydrationLoading };
  },
  useQueryEntities: ({
    where,
    first,
    enabled,
    deferUntilFetched,
    prefetchNextPage,
  }: {
    where: unknown;
    first?: number;
    enabled?: boolean;
    deferUntilFetched?: boolean;
    prefetchNextPage?: boolean;
  }) => {
    mocks.relatedWheres.push(where);
    mocks.relatedFirsts.push(first);
    mocks.relatedDefers.push(deferUntilFetched);
    mocks.relatedPrefetches.push(prefetchNextPage);
    // A first load has no rows yet -- returning them *and* `isLoading` is a state react-query
    // never produces, and a test written against it passes whatever the picker does with the flag.
    const loading = enabled !== false && mocks.relatedEntitiesLoading;
    // `first` is a real cap, as it is on the query this stands in for. Ignoring it let a fixture
    // hand back more rows than were asked for, which is how a caller that asks for too few still
    // looks like it returned enough.
    const page = first === undefined ? mocks.relatedEntities : mocks.relatedEntities.slice(0, first);
    return {
      entities: enabled === false || loading ? [] : page,
      isLoading: loading,
      isPlaceholderData: false,
      endCursor: null,
      hasNextPage: false,
      error: enabled === false ? null : mocks.relatedEntitiesError,
    };
  },
}));

vi.mock('~/core/debates/claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => {
    mocks.entityIdLookups.push(ids);
    // Answerless while loading, as react-query is on a cold key. Without that a "loading" lookup
    // still handed back its fixtures, so nothing downstream could tell the two apart — and the
    // states that exist to wait for hydration were untestable.
    //
    // Matched on the normalized id, as the graph does. Most fixtures here spell an id the same way
    // on both sides, which production does not: geo-chat dashes what the graph stores bare. A
    // strict compare here would make the mock stricter than the thing it stands in for, and fail a
    // caller that correctly normalized before asking.
    const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
    const wanted = new Set(ids.map(norm));
    const failed = mocks.entityHydrationErrorFor !== null && wanted.has(norm(mocks.entityHydrationErrorFor));
    const pending =
      mocks.entityHydrationLoading ||
      (mocks.entityLookupLoadingId !== null && wanted.has(norm(mocks.entityLookupLoadingId)));
    return {
      entities: failed || pending ? [] : mocks.entities.filter(entity => wanted.has(norm(entity.id as string))),
      isLoading: pending,
      // Stable identity: a fresh Error each render would be a new value for every memo below it.
      error: failed ? HYDRATION_ERROR : null,
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

function responseIndexingStatusFor(entityId: string): 'idle' | 'reconciling' | 'delayed' | 'indexed' {
  if (mocks.optimisticResponses.get(entityId) === undefined) return 'idle';
  return mocks.responseIndexingStatus ?? (mocks.responseIndexingDelayed ? 'delayed' : 'reconciling');
}

vi.mock('~/core/hooks/use-entity-vote', () => ({
  // In production `optimisticResponse` is derived from this snapshot, so the two can't disagree
  // about *what* the answer is. They do apply different thresholds to the same status, though:
  // `optimisticResponse` goes undefined outside `reconciling`/`delayed`, while the card treats
  // anything but `idle` as still in flight — so at `indexed` the pill is lit and the gate sees
  // nothing. Mirrored here rather than mocked independently, so that window is reachable without
  // letting a test assert an optimistic side the snapshot denies.
  useEntityResponse: ({ entityId }: { entityId: string }) => ({
    submitResponse: (direction: 'positive' | 'negative' | 'clear') => mocks.submitResponse(entityId, direction),
    optimisticResponse: ['reconciling', 'delayed'].includes(responseIndexingStatusFor(entityId))
      ? mocks.optimisticResponses.get(entityId)
      : undefined,
    isConnected: true,
    personalSpaceId: 'personal-space',
  }),
  useEntityResponseIndexingSnapshot: ({ entityId }: { entityId: string }) => {
    const expectedResponse = mocks.optimisticResponses.get(entityId);
    const status = responseIndexingStatusFor(entityId);
    if (expectedResponse === undefined || status === 'idle') return { status: 'idle', pending: null, runId: null };
    return { status, pending: { entityId, expectedResponse }, runId: `run-${entityId}` };
  },
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

// The card's Debate toggle publishes readiness through this.
vi.mock('~/core/debates/matchmaking/hooks', () => ({
  useClaimReadiness: () => ({ mutate: mocks.setReadiness, isPending: false, error: null }),
  // The shared position control asks whether this claim has a match, to put the opponent's face on
  // the opposing side. The picker hides its own end slot — a rematch request is a different
  // mutation — so there is never an offer here, and these only have to answer "no".
  useMatchmakingMatches: () => ({ data: { matches: [] }, isLoading: false, error: null }),
  useDebateRequests: () => ({ data: { inbound: [], outbound: null }, isLoading: false, error: null }),
  useCreateDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  // The All tab is the hub's Claims query. Its arguments are what the tests below inspect.
  useMatchmakingClaims: (
    query: { search: string | null; spaceIds?: string[] | null; topicIds?: string[] | null },
    enabled: boolean
  ) => {
    // A disabled query is not a silent one: `placeholderData: keepPreviousData` outlives
    // `enabled: false`, so it keeps handing back the last key's pages — facets included. Modelled,
    // because a mock that returns nothing here makes the masking downstream look unnecessary.
    if (!enabled) {
      return {
        data: mocks.lastEnabledData,
        isLoading: false,
        error: null,
        hasNextPage: mocks.entityQueryHasNextPage,
        isFetchingNextPage: false,
        isPlaceholderData: mocks.lastEnabledData !== undefined,
        fetchNextPage: mocks.fetchNextPage,
      };
    }
    // A scope change is a key change like any other, so `keepPreviousData` answers it with the
    // previous scope's pages while the new request is in flight.
    if (mocks.scopeHeldOver) {
      return {
        data: mocks.lastEnabledData,
        isLoading: false,
        error: null,
        hasNextPage: mocks.entityQueryHasNextPage,
        isFetchingNextPage: false,
        isPlaceholderData: true,
        fetchNextPage: mocks.fetchNextPage,
      };
    }
    mocks.entityQueries.push(query);
    // `space_id` and `topic_id` both filter server-side as of GEO-2659, and every page carries
    // facets computed over the whole candidate set rather than the page being returned.
    const corpus = mocks.entityQueryPages ?? [mocks.matchmakingClaims];
    // Both sides normalized, as geo-chat does: the scope carries dash-less ids while the fixtures
    // carry the dashed spelling, so comparing them raw would filter everything out.
    const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
    const inSpaceFilter = (spaceId: string) =>
      !query.spaceIds?.length || query.spaceIds.some(id => norm(id) === norm(spaceId));
    // AND since GEO-2696: every selected topic has to be on the claim, not just one of them.
    const inTopicFilter = (topics: { id: string }[]) =>
      !query.topicIds?.length || query.topicIds.every(id => topics.some(topic => topic.id === id));
    const inSpace = corpus.flat().filter(entry => inSpaceFilter(entry.claim.space_id));
    // Co-occurrence: over the claims already carrying every selected topic, so the menu offers
    // what appears alongside the selection and the selection itself.
    // Counted, not just listed: a facet count is how many surviving claims carry the topic, so a
    // selected one comes back at the current result size. Collapsing them all to 1 would let a
    // count-display or count-ordering regression pass against an impossible response.
    const topicCounts = new Map<string, { id: string; name: string | null; count: number }>();
    for (const entry of inSpace.filter(entry => inTopicFilter(entry.topics))) {
      for (const topic of entry.topics) {
        const seen = topicCounts.get(topic.id);
        if (seen) seen.count += 1;
        else topicCounts.set(topic.id, { id: topic.id, name: topic.name, count: 1 });
      }
    }
    const topicFacets = [...topicCounts.values()];
    // Narrowed by the topic filter and never by its own dimension — picking a space must not
    // collapse the menu it came from, while picking a topic must narrow it. Built from the whole
    // corpus, this returned a response the server can't produce, so a multi-topic test would have
    // been checking the space menu against an impossible facet.
    const spaceIds = [
      ...new Set(
        corpus
          .flat()
          .filter(entry => inTopicFilter(entry.topics))
          .map(entry => entry.claim.space_id)
      ),
    ];
    // Spaces narrowed by the topic selection and never by their own — picking a space must not
    // collapse the menu it came from. Topics are co-occurrence, built above.
    const facets = {
      space_ids: spaceIds,
      topics: topicFacets.map(topic => ({ id: topic.id, name: topic.name })),
      space_facets: spaceIds.map(id => ({
        id,
        name: null,
        count: corpus.flat().filter(entry => entry.claim.space_id === id && inTopicFilter(entry.topics)).length,
      })),
      topic_facets: topicFacets,
    };
    const data = {
      pages: corpus.map(page => ({
        // Rows come back with `topics: []`, which is what the real endpoint sends:
        // `matchmaking_claims_for_user` leaves the field empty and answers about topics in the
        // facet instead. The fixture used to hand its own topics back on every row, which is more
        // than geo-chat gives — and that generosity is why nothing caught GEO-2714, where the
        // client re-tested server rows against topics it could not possibly know.
        claims: page
          .filter(entry => inSpaceFilter(entry.claim.space_id))
          .filter(entry => inTopicFilter(entry.topics))
          .map(entry => ({ ...entry, topics: [] })),
        next_cursor: null,
        facets,
      })),
    };
    mocks.lastEnabledData = data;
    return {
      data,
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
    // The real hook holds the previous id set's map rather than blanking it, and flags that it is
    // doing so. A held map answers nothing about ids it was never asked for, which is the whole
    // reason the picker has to wait it out.
    isPlaceholderData: mocks.spacesHeldOver,
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
  mocks.requestError = null;
  mocks.requestVariables = undefined;
  mocks.submitResponse.mockReset();
  mocks.optimisticResponses.clear();
  mocks.responseIndexingDelayed = false;
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
  mocks.featuredCatalogError = null;
  mocks.topicFacetSettled = true;
  mocks.facetOnlyTopics = [];
  mocks.taggedFiltersAskedFor = [];
  mocks.taggedHasNextPage = false;
  mocks.fetchNextTaggedPage = vi.fn();
  mocks.entityHydrationErrorFor = null;
  mocks.savedClaimsLoading = false;
  mocks.savedClaimsError = null;
  mocks.featuredEnabledWith = [];
  mocks.taggedClaimsAskedFor = [];
  mocks.entityQueryHasNextPage = false;
  mocks.lastEnabledData = undefined;
  mocks.spacesHeldOver = false;
  mocks.scopeHeldOver = false;
  mocks.entityQueryLoading = false;
  mocks.entityHydrationLoading = false;
  mocks.fetchNextPage.mockReset();
  mocks.entities = [sharedEntity(), publishedEntity()];
  // The All tab's corpus. It used to be `matchmakingClaims` — geo-chat's paged rows — and is now
  // the Debate tag paired with the entities above, which is what the list is built from.
  //
  // Both claims are tagged, where the second used to arrive through the merge instead (GEO-2798):
  // the session's own rows are not folded into this list any more, so a claim the pair answered is
  // here because a curator tagged it, or it is on the opponent's tab.
  mocks.debateTagClaims = [debateTag(), debateTag(CLAIM_SHARED, 'A claim both participants chose', SPACE_1, 2)];
  // The session came out of a debate by default, the way the fixture session says it did. Related
  // still stays out of the menu until `relatedEntities` gives it something to list.
  mocks.sourceDebate = { claim: { claim_entity_id: CLAIM_SOURCE, space_id: SPACE_1 } };
  mocks.sourceDebateLoading = false;
  mocks.relatedEntities = [];
  mocks.relatedEntitiesLoading = false;
  mocks.relatedEntitiesError = null;
  mocks.rematchExcludedIds = [];
  mocks.relatedWheres.length = 0;
  mocks.relatedFirsts.length = 0;
  mocks.relatedDefers.length = 0;
  mocks.relatedPrefetches.length = 0;
  mocks.entityHydrations.length = 0;
  mocks.entityLookupLoadingId = null;
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
  mocks.responseIndexingStatus = null;
  mocks.spaceAllowlist = null;
  mocks.allowlistLoading = false;
  mocks.spaceTypes = {};
  mocks.publishableSpaceIds = null;
  // jsdom has no IntersectionObserver, which the infinite-scroll sentinel builds. This one records
  // every callback so a test can say the sentinel scrolled into view.
  //
  // Every one of them, not just the last: each claim card now observes itself too, to hold its
  // response reads until it is near the viewport. Keeping a single callback would hand back the
  // last card's, and the sentinel — the only thing these tests scroll — would never fire.
  mocks.observerTriggers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        mocks.observerTriggers.push(() =>
          this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this as never)
        );
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
  mocks.sessionLoading = false;
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
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Request debate' })[0]).toBeEnabled());
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
      return { claimEntityId: id, spaceId, name, description: null, rankingScore: 1 };
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

    // The row spread all of its menus across the full width, which was fine while there were two of
    // them. With the source menu leading it, that stranded the space menu in the middle rather than
    // leaving it beside the source it narrows. Only the topic menu goes to the far end now.
    it('groups the source and space menus, leaving the topic menu at the end', async () => {
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      const sourceMenu = screen.getByRole('button', { name: 'Featured' });
      const spaceMenu = screen.getByRole('button', { name: /Any space/ });
      const topicMenu = screen.getByRole('button', { name: /Any topic/ });
      const row = sourceMenu.parentElement;

      // The two that belong together share the row directly, in order, with nothing spreading them.
      expect(row).toBe(spaceMenu.parentElement);
      expect(row?.className).not.toContain('justify-between');
      expect(sourceMenu.compareDocumentPosition(spaceMenu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // And the topic menu alone is pushed to the far end.
      expect(topicMenu.parentElement?.className).toContain('ml-auto');
      expect(topicMenu.parentElement?.parentElement).toBe(row);
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

    // The space ranking picks the highest-ranked space a claim is *named* in and knows nothing of
    // the allowlist, so left to it a claim featured in an allowed space could be drawn -- and its
    // debate requested -- in a disallowed one that happens to outrank it.
    it('draws a tagged claim in the space it was featured in, not the highest-ranked one', async () => {
      // SPACE_1 (Crypto, rank 2) outranks SPACE_2, and the claim is named in both.
      mocks.spaceAllowlist = new Set([SPACE_2.replace(/-/g, '')]);
      mocks.featuredClaims = [featuredTag(FEATURED, 'A featured claim', SPACE_2)];
      mocks.entities = [
        sharedEntity(),
        {
          ...featuredEntity(),
          spaces: [SPACE_1, SPACE_2],
          values: [
            { property: { id: NAME_PROPERTY }, spaceId: SPACE_1, value: 'A featured claim' },
            { property: { id: NAME_PROPERTY }, spaceId: SPACE_2, value: 'A featured claim' },
          ],
        },
      ];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await settleTabSwap();

      expect(screen.getByText('A featured claim')).toBeInTheDocument();
      expect(mocks.rematchClaimIds.flat()).toContain(FEATURED);
      expect(screen.queryByText('No featured claims are available to debate yet.')).toBeNull();
    });

    // `enabled: false` leaves react-query's cached rows in place, and the hub shares this query key
    // -- so a catalog fetched there arrives pre-populated and would keep the hydration mounted.
    it('asks for nothing while Featured is off screen, even with a cached catalog', async () => {
      curatedPage();
      mocks.featuredClaims = [featuredTag()];
      mocks.entities = [sharedEntity(), featuredEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      // Recommended is the default here, so Featured's claim is never asked about. There is no
      // entity lookup to hold off any more — the page carries what a row is built from — so what
      // must stay quiet is the tag query itself and the geo-chat rows behind it.
      expect(mocks.featuredEnabledWith.every(enabled => enabled === false)).toBe(true);
      expect(mocks.rematchClaimIds.flat()).not.toContain(FEATURED);

      await chooseSource('Featured');

      expect(mocks.featuredEnabledWith.at(-1)).toBe(true);
      await waitFor(() => expect(mocks.rematchClaimIds.flat()).toContain(FEATURED));
    });

    // A remembered Featured source shouldn't keep a graph query alive behind the opponent's tab,
    // which draws from somewhere else entirely.
    it('stops asking for the tag once the viewer leaves Claims', async () => {
      mocks.featuredClaims = [featuredTag()];
      mocks.entities = [sharedEntity(), featuredEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      expect(mocks.featuredEnabledWith.at(-1)).toBe(true);

      await showOpponentClaims();

      expect(mocks.featuredEnabledWith.at(-1)).toBe(false);
    });

    it('reports a failed tag lookup as an error rather than an empty list', async () => {
      mocks.featuredCatalogError = new Error('tag lookup exploded');
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await settleTabSwap();

      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
      expect(screen.queryByText('No featured claims are available to debate yet.')).toBeNull();
    });

    // Featured ids are empty while the allowlist is resolving, so without counting that as part of
    // the source's loading state the empty message painted and was then replaced by the list.
    it('waits on the allowlist rather than flashing its empty state', async () => {
      mocks.spaceAllowlist = null;
      mocks.allowlistLoading = true;
      mocks.featuredClaims = [featuredTag()];
      mocks.entities = [sharedEntity(), featuredEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await settleTabSwap();

      expect(screen.queryByText('No featured claims are available to debate yet.')).toBeNull();
    });

    it('says nothing is featured rather than nothing is debatable', async () => {
      // Nothing carries the tag, so the source has nothing to show. It used to be expressed as a
      // tagged claim with no entity behind it; the page carries its own now, so an untagged corpus
      // is the honest way to say it.
      mocks.featuredClaims = [];
      mocks.entities = [sharedEntity()];
      render(<DebateRematchPageClient sessionId="rematch-1" />);

      await settleTabSwap();

      expect(screen.getByText('No featured claims are available to debate yet.')).toBeInTheDocument();
    });

    /**
     * GEO-2758. Related claims: what the picker opens on straight out of a debate.
     *
     * The condition is the session having a source debate, which is also what the picker already
     * uses to keep the just-debated claim out of every list. A session opened from a profile
     * challenge has none, and that is the "didn't just finish a debate" case.
     */
    describe('Related claims', () => {
      const RELATED = '019fedb9-7db8-7a05-9b88-9de4cf60bb75';

      /** A claim in the source claim's space carrying one of its topics. */
      function relatedEntity(id = RELATED, name = 'A claim on the same topic') {
        return {
          id,
          name,
          description: null,
          spaces: [SPACE_1],
          values: [{ property: { id: NAME_PROPERTY }, spaceId: SPACE_1, value: name }],
          relations: [
            { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-gov', name: 'Governance' }, isDeleted: false },
          ],
        };
      }

      /** The claim the pair just debated, carrying the topic its neighbours are found by. */
      function sourceClaimEntity() {
        return {
          id: CLAIM_SOURCE,
          name: 'The claim just debated',
          description: null,
          spaces: [SPACE_1],
          values: [{ property: { id: NAME_PROPERTY }, spaceId: SPACE_1, value: 'The claim just debated' }],
          relations: [
            { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-gov', name: 'Governance' }, isDeleted: false },
          ],
        };
      }

      /**
       * A session out of a debate whose claim has one neighbour on the same topic.
       *
       * `relatedEntities` carries the source claim as well, because the graph does: it holds the
       * topics the clause matches on, so it is always in its own related list. A fixture without
       * it describes a result the query cannot return.
       */
      function debateWithRelated() {
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity()];
        mocks.relatedEntities = [sourceClaimEntity(), relatedEntity()];
      }

      /**
       * geo-chat hands out dashed uuids where the graph stores bare hex — the convention
       * `use-debates-best-order` spells out, and the reason `sameId` exists in this file. The
       * source claim crosses that boundary: it arrives from geo-chat and is matched against, and
       * queried for, graph entities.
       *
       * Every other fixture here uses one dashed id on both sides, which is a shape production
       * never has, and it hid a strict comparison that would have left `sourceClaimTopicIds` empty
       * and Related permanently absent.
       */
      describe('across the geo-chat / graph id boundary', () => {
        const hex = (uuid: string) => uuid.replace(/-/g, '').toLowerCase();

        it('finds the debated claim when geo-chat dashes the id the graph stores bare', async () => {
          // The graph's copies, keyed the way the graph keys them.
          const sourceOnGraph = { ...sourceClaimEntity(), id: hex(CLAIM_SOURCE), spaces: [hex(SPACE_1)] };
          const relatedOnGraph = { ...relatedEntity(), id: hex(RELATED), spaces: [hex(SPACE_1)] };
          mocks.entities = [sharedEntity(), sourceOnGraph, relatedOnGraph];
          mocks.relatedEntities = [sourceOnGraph, relatedOnGraph];
          // geo-chat's copy, dashed.
          mocks.sourceDebate = { claim: { claim_entity_id: CLAIM_SOURCE, space_id: SPACE_1 } };

          render(<DebateRematchPageClient sessionId="rematch-1" />);
          await settleTabSwap();

          expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
          expect(screen.getByText('A claim on the same topic')).toBeInTheDocument();
        });

        // The clause goes to the graph, so it has to carry the graph's spelling of the space.
        /**
         * The session's answers cross the boundary in the other direction: geo-chat names the
         * claims it has ruled out in its own dashed spelling, and those names are checked against
         * ids the graph handed over as bare hex. A strict membership test never matches, so a
         * claim this session has already excluded is offered anyway.
         */
        it('still excludes a neighbour geo-chat ruled out under its own spelling', async () => {
          const sourceOnGraph = { ...sourceClaimEntity(), id: hex(CLAIM_SOURCE), spaces: [hex(SPACE_1)] };
          const relatedOnGraph = { ...relatedEntity(), id: hex(RELATED), spaces: [hex(SPACE_1)] };
          mocks.entities = [sharedEntity(), sourceOnGraph, relatedOnGraph];
          mocks.relatedEntities = [sourceOnGraph, relatedOnGraph];
          mocks.sourceDebate = { claim: { claim_entity_id: CLAIM_SOURCE, space_id: SPACE_1 } };
          mocks.rematchExcludedIds = [RELATED];

          render(<DebateRematchPageClient sessionId="rematch-1" />);
          await settleTabSwap();

          expect(screen.queryByText('A claim on the same topic')).toBeNull();
        });

        /**
         * And the row's session metadata. geo-chat's flags are keyed by its own spelling while the
         * row is built from the graph's entity, so a miss is silent: every flag quietly reads
         * false, and a recently rejected claim loses both its badge and the disabled request that
         * should come with it.
         */
        it('carries geo-chat session flags onto a row the graph supplied', async () => {
          const sourceOnGraph = { ...sourceClaimEntity(), id: hex(CLAIM_SOURCE), spaces: [hex(SPACE_1)] };
          const relatedOnGraph = { ...relatedEntity(), id: hex(RELATED), spaces: [hex(SPACE_1)] };
          mocks.entities = [sharedEntity(), sourceOnGraph, relatedOnGraph];
          mocks.relatedEntities = [sourceOnGraph, relatedOnGraph];
          mocks.sourceDebate = { claim: { claim_entity_id: CLAIM_SOURCE, space_id: SPACE_1 } };
          mocks.session = session({ recently_rejected_claim_ids: [RELATED] });
          // The badge lives on the request control, which only renders once the pair are on
          // opposing sides -- so the row has to be one they could actually debate.
          mocks.positions = [
            position('profile-local', hex(RELATED), hex(SPACE_1), true),
            position('profile-remote', hex(RELATED), hex(SPACE_1), false),
          ];

          render(<DebateRematchPageClient sessionId="rematch-1" />);
          await settleTabSwap();

          expect(screen.getByText('A claim on the same topic')).toBeInTheDocument();
          expect(screen.getByText('Recently rejected')).toBeInTheDocument();
        });

        /**
         * The same boundary through the row map rather than the session's reject list. geo-chat's
         * row for a claim carries the session flags and is keyed by geo-chat's spelling, while the
         * row it decorates is built from the graph's entity — so a miss silently downgrades every
         * flag to false. Nothing here comes from `recently_rejected_claim_ids`, so the badge can
         * only be arriving through the row map.
         */
        it('reads a session row keyed the way geo-chat keys it', async () => {
          const sourceOnGraph = { ...sourceClaimEntity(), id: hex(CLAIM_SOURCE), spaces: [hex(SPACE_1)] };
          const relatedOnGraph = { ...relatedEntity(), id: hex(RELATED), spaces: [hex(SPACE_1)] };
          mocks.entities = [sharedEntity(), sourceOnGraph, relatedOnGraph];
          mocks.relatedEntities = [sourceOnGraph, relatedOnGraph];
          mocks.sourceDebate = { claim: { claim_entity_id: CLAIM_SOURCE, space_id: SPACE_1 } };
          // geo-chat's row, dashed, flagging the rejection on the row itself.
          mocks.claims = [
            {
              ...sharedClaim(),
              claim: { ...claimSummary(RELATED, 'A claim on the same topic'), space_id: hex(SPACE_1) },
              recently_rejected: true,
            },
          ];
          mocks.positions = [
            position('profile-local', hex(RELATED), hex(SPACE_1), true),
            position('profile-remote', hex(RELATED), hex(SPACE_1), false),
          ];

          render(<DebateRematchPageClient sessionId="rematch-1" />);
          await settleTabSwap();

          expect(screen.getByText('Recently rejected')).toBeInTheDocument();
        });

        /**
         * Topics are indexed by the graph's entity id, but an assembled row keeps geo-chat's
         * `claim_entity_id` wherever geo-chat had a row for it — so the row and the topic index
         * disagree about the claim's name. The row then reports no topics at all: the Related
         * source offers no topic facets, and an existing topic selection filters every related row
         * away.
         *
         * The neighbour here has a session row, which is what puts geo-chat's spelling on it.
         */
        it('offers the topics of a related row geo-chat also has a row for', async () => {
          const sourceOnGraph = { ...sourceClaimEntity(), id: hex(CLAIM_SOURCE), spaces: [hex(SPACE_1)] };
          const relatedOnGraph = { ...relatedEntity(), id: hex(RELATED), spaces: [hex(SPACE_1)] };
          mocks.entities = [sharedEntity(), sourceOnGraph, relatedOnGraph];
          mocks.relatedEntities = [sourceOnGraph, relatedOnGraph];
          mocks.sourceDebate = { claim: { claim_entity_id: CLAIM_SOURCE, space_id: SPACE_1 } };
          mocks.claims = [
            {
              ...sharedClaim(),
              claim: { ...claimSummary(RELATED, 'A claim on the same topic'), space_id: hex(SPACE_1) },
            },
          ];

          render(<DebateRematchPageClient sessionId="rematch-1" />);
          await settleTabSwap();
          expect(screen.getByText('A claim on the same topic')).toBeInTheDocument();

          fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

          expect(screen.getByRole('button', { name: /Governance/ })).toBeInTheDocument();
        });

        it('scopes the query with the id the graph stores', async () => {
          const sourceOnGraph = { ...sourceClaimEntity(), id: hex(CLAIM_SOURCE), spaces: [hex(SPACE_1)] };
          mocks.entities = [sharedEntity(), sourceOnGraph];
          mocks.relatedEntities = [sourceOnGraph];
          mocks.sourceDebate = { claim: { claim_entity_id: CLAIM_SOURCE, space_id: SPACE_1 } };

          render(<DebateRematchPageClient sessionId="rematch-1" />);
          await settleTabSwap();

          const where = mocks.relatedWheres.at(-1) as { spaces: Array<{ equals: string }> };
          expect(where.spaces).toEqual([{ equals: hex(SPACE_1) }]);
        });
      });

      it('opens on Related claims when the pair just finished a debate', async () => {
        debateWithRelated();
        render(<DebateRematchPageClient sessionId="rematch-1" />);

        await settleTabSwap();

        expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
        expect(screen.getByText('A claim on the same topic')).toBeInTheDocument();
      });

      // It is the most specific answer the picker can give, so it leads -- and an option the menu
      // opens on should be the one at the top of it.
      it('leads the menu, above the sources that are always there', async () => {
        debateWithRelated();
        curatedPage();
        mocks.featuredClaims = [featuredTag()];
        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        openSourceMenu();

        const labels = ['Related claims', 'Recommended', 'Featured', 'All claims'];
        const rendered = labels.map(label => screen.getAllByRole('button', { name: label }).at(-1)!);
        for (let index = 1; index < rendered.length; index++) {
          expect(rendered[index - 1]!.compareDocumentPosition(rendered[index]!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        }
      });

      // The empty case, and it has to be answered before the menu renders: an option that appears
      // and then shows nothing is worse than one that was never offered.
      it('stays out of the menu when the debated claim has no neighbours', async () => {
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), featuredEntity()];
        // What the real query returns for a claim with no neighbours: the claim itself, which
        // carries the very topics the clause matches on. Returning `[]` here described a result
        // the graph cannot produce, and hid that `hasRelated` counted the source claim.
        mocks.relatedEntities = [sourceClaimEntity()];
        render(<DebateRematchPageClient sessionId="rematch-1" />);

        await settleTabSwap();

        expect(screen.queryByRole('button', { name: 'Related claims' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
      });

      // Arriving any other way -- a challenge from a profile -- means there is no claim to be
      // related to, however many neighbours the graph could offer.
      it('stays out of the menu when the session did not come from a debate', async () => {
        debateWithRelated();
        mocks.session = session({ source_debate_id: null });
        mocks.sourceDebate = null;
        mocks.featuredClaims = [featuredTag()];
        render(<DebateRematchPageClient sessionId="rematch-1" />);

        await settleTabSwap();

        expect(screen.queryByRole('button', { name: 'Related claims' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
      });

      /**
       * The whole point of sharing `relatedClaimsWhere` with the claim page: a viewer who sees a
       * claim in one surface and not the other has no way to tell which is lying. Asserting the
       * clause rather than the rows is what catches a reimplementation that happens to agree on
       * this fixture.
       */
      it('asks the same question the claim page asks, scoped to the debated claim', async () => {
        debateWithRelated();
        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        const where = mocks.relatedWheres.at(-1) as {
          types: Array<{ id: { equals: string } }>;
          spaces: Array<{ equals: string }>;
          relations: Array<{ typeOf: { id: { equals: string } }; toEntity: { id: { in: string[] } } }>;
        };

        // All three conditions, not just the two that make a claim "related". Without the type
        // clause the same topics pull in every non-claim entity carrying one, and a test naming
        // only the space and the relation stays green while they arrive.
        expect(where.types).toEqual([{ id: { equals: CLAIM_TYPE_ID } }]);
        // Normalized: the clause goes to the graph, and geo-chat's dashed spelling would not match
        // what the graph stores. `SPACE_1` is dashed in these fixtures, so this is a real check.
        expect(where.spaces).toEqual([{ equals: SPACE_1.replace(/-/g, '') }]);
        expect(where.relations[0]!.typeOf.id.equals).toBe(TOPICS_PROPERTY_ID);
        expect(where.relations[0]!.toEntity.id.in).toEqual(['topic-gov']);
        // A configuration assertion rather than a behavioural one: this mock cannot model the
        // store fall-through, and without deferring, the ids it produces fire both row batches a
        // moment before the real answer replaces them.
        expect(mocks.relatedDefers.at(-1)).toBe(true);
        // Bounded on purpose: no pagination UI, so warming the next cursor fetches a page nothing
        // reads. Configuration again — the prefetch lives inside the hook.
        expect(mocks.relatedPrefetches.at(-1)).toBe(false);

        // Topics are per-space, so the source claim must be hydrated with the debate's space. The
        // batch projection this used to go through selects relations with no space filter, which
        // let a topic assigned in some *other* space pull in neighbours the claim page's own
        // gallery would not list — the disagreement the shared clause exists to prevent.
        const hydration = mocks.entityHydrations.find(call => sameSpelling(call.id, CLAIM_SOURCE));
        expect(hydration).toBeDefined();
        expect(hydration!.spaceId).toBeDefined();
        expect(sameSpelling(hydration!.spaceId!, SPACE_1)).toBe(true);

        // The picker narrows further than the claim page does: only claims tagged for debate. Also
        // a configuration assertion — the mock returns whatever `relatedEntities` holds regardless
        // of the clause — but the clause is what the graph and the local matcher both act on, and
        // they agree that two relation conditions are ANDed with each satisfied by some relation.
        expect(where.relations).toHaveLength(2);
        expect(where.relations[1]!.typeOf.id.equals).toBe(TAG_PROPERTY_ID);
        expect(where.relations[1]!.toEntity.id.in).toEqual([DEBATE_TAG_ID]);
      });

      /**
       * Its own topics match it, so the debated claim comes back in its own related list. Offering
       * the pair the claim they just finished arguing is the one thing this source must not do.
       *
       * What this pins is the related list running through `excludedClaimIds` like every other
       * source, not the source-debate exclusion itself: geo-chat's session rows exclude that claim
       * too, so removing one and leaving the other keeps this green either way.
       */
      it('does not offer the claim that was just debated', async () => {
        debateWithRelated();
        render(<DebateRematchPageClient sessionId="rematch-1" />);

        await settleTabSwap();

        expect(screen.getByText('A claim on the same topic')).toBeInTheDocument();
        expect(screen.queryByText('The claim just debated')).toBeNull();
      });

      /**
       * The session lookup is the round trip *before* the three below, and until it lands nobody
       * knows whether this rematch came out of a debate at all. `session` is null while it runs,
       * which reads exactly like a profile challenge — so without it in the gate the trigger names
       * Featured and then swaps once the session says otherwise.
       */
      it('holds the trigger while the session lookup is still running', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.session = null;
        mocks.sessionLoading = true;
        render(<DebateRematchPageClient sessionId="rematch-1" />);

        await settleTabSwap();

        expect(screen.queryByRole('button', { name: 'Featured' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Related claims' })).toBeNull();
      });

      /**
       * The route reuses this component across `sessionId` changes -- which is why the lists are
       * held on a reset key rather than remounting. A source picked in one rematch therefore
       * survives into the next, and Related is the one that can vanish: entering a profile
       * challenge with it still chosen left the trigger naming a source its own menu no longer
       * offered, unselectable and unclearable.
       */
      it('does not carry a chosen Related source into a session that has none', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity(), featuredEntity()];
        const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();
        await chooseSource('Related claims');

        // A challenge from a profile: same component, new session, no source debate.
        mocks.session = session({ id: 'rematch-2', source_debate_id: null });
        mocks.sourceDebate = null;
        mocks.relatedEntities = [];
        rerender(<DebateRematchPageClient sessionId="rematch-2" />);
        await settleTabSwap();

        expect(screen.queryByRole('button', { name: 'Related claims' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
      });

      /**
       * The availability check only rejects a choice that vanishes. Featured and All never do, so
       * they outlive the session they were picked in — and the next rematch, one that *did* come
       * out of a debate, would then open on All instead of Related. The ticket's default is a
       * property of the picker being opened, not of the last one the viewer touched.
       */
      it('starts a new session on Related rather than the source picked in the last one', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity(), featuredEntity()];
        mocks.matchmakingClaims = [];
        const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();
        await chooseSource('All claims');
        expect(screen.getByRole('button', { name: 'All claims' })).toBeInTheDocument();

        // A different rematch, also out of a debate, in the same reused component.
        mocks.session = session({ id: 'rematch-2' });
        rerender(<DebateRematchPageClient sessionId="rematch-2" />);
        await settleTabSwap();

        expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
      });

      /**
       * A failed discovery must degrade to Featured, and "failed" is not the same as "returned
       * nothing": `useQueryEntities` falls back to the local store when the remote fetch fails, so
       * rows and an error arrive together. Counting those rows made a failure look like a positive
       * answer, and the picker then opened on Related and rendered its error screen -- the exact
       * fallback the comment beside `hasRelated` promises not to skip.
       */
      it('falls back to Featured when discovery fails but the local store still matches', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity(), featuredEntity()];
        mocks.relatedEntitiesError = new Error('discovery failed');
        render(<DebateRematchPageClient sessionId="rematch-1" />);

        await settleTabSwap();

        expect(screen.queryByRole('button', { name: 'Related claims' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
        expect(screen.getByText('A featured claim')).toBeInTheDocument();
      });

      /**
       * Suppressing a discovery failure is right while the default is being chosen and wrong once
       * the viewer has chosen. Treating the failure as "no related claims" makes the option
       * unavailable, which moves a viewer who deliberately picked Related onto Featured — so the
       * error they should be seeing never renders, and the list they asked for is replaced by one
       * they didn't.
       */
      it('keeps a viewer who chose Related there when a later refetch fails', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity(), featuredEntity()];
        const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();
        await chooseSource('Related claims');

        mocks.relatedEntitiesError = new Error('refetch failed');
        rerender(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
        expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
        expect(screen.queryByText('A featured claim')).toBeNull();
      });

      /**
       * The source claim is in its own related list and is dropped afterwards, so a page sized to
       * the advertised limit yields one fewer neighbour than the limit says. The cap belongs to
       * the claims the picker offers, not to the rows the query happened to return.
       */
      it('offers a full page of neighbours despite dropping the debated claim', async () => {
        const neighbours = Array.from({ length: 40 }, (_, index) => ({
          ...relatedEntity(`019fedc0-0000-7000-8000-${String(index).padStart(12, '0')}`, `Neighbour ${index}`),
        }));
        // The debated claim sorts first, as it would: the debate just touched it.
        mocks.relatedEntities = [sourceClaimEntity(), ...neighbours];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), ...neighbours];

        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.getAllByText(/^Neighbour /)).toHaveLength(RELATED_CLAIMS_LIMIT);
      });

      /**
       * And the other way round. Asking for one extra covers the page that contains the debated
       * claim; a page that does not contain it comes back one over the limit instead, so the cap
       * has to be applied to the neighbours rather than left to the query's `first`. Reachable
       * whenever more than `RELATED_CLAIMS_LIMIT` neighbours were touched more recently than the
       * claim itself.
       */
      it('offers no more than the limit when the debated claim is not on the page', async () => {
        const neighbours = Array.from({ length: 40 }, (_, index) => ({
          ...relatedEntity(`019fedc0-0000-7000-8000-${String(index).padStart(12, '0')}`, `Neighbour ${index}`),
        }));
        // Every row a neighbour: the debated claim sorts below this page.
        mocks.relatedEntities = neighbours;
        mocks.entities = [sharedEntity(), sourceClaimEntity(), ...neighbours];

        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.getAllByText(/^Neighbour /)).toHaveLength(RELATED_CLAIMS_LIMIT);
      });

      /**
       * Discovery answers whether the source exists; the row lookups only draw it. Folding a row
       * failure into the first question makes the source vanish from its own menu — and because a
       * refetch failure sticks (`retry: false`), the viewer is moved to Featured with no error
       * shown, then moved back when the next refetch succeeds. That is the swap under the viewer
       * `sourceUndecided` exists to prevent, arriving by a different route.
       *
       * So a row failure keeps Related: the source genuinely exists, and the honest thing is to say
       * we could not draw it. `chosenSourceIsAvailable` already takes this position for a source
       * the viewer picked; this is the default behaving the same way.
       */
      it('keeps Related and surfaces the error when building its rows fails', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity(), featuredEntity()];
        // Only the neighbour's batch fails; discovery itself succeeded.
        mocks.entityHydrationErrorFor = RELATED;

        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
        expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
        expect(screen.queryByText('A featured claim')).toBeNull();
      });

      /**
       * Reviewer finding: a neighbour with no name is dropped by `rowFromEntity`, and the claim
       * page's gallery — which shares this clause — filters on `entity.name` for the same reason.
       * Counting it makes Related lead the menu, become the default, and then render its empty
       * state. Unlike a session exclusion, which genuinely is not knowable until geo-chat answers,
       * a missing name is knowable from the very query the count comes from.
       */
      it('does not offer Related when its only neighbour has no name', async () => {
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), featuredEntity()];
        mocks.relatedEntities = [sourceClaimEntity(), { ...relatedEntity(), name: null }];

        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.queryByRole('button', { name: 'Related claims' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
      });

      /**
       * The default is discovery's answer, so it lands as soon as discovery settles — the row
       * lookups only draw the list and cannot change which source won.
       *
       * This test asserted the opposite until review: the row lookups were in the gate, so the
       * trigger stayed blank until they finished. That held Featured behind two batches that could
       * not affect the outcome, and it was only necessary because `hasRelated` was folding a row
       * failure into the discovery answer — which had its own, worse consequence (see
       * `keeps Related and surfaces the error when building its rows fails`).
       */
      it('names Related as soon as discovery settles, without waiting for its rows', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity(), featuredEntity()];
        // Discovery has answered; the neighbour's batch has not.
        mocks.entityLookupLoadingId = RELATED;

        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
        // The list is still drawing, so nothing from another source stands in for it.
        expect(screen.queryByText('A featured claim')).toBeNull();
      });

      /**
       * The allowlist is the viewer's own browsing scope — featured spaces plus the ones they are a
       * member or editor of. Having debated a claim puts nothing into it, so for the participant
       * who does not belong to the claim's space it filters out every neighbour and leaves the
       * source empty on one side of the pair only.
       *
       * Related is bounded by an explicit source, like the opponent's positions and a curator's
       * page — both of which this file already keeps outside the allowlist, for this exact reason.
       */
      it('lists neighbours from a space outside the viewer’s own browsing scope', async () => {
        debateWithRelated();
        // The viewer browses SPACE_2; the debate happened in SPACE_1.
        mocks.spaceAllowlist = new Set([SPACE_2.replace(/-/g, '')]);

        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
        expect(screen.getByText('A claim on the same topic')).toBeInTheDocument();
      });

      /**
       * Related leads the fallback chain, so once it has settled *with* neighbours the default is
       * decided — `hasRecommended` cannot change the answer from there. Waiting on the curator
       * lookup anyway leaves the trigger announcing an undecided source, and the list on its
       * loading state, while a multi-stage query that cannot affect the outcome finishes.
       *
       * The wait is still right when Related settles with nothing: then Recommended is next in the
       * chain and genuinely does decide it.
       */
      it('opens on Related without waiting for a curator lookup it has already outranked', async () => {
        debateWithRelated();
        mocks.recommendedLoading = true;

        render(<DebateRematchPageClient sessionId="rematch-1" />);
        await settleTabSwap();

        expect(screen.getByRole('button', { name: 'Related claims' })).toBeInTheDocument();
        expect(screen.getByText('A claim on the same topic')).toBeInTheDocument();
      });

      /**
       * Three round trips stand between arriving and knowing whether Related exists: the source
       * debate, that claim's topics, and the topic query. Until they land, "no related claims" and
       * "not yet" are the same observation -- so the picker waits rather than opening on Featured
       * and swapping the list out from under the viewer a moment later.
       */
      it('waits rather than opening on Featured while the lookup is still resolving', async () => {
        debateWithRelated();
        mocks.featuredClaims = [featuredTag()];
        mocks.entities = [sharedEntity(), sourceClaimEntity(), relatedEntity(), featuredEntity()];
        mocks.relatedEntitiesLoading = true;
        render(<DebateRematchPageClient sessionId="rematch-1" />);

        await settleTabSwap();

        expect(screen.queryByText('A featured claim')).toBeNull();
        // The trigger too, not just the list. The menu renders whatever `source` currently is, so
        // a gate that holds only the rows still shows "Featured" and then swaps it for "Related
        // claims" a moment later -- the swap this is supposed to prevent, one control over.
        expect(screen.queryByRole('button', { name: 'Featured' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Related claims' })).toBeNull();
      });
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

  /**
   * The curator's page names claims with the graph's bare hex ids; geo-chat spells the same claim
   * dashed, and `rowFromEntity` takes its session row's `claim` whole where it has one — so the
   * assembled row carries geo-chat's spelling while the section still asks for the graph's.
   *
   * Latent until `sessionRowsByClaimId` was keyed canonically: before that the session row was
   * never found for a graph-backed claim, so the row kept the entity's id and the section matched
   * it by accident. Fixing the map turned a quietly missing set of session flags into a claim that
   * vanishes from its section, and a section that can empty out entirely.
   */
  it('keeps a recommended claim in its section when geo-chat also has a row for it', async () => {
    const hex = (uuid: string) => uuid.replace(/-/g, '').toLowerCase();
    // The curator's page, in the graph's spelling.
    mocks.recommendedSections = [{ id: 'block-1', name: 'Geopolitics & chips', claimIds: [hex(CLAIM_SHARED)] }];
    mocks.recommendedEntities = [{ ...sharedEntity(), id: hex(CLAIM_SHARED) }];
    mocks.entities = [{ ...sharedEntity(), id: hex(CLAIM_SHARED) }];
    // geo-chat's row for the same claim, dashed.
    mocks.claims = [sharedClaim()];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await settleTabSwap();

    expect(screen.getByRole('heading', { name: 'Geopolitics & chips' })).toBeInTheDocument();
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();
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
    expect(mocks.perSpaceReadinessGroups.every(groups => groups.length === 0)).toBe(true);
    // Hydrated by id — exactly the claims the graph named, nothing paged. Matched among the
    // hydrations rather than as the last one: the All tab now hydrates its own rows too, for
    // the topics geo-chat doesn't carry.
    expect(mocks.entityIdLookups).toContainEqual([CLAIM_SHARED, FRESH]);
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

  // No button to press any more; reaching the end of the list is what asks for the next page.
  it('does not offer a Keep looking button while the sentinel is still paging', async () => {
    mocks.entityQueryHasNextPage = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.queryByRole('button', { name: 'Keep looking' })).toBeNull();
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
    expect(await screen.findByRole('button', { name: 'Request debate' })).toBeInTheDocument();
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

  /**
   * GEO-2698. `shared_preference` is read off the session row, so taking a side on a claim the
   * opponent has already answered flips it — and the tab sorted matches to the top on every
   * recompute. The row the viewer had just acted on jumped out from under them, taking the rest of
   * the list with it.
   *
   * The sort is a load-time arrangement. It still decides where things start, and where a claim the
   * opponent answers next arrives; what it no longer does is rearrange rows the viewer is working.
   */
  describe('opponent tab ordering', () => {
    const FIRST_CLAIM = 'A claim both participants chose';
    const SECOND_CLAIM = 'A second claim they answered';
    const THIRD_CLAIM = 'A claim they answered just now';

    /**
     * A second claim of the opponent's, named in the same space they answered it in — `sidesOf`
     * keys on claim *and* space, so a row whose home space differs from its position's has no
     * participants and never reaches the tab.
     */
    function opponentEntity(id: string, name: string) {
      return {
        id,
        name,
        description: null,
        spaces: [SPACE_1],
        values: [{ property: { id: NAME_PROPERTY }, spaceId: SPACE_1, value: name }],
        relations: [],
      };
    }

    /** A session row for a claim the opponent answered, matched or not. */
    function sessionRow(id: string, claim: string, sharedPreference: boolean) {
      return { ...sharedClaim(), claim: claimSummary(id, claim), shared_preference: sharedPreference };
    }

    /** The opponent's two positions, neither a match yet, in the order the graph returns them. */
    function twoUnmatchedPositions() {
      mocks.positions = [
        position('profile-remote', CLAIM_SHARED, SPACE_1, false),
        position('profile-remote', CLAIM_MORE, SPACE_1, false),
      ];
      mocks.entities = [sharedEntity(), opponentEntity(CLAIM_MORE, SECOND_CLAIM)];
      mocks.claims = [sessionRow(CLAIM_SHARED, FIRST_CLAIM, false)];
    }

    const positionsTab = () => screen.getByRole('button', { name: /positions/ });

    it('holds the order it loaded with when a position becomes a match', async () => {
      twoUnmatchedPositions();
      const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();

      expect(appearsBefore(FIRST_CLAIM, SECOND_CLAIM)).toBe(true);

      // The viewer takes a side on the second one: geo-chat's row comes back a match.
      mocks.claims = [sessionRow(CLAIM_SHARED, FIRST_CLAIM, false), sessionRow(CLAIM_MORE, SECOND_CLAIM, true)];
      rerender(<DebateRematchPageClient sessionId="rematch-1" />);
      await settleTabSwap();

      expect(appearsBefore(FIRST_CLAIM, SECOND_CLAIM)).toBe(true);
    });

    // The hold is on rows already shown, not on the arrangement itself: a claim the opponent
    // answers next has never been under the viewer's cursor, so the sort still places it.
    it('still puts a newly arrived match at the top', async () => {
      twoUnmatchedPositions();
      const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();
      expect(appearsBefore(FIRST_CLAIM, SECOND_CLAIM)).toBe(true);

      mocks.positions = [
        position('profile-remote', CLAIM_FRESH, SPACE_1, false),
        position('profile-remote', CLAIM_SHARED, SPACE_1, false),
        position('profile-remote', CLAIM_MORE, SPACE_1, false),
      ];
      mocks.entities = [
        opponentEntity(CLAIM_FRESH, THIRD_CLAIM),
        sharedEntity(),
        opponentEntity(CLAIM_MORE, SECOND_CLAIM),
      ];
      mocks.claims = [sessionRow(CLAIM_SHARED, FIRST_CLAIM, false), sessionRow(CLAIM_FRESH, THIRD_CLAIM, true)];
      rerender(<DebateRematchPageClient sessionId="rematch-1" />);
      await settleTabSwap();

      expect(appearsBefore(THIRD_CLAIM, FIRST_CLAIM)).toBe(true);
    });

    /**
     * The route keeps this component when it moves from one rematch to another — nothing keys it on
     * the session — so the hold that carries a list through a refetch would otherwise carry it
     * across a session change too. That is the wrong list twice over: the previous rematch's claims
     * on screen while the new one loads, and their order seeding the new session's.
     */
    it('does not carry the previous session’s claims into a new one', async () => {
      twoUnmatchedPositions();
      const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();
      expect(within(positionsTab()).getByText('2')).toBeInTheDocument();

      // The new session's lookups are in flight: nothing of its own to show yet.
      mocks.entityHydrationLoading = true;
      rerender(<DebateRematchPageClient sessionId="rematch-2" />);

      // Asserted on the tab's own count rather than on the claims: the same rows also reach the
      // Claims tab, so searching the document would find them whichever list they came from. And on
      // the skeleton specifically — "not 2" would be satisfied by a confident `0`, which is the
      // wrong answer rather than an absent one.
      expect(screen.getByLabelText('Counting positions')).toBeInTheDocument();
      expect(within(positionsTab()).queryByText('2')).not.toBeInTheDocument();
    });

    /**
     * The window the session change opens: participants come from the session, positions from
     * participants, the claim lookups from positions. While the session is in flight the whole
     * chain is disabled rather than loading, so nothing downstream says "pending" — and the badge
     * would answer `0` for a session it has not read yet. Zero is a claim about the opponent, not a
     * placeholder.
     */
    it('does not answer zero positions for a session it has not read yet', async () => {
      twoUnmatchedPositions();
      const { rerender } = render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();
      expect(within(positionsTab()).getByText('2')).toBeInTheDocument();

      // Only the session is loading, and it has not returned yet — so everything keyed on what it
      // returns is disabled, reporting `isLoading: false` while having nothing to say.
      mocks.sessionLoading = true;
      mocks.session = null;
      rerender(<DebateRematchPageClient sessionId="rematch-2" />);

      expect(screen.getByLabelText('Counting positions')).toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
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
    // Nothing pressable, whatever the control is currently called. With `mocks.claims` empty this
    // claim lists off the session's rejected ids alone, so geo-chat has no row for it and the gate
    // is shut on the position as well as the rejection (GEO-2808) — asserting the enabled state
    // rather than one label keeps this test about the rejection it is named for.
    for (const button of screen.getAllByRole('button', { name: /Request debate|your position/ })) {
      expect(button).toBeDisabled();
    }
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

  // GEO-2798 review. On a graph-filtered source the topic menu is its own query, separate from the
  // catalog — so `tabIsLoading`, which watches the catalog, says "settled" while the facet is still
  // out. Switching back to a source whose page is already cached hits that gap every time, and the
  // menu it hands over there is empty for the same reason an outage's is: reconciling against it
  // reads "your topic no longer exists" and takes the selection permanently.
  it('keeps a picked topic through a gap in the facet, so it is still there when it returns', async () => {
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    selectFilter('Any topic', 'Governance');
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());

    // The catalog stays answered and only the menu goes away, which is the divergence. With no
    // options the menu is not drawn at all, so nothing is assertable *during* the gap — which is
    // also why this went unnoticed: on screen it looks like the filter row simply thinned out.
    mocks.topicFacetSettled = false;
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);
    await waitFor(() => expect(screen.queryByRole('button', { name: /Governance/ })).toBeNull());

    // What the guard is actually for: the *selection* outlived the gap, so the menu coming back
    // restores the chip rather than the viewer finding their filter quietly cleared.
    mocks.topicFacetSettled = true;
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Governance/ })).toBeInTheDocument());
    expect(screen.queryByText('A claim both participants chose')).toBeNull();
  });

  it('matches the topic filter on any of a claim topics, not just the first', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    // The published claim is tagged Governance and Ethics; filtering on the second still matches.
    selectFilter('Any topic', 'Ethics');

    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  // GEO-2653. The space and topic menus were both fed by a ref that only ever accumulated, so a
  // topic stayed on offer after its claims had been filtered away — and picking it could only
  // ever produce an empty list. Spaces still accumulate: the space filter runs in the browsed
  // query, so a menu built from the loaded corpus would strand the viewer in whatever space they
  // picked. The topic filter runs client-side and has no such problem to solve.
  it('drops the topics that have no claims in the selected space', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    // Governance and Ethics belong to the published claim, which lives in the Governance space.
    selectFilter('Any space', 'Crypto');
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.queryByRole('button', { name: /Governance/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ethics/ })).toBeNull();
  });

  // GEO-2798 review. `sessionRowsByClaimId` is keyed on the claim alone, because geo-chat answers
  // per session rather than per space — so a claim tagged in two spaces comes back once, under
  // whichever space it was recorded in. Taking that row whole drew an A-space card under a B-space
  // filter, and a debate requested from it would have published into A.
  it('draws the picked space’s card, not the one geo-chat happened to record', async () => {
    // Tagged in both spaces; geo-chat's session row names Crypto.
    mocks.debateTagClaims = [debateTag(CLAIM_MORE, 'A newly published claim', SPACE_1), debateTag()];
    mocks.entities = [{ ...publishedEntity(), spaces: [SPACE_1, SPACE_2] }];
    mocks.claims = [
      { ...sharedClaim(), claim: { ...sharedClaim().claim, claim_entity_id: CLAIM_MORE, space_id: SPACE_1 } },
    ];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    selectFilter('Any space', 'Governance space');

    await waitFor(() => expect(screen.getByText('A newly published claim')).toBeInTheDocument());
    // The filter chip says "Governance space" too, so the discriminator is the space the card is
    // *not* drawn in: with the row taken whole, this card wore Crypto under a Governance filter.
    expect(screen.queryByText('Crypto')).toBeNull();
  });

  // The report that reopened GEO-2653: the menu was built from the claims paged in so far, so a
  // space whose first page carried no topics looked like a space with none. The facet describes the
  // whole filtered set, so a topic shows up without the viewer scrolling to reach its claim.
  //
  // GEO-2771 made this briefly untestable — the tag was handed over whole, so every topic in the
  // menu came off a row already in hand — and GEO-2798 made it live again by paging the tag. Both
  // halves are covered now: a topic on a listed claim, and a topic the aggregate knows only from a
  // claim on a later page, which is the one that fails if the menu is ever rebuilt from the rows.
  it('offers a topic the facet knows about before its claim has been paged in', async () => {
    mocks.facetOnlyTopics = [{ id: 'topic-unpaged', name: 'Not yet paged', count: 3 }];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(await screen.findByRole('button', { name: /Not yet paged/ })).toBeInTheDocument();
  });

  it('offers a topic carried by any claim on the list', async () => {
    const OTHER = '019fedc2-3333-7000-8000-000000000003';
    mocks.debateTagClaims = [debateTag(), debateTag(OTHER, 'A claim carrying a topic of its own')];
    mocks.entities = [
      sharedEntity(),
      { ...publishedEntity(), relations: [] },
      {
        ...publishedEntity(OTHER, 'A claim carrying a topic of its own'),
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-later', name: 'Later' }, isDeleted: false },
        ],
      },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();
    await waitFor(() => expect(screen.getByText('A newly published claim')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.getByRole('button', { name: /Later/ })).toBeInTheDocument();
  });

  // The same scope the rows are gated by has to reach the query, and it isn't known until the
  // allowlist, the acceptor's editor spaces and the space types have all landed. Asked before
  // then, geo-chat answers about every space it knows: `browsedRows` drops those rows, but a
  // topic facet has no space on it to drop it by, so the menu kept offering them.
  it('offers no topics until the scope it is about to apply is known', async () => {
    mocks.matchmakingClaims = [
      { ...matchmakingClaim(), topics: [] },
      {
        ...matchmakingClaim(CLAIM_SOURCE, 'A claim only the facet knows about'),
        topics: [{ id: 'topic-later', name: 'Later' }],
      },
    ];
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.queryByRole('button', { name: /Later/ })).toBeNull();
  });

  // The held order is released for a new search or space because those change what the server
  // ranked. Topic does now too — it goes out as `topic_id` — so without it in the key the rows
  // that survive the change keep the ranking of the query before it, and the newly ranked list
  // arrives arranged by an order the viewer already left. The Claims tab resets on it already.
  it('takes the new ranking when the topic changes, rather than holding the old one', async () => {
    const FIRST = '019fedc1-1111-7000-8000-000000000001';
    const SECOND = '019fedc1-2222-7000-8000-000000000002';
    const govOnly = (id: string, name: string) => ({
      ...publishedEntity(id, name),
      relations: [
        { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-gov', name: 'Governance' }, isDeleted: false },
      ],
    });
    mocks.debateTagClaims = [
      debateTag(FIRST, 'Ranked first when unfiltered'),
      debateTag(SECOND, 'Ranked first once filtered'),
    ];
    mocks.entities = [
      sharedEntity(),
      govOnly(FIRST, 'Ranked first when unfiltered'),
      govOnly(SECOND, 'Ranked first once filtered'),
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();
    await waitFor(() => expect(appearsBefore('Ranked first when unfiltered', 'Ranked first once filtered')).toBe(true));

    // A re-ranked catalog, which is what a refetch can hand back. The hold on list order has to
    // release when the topic changes, or the new arrangement is drawn in the old one's order.
    mocks.debateTagClaims = [...mocks.debateTagClaims].reverse();
    selectFilter('Any topic', 'Governance');

    await waitFor(() => expect(appearsBefore('Ranked first once filtered', 'Ranked first when unfiltered')).toBe(true));
  });

  // `useSpacesByIds` keeps the previous id set's map instead of blanking every space image on
  // screen, and says so through `isPlaceholderData`. The picker reads it for ids that may not be
  // in it — one just added to the allowlist — and a missing type reads as publishable, so the
  // personal space this gate exists to exclude is exactly what the held map lets through.
  it('waits out a held-over space map rather than trusting what it does not contain', async () => {
    mocks.matchmakingClaims = [
      { ...matchmakingClaim(), topics: [] },
      {
        ...matchmakingClaim(CLAIM_SOURCE, 'A claim only the facet knows about'),
        topics: [{ id: 'topic-later', name: 'Later' }],
      },
    ];
    mocks.spacesHeldOver = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.queryByRole('button', { name: /Later/ })).toBeNull();
  });

  // The browsed query runs on every tab, so its answer must not vouch for rows another tab drew
  // from the graph — least of all under the previous topic selection. Here the opponent's claim
  // carries no topics and has to go the moment one is picked; it is also in the browsed pages,
  // which are held on the selection before this one.
  it('filters the opponent tab on its own topics, not a held browsed answer', async () => {
    mocks.positions = [
      position('profile-local', CLAIM_SHARED, SPACE_1, true),
      position('profile-remote', CLAIM_SHARED, SPACE_1, false),
      position('profile-remote', CLAIM_MORE, SPACE_2, false),
    ];
    mocks.matchmakingClaims = [matchmakingClaim(), matchmakingClaim(CLAIM_SHARED, 'A claim both participants chose')];
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();
    await waitFor(() => expect(screen.getByText('A claim both participants chose')).toBeInTheDocument());

    mocks.scopeHeldOver = true;
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    selectFilter('Any topic', 'Governance');

    // The shared claim carries no topics at all, so nothing about it survives the filter.
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
  });

  // Reported after the facet landed: pick a space, pick a topic it lists, get nothing. The space
  // menu was filtered by the viewer's allowlist but not by whether this pairing can publish a
  // debate there — and `browsedRows` drops every claim in a space it cannot. The server's topic
  // facet knows nothing about that, so it offered all of the space's topics over an empty list.
  it('does not offer a space no debate can be published into', async () => {
    mocks.publishableSpaceIds = new Set([SPACE_1.replace(/-/g, '')]);
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    // SPACE_2 holds the published claim and is on the server's space facet; it is not somewhere
    // this pairing can debate, so picking it could only ever empty the list.
    await waitFor(() => expect(screen.getByRole('button', { name: /Crypto/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Governance/ })).toBeNull();
  });

  // The publishability lookup answers `true` while it is still resolving, so the first render
  // admits every space the facet names. The menu accumulates, so gating only the writes would
  // never take those back — it has to re-check what it already holds.
  it('drops an unpublishable space from the menu once the lookup resolves', async () => {
    mocks.publishableSpaceIds = null;
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Governance/ })).toBeInTheDocument());
    fireEvent.keyDown(document, { key: 'Escape' });

    mocks.publishableSpaceIds = new Set([SPACE_1.replace(/-/g, '')]);
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Governance/ })).toBeNull());
  });

  // The opponent and curated tabs are deliberately not narrowed by the viewer's allowlist, so a
  // claim of theirs in a space the viewer has never joined stays on screen. Its space has to stay
  // in the menu with it, or the row is visible and unfilterable.
  it('keeps a graph-tab space in the menu even when the allowlist excludes it', async () => {
    mocks.spaceAllowlist = new Set([SPACE_2.replace(/-/g, '')]);
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    // The shared claim sits in Crypto, which the allowlist above leaves out.
    expect(screen.getByText('A claim both participants chose')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    await waitFor(() => expect(screen.getByRole('button', { name: /Crypto/ })).toBeInTheDocument());
  });

  // A claim can carry the Debate tag in more than one space, and the catalog returns a row for each.
  //
  // The hub cuts by the picked space and *then* collapses to one row per claim. The picker
  // collapsed first, which pinned the claim to whichever tag row came back first — so filtering to
  // the other space it is tagged in hid it, and the two surfaces answered the same question
  // differently.
  it('keeps a claim tagged in two spaces when the second one is picked', async () => {
    mocks.entities = [sharedEntity(), { ...publishedEntity(), spaces: [SPACE_1, SPACE_2] }];
    // SPACE_1 first, so the collapse would settle on it and the pick below would be the other one.
    mocks.debateTagClaims = [
      {
        claimEntityId: CLAIM_MORE,
        spaceId: SPACE_1,
        name: 'A newly published claim',
        description: null,
        rankingScore: 2,
      },
      {
        claimEntityId: CLAIM_MORE,
        spaceId: SPACE_2,
        name: 'A newly published claim',
        description: null,
        rankingScore: 2,
      },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();
    await waitFor(() => expect(screen.getByText('A newly published claim')).toBeInTheDocument());

    selectFilter('Any space', 'Governance space');

    // The SPACE_1 row going is what says the filter landed — without it this would assert nothing.
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  // A space can be picked while the gates are still passing everything. Once they reject it the
  // menu drops it, and leaving it selected keeps it going out on every request.
  it('lets go of a picked space the settled gates reject', async () => {
    mocks.publishableSpaceIds = null;
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    selectFilter('Any space', 'Governance');
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());

    mocks.publishableSpaceIds = new Set([SPACE_1.replace(/-/g, '')]);
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Any space/ })).toBeInTheDocument());
  });

  it('keeps every space on offer after narrowing to one', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    selectFilter('Any space', 'Crypto');
    await waitFor(() => expect(screen.queryByText('A newly published claim')).toBeNull());

    // The way back. Narrowing the space menu to the loaded corpus would leave only Crypto on it.
    fireEvent.click(screen.getByRole('button', { name: /Crypto/ }));

    expect(screen.getByRole('button', { name: /Governance/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
  });

  // GEO-2696: topics intersect now, and the menu answers "what appears alongside what I picked".
  // The pinned rows are the half geo-chat has no facet for, so the rule is applied here — the two
  // halves of one menu must not disagree about what a second topic does.
  //
  // Built so the old union rule and the new one differ: `Pinned only` shares no claim with Ethics,
  // so under union it stayed on offer and led to an empty list.
  it('offers only the topics that co-occur with the picked one', async () => {
    // The default tagged claim carries Governance and Ethics; this adds a pinned row carrying a
    // topic that appears on nothing else.
    //
    // `publishedEntity` stays in the list. The tagged claim's topics come off its entity now, where
    // the paged row used to carry them itself — so replacing the entities wholesale would take the
    // claim this test compares against with them.
    mocks.entities = [
      {
        ...sharedEntity(),
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-pinned', name: 'Pinned only' }, isDeleted: false },
        ],
      },
      publishedEntity(),
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    expect(screen.getByRole('button', { name: /Pinned only/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ethics/ }));

    // No claim carries both, so adding it could only ever empty the list.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Pinned only/ })).toBeNull());
    // Governance does co-occur with Ethics on the published claim, so it stays addable.
    expect(screen.getByRole('button', { name: /Governance/ })).toBeInTheDocument();
  });

  // Not reachable by picking a topic and then a space it has nothing in: each menu is narrowed by
  // the other, so such a space is never on offer. It is reachable by the corpus moving under a
  // selection that was valid when it was made.
  it('lets go of a selected topic once the space no longer has claims for it', async () => {
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    selectFilter('Any space', 'Governance space');
    selectFilter('Any topic', 'Ethics');
    await waitFor(() => expect(screen.getByRole('button', { name: /Ethics/ })).toBeInTheDocument());

    // The one Ethics claim in that space is answered, published elsewhere, or otherwise leaves the
    // candidate set, so the menu stops naming the topic. Its topics come off the entity now.
    mocks.entities = [
      sharedEntity(),
      {
        ...publishedEntity(),
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-gov', name: 'Governance' }, isDeleted: false },
        ],
      },
    ];
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    // Held, it would filter the list by a chip that is no longer in the menu to unpick.
    await waitFor(() => expect(screen.getByRole('button', { name: /Any topic/ })).toBeInTheDocument());
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

    // The Claims tab searches on the server now, so the term narrows the list a round trip later
    // rather than on the same frame.
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();

    // The opponent's tab is their own positions, fetched by id and filtered here rather than by a
    // query — so the term carries across the switch and narrows that list too, keeping what matches
    // and dropping what does not.
    fireEvent.click(screen.getByRole('button', { name: /Salina’s positions/ }));
    await waitFor(() => expect(screen.queryByText('A claim both participants chose')).toBeNull());
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
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

  // geo-chat now carries readiness on the rematch claims themselves — the rows the picker already
  // asked for. The per-space lookup used to cost one request per space on screen; when the rematch
  // response has the answer, that fan-out must not run at all.
  describe('when the rematch response carries readiness', () => {
    it('skips the per-space lookup when the rematch response carries readiness', async () => {
      mocks.claims = [{ ...sharedClaim(), viewer_debate_ready: true, readiness_disabled_reason: null }];
      // Left empty on purpose: if the card read this the switch would be off.
      mocks.claimReadiness = [];

      render(<DebateRematchPageClient sessionId="rematch-1" />);
      await showOpponentClaims();

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
      await showOpponentClaims();
      const scoped = () => mocks.gatewaySpaceScopes.filter(scope => scope.enabled).at(-1)?.spaceIds;
      // The opponent's tab: their claims' space and both debaters' own.
      expect(scoped()).toEqual([SPACE_1, 'profile-local', 'profile-remote']);

      // The All tab brings its own claims' space with it. The scope follows the tab now, because
      // every source is tab-gated — Featured always was, and GEO-2771 put All on the same footing
      // by replacing the index query, which ran on every tab and so kept its spaces scoped from
      // anywhere. Nothing is lost by the narrowing: a scope exists to have updates pushed for rows
      // on screen, and these rows are not.
      await showAllClaims();
      expect(scoped()).toEqual([SPACE_1, SPACE_2, 'profile-local', 'profile-remote']);
    });
  });

  // geo-chat answers the browsed lookup in id-sorted batches, so a list laid out in response order
  // would reshuffle every time a new page's ids landed in the middle of the sorted range.
  it('keeps the All tab in the order the tag ranked the claims', async () => {
    const FIRST = '019fedb4-3f74-7c61-8d44-5fa08b1e7a01';
    const SECOND = '019fedb4-3f74-7c61-8d44-5fa08b1e7a02';
    const THIRD = '019fedb4-3f74-7c61-8d44-5fa08b1e7a03';
    // Ranked by the graph now rather than paged by geo-chat, and `fetchTaggedClaims` has already
    // sorted before this list sees it — so what is pinned here is that nothing downstream re-sorts,
    // which is the same guarantee the paged version needed.
    mocks.debateTagClaims = [
      debateTag(FIRST, 'Ordered claim one'),
      debateTag(SECOND, 'Ordered claim two'),
      debateTag(THIRD, 'Ordered claim three'),
    ];
    mocks.entities = [
      sharedEntity(),
      publishedEntity(FIRST, 'Ordered claim one'),
      publishedEntity(SECOND, 'Ordered claim two'),
      publishedEntity(THIRD, 'Ordered claim three'),
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

  // GEO-2684. This page's sticky block is its own implementation rather than the hub's shared
  // helper, so nothing else covers it. Its tabs scroll with the page, unlike the panel's, which is
  // why they are pinned alongside the filters — pinning the filters alone would float them over a
  // tab strip sliding past behind them.
  it('pins the tabs, filters and search together, leaving the list to scroll', async () => {
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    const pinned = screen.getByRole('textbox', { name: 'Search claims' }).closest('.sticky');
    expect(pinned).not.toBeNull();
    expect(pinned?.className).toContain('top-0');

    // The tab strip rides in the same block rather than scrolling out from under the controls.
    expect(screen.getByRole('button', { name: 'Claims' }).closest('.sticky')).toBe(pinned);
    expect(screen.getByRole('button', { name: /Any space/ }).closest('.sticky')).toBe(pinned);

    // And the list is outside it, or it would be pinned too and never scroll. Anchored on a claim
    // row: the scroll sentinel used to stand for the list here, and nothing pages any more.
    expect(screen.getByText('A newly published claim').closest('.sticky')).toBeNull();
  });

  // The paging skeleton and the sentinel it followed are both gone (GEO-2771): the tag hands the
  // list over whole, so there is never a next page to wait on. Pinned as their absence, because
  // leaving either behind would page a corpus nothing reads.
  /**
   * GEO-2771. The All source is the graph's Debate tag, not geo-chat's paged corpus.
   *
   * What stays merged into it is the session's own: saved, opponent and curated rows, tag or no
   * tag. Those three are already exceptions to whatever the corpus is, and a rematch that dropped
   * the very claim the pair had been arguing — because nobody had tagged it — is the one failure
   * this list cannot afford.
   */
  it('reads the Debate tag, not Featured’s', async () => {
    // Two tags, two catalogs, two claims. The row's text comes from the *entity*, so each needs one.
    const ONLY_FEATURED = '019fedc3-4444-7000-8000-000000000004';
    mocks.featuredClaims = [debateTag(ONLY_FEATURED, 'Only featured')];
    mocks.debateTagClaims = [debateTag()];
    mocks.entities = [sharedEntity(), publishedEntity(), publishedEntity(ONLY_FEATURED, 'Only featured')];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(mocks.taggedClaimsAskedFor).toContain('55c95b2626f8482cb9739ea99dfde438');
    // `waitFor`, because the picker animates the outgoing list out and jsdom never finishes an
    // exit animation — Featured's row is still mounted on the tick the source changes.
    await waitFor(() => expect(screen.queryByText('Only featured')).toBeNull());
    expect(screen.getByText('A newly published claim')).toBeInTheDocument();
  });

  /**
   * Reported: flipping between Featured and All on first load left the list unchanged, and only
   * started switching after a few goes.
   *
   * `useLastSettled` holds the last settled list while a new one loads, keyed on the session — which
   * does not change when the source does. Before GEO-2771 that was safe, because Featured was the
   * only tagged source and All came from a different variable entirely. Routing both through
   * `taggedClaims` made the hold bridge two genuinely different lists: switch, and the previous
   * source's rows stay up for as long as the new tag takes to fetch. Once both catalogs are cached
   * the fetch is instant, which is why it comes right after a few switches.
   */
  it('does not hold the previous source’s claims while the new tag loads', async () => {
    const ONLY_FEATURED = '019fedc4-5555-7000-8000-000000000005';
    mocks.featuredClaims = [debateTag(ONLY_FEATURED, 'Only featured')];
    mocks.debateTagClaims = [debateTag()];
    mocks.entities = [sharedEntity(), publishedEntity(), publishedEntity(ONLY_FEATURED, 'Only featured')];

    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await waitFor(() => expect(screen.getByText('Only featured')).toBeInTheDocument());

    // The Debate tag has never been fetched, so switching to All starts a load.
    mocks.featuredCatalogLoading = true;
    await showAllClaims();

    await waitFor(() => expect(screen.queryByText('Only featured')).toBeNull());
  });

  // Every other entity lookup on this page is gated by the source that shows its rows. Ungated, this
  // one fanned out graph batches behind the opponent's tab and Recommended, which never list them.
  it('does not hydrate the saved claims on tabs that do not show them', async () => {
    mocks.positions = [];
    // The All tab is the Debate tag and nothing else now (GEO-2798). What the merge used to put
    // there — the session's own claims — has to be tagged to be there, which is what the default
    // corpus says: the claim both debaters answered, and a published one they have not.
    mocks.debateTagClaims = [
      {
        claimEntityId: CLAIM_SHARED,
        spaceId: SPACE_1,
        name: 'A claim both participants chose',
        description: null,
        rankingScore: 2,
      },
      {
        claimEntityId: CLAIM_MORE,
        spaceId: SPACE_2,
        name: 'A newly published claim',
        description: null,
        rankingScore: 1,
      },
    ];
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(mocks.entityIdLookups.flat()).not.toContain(CLAIM_SHARED);
  });

  // GEO-2798 review. This asserted GEO-2771's "nothing pages" behaviour, which stopped being true
  // when the All source moved onto the paged tagged query — and it asked for `claims-scroll-sentinel`
  // where this page renders `rematch-claims-scroll-sentinel`, so it passed whatever the picker did.
  // Both halves now, since either alone reads as correct: a page to fetch, and a last page.
  it('pages the tagged list when the sentinel comes into view', async () => {
    mocks.taggedHasNextPage = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.getByTestId('rematch-claims-scroll-sentinel')).toBeInTheDocument();

    act(() => mocks.observerTriggers.forEach(trigger => trigger()));

    expect(mocks.fetchNextTaggedPage).toHaveBeenCalled();
  });

  it('places no sentinel once the tagged list has no page left', async () => {
    mocks.taggedHasNextPage = false;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showAllClaims();

    expect(screen.queryByTestId('rematch-claims-scroll-sentinel')).toBeNull();
  });

  // GEO-2647. A shared preference used to be pinned to the top of the All tab, which put it ahead
  // of what the viewer had typed and pushed their search results down. Matched claims stay
  // legible without the pin — they are the ones offering "Request debate", and the Matches tab
  // lists them on their own.
  it('leaves a matched claim where the ranking put it rather than pinning it first', async () => {
    const FIRST = '019fedb4-3f74-7c61-8d44-5fa08b1e7a01';
    const SECOND = '019fedb4-3f74-7c61-8d44-5fa08b1e7a02';
    const MATCHED = '019fedb4-3f74-7c61-8d44-5fa08b1e7a03';
    mocks.debateTagClaims = [
      debateTag(FIRST, 'Ordered claim one'),
      debateTag(SECOND, 'Ordered claim two'),
      debateTag(MATCHED, 'Ordered claim three'),
    ];
    mocks.entities = [
      sharedEntity(),
      publishedEntity(FIRST, 'Ordered claim one'),
      publishedEntity(SECOND, 'Ordered claim two'),
      publishedEntity(MATCHED, 'Ordered claim three'),
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
  // requesting a rematch" — so the request waits for geo-chat's copy, not the optimistic one.
  // GEO-2697: it waits as a pending button rather than by hiding, so the wait sits on the control
  // it is blocking instead of beside a button that isn't on screen.
  it('holds the request unpressable until geo-chat has the position it will be validated against', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    // Needed since the Featured tab landed: this asserts the control is *present*, so the claim
    // has to actually render. The version this replaces only checked for absence, which a tab
    // showing no claims satisfies for free.
    await showOpponentClaims();

    const button = screen.getByRole('button', { name: 'Publishing your position…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    // The old separate spinner line is gone: there is one element, not a message beside a gap.
    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
  });

  // Request errors are rendered on the claim card that initiated the mutation.
  it('reports a refused request on the card it was sent from', async () => {
    // Through the press, so the claim the error is keyed to is the one the mutation was actually
    // sent for — `variables` is react-query's record of that call, not a value this test picks.
    mocks.mutate.mockImplementation((variables: { claim_id: string }) => {
      mocks.requestVariables = variables;
    });
    mocks.requestError = new Error('respond to this claim before requesting a rematch');
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const card = screen.getByText('A claim both participants chose').closest('article');
    fireEvent.click(within(card!).getByRole('button', { name: 'Request debate' }));
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(mocks.requestVariables?.claim_id).toBe(CLAIM_SHARED);
    expect(within(card!).getByRole('alert')).toHaveTextContent('respond to this claim before requesting a rematch');
    // One report, not one per surface.
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  // The shared mutation must not expose one claim's error on other cards — and the card it belongs
  // to can leave the list (a tab swap, a search, a filter), so the page keeps the fallback rather
  // than letting the message go down with it.
  it('keeps a refusal on the page when its card is not on screen', async () => {
    mocks.requestError = new Error('respond to this claim before requesting a rematch');
    mocks.requestVariables = { claim_id: 'a-claim-this-tab-does-not-show' };
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const card = screen.getByText('A claim both participants chose').closest('article');
    expect(within(card!).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('respond to this claim before requesting a rematch');
  });

  // GEO-2652. The wait is real — a publish, an index and a notification — so it is named rather
  // than left as an inert control. A disabled button nobody is focused on announces nothing, so the
  // wait is still a `status` for screen readers even though it is no longer drawn as one.
  it('announces what it is waiting for while the position is being confirmed', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByRole('status')).toHaveTextContent('Publishing your position…');
  });

  // The machine's own signal that this is running long, and a different phase: `delayed` is only
  // reached after the publish succeeded, so the label stops claiming to be publishing. It matters
  // more now that it is the button's own text — under GEO-2687 it can sit there for half a minute.
  it('says the wait is running long on the button itself', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    mocks.responseIndexingDelayed = true;
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(screen.getByRole('button', { name: 'Still confirming your position…' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Still confirming your position…');
  });

  // The point of the ticket: one element, not two. Asserted across the transition rather than on
  // a settled render — the same DOM node has to go from pending to pressable, which is what
  // distinguishes this from a spinner disappearing and a button appearing somewhere else.
  it('turns the same button pressable once the position settles', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const pending = screen.getByRole('button', { name: 'Publishing your position…' });
    expect(pending).toBeDisabled();

    // geo-chat catches up with the side already on screen. The graph is deliberately left
    // behind: that is the whole point of the gate moving off it (GEO-2808).
    mocks.optimisticResponses.delete(CLAIM_SHARED);
    mocks.positions = [
      position('profile-local', CLAIM_SHARED, SPACE_1, true),
      position('profile-remote', CLAIM_SHARED, SPACE_1, false),
    ];
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

    const settled = await screen.findByRole('button', { name: 'Request debate' });
    expect(settled).toBeEnabled();
    expect(settled).not.toHaveAttribute('aria-busy');
    expect(screen.queryByRole('status')).toBeNull();
    // Same node — not a second control that replaced the first.
    expect(settled).toBe(pending);
  });

  // And nothing is said before the viewer has taken a side — there is nothing being confirmed, so a
  // spinner would be claiming work that is not happening.
  it('says nothing while the viewer has taken no side', async () => {
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    render(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(screen.queryByText('Publishing your position…')).not.toBeInTheDocument();
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

    const request = await screen.findByRole('button', { name: 'Request debate' });
    expect(request).toBeEnabled();
    fireEvent.click(request);
    expect(mocks.mutate).toHaveBeenCalled();
  });

  /**
   * GEO-2808, and the point of the change. geo-chat is the only thing that can reject an early
   * request, and since #2348 it learns the position while the write is still in flight — so once it
   * agrees there is nothing left to wait for, however far behind the indexer is.
   *
   * The graph is deliberately given *nothing* here: under the old gate this rendered
   * "Publishing your position…" and stayed there for `web.write.entity_response` (p50 9.9s).
   */
  it('opens the request as soon as geo-chat agrees, without waiting for the graph', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    // The indexer has not seen the viewer's side at all.
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const request = await screen.findByRole('button', { name: 'Request debate' });
    expect(request).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Publishing your position…' })).not.toBeInTheDocument();
    fireEvent.click(request);
    expect(mocks.mutate).toHaveBeenCalled();
  });

  /**
   * Reported from the browser after the previous fix: the position stays, but the Request debate
   * button does not.
   *
   * One snapshot, two thresholds. `optimisticResponse` goes undefined outside
   * `reconciling`/`delayed`, while the card treats anything but `idle` as still in flight — so at
   * `indexed` the pill stays lit and the gate sees nothing. With geo-chat not having echoed the
   * write yet, `opposing` collapsed and unmounted the footer under a pill that was still on. The
   * button did not change label; it left.
   */
  it('keeps the request control mounted while the snapshot sits at indexed', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          // geo-chat has not echoed the viewer's write back yet.
          { user_id: 'user-local', position: null, position_label: null },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    // The snapshot has reached `indexed`: the card still treats that as in flight, while
    // `optimisticResponse` has already gone undefined.
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    mocks.responseIndexingStatus = 'indexed';
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const card = screen.getByText('A claim both participants chose').closest('article')!;
    expect(within(card).getByRole('button', { name: /^Agree/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Publishing your position…' })).toBeDisabled();
  });

  /**
   * Reported from the browser: take a position, it says publishing, then the position itself
   * disappears and does not come back — until you answer a second time, which sticks.
   *
   * The card falls back to `readiness.viewer_response` the moment the indexing snapshot clears, and
   * that field was built from `claim.participants` — sides the assembly upstream had already
   * overwritten with the graph's. So the fallback was an indexer that had not caught up, and the
   * viewer's own side vanished for as long as it took (p95 48.6s). The second answer worked because
   * by then the first had landed.
   */
  it('keeps the viewer side on the card when the optimistic answer clears before the graph', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    // The indexer has nothing for the viewer, which is the state that used to blank the pill.
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    const card = () => screen.getByText('A claim both participants chose').closest('article')!;
    expect(within(card()).getByRole('button', { name: /^Agree/ })).toHaveAttribute('aria-pressed', 'true');

    // The mutation settles and the optimistic answer goes away. geo-chat still holds the side.
    mocks.optimisticResponses.delete(CLAIM_SHARED);
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(within(card()).getByRole('button', { name: /^Agree/ })).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * The optimistic answer clears when the mutation settles, and the graph is still ten seconds
   * behind it. A gate that fell back to the graph there shut again and re-announced a publish that
   * had already landed — the control flickered ready → publishing → ready.
   *
   * Asserted across the transition rather than on a settled render: both ends were already green,
   * and it is the middle that was wrong.
   */
  it('stays pressable when the optimistic answer clears before the graph catches up', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    const view = render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(await screen.findByRole('button', { name: 'Request debate' })).toBeEnabled();

    // The mutation settles. geo-chat still holds the side; the indexer still does not.
    mocks.optimisticResponses.delete(CLAIM_SHARED);
    view.rerender(<DebateRematchPageClient sessionId="rematch-1" />);

    expect(await screen.findByRole('button', { name: 'Request debate' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Publishing your position…' })).not.toBeInTheDocument();
  });

  /**
   * geo-chat's rematch row reports the position slightly before its request endpoint will honour a
   * request against it, so a request sent the instant the gate opens can still come back
   * `claim_response_required`. That race is unaddressed here and belongs on the backend — a client
   * timer large enough to cover it is large enough for a reader to feel.
   */
  it('offers the debate once geo-chat agrees', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          { user_id: 'user-local', position: true, position_label: 'Agree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [position('profile-remote', CLAIM_SHARED, SPACE_1, false)];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    expect(await screen.findByRole('button', { name: 'Request debate' })).toBeEnabled();
  });

  // Switching sides leaves geo-chat holding the side you just moved off, which is no more valid to
  // request against than holding none.
  it('withholds the request while a side switch is still publishing', async () => {
    mocks.claims = [
      {
        ...sharedClaim(),
        participants: [
          // geo-chat still holds the side the viewer just moved off.
          { user_id: 'user-local', position: false, position_label: 'Disagree' },
          { user_id: 'user-remote', position: false, position_label: 'Disagree' },
        ],
      },
    ];
    mocks.positions = [
      position('profile-local', CLAIM_SHARED, SPACE_1, false),
      position('profile-remote', CLAIM_SHARED, SPACE_1, false),
    ];
    mocks.optimisticResponses.set(CLAIM_SHARED, 'positive');
    render(<DebateRematchPageClient sessionId="rematch-1" />);
    await showOpponentClaims();

    // Asserted on the disabled state rather than the button's absence: since GEO-2697 the control
    // is on screen throughout, and it is only *named* differently while it waits. Checking the
    // name alone would pass for a button that had become pressable under a new label.
    const button = screen.getByRole('button', { name: 'Publishing your position…' });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Request debate' })).not.toBeInTheDocument();
  });
});

/** The latest arguments the picker handed its browsed-claims page query. */

/** The picker opens on the opponent's positions; most assertions want the unfiltered list. */
/**
 * The tab region cross-fades with `mode="wait"`, so the incoming list is not in the DOM until the
 * outgoing one has finished leaving. Comfortably longer than the 100ms swap.
 */
async function settleTabSwap() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
  });
}

/**
 * Opens the source menu on whichever option it is currently showing.
 *
 * The pending name is one of the labels it answers to: while the default is still being decided
 * the trigger draws a skeleton rather than a source it might not settle on, so it has no source
 * label to be found by -- but it is still a button, and still opens.
 */
function openSourceMenu() {
  const label = (['Related claims', 'Recommended', 'Featured', 'All claims', SOURCE_PENDING] as const).find(
    name => screen.queryAllByRole('button', { name }).length > 0
  );
  fireEvent.click(screen.getAllByRole('button', { name: label! })[0]!);
}

/**
 * Picks a source out of the Claims menu.
 *
 * The last match, not the only one: with the menu open, the source already showing is named twice
 * -- once on the trigger and once on its own option -- so re-picking the current source is
 * ambiguous. Options render after the trigger, so the last match is always the menu item.
 */
async function chooseSource(next: string) {
  openSourceMenu();
  fireEvent.click(screen.getAllByRole('button', { name: next }).at(-1)!);
  await settleTabSwap();
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
  // Multi-select menus stay open across a tick, so the trigger and the row would both answer to
  // the same name until this closes it.
  fireEvent.keyDown(document, { key: 'Escape' });
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

/**
 * The published claim as the hub's claims query lists it: in Governance space, tagged twice.
 *
 * geo-chat replicates topics from the Knowledge Graph as of GEO-2659, so its rows carry them
 * again. They were briefly empty here to match a server that sent `topics: vec![]` on every row,
 * which is what forced the picker to hydrate these rows from the graph itself.
 */
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

/**
 * A claim carrying the Debate tag, which is where the All tab's corpus comes from since GEO-2771.
 *
 * Pairs with `publishedEntity`: same id, same space, and the topics the menus are built from. The
 * tag says *which* claims are on the list; the entity says everything else about them. Both are
 * needed, the way the two lookups behind this list need them.
 */
function debateTag(id = CLAIM_MORE, name = 'A newly published claim', spaceId = SPACE_2, rankingScore = 1) {
  return { claimEntityId: id, spaceId, name, description: null, rankingScore };
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
