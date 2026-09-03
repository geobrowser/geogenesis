import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingClaim } from '../api';
import { ClaimsTab } from './claims-tab';

const mocks = vi.hoisted(() => ({
  promptSignIn: vi.fn(),
  /** Privy's answer; the tab's signed-out paths hang off it. */
  authenticated: true,
  claims: [] as MatchmakingClaim[],
  /** Which tag each enabled render of the graph hook asked for, in order. */
  tagsAskedFor: [] as string[],
  /** One catalog per tag id, as the real hook keys them. */
  taggedClaims: {} as Record<
    string,
    Array<{
      claimEntityId: string;
      spaceId: string;
      name: string;
      description: string | null;
      rankingScore: number | null;
    }>
  >,
  featuredClaims: [] as Array<{
    claimEntityId: string;
    spaceId: string;
    name: string;
    description: string | null;
    rankingScore: number | null;
  }>,
  featuredLoading: false,
  debateClaimGroups: [] as Array<Array<{ spaceId: string; claimIds: string[] }>>,
  /** geo-chat's per-space claim rows, keyed by the space that answered for them. */
  debateClaimRows: [] as Array<Record<string, unknown> & { claim_entity_id: string; space_id: string }>,
  claimEntityLookups: [] as string[][],
  /** A failed per-space geo-chat lookup — reported as a flag, as the real hook does. */
  taggedRowsError: false,
  /** The per-space lookup still in flight, which is where the viewer's own side comes from. */
  taggedRowsLoading: false,
  /** What the tab asked the server to narrow by, in order. */
  taggedFiltersAskedFor: [] as any[],
  /** The same, for the space menu's own count — which must carry every filter but the space one. */
  spaceFacetFiltersAskedFor: [] as any[],
  taggedHasNextPage: false,
  fetchNextTaggedPage: vi.fn(),
  /** Privy can report authenticated before it has rehydrated the user, so this is separable. */
  accountKey: 'account-1' as string | null,
  /** A failed entity hydration, which is where the graph-backed list gets its topics. */
  claimEntitiesError: null as Error | null,
  /** A failed tag catalog — the query that says which claims the list is made of. */
  taggedCatalogError: null as Error | null,
  claimEntities: [] as Array<{
    id: string;
    name: string | null;
    description: string | null;
    spaces: string[];
    values: Array<{ property: { id: string }; spaceId: string; value: string }>;
    relations: Array<{ type: { id: string }; toEntity: { id: string; name: string | null } }>;
  }>,
  lastEnabled: true,
  facetSpaceIds: [] as string[],
  pageSize: null as number | null,
  lastEnabledData: undefined as unknown,
  spaceAllowlist: null as Set<string> | null,
  allowlistLoading: false,
  publishableSpaceIds: null as Set<string> | null,
  publishableLoading: false,
  scopeHeldOver: false,
  sidebarData: null as unknown,
  fetchedSpaceIds: [] as string[][],
  spacesLoading: false,
  lastQuery: null as unknown,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  observed: [] as Element[],
  triggers: [] as (() => void)[],
  /** Scrolls everything observed into view. Null-safe so a test with nothing observed still reads. */
  trigger: () => mocks.triggers.forEach(fire => fire()),
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

vi.mock('~/core/debates/use-claim-space-allowlist', () => ({
  useClaimSpaceAllowlist: () => ({ allowlist: mocks.spaceAllowlist, isLoading: mocks.allowlistLoading }),
}));

vi.mock('~/core/debates/use-debate-publishable-spaces', async importOriginal => ({
  // The real predicate: normalization and the null-means-unknown rule are the parts under test.
  ...(await importOriginal<typeof import('../use-debate-publishable-spaces')>()),
  useDebatePublishableSpaces: () => ({
    publishableSpaceIds: mocks.publishableSpaceIds,
    isLoading: mocks.publishableLoading,
  }),
}));

vi.mock('./hooks', () => ({
  useMatchmakingClaims: (query: unknown, enabled: boolean) => {
    mocks.lastQuery = query;
    mocks.lastEnabled = enabled;
    // `placeholderData: keepPreviousData` outlives `enabled: false`, so a disabled query still
    // hands back the last key's pages — facets included. Modelled, because a mock that returns
    // nothing here makes masking look unnecessary.
    if (!enabled) {
      return {
        data: mocks.lastEnabledData,
        isLoading: false,
        error: null,
        hasNextPage: true,
        isFetchingNextPage: false,
        fetchNextPage: mocks.fetchNextPage,
        refetch: vi.fn(),
      };
    }
    // A scope change is a key change like any other, so `keepPreviousData` answers it with the
    // previous scope's pages while the new request is in flight. Modelled, because that hold is
    // the whole of what the mask downstream is for.
    if (mocks.scopeHeldOver) {
      return {
        data: mocks.lastEnabledData,
        isLoading: false,
        error: null,
        hasNextPage: mocks.hasNextPage,
        isFetchingNextPage: false,
        isPlaceholderData: true,
        fetchNextPage: mocks.fetchNextPage,
        refetch: vi.fn(),
      };
    }
    const { spaceIds, topicIds } = query as { spaceIds?: string[] | null; topicIds?: string[] | null };
    // geo-chat normalizes both sides before comparing; the fixtures carry the dashed spelling while
    // the allowlist carries the dash-less one, so a mock that compared them raw would filter
    // everything out and look like a broken query.
    const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
    const inSpaceFilter = (spaceId: string) => !spaceIds?.length || spaceIds.some(id => norm(id) === norm(spaceId));
    // AND since GEO-2696: a claim has to carry every selected topic, not any of them.
    const inTopicFilter = (topics: { id: string }[]) =>
      !topicIds?.length || topicIds.every(id => topics.some(topic => topic.id === id));
    // `space_id` and `topic_id` are both query parameters as of GEO-2659, so the endpoint
    // returns only the rows that match. Mirrored here, because what the tab renders and what
    // its menus describe both hang off that.
    const inSpace = mocks.claims.filter(entry => inSpaceFilter(entry.claim.space_id));
    const claims = inSpace.filter(entry => inTopicFilter(entry.topics));
    // The space facet is cut by the topic filter and never by its own — spaces are still OR. The
    // topic facet is co-occurrence since GEO-2696: computed over the claims that already carry
    // every selected topic, so what it offers is what appears *alongside* the selection, and the
    // selected topics come back with the current result count. Computed over the whole filtered
    // set rather than the returned page, which is the point of a server-side facet.
    // Counted, not just listed: a facet count is how many of the surviving claims carry the topic,
    // so a selected one comes back at the current result size. Collapsing every option to 1 would
    // let a count-display or count-ordering regression pass against a response the server cannot
    // produce.
    const topicCounts = new Map<string, { id: string; name: string | null; count: number }>();
    for (const entry of claims) {
      for (const topic of entry.topics) {
        const seen = topicCounts.get(topic.id);
        if (seen) seen.count += 1;
        else topicCounts.set(topic.id, { id: topic.id, name: topic.name, count: 1 });
      }
    }
    const topicFacets = [...topicCounts.values()];
    const spacesCarryingTopic = new Set(
      mocks.claims.filter(entry => inTopicFilter(entry.topics)).map(entry => norm(entry.claim.space_id))
    );
    const spaceFacetIds = topicIds?.length
      ? mocks.facetSpaceIds.filter(id => spacesCarryingTopic.has(norm(id)))
      : mocks.facetSpaceIds;
    // Facets are computed over the whole filtered set while the page is a slice of it — the
    // shape that matters here, since the menu must not depend on how far the viewer has scrolled.
    const page = mocks.pageSize === null ? claims : claims.slice(0, mocks.pageSize);
    const data = {
      pages: [
        {
          claims: page,
          next_cursor: null,
          facets: {
            space_ids: spaceFacetIds,
            topics: topicFacets.map(topic => ({ id: topic.id, name: topic.name })),
            // A space's count is its claims that survive the topic filter — never its own, since
            // spaces are OR and picking one must not collapse the menu it came from.
            space_facets: spaceFacetIds.map(id => ({
              id,
              name: null,
              count: mocks.claims.filter(
                entry => norm(entry.claim.space_id) === norm(id) && inTopicFilter(entry.topics)
              ).length,
            })),
            topic_facets: topicFacets,
          },
        },
      ],
    };
    mocks.lastEnabledData = data;
    return {
      data,
      isLoading: false,
      error: null,
      hasNextPage: mocks.hasNextPage || page.length < claims.length,
      isFetchingNextPage: false,
      isPlaceholderData: false,
      fetchNextPage: mocks.fetchNextPage,
      refetch: vi.fn(),
    };
  },
  // Each card's end slot asks whether there is a debate to be had on its claim. One shared query at
  // runtime; here it only has to answer "no", so the slot stays empty and the tab's own assertions
  // are about the tab.
  useMatchmakingMatches: () => ({ data: { matches: [] }, isLoading: false, error: null }),
  useDebateRequests: () => ({ data: { inbound: [], outbound: null }, isLoading: false, error: null }),
  useCreateDebateRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

// The cards report their own responses now, which is a graph read per card and not what this tab's
// tests are about.
vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({
    positive: 0,
    negative: 0,
    total: 0,
    percent: null,
    meetsFloor: false,
    isControversial: false,
    isLoading: true,
    isViewerResponseLoading: true,
    hasCounts: false,
    viewerDirection: null,
    viewerSpaceId: null,
  }),
}));

// The readiness switch rides the shared queue-backed machine, which reaches for geo-chat auth and
// the join/leave mutations rather than a one-shot readiness mutation.
vi.mock('../hooks', () => ({
  // Mirrors the real key factory: the readiness machine refetches these families before it
  // retries a `claim_response_required`.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated, accountKey: mocks.accountKey }),
  // Read by the end slot's match lookup; the tab's tests do not exercise availability.
  useDebateActivity: () => ({ data: null, isLoading: false, error: null }),
  useJoinDebateQueue: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  // Featured rows are hydrated by the per-space debate-claims lookup. Records what it was asked
  // for so the suites can assert the tab only asks about spaces it may show.
  useDebateClaimsBySpaces: (groups: Array<{ spaceId: string; claimIds: string[] }>) => {
    mocks.debateClaimGroups.push(groups);
    // Answers per space, as the real hook does: it asks geo-chat once per group and flattens the
    // results, so a claim tagged in two spaces comes back twice with each space's own row.
    const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
    const claims = mocks.debateClaimRows.filter(row =>
      groups.some(
        group =>
          norm(group.spaceId) === norm(row.space_id) &&
          group.claimIds.some(id => norm(id) === norm(row.claim_entity_id))
      )
    );
    // Answerless while loading, as react-query is on a cold key.
    return {
      claims: mocks.taggedRowsLoading ? [] : claims,
      isLoading: mocks.taggedRowsLoading,
      isError: mocks.taggedRowsError,
    };
  },
}));

/**
 * The tag query, which now pages and filters on the server (GEO-2798).
 *
 * The mock does the join the server does: the catalog fixtures still say which claims carry the
 * tag and in which space, `mocks.claimEntities` still says what each one contains, and this puts
 * them together into the row shape the tab reads. Every case written against those two fixtures
 * keeps its meaning, and the ones about filtering keep it too — the filters are applied here,
 * because a mock that ignored them would let the tab claim to filter while doing nothing.
 */
function taggedRowsFor(tagId: string) {
  const FEATURED = 'ec3086a54ddf43d8aaefd6cc6e1b0556';
  const catalog = mocks.taggedClaims[tagId] ?? (tagId === FEATURED ? mocks.featuredClaims : []);

  // One row per claim carrying every space it is tagged in — a claim tagged twice is two catalog
  // entries in these fixtures and one row out of the graph.
  const byClaim = new Map<string, { entity: any; tagSpaceIds: string[]; rankingScore: number | null }>();
  for (const entry of catalog) {
    const existing = byClaim.get(entry.claimEntityId);
    if (existing) {
      existing.tagSpaceIds.push(entry.spaceId);
      continue;
    }
    byClaim.set(entry.claimEntityId, {
      entity: mocks.claimEntities.find(candidate => candidate.id === entry.claimEntityId) ?? {
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
  const spaces: string[] | null = narrowBySpace && filters.spaceIds.length > 0 ? filters.spaceIds : filters.eligibleSpaceIds;
  const kept = rows.filter(row => {
    const name = (row.entity.name ?? '') as string;
    if (filters.search && !name.toLowerCase().includes(filters.search.toLowerCase())) return false;
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

vi.mock('../tagged-claims', async importOriginal => ({
  ...(await importOriginal<typeof import('../tagged-claims')>()),
  useTaggedClaims: (tagId: string, filters: any, enabled: boolean) => {
    if (enabled) mocks.tagsAskedFor.push(tagId);
    if (enabled) mocks.taggedFiltersAskedFor.push(filters);
    // Answerless when it failed, as react-query is.
    const claims = enabled && !mocks.taggedCatalogError ? applyServerFilters(taggedRowsFor(tagId), filters) : [];
    return {
      claims,
      isLoading: enabled && mocks.featuredLoading,
      error: mocks.taggedCatalogError,
      hasNextPage: mocks.taggedHasNextPage,
      fetchNextPage: mocks.fetchNextTaggedPage,
      isFetchingNextPage: false,
      refetch: vi.fn(),
    };
  },
  useTaggedTopicFacet: (tagId: string, filters: any, enabled: boolean) => {
    // Co-occurrence: counted over the claims that already carry every picked topic, as the server
    // does, so the menu offers what appears *alongside* the selection.
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
      topics: [...counts.values()],
      isLoading: enabled && mocks.featuredLoading,
      countsSettled: enabled && !mocks.featuredLoading && !mocks.taggedCatalogError,
      error: mocks.taggedCatalogError,
    };
  },
  useTaggedSpaceFacet: (tagId: string, filters: any, enabled: boolean) => {
    if (enabled) mocks.spaceFacetFiltersAskedFor.push(filters);
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
      isLoading: enabled && mocks.featuredLoading,
      settled: enabled && !mocks.featuredLoading && !mocks.taggedCatalogError,
      error: mocks.taggedCatalogError,
    };
  },
}));

// The cards report their own responses now, which is a graph read per card and not what this tab's
// tests are about.
vi.mock('~/core/claims/browse/claim-response-summary', () => ({
  useClaimResponseSummary: () => ({
    positive: 0,
    negative: 0,
    total: 0,
    percent: null,
    meetsFloor: false,
    isControversial: false,
    isLoading: true,
    isViewerResponseLoading: true,
    hasCounts: false,
    viewerDirection: null,
    viewerSpaceId: null,
  }),
}));

// The readiness switch rides the shared queue-backed machine, which reaches for geo-chat auth and
// the join/leave mutations rather than a one-shot readiness mutation.
vi.mock('../hooks', () => ({
  // Mirrors the real key factory: the readiness machine refetches these families before it
  // retries a `claim_response_required`.
  debateQueryKeys: {
    matchmakingClaimsRoot: (accountKey: string | null) =>
      ['debates', 'account', accountKey, 'matchmaking-claims'] as const,
    matches: (accountKey: string | null) => ['debates', 'account', accountKey, 'matches'] as const,
    rematchRoot: (accountKey: string | null) => ['debates', 'account', accountKey, 'rematch'] as const,
  },
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated, accountKey: mocks.accountKey }),
  // Read by the end slot's match lookup; the tab's tests do not exercise availability.
  useDebateActivity: () => ({ data: null, isLoading: false, error: null }),
  useJoinDebateQueue: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  // Featured rows are hydrated by the per-space debate-claims lookup. Records what it was asked
  // for so the suites can assert the tab only asks about spaces it may show.
  useDebateClaimsBySpaces: (groups: Array<{ spaceId: string; claimIds: string[] }>) => {
    mocks.debateClaimGroups.push(groups);
    // Answers per space, as the real hook does: it asks geo-chat once per group and flattens the
    // results, so a claim tagged in two spaces comes back twice with each space's own row.
    const norm = (id: string) => id.replace(/-/g, '').toLowerCase();
    const claims = mocks.debateClaimRows.filter(row =>
      groups.some(
        group =>
          norm(group.spaceId) === norm(row.space_id) &&
          group.claimIds.some(id => norm(id) === norm(row.claim_entity_id))
      )
    );
    // Answerless while loading, as react-query is on a cold key.
    return {
      claims: mocks.taggedRowsLoading ? [] : claims,
      isLoading: mocks.taggedRowsLoading,
      isError: mocks.taggedRowsError,
    };
  },
}));

// Featured reads topics and the "Is factual" value through the picker's narrow projection.
vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => {
    mocks.claimEntityLookups.push(ids);
    // Answerless when it failed, as react-query is: a query that errored has no data. Handing back
    // fixtures alongside an error makes the states that exist to survive a failure untestable.
    return {
      entities: mocks.claimEntitiesError ? [] : mocks.claimEntities.filter(entity => ids.includes(entity.id)),
      isLoading: false,
      error: mocks.claimEntitiesError,
    };
  },
}));

vi.mock('~/core/hooks/use-entity-vote', () => ({
  useEntityResponse: () => ({ submitResponse: vi.fn(), isConnected: true, personalSpaceId: 'personal-space' }),
  useEntityResponseIndexingSnapshot: () => ({ status: 'idle', pending: null, runId: null }),
  useResetEntityResponseIndexingSnapshot: () => vi.fn(),
}));

// useSpaceLabels reads the browse sidebar's cache before falling back to the query below. These
// suites render without a QueryClientProvider, so the read is stubbed; `sidebarData` lets a test
// put rows in it.
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useBrowseSidebarQuerySource: () => ({
    personalSpaceId: null,
    walletAddress: undefined,
    keyInput: null,
    isLoading: false,
  }),
  useCachedBrowseSidebarData: () => mocks.sidebarData,
}));

