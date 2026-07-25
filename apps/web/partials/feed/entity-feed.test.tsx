import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EXPLORE_ENTITY_TYPE_IDS } from '~/core/explore/explore-constants';
import { EXPLORE_TYPE_FILTER_STORAGE_KEY } from '~/core/explore/explore-type-filter';

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

    fireEvent.click(screen.getByRole('button', { name: 'News story' }));
    await screen.findByText('0 types');
    await waitFor(() => expect(window.localStorage.getItem(EXPLORE_TYPE_FILTER_STORAGE_KEY)).toBe('[]'));
  });
});
