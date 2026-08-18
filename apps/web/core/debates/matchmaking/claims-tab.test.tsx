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
  lastQuery: null as unknown,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  observed: [] as Element[],
  trigger: null as null | (() => void),
}));

vi.mock('~/core/debates/use-claim-space-allowlist', () => ({
  useClaimSpaceAllowlist: () => ({ allowlist: mocks.spaceAllowlist, isLoading: false }),
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

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: () => ({ spaces: [], spacesById: new Map(), isLoading: false }),
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
  // Null is "the allowlist hasn't resolved", which every pre-existing case here runs under.
  mocks.spaceAllowlist = null;
  mocks.fetchNextPage.mockReset();
  mocks.observed = [];
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

  // The allowlist is keyed on normalized ids; a claim row carries the hyphen-less form.
  it('matches allowed spaces across id formats', () => {
    mocks.claims = [claim(MINE, 'Chips are better than fries', true)];
    mocks.spaceAllowlist = new Set([SPACE_ID.replace(/-/g, '').toLowerCase()]);
    render(<ClaimsTab />);

    expect(screen.getByText('Chips are better than fries')).toBeInTheDocument();
  });

  // Until the sources settle there is no allowlist to filter against, and hiding claims the viewer
  // is entitled to and then flashing them back in reads worse than a beat of everything.
  it('filters nothing while the allowlist is still resolving', () => {
    mocks.claims = [claim(THEIRS, 'Bitcoin will never top $250K', false, false, OTHER_SPACE_ID)];
    mocks.spaceAllowlist = null;
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