// Deliberately answers nothing: a name that shows up on screen came from the sidebar cache above.
vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: (spaceIds: string[]) => {
    mocks.fetchedSpaceIds.push(spaceIds);
    return { spaces: [], spacesById: new Map(), isLoading: mocks.spacesLoading };
  },
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [] }),
}));

// `usePrivySignIn` reaches for Privy's context, which these suites do not stand up. The signed-out
// paths assert that it is *called*, so the stub is shared through `mocks.promptSignIn`.
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.promptSignIn,
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactElement) => <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>;
  const view = rtlRender(wrap(ui));
  // Testing Library's own `rerender` replaces the whole tree with what it is handed, which drops
  // the provider — so a re-render of the same component crashes on a missing QueryClient rather
  // than showing what changed. Re-wrapped here so a test can move the world and render again.
  // The client comes back too, so a test can watch what a retry asks it to refetch.
  return { ...view, queryClient, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
}

const SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c566';
const OTHER_SPACE_ID = '019fedae-72b6-7ab2-927a-df044d57c599';

/** What `BrowseSidebar` has already loaded by the time the debates panel opens. */
function sidebarData() {
  return {
    featured: [{ id: SPACE_ID, name: 'Crypto', image: null }],
    editorOf: [],
    memberOf: [],
    documentationImage: null,
    personalSpaceId: null,
  };
}

