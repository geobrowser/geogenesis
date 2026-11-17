import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_EXPLORE_TYPE_IDS,
  EXPLORE_ENTITY_TYPES,
  EXPLORE_ENTITY_TYPE_IDS,
  PAPER_TYPE_ID,
} from '~/core/explore/explore-constants';
import { PUBLIC_BEST_FEED_PATH } from '~/core/explore/explore-feed-params';

import { EntityFeed, FEED_REQUEST_TIMEOUT_MS, buildFeedQuery, leadFirst } from './entity-feed';

const mocks = vi.hoisted(() => ({
  entryItem: null as Record<string, unknown> | null,
  entryQueryOptions: null as Record<string, unknown> | null,
  entryPending: false,
  hasNextPage: false,
  queryOptions: null as Record<string, unknown> | null,
  facetQueryOptions: null as Record<string, unknown> | null,
  /** The public first page a signed-in reader paints from while their own page loads. */
  publicQueryOptions: null as Record<string, unknown> | null,
  publicPage: null as { items: Record<string, unknown>[]; nextCursor?: string | null } | null,
  /** Whether the infinite query reports its data as a placeholder. */
  isPlaceholderData: false,
  facetData: null as { topics: Array<{ id: string; name: string | null; count: number }> } | null,
  /** Every key the feed has subscribed under, so a test can see what it asked for *first*. */
  queryKeys: [] as unknown[][],
  fetch: vi.fn(),
  /** Pages the mocked infinite query hands back, so a test can put a card on the page. */
  pages: null as { items: Record<string, unknown>[] }[] | null,
  /** Props the last rendered card received. */
  cardProps: null as Record<string, unknown> | null,
  /** The item each feed position last rendered. */
  itemAt: {} as Record<number, Record<string, unknown>>,
  /** The error the infinite query reports, so the failed-feed message can be rendered. */
  error: null as Error | null,
  /** Whether the last next-page fetch failed. */
  isFetchNextPageError: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  /** What the browse sidebar's cache holds — the space menu's options. */
  browseSidebar: null as {
    featured: { id: string; name: string }[];
    editorOf: { id: string; name: string }[];
    memberOf: { id: string; name: string }[];
    featuredError?: boolean;
  } | null,
  /** The smart-account address `useSmartAccount` reports; null until Privy restores the wallet. */
  accountAddress: null as string | null,
  /** The identity token Privy has restored; null until it has. */
  identityToken: null as string | null,
}));

vi.mock('~/core/wallet/auth-hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/wallet/auth-hooks')>()),
  useIdentityToken: () => ({ identityToken: mocks.identityToken }),
  // Privy still restoring, which is what a reader with a wallet cookie sees on first paint. The
  // facade's own signed-out value reports `ready: true`, which ends these waits at once.
  usePrivy: () => ({ ready: false, authenticated: false }),
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
      isPlaceholderData: mocks.isPlaceholderData,
      fetchNextPage: mocks.fetchNextPage,
      hasNextPage: mocks.hasNextPage,
      error: mocks.error,
      isFetching: false,
      isFetchNextPageError: mocks.isFetchNextPageError,
      refetch: mocks.refetch,
    };
  },
  useQuery: (options: Record<string, unknown>) => {
    if ((options.queryKey as unknown[])[0] === 'explore-entry') {
      mocks.entryQueryOptions = options;
      return { data: options.enabled ? mocks.entryItem : undefined, isPending: mocks.entryPending };
    }
    if ((options.queryKey as unknown[])[1] === 'public') {
      mocks.publicQueryOptions = options;
      return { data: options.enabled ? (mocks.publicPage ?? undefined) : undefined };
    }
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
  useSmartAccount: () => ({
    smartAccount: mocks.accountAddress ? { account: { address: mocks.accountAddress } } : null,
  }),
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
    mocks.itemAt[props.itemPosition as number] = props.item as Record<string, unknown>;
    return null;
  },
}));

