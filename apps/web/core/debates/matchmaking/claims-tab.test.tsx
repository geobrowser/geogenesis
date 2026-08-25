import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';

import type { ReactElement } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchmakingClaim } from '../api';
import { ClaimsTab } from './claims-tab';

const mocks = vi.hoisted(() => ({
  claims: [] as MatchmakingClaim[],
  facetSpaceIds: [] as string[],
  spaceAllowlist: null as Set<string> | null,
  allowlistLoading: false,
  publishableSpaceIds: null as Set<string> | null,
  publishableLoading: false,
  sidebarData: null as unknown,
  fetchedSpaceIds: [] as string[][],
  spacesLoading: false,
  lastQuery: null as unknown,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  observed: [] as Element[],
  trigger: null as null | (() => void),
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
  useMatchmakingClaims: (query: unknown) => {
    mocks.lastQuery = query;
    return {
      data: { pages: [{ claims: mocks.claims, next_cursor: null, facets: { space_ids: mocks.facetSpaceIds } }] },
      isLoading: false,
      error: null,
      hasNextPage: mocks.hasNextPage,
      isFetchingNextPage: false,
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
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'account-1' }),
  useJoinDebateQueue: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveDebateQueue: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
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

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
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
  spaceId = SPACE_ID
): MatchmakingClaim {
  return {
    claim: { id: `row-${entityId}`, space_id: spaceId, claim_entity_id: entityId, claim: text, description: null },
    topics: [],
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

const MINE = '019fedb1-0c41-7f3e-9a11-2c7d5e8b4419';
const THEIRS = '019fedb2-1d52-7a4f-8b22-3d8e6f9c5520';

beforeEach(() => {
  mocks.hasNextPage = false;
  mocks.facetSpaceIds = [];
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
  // Pages arrive by reaching the end of the list, not by pressing anything.
  it('fetches the next page when the end of the list scrolls into view', () => {
    mocks.hasNextPage = true;
    render(<ClaimsTab />);

    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
    expect(mocks.fetchNextPage).not.toHaveBeenCalled();

    act(() => mocks.trigger?.());

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  it('places no sentinel once the last page has arrived', () => {
    render(<ClaimsTab />);

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();
  });

  // The tab is one list in the server's order. Leading with the claims you'd already answered
  // re-ranked it by something the Position filter in the dropdown already covers, and it moved a
  // card between two sections the moment you took a side.
  it('renders one unsectioned list in the order the server returned', () => {
    render(<ClaimsTab />);

    expect(screen.queryByRole('heading', { name: 'My positions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'All claims' })).not.toBeInTheDocument();

    // `claim(MINE, …)` is answered and `claim(THEIRS, …)` is not; the answered one no longer jumps
    // the queue, so the server's order stands.
    const first = screen.getByText('Chips are better than fries');
    const second = screen.getByText('Bitcoin will never top $250K');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves an answered claim where the server put it rather than promoting it', () => {
    mocks.claims = [
      claim(THEIRS, 'Bitcoin will never top $250K', false),
      claim(MINE, 'Chips are better than fries', true),
    ];
    render(<ClaimsTab />);

    const unanswered = screen.getByText('Bitcoin will never top $250K');
    const answered = screen.getByText('Chips are better than fries');
    expect(unanswered.compareDocumentPosition(answered) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // "My positions" means every claim the viewer holds a response for, whether or not they are
  // currently open to debating it — the toggle is a separate answer to a separate question. The
  // reported bug drops the toggled-off ones, and it is geo-chat's join to fix; this pins the client
  // half, so nobody closes the gap here by filtering the list a second time on the way in.
  it('keeps positions the viewer is not currently open to debating', () => {
    const OFF = '019fedb3-2e63-7b50-9c33-4e9f7a0d6631';
    mocks.claims = [
      claim(MINE, 'Chips are better than fries', true, true),
      claim(OFF, 'Rust belongs in the kernel', true, false),
    ];
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /All claims/ }));
    fireEvent.click(screen.getByRole('button', { name: 'My positions' }));

    expect(mocks.lastQuery).toMatchObject({ filter: 'mine' });
    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
    expect(screen.getByText('Rust belongs in the kernel')).toBeInTheDocument();
  });

  // Featured spaces plus the viewer's own; `/matchmaking/claims` takes a single space_id, so the
  // list has to be narrowed here.
  it('shows only claims from spaces the viewer is allowed to see', () => {
    mocks.claims = [
      claim(MINE, 'Chips are better than fries', true),
      claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID),
    ];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
    expect(screen.queryByText('Bitcoin will never top $250K')).not.toBeInTheDocument();
  });

  // GEO-2649. A separate question from the allowlist: the viewer may be perfectly entitled to see
  // the space, but if the acceptor isn't an editor of it the debate fails on-chain at the very end,
  // so offering the claim is offering a dead end.
  it('shows only claims from spaces a debate could be published in', () => {
    mocks.claims = [
      claim(MINE, 'Chips are better than fries', true),
      claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID),
    ];
    mocks.publishableSpaceIds = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
    expect(screen.queryByText('Bitcoin will never top $250K')).not.toBeInTheDocument();
  });

  // Both gates apply, and a claim has to clear both. Allowed to see it, but nothing can be
  // published there.
  it('hides an allowed space that no debate can be published in', () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.publishableSpaceIds = new Set([OTHER_SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);

    expect(screen.queryByText('Chips are better than fries')).toBeNull();
  });

  it('keeps the space filter to spaces a debate could be published in', () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.publishableSpaceIds = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    // Names resolve through useSpacesByIds, mocked empty here, so each offered space reads "Space".
    expect(screen.getAllByRole('button', { name: /Space$/ })).toHaveLength(1);
  });

  // Same trimming-under-the-viewer problem the allowlist has, and the same answer: `null` does not
  // filter, so without waiting the tab lists everything and then pulls claims back out.
  it('shows nothing until the publishable lookup settles', () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.publishableSpaceIds = null;
    mocks.publishableLoading = true;
    render(<ClaimsTab />);

    expect(screen.queryByText('Bitcoin will never top $250K')).toBeNull();
  });

  // And the other half of that rule: a lookup that settled without an answer must not empty the
  // tab. No acceptor is configured locally at all, so this is the everyday path.
  it('falls through to the unfiltered list when the publishable lookup comes back empty', () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.publishableSpaceIds = null;
    mocks.publishableLoading = false;
    render(<ClaimsTab />);

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // The allowlist is keyed on normalized ids; a claim row carries the hyphen-less form.
  it('matches allowed spaces across id formats', () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '').toLowerCase()]);
    render(<ClaimsTab />);

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // The reported bug: the menu opened on every space the server faceted, then trimmed itself to
  // the viewer's own a moment later — spaces appearing and vanishing, and offering picks that were
  // never theirs to make.
  it('shows nothing until the allowlist settles, rather than trimming under the viewer', () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = true;
    render(<ClaimsTab />);

    expect(screen.queryByText('Bitcoin will never top $250K')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    expect(screen.queryByLabelText('Loading space name')).toBeNull();
    expect(screen.queryByText('Space')).toBeNull();
  });

  // The tab shows a four-row skeleton while the allowlist resolves, so a sentinel below it sits in
  // view and reads "the viewer reached the end" off a list that isn't rendered.
  it('does not page the corpus while the allowlist is still resolving', () => {
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = true;
    mocks.hasNextPage = true;
    render(<ClaimsTab />);

    expect(screen.queryByTestId('claims-scroll-sentinel')).toBeNull();

    act(() => mocks.trigger?.());

    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  // A lookup that settles without an answer must not leave the panel permanently empty — too wide
  // a list beats one that never fills.
  it('falls through to the unfiltered list when the allowlist lookup comes back empty', () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.spaceAllowlist = null;
    mocks.allowlistLoading = false;
    render(<ClaimsTab />);

    expect(screen.getByText('Bitcoin will never top $250K')).toBeInTheDocument();
  });

  // The space menu comes from the server's facets, which span every space the query touched.
  it('offers only allowed spaces in the space filter', () => {
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    // Names resolve through useSpacesByIds, mocked empty here, so every allowed space reads "Space".
    expect(screen.getAllByRole('button', { name: /Space$/ })).toHaveLength(1);
  });

  // The allowlist runs over the loaded page, so a page can arrive with nothing left in it. With
  // the sentinel rendered only alongside results the list would stop there and report "no claims"
  // while the corpus still held matches.
  it('keeps asking for pages when the allowlist empties the one it has', () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '')]);
    mocks.hasNextPage = true;
    render(<ClaimsTab />);

    expect(screen.getByText('No debatable claims yet.')).toBeInTheDocument();
    expect(screen.getByTestId('claims-scroll-sentinel')).toBeInTheDocument();

    act(() => mocks.trigger?.());

    expect(mocks.fetchNextPage).toHaveBeenCalled();
  });

  // The reported bug: the space menu opened as a column of "Space" placeholders while it re-fetched
  // names the browse sidebar had been showing since first paint.
  it('names the space options from the sidebar rows without fetching them again', () => {
    mocks.facetSpaceIds = [SPACE_ID];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    expect(screen.getByRole('button', { name: /Crypto/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Space$/ })).toBeNull();
    // Not one id reached the knowledge graph — neither from the menu nor from the cards below it.
    expect(mocks.fetchedSpaceIds.flat()).toEqual([]);
  });

  // The same placeholder showed on every card in the list, from the same missing names.
  it('names each card space from the sidebar rows too', () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);

    expect(screen.getByText('Crypto')).toBeInTheDocument();
  });

  // On a cold load the sidebar hasn't cached anything yet either. A column of identical "Space"
  // rows reads as a list of real, indistinguishable choices; skeletons read as names on their way.
  it('draws unresolved space options as skeletons rather than a column of "Space"', () => {
    mocks.claims = [];
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.spacesLoading = true;
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    expect(screen.getAllByLabelText('Loading space name')).toHaveLength(2);
    expect(screen.queryByText('Space')).toBeNull();
  });

  // Picking a space nobody can name yet filters the list to something the viewer can't read back.
  it('does not let an unresolved space be picked', () => {
    mocks.claims = [];
    mocks.facetSpaceIds = [SPACE_ID];
    mocks.spacesLoading = true;
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));
    const option = screen.getByLabelText('Loading space name').closest('button');
    expect(option).toBeDisabled();

    fireEvent.click(option!);

    expect(mocks.lastQuery).toMatchObject({ spaceId: null });
  });

  // A settled lookup that still can't name the space really does leave "Space" as the best label
  // there is — the skeleton must not become the permanent state.
  it('falls back to the plain label once the lookup settles with no name', () => {
    mocks.claims = [];
    mocks.facetSpaceIds = [SPACE_ID];
    mocks.spacesLoading = false;
    render(<ClaimsTab />);

    fireEvent.click(screen.getByRole('button', { name: /Any space/ }));

    expect(screen.queryByLabelText('Loading space name')).toBeNull();
    // The option's accessible name picks up its avatar initial, so it reads "SSpace".
    expect(screen.getByRole('button', { name: /Space$/ })).toBeEnabled();
  });

  // The same placeholder ran down every card in the list.
  it('draws an unresolved card space as a skeleton', () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spacesLoading = true;
    render(<ClaimsTab />);

    expect(screen.getAllByLabelText('Loading space name').length).toBeGreaterThan(0);
    expect(screen.queryByText('Space')).toBeNull();
  });

  // A space the sidebar has no row for still has to resolve the old way.
  it('still fetches a space the sidebar has never heard of', () => {
    mocks.facetSpaceIds = [SPACE_ID, OTHER_SPACE_ID];
    mocks.sidebarData = sidebarData();
    render(<ClaimsTab />);

    expect(mocks.fetchedSpaceIds.flat()).toEqual([OTHER_SPACE_ID]);
  });
});

// Search, the space filter and the position filter all run server-side, so what this tab puts in
// the query is the whole feature — a mock that ignores it cannot catch a dropped filter.
it('asks the server for the filter the viewer picked', () => {
  render(<ClaimsTab />);

  expect(mocks.lastQuery).toMatchObject({ filter: 'all', spaceId: null });

  fireEvent.click(screen.getByRole('button', { name: 'All claims' }));
  fireEvent.click(screen.getByRole('button', { name: 'Debate now' }));

  expect(mocks.lastQuery).toMatchObject({ filter: 'debate_now' });
});