function claim(
  entityId: string,
  text: string,
  viewerResponded: boolean,
  debateReady = false,
  spaceId = SPACE_ID,
  topics: { id: string; name: string }[] = []
): MatchmakingClaim {
  return {
    claim: { id: `row-${entityId}`, space_id: spaceId, claim_entity_id: entityId, claim: text, description: null },
    topics,
    response_kind: 'stance',
    viewer_position: viewerResponded ? true : null,
    viewer_response: viewerResponded ? { position: true, position_label: 'Agree' } : null,
    viewer_debate_ready: debateReady,
    readiness_disabled_reason: null,
    positions: [],
    score: 0,
    active_debate: false,
  };
}

/** Picks an option out of the position dropdown, which opens on its current label. */
function chooseFilter(current: string, next: string) {
  fireEvent.click(screen.getByRole('button', { name: current }));
  fireEvent.click(screen.getByRole('button', { name: next }));
}

/**
 * The tab opens on Featured, so every case about geo-chat's paged list has to ask for it. Kept as a
 * helper rather than folded into `render` so the default stays visible in the cases that assert it.
 *
 * Awaits the swap: the region cross-fades with `mode="wait"`, so the list is not in the DOM until
 * the state it replaced has finished leaving.
 */
/**
 * Switches to a list geo-chat's index answers.
 *
 * "All claims" is no longer one of those — GEO-2771 moved it to the graph's Debate tag — so the
 * paged behaviours these tests cover (the cursor, the scroll sentinel, the server facets, the space
 * allowlist over returned rows) are reachable through the viewer-relative filters, which stayed.
 * The mocked index ignores `filter`, so which of the two is picked changes nothing it returns.
 */
async function showIndexedClaims() {
  chooseFilter('Featured', 'My positions');
  await waitFor(() => expect(screen.queryByText('No claims have been featured yet.')).toBeNull());
}

/** Switches to the Debate-tagged list, which the graph answers. */
async function showAllClaims() {
  chooseFilter('Featured', 'All claims');
  await waitFor(() => expect(screen.queryByText('No claims have been featured yet.')).toBeNull());
}

const MINE = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';
const THEIRS = '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520';

beforeEach(() => {
  // Not a mock fn, so `resetAllMocks` does not restore it.
  mocks.authenticated = true;
  mocks.accountKey = 'account-1' as string | null;
  mocks.taggedRowsError = false;
  mocks.taggedRowsLoading = false;
  mocks.claimEntitiesError = null;
  mocks.taggedCatalogError = null;
  mocks.taggedFiltersAskedFor = [];
  mocks.spaceFacetFiltersAskedFor = [];
  mocks.taggedHasNextPage = false;
  mocks.fetchNextTaggedPage = vi.fn();
  mocks.hasNextPage = false;
  mocks.facetSpaceIds = [];
  mocks.featuredClaims = [];
  mocks.tagsAskedFor = [];
  mocks.taggedClaims = {};
  mocks.featuredLoading = false;
  mocks.debateClaimGroups = [];
  mocks.debateClaimRows = [];
  mocks.claimEntityLookups = [];
  mocks.claimEntities = [];
  mocks.pageSize = null;
  mocks.lastEnabledData = undefined;
  mocks.scopeHeldOver = false;
  // Null + settled is "the allowlist lookup came back with nothing", which falls through to an
  // unfiltered list — what every pre-existing case here runs under.
  mocks.spaceAllowlist = null;
  mocks.allowlistLoading = false;
  // Same shape, same reason: settled-with-no-answer does not filter, which is what every
  // pre-existing case here runs under.
  mocks.publishableSpaceIds = null;
  mocks.publishableLoading = false;
  mocks.sidebarData = null;
  mocks.fetchedSpaceIds = [];
  mocks.spacesLoading = false;
  mocks.fetchNextPage.mockReset();
  mocks.observed = [];
  // Cleared with them: a trigger left over from the previous test still closes over that test's
  // observer, so a case where nothing is observed could "scroll" a sentinel that isn't there.
  mocks.triggers = [];
  // Records everything observed and hands back a way to say it all scrolled into view.
  //
  // Every observer, not just the last one to be built. The sentinel is no longer the only thing
  // watching: each claim card now observes itself, to hold its response reads until it is near the
  // viewport. A stub that kept one trigger would hand back the last card's, and the sentinel — the
  // one thing these tests scroll — would never fire.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        mocks.observed.push(element);
        mocks.triggers.push(() =>
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

  mocks.claims = [
    claim(MINE, 'Chips are better than fries', true),
    claim(THEIRS, 'Bitcoin will never top $250K', false),
  ];

  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

describe('ClaimsTab', () => {
  // GEO-2684. The list pages forever, so controls left in the scrolling body meant scrolling back
  // to the start to change a filter. jsdom has no layout, so what's assertable is that they sit in
  // a pinned container rather than in the body that scrolls.
  it('pins search and the filters above the list', async () => {
    // The sentinel only exists while a page is outstanding, and it is the handle for "this part
    // scrolls".
    mocks.hasNextPage = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    const pinned = screen.getByLabelText('Search claims').closest('.sticky');
    expect(pinned).not.toBeNull();
    expect(pinned?.className).toContain('top-0');

    // Both controls ride in the same pinned block. Two stickies would each claim `top-0` and
    // overlap, which is why the filters aren't pinned separately.
    expect(screen.getByRole('button', { name: /My positions/ }).closest('.sticky')).toBe(pinned);

    // And the list itself is not inside it, or it would be pinned too and never scroll.
    expect(screen.getByTestId('claims-scroll-sentinel').closest('.sticky')).toBeNull();
  });

  // Pages arrive by reaching the end of the list, not by pressing anything.
  it('fetches the next page when the end of the list scrolls into view', async () => {
    mocks.hasNextPage = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();

    act(() => mocks.trigger());

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  it('places no sentinel once the last page has arrived', async () => {
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();
  });

  // The tab is one list in the server's order. Leading with the claims you'd already answered
  // re-ranked it by something the Position filter in the dropdown already covers, and it moved a
  // card between two sections the moment you took a side.
  it('renders one unsectioned list in the order the server returned', async () => {
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByRole('heading', { name: 'My positions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All claims' })).not.toBeInTheDocument();

    // `claim(MINE, …)` is answered and `claim(THEIRS, …)` is not; the answered one no longer jumps
    // the queue, so the server's order stands.
    const first = screen.getByText('Chips are better than fries');
    const second = screen.getByText('Bitcoin will never top $250K');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves an answered claim where the server put it rather than promoting it', async () => {
    mocks.claims = [
      claim(THEIRS, 'Bitcoin will never top $250K', false),
      claim(MINE, 'Chips are better than fries', true),
    ];
    render(<ClaimsTab />);
    await showIndexedClaims();

    const unanswered = screen.getByText('Bitcoin will never top $250K');
    const answered = screen.getByText('Chips are better than fries');
    expect(unanswered.compareDocumentPosition(answered) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // "My positions" means every claim the viewer holds a response for, whether or not they are
  // currently open to debating it — the toggle is a separate answer to a separate question. The
  // reported bug drops the toggled-off ones, and it is geo-chat's join to fix; this pins the client
  // half, so nobody closes the gap here by filtering the list a second time on the way in.
  it('keeps positions the viewer is not currently open to debating', async () => {
    const OFF = '019fedb3-2e63-7b50-9c33-4e9f7a0d6631';
    mocks.claims = [
      claim(MINE, 'Chips are better than fries', true, true),
      claim(OFF, 'Rust belongs in the kernel', true, false),
    ];
    render(<ClaimsTab />);
    // The helper already lands here, which is the filter this is about.
    await showIndexedClaims();

    expect(mocks.lastQuery).toMatchObject({ filter: 'mine' });
    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
    expect(screen.getByText('Rust belongs in the kernel')).toBeInTheDocument();
  });

  // Featured spaces plus the viewer's own; `/matchmaking/claims` takes a single space_id, so the
  // list has to be narrowed here.
  it('shows only claims from spaces the viewer is allowed to see', async () => {
    mocks.claims = [
      claim(MINE, 'Chips are better than fries', true),
      claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID),
    ];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
    expect(screen.queryByText('Bitcoin will never top $250K')).not.toBeInTheDocument();
  });

  // GEO-2649. A separate question from the allowlist: the viewer may be perfectly entitled to see
  // the space, but if the acceptor isn't an editor of it the debate fails on-chain at the very end,
  // so offering the claim is offering a dead end.
  it('shows only claims from spaces a debate could be published in', async () => {
    mocks.claims = [
      claim(MINE, 'Chips are better than fries', true),
      claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID),
    ];
    mocks.publishableSpaceIds = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
    expect(screen.queryByText('Bitcoin will never top $250K')).not.toBeInTheDocument();
  });

  // Both gates apply, and a claim has to clear both. Allowed to see it, but nothing can be
  // published there.
  it('hides an allowed space that no debate can be published in', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.publishableSpaceIds = new Set([OTHER_SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByText('Chips are better than fries')).toBeNull();
  });

  it('keeps the space filter to spaces a debate could be published in', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.publishableSpaceIds = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    // Names resolve through useSpacesByIds, mocked empty here, so each offered space reads "Space".
    expect(screen.getAllByRole('button', { name: /Space/ })).toHaveLength(1);
  });

  // Same trimming-under-the-viewer problem the allowlist has, and the same answer: `null` does not
  // filter, so without waiting the tab lists everything and then pulls claims back out.
  it('shows nothing until the publishable lookup settles', async () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.publishableSpaceIds = null;
    mocks.publishableLoading = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByText('Bitcoin will never top $250K')).toBeNull();
  });

  // And the other half of that rule: a lookup that settled without an answer must not empty the
  // tab. No acceptor is configured locally at all, so this is the everyday path.
  it('falls through to the unfiltered list when the publishable lookup comes back empty', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.publishableSpaceIds = null;
    mocks.publishableLoading = false;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // The allowlist is keyed on normalized ids; a claim row carries the hyphen-less form.
  it('matches allowed spaces across id formats', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '').toLowerCase()]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // The reported bug: the menu opened on every space the server faceted, then trimmed itself to
  // the viewer's own a moment later — spaces appearing and vanishing, and offering picks that were
  // never theirs to make.
  it('shows nothing until the allowlist settles, rather than trimming under the viewer', async () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByText('Bitcoin will never top $250K')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    expect(screen.queryByLabelText('Loading space name')).toBeNull();
    expect(screen.queryByText('Space')).toBeNull();
  });

  // The tab shows a four-row skeleton while the allowlist resolves, so a sentinel below it sits in
  // view and reads "the viewer reached the end" off a list that isn't rendered.
  it('does not page the corpus while the allowlist is still resolving', async () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = true;
    mocks.hasNextPage = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();

    act(() => mocks.trigger());

    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  // A lookup that settles without an answer must not leave the panel permanently empty — too wide
  // a list beats one that never fills.
  it('falls through to the unfiltered list when the allowlist lookup comes back empty', async () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = false;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('Bitcoin will never top $250K')).toBeInTheDocument();
  });

  // The space menu comes from the server's facets, which span every space the query touched.
  it('offers only allowed spaces in the space filter', async () => {
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    // Names resolve through useSpacesByIds, mocked empty here, so every allowed space reads "Space".
    expect(screen.getAllByRole('button', { name: /Space/ })).toHaveLength(1);
  });

  // The allowlist runs over the loaded page, so a page can arrive with nothing left in it. With
  // the sentinel rendered only alongside results the list would stop there and report "no claims"
  // while the corpus still held matches.
  it('keeps asking for pages when the allowlist empties the one it has', async () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.hasNextPage = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    // Nothing is narrowing the list — the viewer simply holds no positions — so it says that rather
    // than blaming filters they never set.
    expect(screen.getByText('You haven’t taken a position on any claims yet.')).toBeInTheDocument();
    expect(screen.getByTestId('claims-scroll-sentinel')).toBeInTheDocument();

    act(() => mocks.trigger());

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  // The reported bug: the space menu opened as a column of "Space" placeholders while it re-fetched
  // names the browse sidebar had been showing since first paint.
  it('names the space options from the sidebar rows without fetching them again', async () => {
    mocks.facetSpaceIds = [SPACE_ID];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    expect(screen.getByRole('button', { name: /Crypto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Space$/ })).toBeNull();
    // Not one id reached the knowledge graph — neither from the menu nor from the cards below it.
    expect(mocks.fetchedSpaceIds.flat()).toEqual([]);
  });

  // The same placeholder showed on every card in the list, from the same missing names.
  it('names each card space from the sidebar rows too', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('Crypto')).toBeInTheDocument();
  });

  // On a cold load the sidebar hasn't cached anything yet either. A column of identical "Space"
  // rows reads as a list of real, indistinguishable choices; skeletons read as names on their way.
  it('draws unresolved space options as skeletons rather than a column of "Space"', async () => {
    mocks.claims = [];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spacesLoading = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    expect(screen.getAllByLabelText('Loading space name')).toHaveLength(2);
    expect(screen.queryByText('Space')).toBeNull();
  });

  // Picking a space nobody can name yet filters the list to something the viewer can't read back.
  it('does not let an unresolved space be picked', async () => {
    mocks.claims = [];
    mocks.facetSpaceIds = [SPACE_ID];
    mocks.spacesLoading = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    const option = screen.getByLabelText('Loading space name').closest('button');
    expect(option).toBeDisabled();

    fireEvent.click(option!);

    expect(mocks.lastQuery).toMatchObject({ spaceIds: null });
  });

  // A settled lookup that still can't name the space really does leave "Space" as the best label
  // there is — the skeleton must not become the permanent state.
  it('falls back to the plain label once the lookup settles with no name', async () => {
    mocks.claims = [];
    mocks.facetSpaceIds = [SPACE_ID];
    mocks.spacesLoading = false;
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    expect(screen.queryByLabelText('Loading space name')).toBeNull();
    // The option's accessible name picks up its avatar initial, so it reads "SSpace".
    expect(screen.getByRole('button', { name: /Space/ })).toBeEnabled();
  });

  // The same placeholder ran down every card in the list.
  it('draws an unresolved card space as a skeleton', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spacesLoading = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getAllByLabelText('Loading space name').length).toBeGreaterThan(0);
    expect(screen.queryByText('Space')).toBeNull();
  });

  // A space the sidebar has no row for still has to resolve the old way.
  it('still fetches a space the sidebar has never heard of', async () => {
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect([...new Set(mocks.fetchedSpaceIds.flat())]).toEqual([OTHER_SPACE_ID]);
  });
});

