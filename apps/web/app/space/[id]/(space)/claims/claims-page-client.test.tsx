import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Relation } from '~/core/types';

import { ClaimsPageClient } from './claims-page-client';

const mocks = vi.hoisted(() => ({
  nameSet: vi.fn(),
  relationSet: vi.fn(),
  setActiveSpace: vi.fn(),
  bumpReviewVersion: vi.fn(),
  setIsReviewOpen: vi.fn(),
  fetchNextPage: vi.fn(),
  hookCalls: [] as { spaceId: string; kind: string; sort: string; filters: any }[],
  searchCalls: [] as string[],
  topics: [] as { id: string; name: string | null; count: number }[],
  searchClaimIds: null as string[] | null,
  retrySearch: vi.fn(),
  search: { isPending: false, error: null as Error | null },
  facet: { settled: true, error: null as Error | null },
  rows: [] as { entityId: string; spaceId: string }[],
  listState: { isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false },
}));

/**
 * The ranked query is covered in `space-activity-rows.test.ts` and the card where it lives. What
 * this page decides is which list it asks for and how it draws the result, so the hook is faked and
 * its arguments recorded.
 */
vi.mock('~/core/space/use-space-debate-activity', () => ({
  useSpaceActivityRowsInfinite: (spaceId: string, kind: string, sort: string, filters: unknown) => {
    mocks.hookCalls.push({ spaceId, kind, sort, filters });
    return {
      rows: mocks.rows,
      isLoading: mocks.listState.isLoading,
      isError: mocks.listState.isError,
      isPending: false,
      hasNextPage: mocks.listState.hasNextPage,
      isFetchingNextPage: mocks.listState.isFetchingNextPage,
      fetchNextPage: mocks.fetchNextPage,
    };
  },
  useSpaceClaimTopicFacet: () => ({
    topics: mocks.topics,
    isLoading: false,
    settled: mocks.facet.settled,
    error: mocks.facet.error,
  }),
  useSpaceClaimSearch: (search: string) => {
    mocks.searchCalls.push(search);
    return {
      claimIds: mocks.searchClaimIds,
      isPending: mocks.search.isPending,
      error: mocks.search.error,
      retry: mocks.retrySearch,
    };
  },
}));

vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: ({ item, hideSpaceLink, hideJoinButton }: Record<string, any>) => (
    <div
      data-testid="claim-card"
      data-entity-id={item.entityId}
      data-hide-space-link={String(Boolean(hideSpaceLink))}
      data-hide-join={String(Boolean(hideJoinButton))}
    />
  ),
}));

vi.mock('~/core/state/diff-store', () => ({
  useDiff: () => ({
    setActiveSpace: mocks.setActiveSpace,
    bumpReviewVersion: mocks.bumpReviewVersion,
    setIsReviewOpen: mocks.setIsReviewOpen,
  }),
}));

vi.mock('~/core/sync/use-mutate', () => ({
  useMutate: () => ({
    storage: {
      entities: { name: { set: mocks.nameSet } },
      relations: { set: mocks.relationSet },
    },
  }),
}));

vi.mock('~/design-system/select-entity-compact', () => ({
  SelectEntityCompact: ({ placeholder }: { placeholder: string }) => (
    <div data-testid={`selector-${placeholder}`}>{placeholder}</div>
  ),
}));

/**
 * The topic menu's dropdown measures itself to decide where to open. `setupTests.ts` stubs this
 * globally but is not the file vitest loads — see `vite.config.js`, which points at
 * `vitest.setup.ts` — so the menu's own tests stub it per file and so does this one.
 */
window.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const asked = () => mocks.hookCalls.at(-1)!;

