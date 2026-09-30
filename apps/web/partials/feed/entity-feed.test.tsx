import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EXPLORE_TYPE_IDS,
  EXPLORE_ENTITY_TYPES,
  EXPLORE_ENTITY_TYPE_IDS,
  PAPER_TYPE_ID,
} from '~/core/explore/explore-constants';

import { EntityFeed } from './entity-feed';

const mocks = vi.hoisted(() => ({
  queryOptions: null as Record<string, unknown> | null,
  facetQueryOptions: null as Record<string, unknown> | null,
  facetData: null as { topics: Array<{ id: string; name: string | null; count: number }> } | null,
  /** Every key the feed has subscribed under, so a test can see what it asked for *first*. */
  queryKeys: [] as unknown[][],
  fetch: vi.fn(),
  /** Pages the mocked infinite query hands back, so a test can put a card on the page. */
  pages: null as { items: Record<string, unknown>[] }[] | null,
  /** Props the last rendered card received. */
  cardProps: null as Record<string, unknown> | null,
  /** The error the infinite query reports, so the failed-feed message can be rendered. */
  error: null as Error | null,
  /** What the browse sidebar's cache holds — the space menu's options. */
  browseSidebar: null as {
    featured: { id: string; name: string }[];
    editorOf: { id: string; name: string }[];
    memberOf: { id: string; name: string }[];
  } | null,
}));

vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({
  useCachedBrowseSidebarData: () => mocks.browseSidebar,
}));

vi.mock('@tanstack/react-query', () => ({
  keepPreviousData: Symbol('keepPreviousData'),
  useInfiniteQuery: (options: Record<string, unknown>) => {
    mocks.queryOptions = options;
    mocks.queryKeys.push(options.queryKey as unknown[]);
    return {
      data: mocks.pages ? { pages: mocks.pages } : undefined,
      isLoading: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      error: mocks.error,
    };
  },
  useQuery: (options: Record<string, unknown>) => {
    mocks.facetQueryOptions = options;
    return {
      data: mocks.facetData ?? undefined,
      isLoading: Boolean(options.enabled) && mocks.facetData === null,
      isPlaceholderData: false,
      error: null,
    };
  },
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: null }),
}));

vi.mock('~/design-system/menu', () => ({
  Menu: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
  MenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: (props: Record<string, unknown>) => {
    mocks.cardProps = props;
    return null;
  },
}));

beforeEach(() => {
  mocks.queryOptions = null;
  mocks.facetQueryOptions = null;
  mocks.facetData = null;
  mocks.pages = null;
  mocks.cardProps = null;
  mocks.queryKeys = [];
  mocks.error = null;
  mocks.browseSidebar = null;
  mocks.fetch.mockReset();
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: null }) });
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The request the feed would make right now, as a URL. */
async function requestedUrl() {
  const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
  await queryFn({ pageParam: undefined });
  return mocks.fetch.mock.calls.at(-1)?.[0] as string;
}

/**
 * The mocked Menu renders its trigger and its items together, so a word can appear twice. The
 * trigger's accessible name is "Time range: <value>", which both tells it apart from the item
 * holding the same word and keeps the value it is showing.
 */
const timeTrigger = () => screen.queryByRole('button', { name: /^Time range:/ });
const pickOption = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