// Search, the space filter and the position filter all run server-side, so what this tab puts in
// the query is the whole feature — a mock that ignores it cannot catch a dropped filter.
it('asks the server for the filter the viewer picked', async () => {
  render(<ClaimsTab />);
  await showIndexedClaims();

  expect(mocks.lastQuery).toMatchObject({ filter: 'mine', spaceIds: null });

  fireEvent.click(screen.getByRole('button', { name: 'My positions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Debate now' }));

  expect(mocks.lastQuery).toMatchObject({ filter: 'debate_now' });
});

/**
 * GEO-2771. "All claims" is the graph's Debate tag now, not geo-chat's corpus.
 *
 * The index has no notion of the tag, and replicating one into it — the way GEO-2659 had to for
 * topics — buys nothing when the graph already knows: 312 tagged claims against 313,722. So the
 * graph answers *which* claims and geo-chat answers about them, which is what Featured has always
 * done and is now the whole of the difference between these two lists and the other two.
 */
describe('All claims reads the Debate tag', () => {
  const DEBATE_TAG = '55c95b2626f8482cb9739ea99dfde438';
  const FEATURED_TAG = 'ec3086a54ddf43d8aaefd6cc6e1b0556';

  it('asks the graph for the Debate tag rather than the index', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);
    await showAllClaims();

    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(mocks.tagsAskedFor).toContain(DEBATE_TAG);
  });

  // The catalog says which claims; two lookups behind it say everything about them. Reporting only
  // the catalog's failure leaves the other two rendering an outage as content — a claim with no
  // topics, or with no position and no readiness — which reads as a settled answer.
  it('keeps listing claims when the hydration behind their topics fails', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    mocks.claimEntitiesError = new Error('hydration exploded');
    render(<ClaimsTab />);
    await showAllClaims();

    expect(await screen.findByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).toBeNull();
  });

  // `taggedRows` asks geo-chat once per space in batches of fifty. Across a few hundred tagged
  // claims that is a lot of requests, and treating any one failure as fatal blanked a list that
  // renders perfectly well without it — found in a browser, not by these tests, which is why the
  // pair above now assert the list survives rather than that the tab reports an error.
  it('keeps listing claims when the per-space details lookup fails', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    mocks.taggedRowsError = true;
    render(<ClaimsTab />);
    await showAllClaims();

    expect(await screen.findByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).toBeNull();
  });

  // The card is still held, which is where a missing lookup is actually answered: without the
  // vocabulary and the viewer's own side, a press would publish the wrong thing.
  it('holds the response controls while those lookups are unanswered', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    mocks.taggedRowsError = true;
    mocks.claimEntities = [];
    render(<ClaimsTab />);
    await showAllClaims();

    const agree = await screen.findByRole('button', { name: /^Agree/ });
    expect(agree).toBeDisabled();
  });

  // `fetchDebateClaims` sends `auth: 'optional'` with no account, so a request made before Privy
  // has rehydrated the user *succeeds* and comes back with every viewer field null — and that
  // answer used to be cached under the key the signed-in fetch would later read. The card then drew
  // its avatars and its split while reporting no response from the viewer.
  it('asks geo-chat nothing until it knows whose responses it is asking about', async () => {
    mocks.accountKey = null;
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);
    await showAllClaims();

    // The claims still list — the catalog is the graph's, and it needs no account.
    expect(await screen.findByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(mocks.debateClaimGroups.flat()).toEqual([]);
  });

  it('asks once the account is known', async () => {
    // The guard: without it, never asking would satisfy the case above just as well.
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);
    await showAllClaims();

    await waitFor(() => expect(mocks.debateClaimGroups.flat().length).toBeGreaterThan(0));
  });

  // The tag rows are per space, so a claim tagged in two comes back twice and the collapse to one
  // row has to happen *after* the picked-space cut. Collapsing first pins the claim to whichever
  // row arrived first, and filtering to the other space it is tagged in hides it.
  //
  // The hub has always had this the right way round — `taggedMatching` filters and then collapses —
  // but nothing held it there, and the picker had the same code the wrong way round until GEO-2771.
  it('keeps a claim tagged in two spaces when the second one is picked', async () => {
    // Named through the sidebar cache, which is where the menu's labels come from — otherwise both
    // options read "Space" and the pick below could not say which one it made.
    mocks.sidebarData = {
      featured: [
        { id: SPACE_ID, name: 'Crypto', image: null },
        { id: OTHER_SPACE_ID, name: 'Governance', image: null },
      ],
      editorOf: [],
      memberOf: [],
      documentationImage: null,
      personalSpaceId: null,
    };
    // SPACE_ID first, so a collapse ahead of the cut would settle on it and lose the pick below.
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Tagged in two spaces', SPACE_ID),
      featuredClaim(FEATURED_A, 'Tagged in two spaces', OTHER_SPACE_ID),
      featuredClaim(FEATURED_B, 'Only in the first space', SPACE_ID),
    ];
    render(<ClaimsTab />);
    await showAllClaims();
    await waitFor(() => expect(screen.getByText('Tagged in two spaces')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    // Unanchored: the option's accessible name carries the space's avatar initial and its count,
    // so it reads "GGovernance1" rather than the label alone.
    fireEvent.click(screen.getByRole('button', { name: /Governance/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    // The SPACE_ID-only claim going is what says the filter landed — without it this asserts nothing.
    await waitFor(() => expect(screen.queryByText('Only in the first space')).toBeNull());
    expect(screen.getByText('Tagged in two spaces')).toBeInTheDocument();
  });

  // Same rule, one query further up. A failed *catalog* leaves the list with no claims, so the
  // entity lookup has nothing to ask about and sits idle — neither loading nor failed. The menu is
  // then empty with nothing to say why, and calling that settled costs the viewer their selection
  // for good: the outage clears, the claims come back, the chips do not.
  it('keeps a picked topic when the catalog behind the list fails', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } }],
      },
      // Carries no topic, so it is present exactly when nothing is selected — which is what makes
      // the selection observable in the list rather than in the trigger's label.
      {
        id: FEATURED_B,
        name: 'Cities should ban cars downtown',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [],
      },
    ];
    const view = render(<ClaimsTab />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    // The filter has actually landed once the untopiced claim is gone — not merely once the trigger
    // has changed, which happens a debounce earlier and would leave the assertions below racing it.
    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());

    mocks.taggedCatalogError = new Error('catalog exploded');
    view.rerender(<ClaimsTab />);
    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();

    // Asserted after the outage clears rather than during it: while the error is up the menu is not
    // rendered at all, so its absence says nothing. What matters is that the selection comes back
    // with the list — a reconciliation that ran during the outage would have spent it by now.
    mocks.taggedCatalogError = null;
    view.rerender(<ClaimsTab />);

    expect(await screen.findByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    // Still filtered: a reconciliation during the outage would have dropped the selection, and this
    // claim — which carries no topic — would be back.
    expect(screen.queryByText('Cities should ban cars downtown')).toBeNull();
  });

  // And once more for the gate rather than a failure: `taggedAllowed` is deliberately emptied while
  // the space gates resolve, which empties the menu the same way without anything being wrong.
  it('keeps a picked topic while the space gates are still resolving', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } }],
      },
      // Carries no topic, so it is present exactly when nothing is selected — which is what makes
      // the selection observable in the list rather than in the trigger's label.
      {
        id: FEATURED_B,
        name: 'Cities should ban cars downtown',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [],
      },
    ];
    const view = render(<ClaimsTab />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    // The filter has actually landed once the untopiced claim is gone — not merely once the trigger
    // has changed, which happens a debounce earlier and would leave the assertions below racing it.
    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());

    mocks.allowlistLoading = true;
    view.rerender(<ClaimsTab />);
    mocks.allowlistLoading = false;
    view.rerender(<ClaimsTab />);

    // Same shape: the gate resolves, the claims come back, and the selection has to still be there.
    expect(await screen.findByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    // Still filtered: a reconciliation during the outage would have dropped the selection, and this
    // claim — which carries no topic — would be back.
    expect(screen.queryByText('Cities should ban cars downtown')).toBeNull();
  });

  // The topics come from the entity lookup alone, so a failed one leaves the menu empty while it
  // stops loading. Read as settled, that empty menu says the viewer's topic no longer exists and
  // the reconciliation drops it — the selection lost to an outage, and not given back when the
  // lookup recovers.
  it('keeps a picked topic when the lookup behind the menu fails', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } }],
      },
      // Carries no topic, so it is present exactly when nothing is selected — which is what makes
      // the selection observable in the list rather than in the trigger's label.
      {
        id: FEATURED_B,
        name: 'Cities should ban cars downtown',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [],
      },
    ];
    const view = render(<ClaimsTab />);
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    // The filter has actually landed once the untopiced claim is gone — not merely once the trigger
    // has changed, which happens a debounce earlier and would leave the assertions below racing it.
    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());

    mocks.claimEntitiesError = new Error('hydration exploded');
    view.rerender(<ClaimsTab />);
    mocks.claimEntitiesError = null;
    view.rerender(<ClaimsTab />);

    // Still picked: the menu it was picked from never answered during the outage, so it never
    // stopped offering it. The list is not blanked by that failure, so this is observable directly.
    expect(await screen.findByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Any topic/ })).toBeNull();
  });

  // "Try again" has to reach whatever produced the error. The two lookups behind this list are not
  // keyed on the catalog, so refetching the catalog alone left the failed one untouched and the
  // error state exactly where it was — a retry button that cannot clear the state it is offered in.
  it('retries the lookups behind the list, not only the catalog', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    // The catalog is the only fatal failure now, so it is what puts the retry on screen. What the
    // retry must still reach is everything the list depends on, not just the query that failed.
    mocks.taggedCatalogError = new Error('catalog exploded');
    const { queryClient } = render(<ClaimsTab />);
    await showAllClaims();

    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(keys).toContainEqual(['claim-picker', 'entities']);
    expect(keys).toContainEqual(['debates', 'claims']);
  });

  it('does not serve Featured’s catalog to it', async () => {
    // The two are different tags and different lists. A shared mock — or a filter reading the wrong
    // constant — would look identical on screen without this.
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Only featured')];
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_B, 'Only debatable')];
    render(<ClaimsTab />);
    await showAllClaims();

    // `waitFor`, because `AnimatePresence` keeps an exiting card mounted until its exit animation
    // finishes and jsdom never runs one — so the outgoing list is still in the DOM on the tick the
    // filter changes. The same wait the search cases in this file use.
    await waitFor(() => expect(screen.queryByText('Only featured')).toBeNull());
    expect(screen.getByText('Only debatable')).toBeInTheDocument();
  });

  it('keeps Featured on its own tag', async () => {
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Only featured')];
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_B, 'Only debatable')];
    render(<ClaimsTab />);

    expect(screen.getByText('Only featured')).toBeInTheDocument();
    expect(screen.queryByText('Only debatable')).toBeNull();
    expect(mocks.tagsAskedFor).toContain(FEATURED_TAG);
  });

  // An untouched list is empty because it is empty, not because filters hid it. The position filter
  // still counts as something "Clear filters" should undo — the two questions had one answer, and
  // an unfiltered My positions was being blamed on filters the viewer never set.
  it('says why an unfiltered list is empty rather than blaming filters', async () => {
    mocks.claims = [];
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('You haven’t taken a position on any claims yet.')).toBeInTheDocument();
    expect(screen.queryByText('No claims match these filters.')).toBeNull();
  });

  // Searching is the server's job now, and this is the trade GEO-2798 makes: the term goes out with
  // the query instead of filtering a corpus already in hand. It costs a round trip and buys a menu
  // and a list that describe the whole tag rather than the pages loaded so far.
  it('sends the search term to the server rather than filtering a loaded list', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    render(<ClaimsTab />);
    await showAllClaims();

    fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'nuclear' } });

    // The term reaches the app's own search, and its matched ids reach the query — which is the
    // whole point of the change: fuzzy and ranked, rather than a substring filter of this list.
    await waitFor(() => expect(mocks.taggedFiltersAskedFor.at(-1).search).toBe('nuclear'));
    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());
    // And no entity lookup rides along with it, because there is no longer one at all.
    expect(mocks.claimEntityLookups.flat()).toEqual([]);
  });

  // A claim tagged in two spaces is asked about once per space, so geo-chat answers twice — each row
  // carrying that space's own sides and readiness. The card is built against the tag row that
  // survived deduplication, so the answers have to be looked up by the same space, or it draws one
  // space's positions onto the other's card and publishes into the wrong one.
  it('takes each claim’s answers from the space its card is for', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Tagged in two spaces', SPACE_ID),
      featuredClaim(FEATURED_A, 'Tagged in two spaces', OTHER_SPACE_ID),
    ];
    // Only the *other* space has a position on it. The card is drawn for SPACE_ID, which has none.
    mocks.debateClaimRows = [
      {
        id: 'row-other',
        claim_entity_id: FEATURED_A,
        space_id: OTHER_SPACE_ID,
        response_kind: 'stance',
        viewer_response: { position: true, position_label: 'Agree' },
        viewer_debate_ready: true,
        readiness_disabled_reason: null,
        online_choices: [],
        active_debate: null,
      },
    ];
    render(<ClaimsTab />);
    await showAllClaims();

    // Drawn from SPACE_ID's absent row, so no side is held — not the other space's Agree.
    const agree = await screen.findByRole('button', { name: /^Agree/ });
    expect(agree).toHaveAttribute('aria-pressed', 'false');
  });

  // The vocabulary half of this is retired: it rides on the claim now, so no row from anywhere can
  // vouch for it and none is asked to. The half that remains is the viewer's own side, which is
  // still per space and still geo-chat's — see "takes each claim's answers from the space its card
  // is for" above, and the row-settled cases below.
  it('draws no side on a card whose own space has no row, whatever another space says', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Tagged in two spaces', SPACE_ID),
      featuredClaim(FEATURED_A, 'Tagged in two spaces', OTHER_SPACE_ID),
    ];
    mocks.debateClaimRows = [
      {
        id: 'row-other',
        claim_entity_id: FEATURED_A,
        space_id: OTHER_SPACE_ID,
        response_kind: 'stance',
        viewer_response: { position: true, position_label: 'Agree' },
        viewer_debate_ready: false,
        readiness_disabled_reason: null,
        online_choices: [],
        active_debate: null,
      },
    ];

    render(<ClaimsTab />);
    await showAllClaims();

    // The card is drawn for SPACE_ID, which holds no row — so no side is held here, and the other
    // space's Agree is not borrowed onto it.
    const agree = await screen.findByRole('button', { name: /^Agree/ });
    expect(agree).toHaveAttribute('aria-pressed', 'false');
  });

  // The entity settles the vocabulary and nothing else. The side the viewer already holds rides on
  // this space's geo-chat row, and `viewerPosition` is read from it alone — so opening the card on a
  // hydrated entity while that row is still in flight draws a held side as unselected, and pressing
  // it publishes that side again instead of clearing it. The card's own contract asks for both.
  it('does not open the card on the vocabulary alone, before the viewer’s side has arrived', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Tagged in one space', SPACE_ID)];
    // The vocabulary *is* resolved: the entity has landed and says this is a stance claim.
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Tagged in one space',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [],
      },
    ];
    // The half that has not: no row yet, so nothing knows which side the viewer is already on.
    mocks.taggedRowsLoading = true;

    render(<ClaimsTab />);
    await showAllClaims();

    const agree = await screen.findByRole('button', { name: /^Agree/ });
    expect(agree).toBeDisabled();
    expect(agree).toHaveAttribute('title', 'Loading this claim\u2019s responses\u2026');
  });

  // The guard for the case above: a claim with no row at all still has to become answerable once
  // the lookup settles, or the entity path would be dead and every unanswered claim stuck loading.
  it('opens the card once the row lookup settles, even with no row for the claim', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Tagged in one space', SPACE_ID)];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Tagged in one space',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [],
      },
    ];
    mocks.debateClaimRows = [];
    mocks.taggedRowsLoading = false;

    render(<ClaimsTab />);
    await showAllClaims();

    expect(await screen.findByRole('button', { name: /^Agree/ })).toBeEnabled();
  });

  // The guard for the case above: the card has to come alive once this space's own row lands, or a
  // permanently dead pill would satisfy it just as well.
  it('lets the card answer once its own space’s row arrives', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [
      featuredClaim(FEATURED_A, 'Tagged in two spaces', SPACE_ID),
      featuredClaim(FEATURED_A, 'Tagged in two spaces', OTHER_SPACE_ID),
    ];
    mocks.debateClaimRows = [
      {
        id: 'row-this',
        claim_entity_id: FEATURED_A,
        space_id: SPACE_ID,
        response_kind: 'stance',
        viewer_response: null,
        viewer_debate_ready: false,
        readiness_disabled_reason: null,
        online_choices: [],
        active_debate: null,
      },
    ];
    mocks.claimEntities = [];

    render(<ClaimsTab />);
    await showAllClaims();

    expect(await screen.findByRole('button', { name: /^Agree/ })).toBeEnabled();
  });

  it('stops paging the index, which is no longer answering this list', async () => {
    // The sentinel is what walked geo-chat's cursor. A graph-sourced list has every row in hand, so
    // a sentinel here would page a corpus nothing is reading.
    mocks.hasNextPage = true;
    mocks.taggedClaims[DEBATE_TAG] = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);
    await showAllClaims();

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();
  });

  it('says nothing is tagged rather than blaming the filters', async () => {
    mocks.taggedClaims[DEBATE_TAG] = [];
    render(<ClaimsTab />);
    await showAllClaims();

    expect(screen.getByText('No claims have been tagged for debate yet.')).toBeInTheDocument();
  });
});