beforeEach(() => {
  mocks.queryOptions = null;
  mocks.facetQueryOptions = null;
  mocks.publicQueryOptions = null;
  mocks.publicPage = null;
  mocks.isPlaceholderData = false;
  mocks.facetData = null;
  mocks.pages = null;
  mocks.cardProps = null;
  mocks.itemAt = {};
  mocks.entryItem = null;
  mocks.entryPending = false;
  mocks.hasNextPage = false;
  mocks.entryQueryOptions = null;
  mocks.queryKeys = [];
  mocks.error = null;
  mocks.isFetchNextPageError = false;
  mocks.refetch.mockReset();
  mocks.fetchNextPage.mockReset();
  mocks.browseSidebar = null;
  mocks.accountAddress = null;
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

  // GEO-3703: a reader left on the failure message had no way out but reloading the page.
  it('offers to try again, and trying again refetches the feed', () => {
    mocks.error = new Error('Feed failed');
    renderExploreFeed();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('says when the next page failed and fetches it again on request', () => {
    mocks.pages = [{ items: [{ entityId: 'a1', spaceId: 's1', types: [], title: 'A' }] }];
    mocks.hasNextPage = true;
    mocks.isFetchNextPageError = true;
    renderExploreFeed();

    expect(screen.getByText('Could not load more.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  // A request the route never answers would otherwise hold the skeletons up for good.
  it('gives up on a request that is never answered', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    renderExploreFeed();

    const queryFn = mocks.queryOptions?.queryFn as (args: {
      pageParam?: string;
      signal: AbortSignal;
    }) => Promise<unknown>;
    const reactQuery = new AbortController();
    await queryFn({ pageParam: undefined, signal: reactQuery.signal });

    expect(timeout).toHaveBeenCalledWith(FEED_REQUEST_TIMEOUT_MS);
    // Still cancelled when react-query drops the request, not only when the clock runs out.
    const init = mocks.fetch.mock.calls.at(-1)?.[1] as RequestInit;
    reactQuery.abort();
    expect(init.signal?.aborted).toBe(true);
    timeout.mockRestore();
  });

  it('still loads in a browser without AbortSignal.any (Safari before 17.4)', async () => {
    const any = AbortSignal.any;
    // @ts-expect-error -- simulating an older browser
    delete AbortSignal.any;
    try {
      renderExploreFeed();
      const queryFn = mocks.queryOptions?.queryFn as (args: {
        pageParam?: string;
        signal: AbortSignal;
      }) => Promise<unknown>;
      await expect(queryFn({ pageParam: undefined, signal: new AbortController().signal })).resolves.toBeTruthy();
    } finally {
      AbortSignal.any = any;
    }
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

  // Copilot on #2682: a failed Featured traversal still returns a payload, with no featured rows.
  it('keeps a ticked featured space through a payload whose Featured lookup failed', async () => {
    const { rerenderFeed } = renderExploreFeed();
    pickOption('More filters');
    fireEvent.click(screen.getByText('Featured space'));

    mocks.browseSidebar = { featured: [], editorOf: [MINE], memberOf: [MINE], featuredError: true };
    rerenderFeed();

    const url = new URL(await requestedUrl(), 'http://localhost');
    expect(url.searchParams.get('spaceIds')).toBe(FEATURED.id);
  });

  // Copilot on #2682: the checkboxes and the trigger compare ids exactly.
  it('follows a space whose id comes back in another spelling, so the trigger still names it', async () => {
    const { rerenderFeed } = renderExploreFeed();
    pickOption('More filters');
    fireEvent.click(screen.getByText('My space'));
    const respelled = { ...MINE, id: 'spacemine' };

    mocks.browseSidebar = { featured: [FEATURED], editorOf: [respelled], memberOf: [respelled] };
    rerenderFeed();

    await waitFor(() => expect(screen.queryByText('1 space')).toBeNull());
    const url = new URL(await requestedUrl(), 'http://localhost');
    expect(url.searchParams.get('spaceIds')).toBe('spacemine');
  });

  it('offers nothing extra on a feed that does not opt in', () => {
    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSort="best" showSortFilter />);

    expect(screen.queryByRole('button', { name: 'More filters' })).toBeNull();
  });
});

// A signed-in reader's account is null for the first renders, until Privy restores the wallet and
// ZeroDev builds the account. Keyed on that address, the feed used to fetch anonymously, render,
// blank and fetch again (2026-10-16); #2890 made it wait for the account instead, which held the
// first card back by a second or two. The server reads the same cookie, so the feed keys on it.
describe('EntityFeed for a reader with a wallet cookie', () => {
  const ADDRESS = '0x00000000000000000000000000000000000000aa';

  function renderFeed(walletAddress: string | null) {
    return render(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSort="best"
        showTimeFilter={false}
        walletAddress={walletAddress}
      />
    );
  }

  function renderForYou() {
    return render(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSort="for-you"
        showTimeFilter={false}
        sendIdentityToken
        followedTopicIds={[]}
        walletAddress={ADDRESS}
      />
    );
  }

  afterEach(() => {
    mocks.identityToken = null;
    vi.useRealTimers();
  });

  it('sends the first request at once, keyed on the cookie, before the account resolves', () => {
    const { rerender } = renderFeed(ADDRESS);
    expect(mocks.queryOptions?.enabled).toBe(true);
    expect((mocks.queryOptions?.queryKey as unknown[]).at(-1)).toBe(ADDRESS);
    const firstKey = mocks.queryOptions?.queryKey;

    mocks.accountAddress = ADDRESS;
    rerender(
      <EntityFeed apiEndpoint="/api/explore/feed" initialSort="best" showTimeFilter={false} walletAddress={ADDRESS} />
    );
    // The same key, so the account arriving does not refetch.
    expect(mocks.queryOptions?.queryKey).toEqual(firstKey);
  });

  it('holds a request that carries an identity token until Privy restores the token', () => {
    const { rerender } = renderForYou();
    expect(mocks.queryOptions?.enabled).toBe(false);
    expect(screen.queryByText('No entities match these filters yet.')).toBeNull();

    mocks.identityToken = 'token';
    rerender(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSort="for-you"
        showTimeFilter={false}
        sendIdentityToken
        followedTopicIds={[]}
        walletAddress={ADDRESS}
      />
    );
    expect(mocks.queryOptions?.enabled).toBe(true);
    expect((mocks.queryOptions?.queryKey as unknown[]).at(-1)).toBe(ADDRESS);
  });

  it('gives up waiting for the token after five seconds, so a stale cookie cannot hold the feed', () => {
    vi.useFakeTimers();
    renderForYou();
    expect(mocks.queryOptions?.enabled).toBe(false);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(mocks.queryOptions?.enabled).toBe(true);
  });

  it('does not wait for a reader with no wallet cookie', () => {
    renderFeed(null);
    expect(mocks.queryOptions?.enabled).toBe(true);
    expect((mocks.queryOptions?.queryKey as unknown[]).at(-1)).toBeNull();
  });

  it('keeps the cards up across a change of account, but not a change of filter', () => {
    renderFeed(null);
    const placeholderData = mocks.queryOptions?.placeholderData as (
      previous: unknown,
      previousQuery: { queryKey: unknown[] } | undefined
    ) => unknown;
    const key = mocks.queryOptions?.queryKey as unknown[];
    const previous = { pages: [] };

    expect(placeholderData(previous, { queryKey: [...key.slice(0, -1), ADDRESS] })).toBe(previous);
    expect(placeholderData(previous, { queryKey: [key[0], 'new', ...key.slice(2)] })).toBeUndefined();
    expect(placeholderData(previous, undefined)).toBeUndefined();
  });
});

describe('EntityFeed pending onboarding follows', () => {
  it('sends the pending-follow signal only for For you', async () => {
    render(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSort="for-you"
        sortOptions={['for-you', 'best']}
        showSortFilter
        followedTopicIds={['topic-a']}
        pendingTopicFollows
      />
    );
    expect(new URL(await requestedUrl(), 'http://localhost').searchParams.get('pendingTopicFollows')).toBe('1');

    pickOption('Best');
    const best = new URL(await requestedUrl(), 'http://localhost');
    expect(best.searchParams.get('pendingTopicFollows')).toBeNull();
    expect(best.searchParams.get('followedTopicIds')).toBeNull();
  });

  it('refetches when pending follows clear without changing the topic ids', () => {
    const props = {
      apiEndpoint: '/api/explore/feed',
      initialSort: 'for-you' as const,
      followedTopicIds: ['topic-a'],
    };
    const { rerender } = render(<EntityFeed {...props} pendingTopicFollows />);
    const pendingKey = mocks.queryOptions?.queryKey;

    rerender(<EntityFeed {...props} pendingTopicFollows={false} />);

    expect(mocks.queryOptions?.queryKey).not.toEqual(pendingKey);
  });
});

// The CDN ignores cookies, so only the plain signed-out first Best page may use the cacheable URL.
describe('EntityFeed cacheable first page', () => {
  function renderFeed(props: Partial<React.ComponentProps<typeof EntityFeed>> = {}) {
    return render(
      <EntityFeed apiEndpoint="/api/explore/feed" initialSort="best" showSortFilter cdnFirstPage {...props} />
    );
  }

  it('uses the public URL for a signed-out reader, matching the preload exactly', async () => {
    renderFeed();

    expect(await requestedUrl()).toBe(PUBLIC_BEST_FEED_PATH);
  });

  it('keeps the personal URL when a wallet cookie is present', async () => {
    renderFeed({ walletAddress: '0xabc' });

    expect(await requestedUrl()).toBe('/api/explore/feed?sort=best');
  });

  it('keeps the personal URL once a smart account has resolved', async () => {
    mocks.accountAddress = '0xabc';
    renderFeed();

    expect(await requestedUrl()).toBe('/api/explore/feed?sort=best');
  });

  it('keeps the personal URL for other sorts', async () => {
    renderFeed({ initialSort: 'new' });

    expect(await requestedUrl()).not.toContain('public=');
  });

  it('stays off unless the feed opts in', async () => {
    renderFeed({ cdnFirstPage: false });

    expect(await requestedUrl()).toBe('/api/explore/feed?sort=best');
  });

  it('never marks a later page, a filter or a scoped feed', () => {
    const base = {
      sort: 'best' as const,
      time: undefined,
      spaceIds: [],
      typeIds: undefined,
      topicIds: [],
      followedTopicIds: [],
      fixedParams: {},
      cursor: undefined,
      anonymous: true,
    };
    expect(buildFeedQuery(base)).toBe('sort=best&public=1');
    expect(buildFeedQuery({ ...base, cursor: 'abc' })).not.toContain('public');
    expect(buildFeedQuery({ ...base, typeIds: ['a'] })).not.toContain('public');
    expect(buildFeedQuery({ ...base, spaceIds: ['a'] })).not.toContain('public');
    expect(buildFeedQuery({ ...base, time: 'month' })).not.toContain('public');
    expect(buildFeedQuery({ ...base, fixedParams: { topicId: 't' } })).not.toContain('public');
    expect(buildFeedQuery({ ...base, sort: 'top' })).not.toContain('public');
    expect(buildFeedQuery({ ...base, anonymous: false })).toBe('sort=best');
  });
});

// A signed-in reader's own Best page takes most of a second to build, so it paints from the public
// page the route preloaded, and the swap keeps the playing lead on top.
describe('EntityFeed signed-in first paint', () => {
  const ADDRESS = '0x00000000000000000000000000000000000000aa';

  function renderFeed(props: Partial<React.ComponentProps<typeof EntityFeed>> = {}) {
    return render(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSort="best"
        showSortFilter
        cdnFirstPage
        walletAddress={ADDRESS}
        {...props}
      />
    );
  }

  type Placeholder = (previous: unknown, previousQuery: { queryKey: unknown[] } | undefined) => unknown;

  it('fetches the public page from the preloaded URL', async () => {
    renderFeed();
    expect(mocks.publicQueryOptions?.enabled).toBe(true);

    await (mocks.publicQueryOptions?.queryFn as (ctx: { signal: AbortSignal }) => Promise<unknown>)({
      signal: new AbortController().signal,
    });
    expect(mocks.fetch.mock.calls.at(-1)?.[0]).toBe(PUBLIC_BEST_FEED_PATH);
    // A preload is reused only when the request matches it: same URL, same credentials, and no
    // authorization header. The abort signal is not part of that match.
    const init = mocks.fetch.mock.calls.at(-1)?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.headers).toBeUndefined();
  });

  it('shows the public page while the personal one loads', () => {
    const publicPage = { items: [], nextCursor: 'p' };
    mocks.publicPage = publicPage;
    renderFeed();

    const placeholderData = mocks.queryOptions?.placeholderData as Placeholder;
    expect(placeholderData(undefined, undefined)).toEqual({ pages: [publicPage], pageParams: [undefined] });
  });

  it('prefers the previous account’s cards when only the account changed', () => {
    mocks.publicPage = { items: [] };
    renderFeed();

    const placeholderData = mocks.queryOptions?.placeholderData as Placeholder;
    const key = mocks.queryOptions?.queryKey as unknown[];
    const previous = { pages: [] };
    expect(placeholderData(previous, { queryKey: [...key.slice(0, -1), null] })).toBe(previous);
  });

  it('is off for a signed-out reader, who fetches the public page directly', () => {
    mocks.publicPage = { items: [] };
    renderFeed({ walletAddress: null });

    expect(mocks.publicQueryOptions?.enabled).toBe(false);
    expect((mocks.queryOptions?.placeholderData as Placeholder)(undefined, undefined)).toBeUndefined();
  });

  it('is off for other sorts and unless the feed opts in', () => {
    renderFeed({ initialSort: 'new' });
    expect(mocks.publicQueryOptions?.enabled).toBe(false);
    cleanup();

    renderFeed({ cdnFirstPage: false });
    expect(mocks.publicQueryOptions?.enabled).toBe(false);
  });

  it('pins the placeholder’s lead on top of the personal page', () => {
    const card = (entityId: string) => ({ entityId, spaceId: 's', name: entityId });
    mocks.publicPage = { items: [card('lead'), card('b')] };
    mocks.pages = [mocks.publicPage];
    mocks.isPlaceholderData = true;
    const { rerender } = renderFeed();

    mocks.pages = [{ items: [card('member'), card('b'), card('lead')] }];
    mocks.isPlaceholderData = false;
    rerender(
      <EntityFeed
        apiEndpoint="/api/explore/feed"
        initialSort="best"
        showSortFilter
        cdnFirstPage
        walletAddress={ADDRESS}
      />
    );
    expect([1, 2, 3].map(position => mocks.itemAt[position]?.entityId)).toEqual(['lead', 'member', 'b']);
  });
});

describe('leadFirst', () => {
  const items = [{ entityId: 'a' }, { entityId: 'b' }, { entityId: 'c' }];

  it('moves the lead to the front, keeping the rest in order', () => {
    expect(leadFirst(items, 'c').map(i => i.entityId)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the list alone when the lead is absent, already first, or unset', () => {
    expect(leadFirst(items, 'z')).toBe(items);
    expect(leadFirst(items, 'a')).toBe(items);
    expect(leadFirst(items, null)).toBe(items);
  });
});

// GEO-3421. Past calls sit between the feed's own cards, client side, on an unfiltered feed only.
describe('EntityFeed interleave', () => {
  const item = (id: string) => ({
    entityId: id,
    spaceId: 'space-1',
    spaceName: 'Space',
    spaceImage: null,
    types: [],
    createdAtSec: 0,
    title: id,
    description: null,
    imageUrl: null,
    commentCount: 0,
    recordingUrls: [],
    debateVideoUrls: [],
    debateClaim: null,
    isMemberOrEditor: true,
    hasPendingMembershipRequest: false,
  });
  const interleave = (feedLength: number) =>
    new Map<number, React.ReactNode>([[1, <p key="extra">{`extra after 2 of ${feedLength}`}</p>]]);

  it('draws the extra cards where asked, without touching the request', async () => {
    mocks.pages = [{ items: [item('a'), item('b'), item('c')] }];
    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSort="best" interleave={interleave} />);

    expect(screen.getByText('extra after 2 of 3')).toBeTruthy();
    expect(Object.keys(mocks.itemAt)).toEqual(['1', '2', '3']);
    expect(await requestedUrl()).not.toContain('interleave');
  });

  it('draws none on a feed narrowed to a space', () => {
    mocks.pages = [{ items: [item('a'), item('b'), item('c')] }];
    render(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-1" interleave={interleave} />);

    expect(screen.queryByText(/extra after/)).toBeNull();
  });
});

describe('marketing selection', () => {
  const card = (entityId: string) => ({ entityId, spaceId: 's', name: entityId });
  const props = {
    apiEndpoint: '/api/explore/feed',
    initialSort: 'best' as const,
    showSortFilter: true,
    entryEntityId: 'selected',
  };

  it('leads with an explicit selection outside the ranked window', () => {
    mocks.pages = [{ items: [card('ranked')] }];
    mocks.entryItem = card('selected');
    render(<EntityFeed {...props} />);
    expect([1, 2].map(position => mocks.itemAt[position]?.entityId)).toEqual(['selected', 'ranked']);
  });
  it('removes the selected card from its later ranked position', () => {
    mocks.pages = [{ items: [card('ranked'), card('selected')] }];
    mocks.entryItem = card('selected');
    render(<EntityFeed {...props} />);
    expect([1, 2].map(position => mocks.itemAt[position]?.entityId)).toEqual(['selected', 'ranked']);
    expect(mocks.itemAt[3]).toBeUndefined();
  });
  it('holds the ranked lead until the selection lookup settles', () => {
    mocks.pages = [{ items: [card('ranked')] }];
    mocks.entryPending = true;
    render(<EntityFeed {...props} />);
    expect(mocks.itemAt[1]).toBeUndefined();
  });
  it('does not load invisible next pages while waiting for the selected card', () => {
    const observe = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe;
        disconnect = vi.fn();
      }
    );
    mocks.pages = [{ items: [card('ranked')] }];
    mocks.hasNextPage = true;
    mocks.entryPending = true;
    const { rerender } = render(<EntityFeed {...props} />);
    expect(observe).not.toHaveBeenCalled();
    mocks.entryPending = false;
    rerender(<EntityFeed {...props} />);
    expect(observe).toHaveBeenCalledOnce();
  });
  it('keeps loaded cards visible when a later feed page fails', () => {
    mocks.pages = [{ items: [card('ranked')] }];
    mocks.error = new Error('next page unavailable');
    render(<EntityFeed {...props} />);
    expect(mocks.itemAt[1]?.entityId).toBe('ranked');
    expect(screen.queryByText('Could not load the feed.')).toBeNull();
  });
  it('falls back to the normal feed when the selection is unavailable', () => {
    mocks.pages = [{ items: [card('ranked')] }];
    render(<EntityFeed {...props} />);
    expect(mocks.itemAt[1]?.entityId).toBe('ranked');
  });
  it('keeps a resolved selection available when the ranked feed fails', () => {
    mocks.error = new Error('ranking unavailable');
    mocks.entryItem = card('selected');
    render(<EntityFeed {...props} />);
    expect(mocks.itemAt[1]?.entityId).toBe('selected');
    expect(screen.queryByText('Could not load the feed.')).toBeNull();
  });
  it('shows a resolved selection without waiting for the personalized feed identity token', () => {
    mocks.entryItem = card('selected');
    render(
      <EntityFeed
        {...props}
        initialSort="for-you"
        followedTopicIds={[]}
        walletAddress="0x00000000000000000000000000000000000000aa"
        sendIdentityToken
      />
    );
    expect(mocks.itemAt[1]?.entityId).toBe('selected');
  });
  it('stops pinning the selection after the visitor changes sort', () => {
    mocks.pages = [{ items: [card('ranked')] }];
    mocks.entryItem = card('selected');
    render(<EntityFeed {...props} />);
    pickOption('New');
    expect(mocks.entryQueryOptions?.enabled).toBe(false);
    expect(mocks.itemAt[1]?.entityId).toBe('ranked');
  });
});