// GEO-2610. The range answers "top of when?", so it belongs to Top alone. Best is ranked
// server-side and New is ordered by recency already; a window over either is a filter the viewer
// never asked for and — with the dropdown hidden — cannot see they have.
describe('EntityFeed time range visibility', () => {
  function renderExploreFeed() {
    return render(
      <EntityFeed
        apiEndpoint="/api/explore/feed"

        initialTime="month"
        initialSort="best"
        showSortFilter
      />
    );
  }

  it('hides the time dropdown for Best', () => {
    renderExploreFeed();

    expect(timeTrigger()).toBeNull();
  });

  it('hides it for New too', () => {
    renderExploreFeed();

    pickOption('New');

    expect(timeTrigger()).toBeNull();
  });

  it('shows it once Top is picked', () => {
    renderExploreFeed();

    pickOption('Top');

    expect(timeTrigger()).not.toBeNull();
  });

  it('hides it again when leaving Top', async () => {
    renderExploreFeed();

    pickOption('Top');
    expect(timeTrigger()).not.toBeNull();
    pickOption('New');

    await waitFor(() => expect(timeTrigger()).toBeNull());
  });

  // `aria-label` replaces the visible text as the accessible name, so naming the control without
  // its value would leave a screen reader unable to tell which sort or range is selected —
  // `MenuItem` marks the active option with a background colour and nothing else.
  it('announces the value each dropdown is showing, not just what it selects', () => {
    renderExploreFeed();

    expect(screen.queryByRole('button', { name: 'Sort: Best' })).not.toBeNull();

    pickOption('Top');

    expect(screen.queryByRole('button', { name: 'Sort: Top' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Time range: Last month' })).not.toBeNull();
  });

  // The point of the ticket: a hidden range must not quietly filter the feed.
  it('leaves the range out of the request when it is hidden', async () => {
    renderExploreFeed();

    expect(await requestedUrl()).not.toContain('time=');
  });

  it('sends the range when Top is showing it', async () => {
    renderExploreFeed();
    pickOption('Top');

    expect(await requestedUrl()).toContain('time=month');
  });

  // Resetting to a default would lose a choice the viewer made; the state is simply not consulted
  // while there is nowhere to show it.
  it('restores the range the viewer last picked when they return to Top', async () => {
    renderExploreFeed();

    pickOption('Top');
    pickOption('Last year');
    pickOption('New');
    await waitFor(() => expect(timeTrigger()).toBeNull());

    pickOption('Top');

    expect(timeTrigger()).not.toBeNull();
    expect(await requestedUrl()).toContain('time=year');
  });

  // Two Best feeds differing only in a hidden range are the same request; caching them apart would
  // refetch on a change the viewer never made.
  it('keys the query on what it actually sends', async () => {
    renderExploreFeed();
    const bestKey = mocks.queryOptions?.queryKey as unknown[];

    pickOption('Top');
    pickOption('Last year');
    pickOption('Best');
    await waitFor(() => expect(timeTrigger()).toBeNull());

    expect(mocks.queryOptions?.queryKey).toEqual(bestKey);
  });

  // The activity feed opts out of the range entirely, and its request is unchanged by this: it sent
  // `time=all` before and sends nothing now, which the route reads the same way.
  it('sends no range for a feed that opts out of the filter', async () => {
    render(
      <EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-1" initialTime="all" showTimeFilter={false} />
    );

    expect(timeTrigger()).toBeNull();
    expect(await requestedUrl()).not.toContain('time=');
  });
});

describe('EntityFeed card and query wiring', () => {
  it('leaves contextual query-key slots empty for ordinary feeds', () => {
    render(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-id" />);

    // The time slot is empty rather than 'week': this feed sorts by New, which carries no range,
    // so there is nothing to send and nothing to key on. The Topic/fixed-param slots are empty.
    expect(mocks.queryOptions?.queryKey).toEqual([
      '/api/activity/feed',
      'new',
      undefined,
      'space-id',
      null,
      '',
      '',
      null,
    ]);
  });
  // GEO-2757. Explore opts its cards into opening the side panel; the space activity tab, which
  // renders this same feed, does not. The flag is a single forward, so nothing but a test says it
  // is still being made.
  describe('titleOpensSidePanel', () => {
    const item = {
      entityId: 'entity-1',
      spaceId: 'space-1',
      spaceName: 'Space',
      spaceImage: null,
      types: [],
      createdAtSec: 0,
      title: 'An entity',
      description: null,
      imageUrl: null,
      commentCount: 0,
      recordingUrls: [],
      debateVideoUrls: [],
      debateClaim: null,
      isMemberOrEditor: true,
      hasPendingMembershipRequest: false,
    };

    it('hands the flag to every card when the feed is opted in', () => {
      mocks.pages = [{ items: [item] }];
      render(<EntityFeed apiEndpoint="/api/explore/feed" titleOpensSidePanel />);

      expect(mocks.cardProps?.titleOpensSidePanel).toBe(true);
    });

    it('leaves cards navigating when it is not', () => {
      mocks.pages = [{ items: [item] }];
      render(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-1" />);

      expect(mocks.cardProps?.titleOpensSidePanel).toBe(false);
    });

    it('hands the mobile debates-panel Claim variant to cards only when requested', () => {
      mocks.pages = [{ items: [item] }];
      const { rerender } = render(
        <EntityFeed apiEndpoint="/api/explore/feed" claimCardVariant="debate-panel-mobile" />
      );

      expect(mocks.cardProps?.claimCardVariant).toBe('debate-panel-mobile');

      rerender(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-1" />);
      expect(mocks.cardProps?.claimCardVariant).toBe('feed');
    });
  });
});

describe('EntityFeed contextual filters', () => {
  const topicOptions = [
    { value: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', label: 'Alignment' },
    { value: 'cccccccccccccccccccccccccccccccc', label: 'Governance' },
  ];

  function renderTopicFeed() {
    return render(
      <EntityFeed
        apiEndpoint="/api/topics/feed"
        initialSort="best"
        showSortFilter
        showTimeFilter={false}
        showTypeFilter
        initialTypeIds={EXPLORE_ENTITY_TYPE_IDS}
        typeOptions={EXPLORE_ENTITY_TYPES}
        topicOptions={topicOptions}
        fixedParams={{ topicId: 'topic-root', spaceId: 'space-route', spaceIds: 'space-route' }}
      />
    );
  }

  it('starts broad and sends the fixed Topic and curated-space scope', async () => {
    renderTopicFeed();

    const request = new URL(await requestedUrl(), 'https://example.com');
    expect(request.searchParams.get('sort')).toBe('best');
    expect(request.searchParams.get('topicId')).toBe('topic-root');
    expect(request.searchParams.get('spaceId')).toBe('space-route');
    expect(request.searchParams.get('spaceIds')).toBe('space-route');
    expect(request.searchParams.get('typeIds')).toBeNull();
  });

  it('defaults to types with results, shows their counts, and keeps the unfiltered feed request', async () => {
    const [claim, debate, article] = EXPLORE_ENTITY_TYPES;
    render(
      <EntityFeed
        apiEndpoint="/api/topics/feed"
        initialSort="best"
        showTimeFilter={false}
        showTypeFilter
        initialTypeIds={[claim.id, debate.id, article.id]}
        typeOptions={[claim, debate, article]}
        typeCounts={[
          { id: claim.id, count: 31 },
          { id: debate.id, count: 1 },
          { id: article.id, count: 0 },
        ]}
        selectTypesWithResultsByDefault
        fixedParams={{ topicId: 'topic-root', spaceId: 'space-route', spaceIds: 'space-route' }}
      />
    );

    await screen.findByText('2 types');
    expect(screen.getByRole('button', { name: new RegExp(`${claim.label}.*31.*Selected`) })).not.toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(`${debate.label}.*1.*Selected`) })).not.toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(article.label) })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unselect all' })).not.toBeNull();

    const request = new URL(await requestedUrl(), 'https://example.com');
    expect(request.searchParams.get('typeIds')).toBeNull();
  });

  it('sends selected child topics as additional narrowing', async () => {
    renderTopicFeed();

    pickOption('Alignment');

    await waitFor(async () => {
      const request = new URL(await requestedUrl(), 'https://example.com');
      expect(request.searchParams.get('topicIds')).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    });
  });

  it('shows entity counts and removes settled zero-result Topic options', () => {
    mocks.facetData = {
      topics: [{ id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', name: 'Alignment', count: 4 }],
    };

    render(
      <EntityFeed
        apiEndpoint="/api/topics/feed"
        topicFacetEndpoint="/api/topics/facets"
        showTopicFilter
        fixedParams={{ topicId: 'topic-root', spaceId: 'space-route', spaceIds: 'space-route' }}
      />
    );

    expect(screen.getByRole('button', { name: /Alignment.*4/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Governance/ })).toBeNull();
  });

  it('requests one population facet rather than sending a global Topic candidate list', async () => {
    mocks.facetData = { topics: [] };
    render(
      <EntityFeed
        apiEndpoint="/api/topics/feed"
        topicFacetEndpoint="/api/topics/facets"
        showTopicFilter
        fixedParams={{ topicId: 'topic-root', spaceId: 'space-route', spaceIds: 'space-route' }}
      />
    );

    const queryFn = mocks.facetQueryOptions?.queryFn as (args: { signal?: AbortSignal }) => Promise<unknown>;
    await queryFn({});

    const body = JSON.parse(mocks.fetch.mock.calls.at(-1)?.[1]?.body as string);
    expect(body).toMatchObject({
      selectedTopicIds: [],
      fixedParams: { topicId: 'topic-root', spaceId: 'space-route', spaceIds: 'space-route' },
    });
    expect(body).not.toHaveProperty('candidateTopicIds');
  });
});

describe('a feed request that failed', () => {
  function renderExploreFeed() {
    return render(<EntityFeed apiEndpoint="/api/explore/feed" initialSort="best" />);
  }

  it('rejects on an error status even when the body still parses as an empty page', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ items: [], nextCursor: null, error: 'feed_unavailable' }),
    });
    renderExploreFeed();

    const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
    await expect(queryFn({ pageParam: undefined })).rejects.toThrow();
  });

  // The retry is what turns a shed traversal on one cold instance back into a working feed, so it
  // is part of the fix rather than incidental configuration.
  it('is retried before the reader is told anything', () => {
    renderExploreFeed();

    expect(mocks.queryOptions?.retry).toBe(2);
  });

  it('says the feed did not load rather than blaming the filters', () => {
    mocks.error = new Error('Feed failed');
    renderExploreFeed();

    expect(screen.getByText('Could not load the feed.')).toBeTruthy();
    expect(screen.queryByText('No entities match these filters yet.')).toBeNull();
  });
});