// GEO-2653. The menu is the server's topic facet, which describes every claim the current
// filters allow rather than the pages this client has walked — the client-side version grew as
// the viewer scrolled, so a space whose first page carried no topics looked like a space with
// none at all.
describe('topic menu', () => {
  const AI = { id: 'topic-ai', name: 'AI' };
  const HEALTH = { id: 'topic-health', name: 'Health' };

  beforeEach(() => {
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.sidebarData = sidebarData();
    mocks.claims = [
      claim('claim-ai', 'Models are getting cheaper', false, false, SPACE_ID, [AI]),
      claim('claim-health', 'Sleep is underrated', false, false, OTHER_SPACE_ID, [HEALTH]),
    ];
  });

  it('offers every topic while no space is picked', async () => {
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.getByRole('button', { name: /^AI/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Health/ })).toBeInTheDocument();
  });

  // Both picks land before the first one's answer does, so the menu still offers a topic that
  // doesn't co-occur with it. Only the pick that didn't fit is given back — and only one of them,
  // which is the part a unit test on the helper cannot see: `facetTopics` is rebuilt from
  // `topicIds`, so an ungated effect reconciles against its own output and takes both.
  it('gives back only the newest topic when two picked in a row cannot co-occur', async () => {
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Health/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'AI' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Any topic/ })).toBeNull();
  });

  // Search narrows the facets exactly as the space and topic filters do, so the window where the
  // box says one thing and the counts answer another is the same window — and has to start on the
  // keystroke. Left out, the grace period didn't begin until the search debounce had already run,
  // so the stale numbers stood for both delays back to back instead of one.
  it('covers the counts while the typed query is still settling', async () => {
    render(<ClaimsTab />);
    await showIndexedClaims();
    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    vi.useFakeTimers();
    try {
      // Two keystrokes far enough apart to restart the debounce, so the query stays unsettled for
      // longer than the menu's grace period without ever being sent.
      fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'mod' } });
      act(() => void vi.advanceTimersByTime(200));
      fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'model' } });
      act(() => void vi.advanceTimersByTime(100));

      expect(screen.getAllByLabelText('Loading count').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops the topics that have no claims in the picked space', async () => {
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    fireEvent.click(screen.getByRole('button', { name: /Crypto/ }));

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    // The selection is debounced before it reaches the query, so the menu it describes arrives a
    // beat later — see `SELECTION_DEBOUNCE_MS`.
    // The reported bug: Health stayed on the menu, and picking it showed nothing at all. Waited on
    // rather than AI, which is present either way — the disappearance is what the pick causes.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Health/ })).toBeNull());
    expect(screen.getByRole('button', { name: /^AI/ })).toBeInTheDocument();
  });

  // The report that reopened this: filter to a space, and topics appeared only as you scrolled,
  // because the menu was built from the claims paged in so far.
  it('offers a topic no claim on the loaded page carries', async () => {
    mocks.claims = [
      claim('claim-plain', 'A claim with no topics', false, false, SPACE_ID),
      claim('claim-ai', 'Models are getting cheaper', false, false, SPACE_ID, [AI]),
    ];
    mocks.pageSize = 1;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.getByText('A claim with no topics')).toBeInTheDocument();
    expect(screen.queryByText('Models are getting cheaper')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.getByRole('button', { name: /^AI/ })).toBeInTheDocument();
  });

  // Without this the facet describes every space geo-chat knows, so a topic living only in a
  // space this viewer can't be shown claims from is offered over a list the client then empties.
  it('scopes the query to the spaces the viewer can be shown claims from', async () => {
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(mocks.lastQuery).toMatchObject({ spaceIds: [SPACE_ID.replace(/-/g, '')] });
  });

  // The allowlist settling without an answer stops it narrowing, deliberately — a list that is too
  // wide beats a panel that never fills. That is a reason to stop narrowing by the allowlist, not
  // to stop narrowing: the publishable set is a different question, and the rows are still cut by
  // it. Left unscoped, the facets would name every space geo-chat knows while the list showed only
  // the publishable ones.
  it('falls back to the publishable spaces when the allowlist settles with nothing', async () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = false;
    mocks.publishableSpaceIds = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(mocks.lastQuery).toMatchObject({ spaceIds: [SPACE_ID.replace(/-/g, '')] });
  });

  // Both unknown is the only case with nothing left to narrow by.
  it('asks unscoped only when neither lookup has an answer', async () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = false;
    mocks.publishableSpaceIds = null;
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(mocks.lastQuery).toMatchObject({ spaceIds: null });
  });

  // "No eligible spaces" and "no space filter" are the same request on the wire, so the query
  // has to be skipped rather than sent unscoped: the rows would all be dropped here, but the
  // facets would not, leaving a menu whose every option leads to an empty list.
  it('asks for nothing at all when no space is eligible', async () => {
    mocks.spaceAllowlist = new Set();
    mocks.claims = [claim('claim-ai', 'Models are getting cheaper', false, false, SPACE_ID, [AI])];
    render(<ClaimsTab />);
    await showIndexedClaims();

    expect(screen.queryByText('Models are getting cheaper')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    expect(screen.queryByRole('button', { name: /^AI/ })).toBeNull();
  });

  // Disabling the query is not the same as having no data: it keeps the previous key's pages,
  // facets included. Narrowing from a populated scope to an empty one therefore left the last
  // scope's topic menu on screen over a list this tab had emptied.
  it("drops the previous scope's menu when the eligible set narrows to nothing", async () => {
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.claims = [claim('claim-ai', 'Models are getting cheaper', false, false, SPACE_ID, [AI])];
    const view = render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    expect(screen.getByRole('button', { name: /^AI/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    mocks.spaceAllowlist = new Set();
    view.rerender(<ClaimsTab />);

    // The list animates its rows out, so the card outlives the render that dropped it.
    await waitFor(() => expect(screen.queryByText('Models are getting cheaper')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    expect(screen.queryByRole('button', { name: /^AI/ })).toBeNull();
  });

  it('sends the picked space alone, never alongside the eligible list', async () => {
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, ''), OTHER_SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    fireEvent.click(screen.getByRole('button', { name: /Crypto/ }));

    // geo-chat ORs the space parameters together, so sending the scope alongside the pick would
    // widen the query straight back out to every eligible space.
    // The menu's option values are the facet's own ids, which is what goes back out. Debounced,
    // so the request follows the tick rather than riding it.
    await waitFor(() => expect(mocks.lastQuery).toMatchObject({ spaceIds: [SPACE_ID] }));
  });

  it('asks the server to do the topic filtering', async () => {
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));

    // Filtering here would only ever narrow the pages already loaded, which is the same bug in
    // the list that the menu had.
    await waitFor(() => expect(mocks.lastQuery).toMatchObject({ topicIds: [AI.id] }));
  });

  // The scope goes out as `spaceIds`, and it isn't known until the allowlist and the publishable
  // lookup have both landed. Asked before then, the endpoint answers about the whole corpus — rows
  // the gates then drop, and a topic facet spanning spaces this viewer is never shown. The rows
  // being discarded is what made it look harmless: `keepPreviousData` hands the same facets back
  // when the scope settles and the key changes, and nothing gates a topic by space, so the menu
  // offers options over a list with nothing to put under them.
  it('does not ask for a corpus wider than the scope it is about to apply', async () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = true;
    render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.queryByRole('button', { name: /^AI/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Health/ })).toBeNull();
  });

  // Not reachable by picking one and then the other — each menu is narrowed by the other, so a
  // topic with no claims in the picked space is never on offer to pick. It is reachable by the
  // corpus moving underneath a selection that was valid when it was made.
  it('lets go of a selected topic once the space stops having claims for it', async () => {
    const view = render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    fireEvent.click(screen.getByRole('button', { name: /Crypto/ }));
    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    // The menu stays open across a tick, so the trigger and the row both read "AI" until it closes.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /AI/ })).toBeInTheDocument();

    // The one AI claim in Crypto is answered, published elsewhere, or otherwise leaves the
    // candidate set. Crypto now carries no AI claim, so the topic facet drops it.
    mocks.claims = [claim('claim-health', 'Sleep is underrated', false, false, OTHER_SPACE_ID, [HEALTH])];
    view.rerender(<ClaimsTab />);

    // Left held, it would filter the list from a chip no longer in the menu to unpick. Awaited
    // rather than immediate: reconciliation waits for a facet that answers the selection in hand,
    // so it happens once the pick has settled rather than in the same tick as the corpus change.
    await waitFor(() => expect(screen.getByRole('button', { name: /Any topic/ })).toBeInTheDocument());
  });

  // The other dimension, which must behave differently. `space_facets` is narrowed by the topic
  // selection and never by its own, because spaces are OR — which means a space can drop out of the
  // facet merely because *this combination* is empty.
  // That is a reason to show an empty list, not to revise a choice the viewer made. Clearing it
  // would silently discard the space the moment a topic, or a search, emptied the pair.
  it('keeps a selected space when the current combination has nothing in it', async () => {
    const view = render(<ClaimsTab />);
    await showIndexedClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    fireEvent.click(screen.getByRole('button', { name: /Crypto/ }));
    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));

    // The AI claim moves out of Crypto, so the AI-narrowed space facet no longer names it.
    mocks.claims = [claim('claim-ai', 'Models are getting cheaper', false, false, OTHER_SPACE_ID, [AI])];
    view.rerender(<ClaimsTab />);

    expect(screen.getByRole('button', { name: /Crypto/ })).toBeInTheDocument();
  });
});

