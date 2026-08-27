import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPLORE_ENTITY_TYPE_IDS } from '~/core/explore/explore-constants';
import { EXPLORE_TYPE_FILTER_STORAGE_KEY, exploreTypeFilterLabel } from '~/core/explore/explore-type-filter';

import { EntityFeed } from './entity-feed';

const mocks = vi.hoisted(() => ({
  queryOptions: null as Record<string, unknown> | null,
  fetch: vi.fn(),
}));

function createLocalStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: (options: Record<string, unknown>) => {
    mocks.queryOptions = options;
    return {
      data: undefined,
      isLoading: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
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
  ExploreFeedCard: () => null,
}));

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
  mocks.queryOptions = null;
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
        initialSpaceOptions={[]}
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
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));

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
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));
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
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));

    expect(timeTrigger()).toBeNull();
    expect(await requestedUrl()).not.toContain('time=');
  });
});

describe('EntityFeed Explore type filter', () => {
  it('omits the type parameter and does not persist before the user changes the default selection', async () => {
    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);

    await screen.findByText(exploreTypeFilterLabel(EXPLORE_ENTITY_TYPE_IDS.length));
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));
    expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBeNull();

    const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
    await queryFn({ pageParam: undefined });
    const requestUrl = mocks.fetch.mock.calls[0]?.[0] as string;
    expect(requestUrl).not.toContain('typeIds=');
  });

  it('restores cached types, sends them to the feed, and persists checklist changes', async () => {
    const selectedTypeId = EXPLORE_ENTITY_TYPE_IDS[0];
    window.localStorage.setItem(EXPLORE_TYPE_FILTER_STORAGE_KEY, JSON.stringify([selectedTypeId]));

    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);

    await screen.findByText('1 type');
    await waitFor(() => expect(mocks.queryOptions?.enabled).toBe(true));

    const queryFn = mocks.queryOptions?.queryFn as (args: { pageParam?: string }) => Promise<unknown>;
    await queryFn({ pageParam: undefined });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`typeIds=${selectedTypeId}`),
      expect.objectContaining({ credentials: 'include' })
    );

    fireEvent.click(screen.getByRole('button', { name: /News story/ }));
    await screen.findByText('0 types');
    await waitFor(() => expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe('[]'));
  });

  it('applies rapid toggles to the latest selection', async () => {
    const [first, second, third] = EXPLORE_ENTITY_TYPE_IDS;
    window.localStorage.setItem(EXPLORE_TYPE_FILTER_STORAGE_KEY, JSON.stringify([first]));

    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);
    await screen.findByText('1 type');

    act(() => {
      screen.getByRole('button', { name: /Episode/ }).click();
      screen.getByRole('button', { name: /Post/ }).click();
    });

    await screen.findByText('3 types');
    await waitFor(() =>
      expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe(JSON.stringify([first, second, third]))
    );
  });

  it('selects and unselects all types from the menu action', async () => {
    render(<EntityFeed apiEndpoint="/api/explore/feed" initialSpaceOptions={[]} showSortFilter showTypeFilter />);
    await screen.findByText(exploreTypeFilterLabel(EXPLORE_ENTITY_TYPE_IDS.length));

    fireEvent.click(screen.getByRole('button', { name: 'Unselect all' }));
    await screen.findByText('0 types');
    await waitFor(() => expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe('[]'));

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    await screen.findByText(exploreTypeFilterLabel(EXPLORE_ENTITY_TYPE_IDS.length));
    await waitFor(() =>
      expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe(JSON.stringify(EXPLORE_ENTITY_TYPE_IDS))
    );
  });

  it('preserves the historical query key for feeds without the Explore type filter', () => {
    render(<EntityFeed apiEndpoint="/api/activity/feed" lockedSpaceId="space-id" />);

    // The time slot is empty rather than 'week': this feed sorts by New, which carries no range,
    // so there is nothing to send and nothing to key on. Same positions otherwise.
    expect(mocks.queryOptions?.queryKey).toEqual(['/api/activity/feed', 'new', undefined, 'space-id', null]);
  });
});