// #2628 took the type and space menus off Explore to keep the header simple for new readers. Advanced
// readers asked for them back, so they sit behind "More filters" at the foot of the sort menu.
describe('EntityFeed more filters', () => {
  const FEATURED = { id: 'space-featured', name: 'Featured space' };
  const MINE = { id: 'space-mine', name: 'My space' };

  // A fresh store per render, like a fresh page load: what carries over is only what the atom wrote
  // to localStorage, which is the persistence under test — not state left in the shared store.
  function renderExploreFeed() {
    const store = createStore();
    const tree = () => (
      <Provider store={store}>
        <EntityFeed
          apiEndpoint="/api/explore/feed"
          initialTime="month"
          initialSort="best"
          showSortFilter
          showMoreFilters
          typeOptions={EXPLORE_ENTITY_TYPES}
          initialTypeIds={DEFAULT_EXPLORE_TYPE_IDS}
        />
      </Provider>
    );
    const result = render(tree());
    /** The same page re-rendered, as when the sidebar cache it reads hands back a new payload. */
    return { ...result, rerenderFeed: () => result.rerender(tree()) };
  }

  const typeTrigger = () => screen.queryByRole('button', { name: /^\d+ types?$/ });
  const spaceTrigger = () => screen.queryAllByText('Any space')[0] ?? null;
  // Type rows announce their state after the label ("Paper Not selected"), so match the start.
  const pickType = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));

  beforeEach(() => {
    mocks.browseSidebar = { featured: [FEATURED], editorOf: [MINE], memberOf: [MINE] };
    localStorage.removeItem('exploreMoreFiltersOpen');
  });

  it('keeps the type and space menus out of the header until asked for', () => {
    renderExploreFeed();

    expect(screen.getByRole('button', { name: 'More filters' })).toBeTruthy();
    expect(typeTrigger()).toBeNull();
    expect(screen.queryByText('Any space')).toBeNull();
  });

  it('reveals both menus, opening on the defaults without changing the request', async () => {
    renderExploreFeed();
    const before = await requestedUrl();

    pickOption('More filters');

    expect(typeTrigger()?.textContent).toBe('2 types');
    expect(spaceTrigger()).toBeTruthy();
    expect(await requestedUrl()).toBe(before);
    expect(before).not.toContain('typeIds');
    expect(before).not.toContain('spaceIds');
  });

  it('offers each visible space once, featured first', () => {
    renderExploreFeed();
    pickOption('More filters');

    expect(screen.getAllByText('Featured space')).toHaveLength(1);
    expect(screen.getAllByText('My space')).toHaveLength(1);
  });

  it('sends a type the reader ticks', async () => {
    renderExploreFeed();
    pickOption('More filters');

    pickType('Paper');

    const url = new URL(await requestedUrl(), 'http://localhost');
    expect(url.searchParams.get('typeIds')?.split(',')).toEqual(
      EXPLORE_ENTITY_TYPE_IDS.filter(id => [...DEFAULT_EXPLORE_TYPE_IDS, PAPER_TYPE_ID].includes(id))
    );
  });

  // Explore's route reads a missing `typeIds` as its default two types, not as every type.
  it('sends every type explicitly when the reader selects all of them', async () => {
    renderExploreFeed();
    pickOption('More filters');

    pickOption('Select all');

    const url = new URL(await requestedUrl(), 'http://localhost');
    expect(url.searchParams.get('typeIds')?.split(',')).toEqual(EXPLORE_ENTITY_TYPE_IDS);
  });

  it('narrows to a space the reader ticks', async () => {
    renderExploreFeed();
    pickOption('More filters');

    fireEvent.click(screen.getByText('My space'));

    const url = new URL(await requestedUrl(), 'http://localhost');
    expect(url.searchParams.get('spaceIds')).toBe(MINE.id);
  });

  it('drops every narrowing when the menus are put away', async () => {
    renderExploreFeed();
    pickOption('More filters');
    pickType('Paper');
    fireEvent.click(screen.getByText('My space'));

    pickOption('Hide filters');

    expect(typeTrigger()).toBeNull();
    const url = await requestedUrl();
    expect(url).not.toContain('typeIds');
    expect(url).not.toContain('spaceIds');

    pickOption('More filters');
    expect(typeTrigger()?.textContent).toBe('2 types');
  });

  it('remembers the reveal, and only the reveal, for the next visit', async () => {
    const first = renderExploreFeed();
    pickOption('More filters');
    pickType('Paper');
    first.unmount();

    renderExploreFeed();

    await waitFor(() => expect(typeTrigger()?.textContent).toBe('2 types'));
    expect(await requestedUrl()).not.toContain('typeIds');
  });

  // Copilot on #2682: an account change swaps the sidebar payload under an open menu.
  it('drops a ticked space the next account cannot see, so the trigger and request agree', async () => {
    const { rerenderFeed } = renderExploreFeed();
    pickOption('More filters');
    fireEvent.click(screen.getByText('My space'));
    expect(await requestedUrl()).toContain('spaceIds=');

    mocks.browseSidebar = { featured: [FEATURED], editorOf: [], memberOf: [] };
    rerenderFeed();

    // The trigger reads "Any space" again. Left selected, it would fall back to counting a space it
    // can no longer name ("1 space") over a feed the route has already stopped filtering.
    await waitFor(() => expect(screen.queryByText('1 space')).toBeNull());
    expect(screen.queryByText('My space')).toBeNull();
    expect(await requestedUrl()).not.toContain('spaceIds');
  });

  it('keeps a ticked space while the next payload is still loading', async () => {
    const { rerenderFeed } = renderExploreFeed();
    pickOption('More filters');
    fireEvent.click(screen.getByText('My space'));

    mocks.browseSidebar = null;
    rerenderFeed();

    const url = new URL(await requestedUrl(), 'http://localhost');
    expect(url.searchParams.get('spaceIds')).toBe(MINE.id);
  });

  it('offers nothing extra on a feed that does not opt in', () => {
    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSort="best" showSortFilter />);

    expect(screen.queryByRole('button', { name: 'More filters' })).toBeNull();
  });
});