const FEATURED_A = '019fedb4-3f74-7c61-8d44-5fa0810e7742';
const FEATURED_B = '019fedb5-4085-7d72-9e55-60b1921f8853';
const CLAIM_IS_FACTUAL_PROPERTY_ID = 'da4a6c1f9d4446f9832ff3b49a4400ef';
const TOPICS_PROPERTY_ID = '806d52bc27e94c9193c057978b093351';

function featuredClaim(entityId: string, name: string, spaceId = SPACE_ID) {
  return { claimEntityId: entityId, spaceId, name, description: null, rankingScore: 1 };
}

// GEO-2683. Featured is the one option in this menu geo-chat knows nothing about: the tag lives in
// the knowledge graph, so picking it swaps the list's source rather than changing a query param.
describe('ClaimsTab -- Featured', () => {
  // Where the tab opens: a curator's pick beats whatever the index ranked highest as the first
  // thing to put in front of someone, and the whole corpus is one option below.
  it('opens on Featured, listing the tagged claims rather than the index page', () => {
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);

    expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(screen.queryByText('Chips are better than fries')).toBeNull();
  });

  // Featured has no server facet, so its counts are computed here — and a count still has to say
  // what picking the option would leave. Reported: pick a topic that only exists in one space, and
  // the other space kept its full count over a list that would come back empty.
  it('counts the space menu over the picked topic, and never over the picked space', async () => {
    // What the tab owes the menu is the filter it counts under. Whether the count is then right is
    // the query module's own test — asserting it through this menu means fighting the exiting
    // options that jsdom leaves mounted, which says nothing about either.
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy', SPACE_ID),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown', OTHER_SPACE_ID),
    ];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } }],
      },
    ];
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    // The topic reaches it — a space with nothing under the current topic should not be offered.
    await waitFor(() =>
      expect(mocks.spaceFacetFiltersAskedFor.at(-1).topicIds).toEqual(['topic-energy'])
    );

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    fireEvent.click(screen.getByRole('button', { name: /Space/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    // The space does not, and must not: a menu narrowed by its own dimension would read zero
    // against every space the viewer had not already picked, with no way back to another.
    await waitFor(() => expect(mocks.taggedFiltersAskedFor.at(-1).spaceIds.length).toBeGreaterThan(0));
    expect(mocks.spaceFacetFiltersAskedFor.at(-1).spaceIds).toEqual(
      mocks.taggedFiltersAskedFor.at(-1).spaceIds
    );
  });

  it('never covers its counts with skeletons, having nothing to wait for', async () => {
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy', SPACE_ID)];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } },
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-grid', name: 'Grid' } },
        ],
      },
    ];
    vi.useFakeTimers();
    try {
      render(<ClaimsTab />);
      fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

      // Each tick restarts the debounce, so the selection never settles across the run — the only
      // way to stay pending for longer than the grace period. Ordered so the row being clicked is
      // never the one the trigger is currently named after, which would make the two ambiguous.
      fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));
      act(() => void vi.advanceTimersByTime(100));
      fireEvent.click(screen.getByRole('button', { name: /^Grid/ }));
      act(() => void vi.advanceTimersByTime(100));
      fireEvent.click(screen.getByRole('button', { name: /^Grid/ }));
      act(() => void vi.advanceTimersByTime(100));

      expect(screen.queryAllByLabelText('Loading count')).toHaveLength(0);

      // And still none once everything has settled, so this isn't passing on a race.
      act(() => void vi.advanceTimersByTime(500));
      expect(screen.queryAllByLabelText('Loading count')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // The other half of the rule above. Featured's space and topic menus follow the live selections,
  // but its *search* is debounced like everything else — `featuredSearched` reads
  // `debouncedSearch` — so while the box is unsettled its counts really do describe the query
  // before the typing started, and have to be covered.
  it('covers its counts while the typed query is settling, unlike the selections', async () => {
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy', SPACE_ID)];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } }],
      },
    ];
    render(<ClaimsTab />);
    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'nuc' } });
      act(() => void vi.advanceTimersByTime(200));
      fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'nucle' } });
      act(() => void vi.advanceTimersByTime(100));

      expect(screen.getAllByLabelText('Loading count').length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // GEO-2696 made topics intersect rather than union, server-side. Featured is the one source
  // geo-chat has no facet for, so the same rule has to be applied here — two halves of one menu
  // disagreeing about what a second topic does would be worse than either answer on its own.
  //
  // Built so OR and AND disagree: under union both claims would survive, under intersection only
  // the one carrying both does.
  it('needs every picked topic on Featured, not any of them', async () => {
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } },
          { type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-cities', name: 'Cities' } },
        ],
      },
      {
        id: FEATURED_B,
        name: 'Cities should ban cars downtown',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-cities', name: 'Cities' } }],
      },
    ];
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Cities/ }));
    // Both carry Cities, so both are still listed with one topic picked.
    expect(screen.getByText('Cities should ban cars downtown')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    // Only the claim carrying both survives. Under the old union rule this one would have stayed.
    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());
    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
  });

  // The other half of GEO-2696: the menu answers "what appears alongside what I have picked".
  it('offers only the topics that co-occur with the picked one', async () => {
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } }],
      },
      {
        id: FEATURED_B,
        name: 'Cities should ban cars downtown',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-cities', name: 'Cities' } }],
      },
    ];
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    expect(screen.getByRole('button', { name: /^Cities/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));

    // Cities appears on no claim that carries Energy, so it can no longer be added — picking it
    // could only ever empty the list.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Cities/ })).toBeNull());

    // Energy stays on the menu, which is what lets it be un-picked. Checked with the menu closed,
    // since open the trigger answers to the same name as the row.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /^Energy/ })).toBeInTheDocument();
  });

  // The panel is narrow enough that three menus fill the row on their own. Pushing the topic one to
  // the far end there — as the rematch picker does, where there is width to spare — would only
  // separate it from the two it sits with.
  it('leaves the topic menu beside the others rather than at the far end', () => {
    render(<ClaimsTab />);

    const topicMenu = screen.getByRole('button', { name: /Any topic/ });
    expect(topicMenu.parentElement?.className ?? '').not.toContain('ml-auto');
  });

  // Featured leads the menu because it is what the tab opens on; an option you land on shouldn't
  // sit below the one you didn't.
  it('leads the position menu, ahead of All claims', () => {
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Featured' }));

    const labels = ['Featured', 'All claims', 'My positions', 'Debate now'];
    const options = screen.getAllByRole('button').filter(button => labels.includes(button.textContent?.trim() ?? ''));
    // The trigger carries the current label too, and it is rendered ahead of the options.
    expect(options.slice(-4).map(button => button.textContent?.trim())).toEqual(labels);
  });

  // Featured claims are a few hundred in a corpus of hundreds of thousands, so the index is no help
  // here and asking it for a page while Featured is showing is a request for nothing.
  it('leaves the index alone until the viewer asks for All claims', async () => {
    render(<ClaimsTab />);

    expect(mocks.lastEnabled).toBe(false);
    // Still 'all', so asking for it lands on whatever pages are already cached.
    expect(mocks.lastQuery).toMatchObject({ filter: 'all' });

    await showIndexedClaims();

    expect(mocks.lastEnabled).toBe(true);
  });

  // The same two gates the paged list runs under: the viewer's allowlist, and whether a debate in
  // that space could ever be published.
  it('drops tagged claims from spaces the viewer may not be shown', () => {
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown', OTHER_SPACE_ID),
    ];
    render(<ClaimsTab />);

    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(screen.queryByText('Cities should ban cars downtown')).toBeNull();
  });

  it('drops tagged claims from spaces a debate could never be published in', () => {
    mocks.publishableSpaceIds = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown', OTHER_SPACE_ID),
    ];
    render(<ClaimsTab />);

    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(screen.queryByText('Cities should ban cars downtown')).toBeNull();
  });

  // A claim can be tagged in several spaces. Collapsing to one row before the gates would let a
  // space the viewer can't be shown stand for the claim and drop it, though it is featured in one
  // they can.
  it('keeps a claim tagged in both a shown and a hidden space', () => {
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy', OTHER_SPACE_ID),
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
    ];
    render(<ClaimsTab />);

    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    // And on the tag the viewer may actually be shown, so geo-chat is asked in that space.
    expect(mocks.debateClaimGroups.at(-1)).toEqual([{ spaceId: SPACE_ID, claimIds: [FEATURED_A] }]);
  });

  // The sides and readiness on the cards are geo-chat's, asked for by id per space. A claim the tab
  // has already ruled out shouldn't cost a request -- or a gateway scope on that space.
  it('asks geo-chat only about the tagged claims it may show', () => {
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown', OTHER_SPACE_ID),
    ];
    render(<ClaimsTab />);

    expect(mocks.debateClaimGroups.at(-1)).toEqual([{ spaceId: SPACE_ID, claimIds: [FEATURED_A] }]);
  });

  // GEO-2653 moved the paged list's topic menu server-side, but geo-chat has no row for a featured
  // claim -- so its facet says nothing about them and its `topic_id` can't narrow them. Featured
  // resolves topics from the entities it already fetches for the response kind.
  it('builds its own topic menu and filters on it', async () => {
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [],
        relations: [{ type: { id: TOPICS_PROPERTY_ID }, toEntity: { id: 'topic-energy', name: 'Energy' } }],
      },
    ];
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));

    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());
    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
  });

  // The vocabulary arrives with the claim now (GEO-2798): the page selects the "Is factual" value
  // alongside the name and the topics, so there is no second lookup to wait on and no window in
  // which a factual claim is offered Agree/Disagree.
  it('reads each claim’s response kind off the page it arrived on', () => {
    const ids = Array.from(
      { length: 12 },
      (_, index) => `019fedb6-0000-7000-8000-00000000${String(index).padStart(4, '0')}`
    );
    mocks.featuredClaims = ids.map((id, index) => featuredClaim(id, `Claim number ${index}`));
    // The last one is factual, so its sides are Verify/Dispute rather than Agree/Disagree.
    mocks.claimEntities = [
      {
        id: ids.at(-1)!,
        name: 'Claim number 11',
        description: null,
        spaces: [SPACE_ID],
        values: [{ property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, spaceId: SPACE_ID, value: '1' }],
        relations: [],
      },
    ];
    render(<ClaimsTab />);

    expect(screen.getByRole('button', { name: /Verify/ })).toBeInTheDocument();
    // And nothing was asked for it: the entity fan-out this list used to make is gone.
    expect(mocks.claimEntityLookups.flat()).toEqual([]);
  });

  // The vocabulary is no longer something to wait for — it arrives with the claim. What is still
  // worth waiting for is the viewer's own side, which only this space's geo-chat row carries: drawn
  // unselected, a side they already hold would be republished by the press meant to clear it.
  it('will not let anyone answer a featured claim before their own side has arrived', () => {
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    mocks.taggedRowsLoading = true;

    render(<ClaimsTab />);

    const agree = screen.getByRole('button', { name: /^Agree/ });
    expect(agree).toBeDisabled();
    expect(agree).toHaveAttribute('title', 'Loading this claim\u2019s responses\u2026');
  });

  it('lets them answer once the entity has said which vocabulary the claim uses', () => {
    // The guard for the test above: without it, a permanently dead pill would pass just as well.
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    mocks.claimEntities = [
      {
        id: FEATURED_A,
        name: 'Nuclear power is the cheapest clean energy',
        description: null,
        spaces: [SPACE_ID],
        values: [{ property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, spaceId: SPACE_ID, value: '1' }],
        relations: [],
      },
    ];

    render(<ClaimsTab />);

    expect(screen.getByRole('button', { name: /^Verify/ })).toBeEnabled();
  });

  // geo-chat is asked about the rows on screen, so a search that changes the rows does reach it —
  // which is the point: it is a page-scoped lookup now, not a fan-out over the whole tag.
  it('asks geo-chat about the rows the search left, not the whole tag', async () => {
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    render(<ClaimsTab />);
    await waitFor(() => expect(mocks.debateClaimGroups.flat().length).toBeGreaterThan(0));

    fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'nuclear' } });
    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());

    const lastAsk = mocks.debateClaimGroups.at(-1)!.flatMap(group => group.claimIds);
    expect(lastAsk).toEqual([FEATURED_A]);
  });

  // Featured is one graph query, not a paged list. The paged query's own pages survive `enabled:
  // false` through `keepPreviousData`, so a sentinel gated on those would page the corpus
  // underneath a list that never grows.
  it('places no scroll sentinel on Featured', async () => {
    mocks.hasNextPage = true;
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();

    await showIndexedClaims();

    expect(screen.getByTestId('claims-scroll-sentinel')).toBeInTheDocument();
  });

  // Featured chooses which list is on screen rather than narrowing one, so an empty tab reads as
  // "nothing is featured" -- not as filters hiding claims that are there.
  it('says nothing is featured rather than nothing is debatable', () => {
    render(<ClaimsTab />);

    expect(screen.getByText('No claims have been featured yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  // And once one is applied, clearing it leaves the viewer on Featured rather than dropping them
  // onto the paged list they didn't ask for.
  it('keeps the viewer on Featured when they clear a filter', async () => {
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);

    fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'nothing matches this' } });
    await waitFor(() => expect(screen.getByText('No featured claims match these filters.')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument());
    expect(mocks.lastEnabled).toBe(false);
  });

  // GEO-2725. Both are viewer-relative: "My positions" is the viewer's own list, and "Debate now"
  // is scored on who is available to debate *you*. Signed out neither has a subject.
  it('drops the viewer-relative filters when signed out', async () => {
    mocks.authenticated = false;
    render(<ClaimsTab />);

    fireEvent.click(await screen.findByRole('button', { name: /Featured/ }));

    expect(screen.queryByRole('button', { name: 'My positions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Debate now' })).not.toBeInTheDocument();
    // Featured and All claims describe the corpus, so both stay.
    expect(screen.getByRole('button', { name: 'All claims' })).toBeInTheDocument();
  });

  it('keeps both for a signed-in viewer', async () => {
    render(<ClaimsTab />);

    fireEvent.click(await screen.findByRole('button', { name: /Featured/ }));

    expect(screen.getByRole('button', { name: 'My positions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Debate now' })).toBeInTheDocument();
  });

  // Signing out with a viewer-relative filter selected used to leave the tab querying it
  // anonymously, with a trigger showing a value no longer in the menu.
  it('falls back to Featured when the selected filter is hidden by signing out', async () => {
    const view = render(<ClaimsTab />);

    fireEvent.click(await screen.findByRole('button', { name: /Featured/ }));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));
    expect(screen.getByRole('button', { name: /My positions/ })).toBeInTheDocument();

    mocks.authenticated = false;
    view.rerender(<ClaimsTab />);

    expect(screen.getByRole('button', { name: /Featured/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /My positions/ })).not.toBeInTheDocument();
    expect(mocks.lastQuery).not.toMatchObject({ filter: 'mine' });
  });

  // `debateQueryKeys.claims` is keyed on space and ids but not on the account, and a disabled
  // react-query observer still returns whatever that key already holds — so asking at all after a
  // sign-out would draw the previous viewer's response and readiness onto these cards. Asking for
  // nothing is what makes that unreachable; the fields all have graph-derived fallbacks.
  it('asks for no per-space readiness while signed out', async () => {
    mocks.authenticated = false;
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);
    await screen.findByText('Nuclear power is the cheapest clean energy');

    expect(mocks.debateClaimGroups.at(-1)).toEqual([]);
  });

  it('asks for it again once signed in', async () => {
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);
    await screen.findByText('Nuclear power is the cheapest clean energy');

    expect(mocks.debateClaimGroups.at(-1)).not.toEqual([]);
  });
});
