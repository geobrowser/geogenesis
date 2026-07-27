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

    expect(mocks.queryOptions?.queryKey).toEqual(['/api/activity/feed', 'new', 'week', 'space-id', null]);
  });
});