beforeEach(() => {
  mocks.hookCalls.length = 0;
  mocks.searchCalls.length = 0;
  // Deliberately not in count order — the facet answers in the graph's, which is no order a reader
  // can see, and putting the menu right is this surface's job.
  mocks.topics = [
    { id: 't1', name: 'Governance', count: 12 },
    { id: 't2', name: 'Safety', count: 5 },
    { id: 't3', name: 'Industry', count: 31 },
  ];
  mocks.searchClaimIds = null;
  mocks.search = { isPending: false, error: null };
  mocks.facet = { settled: true, error: null };
  mocks.rows = [
    { entityId: 'c1', spaceId: 'space-1' },
    { entityId: 'c2', spaceId: 'space-1' },
  ];
  mocks.listState = { isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false };
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('ClaimsPageClient', () => {
  it('renders the space’s ranked claims under its heading', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Claims' })).toBeInTheDocument();
    expect(screen.getAllByTestId('claim-card').map(card => card.dataset.entityId)).toEqual(['c1', 'c2']);
  });

  // The ranked list for this space's claims, and nothing else — the hook scopes the query.
  it('asks for this space’s claims', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(asked()).toMatchObject({ spaceId: 'space-1', kind: 'claims' });
  });

  it('follows the space it is given', () => {
    const view = render(<ClaimsPageClient spaceId="space-1" />);
    view.rerender(<ClaimsPageClient spaceId="space-2" />);

    expect(asked()).toMatchObject({ spaceId: 'space-2', kind: 'claims' });
  });

  // Every row is this space by construction, so a space chip and a Join button would say the same
  // thing on all of them.
  it('hides the per-card space chip and join button', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    const card = screen.getAllByTestId('claim-card')[0];
    expect(card).toHaveAttribute('data-hide-space-link', 'true');
    expect(card).toHaveAttribute('data-hide-join', 'true');
  });

  it('draws a skeleton rather than an empty list while the first page is out', () => {
    mocks.rows = [];
    mocks.listState = { ...mocks.listState, isLoading: true };
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.queryByText('No claims here yet.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-card')).not.toBeInTheDocument();
  });

  // An empty list and a failed one look identical and mean opposite things.
  it('says so when the list could not be read', () => {
    mocks.rows = [];
    mocks.listState = { ...mocks.listState, isError: true };
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Could not load claims.')).toBeInTheDocument();
    expect(screen.queryByText('No claims here yet.')).not.toBeInTheDocument();
  });

  it('reports a genuinely empty space', () => {
    mocks.rows = [];
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('No claims here yet.')).toBeInTheDocument();
  });

  // Best is the order the Overview card ranks its six by, so "See all claims" continues that list
  // rather than opening a different one.
  it('opens on Best', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(asked()).toMatchObject({ sort: 'best' });
    expect(screen.getByLabelText('Sort: Best')).toBeInTheDocument();
  });

  it('re-asks in the picked order', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByLabelText('Sort: Best'));
    fireEvent.click(screen.getByText('New'));

    expect(asked()).toMatchObject({ sort: 'new' });
  });

  it('offers Explore’s three sorts', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByLabelText('Sort: Best'));

    // `Best` twice — once in the trigger, once as the ticked option — and the other two once each.
    expect(screen.getAllByText('Best')).toHaveLength(2);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Top')).toBeInTheDocument();
  });

  /** A row inside the open topic menu, which the trigger's own label can otherwise shadow. */
  const topicRow = (name: string) =>
    screen
      .getAllByRole('button')
      .filter(button => button.closest('[data-radix-popper-content-wrapper]') !== null)
      .find(button => button.textContent?.startsWith(name))!;

  const topicRows = () =>
    screen
      .getAllByRole('button')
      .map(button => button.textContent?.trim() ?? '')
      .filter(text => /^(Governance|Safety|Industry)\d+$/.test(text));

  it('lists topics by highest count first', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

    expect(topicRows()).toEqual(['Industry31', 'Governance12', 'Safety5']);
  });

  /**
   * Every count changes when the filter does, so ordering a ticked row by its new count would move
   * the row just clicked before the next click lands. Picked rows hold the top, in pick order.
   */
  it('pins a picked topic to the top rather than re-sorting it', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /Safety/ }));

    expect(topicRows()[0]).toBe('Safety5');
  });

  it('narrows by a picked topic', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /Governance/ }));

    expect(asked().filters).toMatchObject({ topicIds: ['t1'] });
  });

  // AND, not OR: a claim has to carry every picked topic.
  it('accumulates picked topics rather than replacing them', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /Governance/ }));
    fireEvent.click(screen.getByRole('button', { name: /Safety/ }));

    expect(asked().filters).toMatchObject({ topicIds: ['t1', 't2'] });
  });

  /**
   * The facet answers in dashed uuids where the rows carry dashless ones, so an id-equality toggle
   * would add a second spelling of a topic already picked rather than removing it. `toggleId`
   * compares canonically; this pins that it is what runs.
   */
  it('unticks a topic whose id comes back in the other spelling', () => {
    mocks.topics = [{ id: '41e851610e13a19441c4d980f2f2ce6b', name: 'Governance', count: 12 }];
    const view = render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(topicRow('Governance'));
    expect(asked().filters.topicIds).toHaveLength(1);

    // The same topic, dashed — which is how a facet grouping hands it back. Re-rendered so the menu
    // actually redraws with the other spelling; without that the row still carries the first one
    // and the toggle is never asked the question. Once one is picked the trigger carries its name
    // too, so the row has to be found inside the open menu.
    mocks.topics = [{ id: '41e85161-0e13-a194-41c4-d980f2f2ce6b', name: 'Governance', count: 12 }];
    view.rerender(<ClaimsPageClient spaceId="space-1" />);
    fireEvent.click(topicRow('Governance'));

    expect(asked().filters.topicIds).toEqual([]);
  });

  it('clears the topic selection', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));
    fireEvent.click(screen.getByRole('button', { name: /Governance/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Any topic' }));

    expect(asked().filters).toMatchObject({ topicIds: [] });
  });

  it('sends what the viewer typed to the search resolver', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'tariffs' } });

    expect(mocks.searchCalls.at(-1)).toBe('tariffs');
  });

  /**
   * Search reaches the list as ids, not text (GEO-2898) — resolved against the tagged corpus where
   * it can be stemmed and ranked. `null` narrows nothing; `[]` means nothing matched.
   */
  it('narrows the list by the ids a search matched', () => {
    mocks.searchClaimIds = ['c9'];
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(asked().filters).toMatchObject({ searchClaimIds: ['c9'] });
  });

  // An empty list under a filter and an empty space mean different things and need different words.
  it('distinguishes a filtered-empty list from an empty space', () => {
    mocks.rows = [];
    const view = render(<ClaimsPageClient spaceId="space-1" />);
    expect(screen.getByText('No claims here yet.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search claims'), { target: { value: 'nothing matches' } });
    expect(screen.getByText('No claims match these filters.')).toBeInTheDocument();
    view.unmount();
  });

  /**
   * `useTaggedClaimSearch` holds `settled` false on a failure, so a page reading only that dims
   * forever with nothing in flight. The list cannot be narrowed to what was typed either, and
   * listing the space unfiltered would answer a question nobody asked.
   */
  it('shows a retryable error instead of a list when the search fails', () => {
    mocks.search = { isPending: false, error: new Error('search down') };
    render(<ClaimsPageClient spaceId="space-1" />);

    expect(screen.getByText('Could not search claims.')).toBeInTheDocument();
    expect(screen.queryByTestId('claim-card')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retrySearch).toHaveBeenCalled();
  });

  // A failure is not "still coming"; dimming behind an error reads as loading.
  it('does not dim the list behind a search error', () => {
    mocks.search = { isPending: true, error: new Error('search down') };
    const { container } = render(<ClaimsPageClient spaceId="space-1" />);

    expect(container.querySelector('.opacity-60')).toBeNull();
  });

  /**
   * The facet's `settled` is false on a failure as well as during a load, so driving skeletons off
   * it alone draws them forever. The topics are still named, so a failure drops the counts rather
   * than the menu.
   */
  it('stops the topic menu waiting on counts that failed', () => {
    mocks.facet = { settled: false, error: new Error('counts down') };
    vi.useFakeTimers({ shouldAdvanceTime: true });

    try {
      render(<ClaimsPageClient spaceId="space-1" />);
      fireEvent.click(screen.getByRole('button', { name: /Any topic/ }));

      // The menu waits out its skeleton delay before drawing them, so a synchronous assertion
      // passes whether or not the counts are reported pending. Past the delay it does not.
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.queryAllByLabelText('Loading count')).toHaveLength(0);
      expect(topicRow('Industry')).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  // The staging form is unrelated to how the list is ordered, and it is the only place in the app
  // that opens a claim proposal from a space. Turning the list into a feed must not take it away.
  it('stages a claim with Claim and Topics relations only', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));
    fireEvent.change(screen.getByLabelText('Claim'), {
      target: { value: 'Public transit should be free' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Open proposal' }).closest('form')!);

    expect(mocks.nameSet).toHaveBeenCalledWith(expect.any(String), 'space-1', 'Public transit should be free');
    const relationTypes = mocks.relationSet.mock.calls.map(call => (call[0] as Relation).type.id);
    expect(relationTypes).toContain(SystemIds.TYPES_PROPERTY);
    expect(relationTypes).not.toContain('73609ae8644c4463a50a90a3ee585746');
    expect(relationTypes).not.toContain(TOPICS_PROPERTY_ID);
    expect(mocks.setIsReviewOpen).toHaveBeenCalledWith(true);
  });

  it('keeps the list mounted while the form is open', () => {
    render(<ClaimsPageClient spaceId="space-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Add claim' }));

    expect(screen.getAllByTestId('claim-card')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add claim' })).not.toBeInTheDocument();
  });
});
