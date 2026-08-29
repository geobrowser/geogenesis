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
  featuredClaims: [] as Array<{
    claimEntityId: string;
    spaceId: string;
    name: string;
    description: string | null;
    rankingScore: number | null;
  }>,
  featuredLoading: false,
  debateClaimGroups: [] as Array<Array<{ spaceId: string; claimIds: string[] }>>,
  claimEntityLookups: [] as string[][],
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
  trigger: null as null | (() => void),
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
  useGeoChatAuth: () => ({ ready: true, authenticated: mocks.authenticated, accountKey: 'account-1' }),
  useJoinDebateQueue: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  // Featured rows are hydrated by the per-space debate-claims lookup. Records what it was asked
  // for so the suites can assert the tab only asks about spaces it may show.
  useDebateClaimsBySpaces: (groups: Array<{ spaceId: string; claimIds: string[] }>) => {
    mocks.debateClaimGroups.push(groups);
    return { claims: [], isLoading: false, isError: false };
  },
}));

vi.mock('../featured-claims', async importOriginal => ({
  ...(await importOriginal<typeof import('../featured-claims')>()),
  useFeaturedClaims: (enabled: boolean) => {
    const claims = enabled ? mocks.featuredClaims : [];
    return {
      claims,
      claimIds: claims.map(claim => claim.claimEntityId),
      isLoading: enabled && mocks.featuredLoading,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

// Featured reads topics and the "Is factual" value through the picker's narrow projection.
vi.mock('../claim-picker-page', () => ({
  useClaimEntitiesByIds: (ids: string[]) => {
    mocks.claimEntityLookups.push(ids);
    return { entities: mocks.claimEntities.filter(entity => ids.includes(entity.id)), isLoading: false, error: null };
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
  return { ...view, rerender: (next: ReactElement) => view.rerender(wrap(next)) };
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
async function showAllClaims() {
  chooseFilter('Featured', 'All claims');
  await waitFor(() => expect(screen.queryByText('No claims have been featured yet.')).toBeNull());
}

const MINE = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';
const THEIRS = '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520';

beforeEach(() => {
  // Not a mock fn, so `resetAllMocks` does not restore it.
  mocks.authenticated = true;
  mocks.hasNextPage = false;
  mocks.facetSpaceIds = [];
  mocks.featuredClaims = [];
  mocks.featuredLoading = false;
  mocks.debateClaimGroups = [];
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
  // Cleared with it: a trigger left over from the previous test still closes over that test's
  // observer, so a case where nothing is observed could "scroll" a sentinel that isn't there.
  mocks.trigger = null;
  // Records the sentinel and hands back a way to say it scrolled into view.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(element: Element) {
        mocks.observed.push(element);
        mocks.trigger = () =>
          this.callback([{ isIntersecting: true, target: element } as IntersectionObserverEntry], this as never);
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
    await showAllClaims();

    const pinned = screen.getByLabelText('Search claims').closest('.sticky');
    expect(pinned).not.toBeNull();
    expect(pinned?.className).toContain('top-0');

    // Both controls ride in the same pinned block. Two stickies would each claim `top-0` and
    // overlap, which is why the filters aren't pinned separately.
    expect(screen.getByRole('button', { name: /All claims/ }).closest('.sticky')).toBe(pinned);

    // And the list itself is not inside it, or it would be pinned too and never scroll.
    expect(screen.getByTestId('claims-scroll-sentinel').closest('.sticky')).toBeNull();
  });

  // Pages arrive by reaching the end of the list, not by pressing anything.
  it('fetches the next page when the end of the list scrolls into view', async () => {
    mocks.hasNextPage = true;
    render(<ClaimsTab />);
    await showAllClaims();

    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();

    act(() => mocks.trigger?.());

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  it('places no sentinel once the last page has arrived', async () => {
    render(<ClaimsTab />);
    await showAllClaims();

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();
  });

  // The tab is one list in the server's order. Leading with the claims you'd already answered
  // re-ranked it by something the Position filter in the dropdown already covers, and it moved a
  // card between two sections the moment you took a side.
  it('renders one unsectioned list in the order the server returned', async () => {
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /All claims/ }));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

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
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

    expect(screen.queryByText('Chips are better than fries')).toBeNull();
  });

  it('keeps the space filter to spaces a debate could be published in', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.publishableSpaceIds = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

    expect(screen.queryByText('Bitcoin will never top $250K')).toBeNull();
  });

  // And the other half of that rule: a lookup that settled without an answer must not empty the
  // tab. No acceptor is configured locally at all, so this is the everyday path.
  it('falls through to the unfiltered list when the publishable lookup comes back empty', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.publishableSpaceIds = null;
    mocks.publishableLoading = false;
    render(<ClaimsTab />);
    await showAllClaims();

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // The allowlist is keyed on normalized ids; a claim row carries the hyphen-less form.
  it('matches allowed spaces across id formats', async () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '').toLowerCase()]);
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();

    act(() => mocks.trigger?.());

    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  // A lookup that settles without an answer must not leave the panel permanently empty — too wide
  // a list beats one that never fills.
  it('falls through to the unfiltered list when the allowlist lookup comes back empty', async () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = false;
    render(<ClaimsTab />);
    await showAllClaims();

    expect(screen.getByText('Bitcoin will never top $250K')).toBeInTheDocument();
  });

  // The space menu comes from the server's facets, which span every space the query touched.
  it('offers only allowed spaces in the space filter', async () => {
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

    expect(screen.getByText('No debatable claims yet.')).toBeInTheDocument();
    expect(screen.getByTestId('claims-scroll-sentinel')).toBeInTheDocument();

    act(() => mocks.trigger?.());

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  // The reported bug: the space menu opened as a column of "Space" placeholders while it re-fetched
  // names the browse sidebar had been showing since first paint.
  it('names the space options from the sidebar rows without fetching them again', async () => {
    mocks.facetSpaceIds = [SPACE_ID];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

    expect(screen.getByText('Crypto')).toBeInTheDocument();
  });

  // On a cold load the sidebar hasn't cached anything yet either. A column of identical "Space"
  // rows reads as a list of real, indistinguishable choices; skeletons read as names on their way.
  it('draws unresolved space options as skeletons rather than a column of "Space"', async () => {
    mocks.claims = [];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spacesLoading = true;
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

    expect(screen.getAllByLabelText('Loading space name').length).toBeGreaterThan(0);
    expect(screen.queryByText('Space')).toBeNull();
  });

  // A space the sidebar has no row for still has to resolve the old way.
  it('still fetches a space the sidebar has never heard of', async () => {
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);
    await showAllClaims();

    expect([...new Set(mocks.fetchedSpaceIds.flat())]).toEqual([OTHER_SPACE_ID]);
  });
});

// Search, the space filter and the position filter all run server-side, so what this tab puts in
// the query is the whole feature — a mock that ignores it cannot catch a dropped filter.
it('asks the server for the filter the viewer picked', async () => {
  render(<ClaimsTab />);
  await showAllClaims();

  expect(mocks.lastQuery).toMatchObject({ filter: 'all', spaceIds: null });

  fireEvent.click(screen.getByRole('button', { name: 'All claims' }));
  fireEvent.click(screen.getByRole('button', { name: 'Debate now' }));

  expect(mocks.lastQuery).toMatchObject({ filter: 'debate_now' });
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
    await showAllClaims();

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
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Health/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'AI' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Any topic/ })).toBeNull();
  });

  it('drops the topics that have no claims in the picked space', async () => {
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

    expect(mocks.lastQuery).toMatchObject({ spaceIds: [SPACE_ID.replace(/-/g, '')] });
  });

  // Both unknown is the only case with nothing left to narrow by.
  it('asks unscoped only when neither lookup has an answer', async () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = false;
    mocks.publishableSpaceIds = null;
    render(<ClaimsTab />);
    await showAllClaims();

    expect(mocks.lastQuery).toMatchObject({ spaceIds: null });
  });

  // "No eligible spaces" and "no space filter" are the same request on the wire, so the query
  // has to be skipped rather than sent unscoped: the rows would all be dropped here, but the
  // facets would not, leaving a menu whose every option leads to an empty list.
  it('asks for nothing at all when no space is eligible', async () => {
    mocks.spaceAllowlist = new Set();
    mocks.claims = [claim('claim-ai', 'Models are getting cheaper', false, false, SPACE_ID, [AI])];
    render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

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
    await showAllClaims();

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(screen.queryByRole('button', { name: /^AI/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Health/ })).toBeNull();
  });

  // Not reachable by picking one and then the other — each menu is narrowed by the other, so a
  // topic with no claims in the picked space is never on offer to pick. It is reachable by the
  // corpus moving underneath a selection that was valid when it was made.
  it('lets go of a selected topic once the space stops having claims for it', async () => {
    const view = render(<ClaimsTab />);
    await showAllClaims();

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
    await showAllClaims();

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
  it('narrows its space counts by the picked topic', async () => {
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
      {
        id: FEATURED_B,
        name: 'Cities should ban cars downtown',
        description: null,
        spaces: [OTHER_SPACE_ID],
        values: [],
        relations: [],
      },
    ];
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    // Both spaces carry a featured claim, so both are offered before any topic narrows them.
    expect(screen.getAllByRole('button', { name: /Space/ })).toHaveLength(2);
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Energy/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    // Only the Energy claim's space is left to pick, and the other is gone rather than offered
    // over a list it could not fill.
    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Space/ })).toHaveLength(1));
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

    await showAllClaims();

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

  // The lookup this replaced was `useQueryEntities`, which defaults to nine rows and slices to them
  // -- so every claim after the ninth drew as a stance claim with no topics, whatever its own "Is
  // factual" value said. The slicing was inside that hook, so a mocked hook can't reproduce it;
  // what this pins is the half that lives here: the whole id set is asked for, and the response
  // kind is read off the answer rather than defaulted.
  it('asks for every claim it lists and reads each one’s response kind', () => {
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

    expect(mocks.claimEntityLookups.at(-1)).toHaveLength(12);
    expect(screen.getByRole('button', { name: /Verify/ })).toBeInTheDocument();
  });

  // Search runs over the loaded list here -- there is no server query for it to go into -- and the
  // set geo-chat is asked about deliberately doesn't narrow with it, so typing filters a list that
  // is already loaded instead of restarting a fan-out on every keystroke.
  it('searches the loaded list without re-asking geo-chat', async () => {
    mocks.featuredClaims = [
      featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy'),
      featuredClaim(FEATURED_B, 'Cities should ban cars downtown'),
    ];
    render(<ClaimsTab />);

    const askedBefore = mocks.debateClaimGroups.at(-1);

    fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'nuclear' } });

    await waitFor(() => expect(screen.queryByText('Cities should ban cars downtown')).toBeNull());
    expect(screen.getByText('Nuclear power is the cheapest clean energy')).toBeInTheDocument();
    expect(mocks.debateClaimGroups.at(-1)).toEqual(askedBefore);
  });

  // Featured is one graph query, not a paged list. The paged query's own pages survive `enabled:
  // false` through `keepPreviousData`, so a sentinel gated on those would page the corpus
  // underneath a list that never grows.
  it('places no scroll sentinel on Featured', async () => {
    mocks.hasNextPage = true;
    mocks.featuredClaims = [featuredClaim(FEATURED_A, 'Nuclear power is the cheapest clean energy')];
    render(<ClaimsTab />);

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();

    await showAllClaims();

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
