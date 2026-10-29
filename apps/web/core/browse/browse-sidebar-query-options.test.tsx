import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGlobalSearchSpaceIds } from '~/core/hooks/use-global-search-space-ids';

import { browseSidebarQueryOptions } from './browse-sidebar-query-options';
import { type BrowseSidebarData, fetchBrowseSidebarData } from './fetch-browse-sidebar-data';
import { useCachedBrowseSidebarData } from './use-browse-sidebar-cache';

vi.mock('./fetch-browse-sidebar-data', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch-browse-sidebar-data')>()),
  fetchBrowseSidebarData: vi.fn(),
}));
vi.mock('~/partials/browse-sidebar/load-browse-sidebar-data', () => ({ loadBrowseSidebarData: vi.fn() }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: PERSONAL_SPACE_ID, isLoading: false }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));
vi.mock('~/core/hooks/use-space-id', () => ({ useSpaceId: () => undefined }));

const PERSONAL_SPACE_ID = 'b1c2d3e4f5a6478899aabbccddeeff00';
const JOINED_SPACE_ID = 'c2d3e4f5a6b7489900aabbccddeeff11';

function sidebar(memberOf: string[]): BrowseSidebarData {
  return {
    featured: [],
    editorOf: [],
    memberOf: memberOf.map(id => ({ id, name: id, image: null })),
    documentationImage: null,
    personalSpaceId: PERSONAL_SPACE_ID,
    featuredError: false,
  } as BrowseSidebarData;
}

let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(fetchBrowseSidebarData).mockReset();
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe('browseSidebarQueryOptions', () => {
  it.each([
    ['useCachedBrowseSidebarData', () => useCachedBrowseSidebarData()?.memberOf.map(row => row.id)],
    ['useGlobalSearchSpaceIds', () => useGlobalSearchSpaceIds()],
  ])('refetches on invalidation when %s rendered after the sidebar', async (_name, useSubscriber) => {
    vi.mocked(fetchBrowseSidebarData)
      .mockResolvedValueOnce(sidebar([]))
      .mockResolvedValueOnce(sidebar([JOINED_SPACE_ID]));
    const { result } = renderHook(
      () => {
        const owner = useQuery(browseSidebarQueryOptions({ personalSpaceId: PERSONAL_SPACE_ID }));
        return { owner: owner.data, subscriber: useSubscriber() };
      },
      { wrapper }
    );
    await waitFor(() => expect(result.current.owner).toBeDefined());

    await act(() => client.invalidateQueries({ queryKey: ['browse-sidebar-data'] }));

    expect(fetchBrowseSidebarData).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.subscriber).toContain(JOINED_SPACE_ID));
  });

  it('never fetches from a read-only subscriber alone', async () => {
    renderHook(() => useCachedBrowseSidebarData(), { wrapper });

    await act(() => client.invalidateQueries({ queryKey: ['browse-sidebar-data'] }));

    expect(fetchBrowseSidebarData).not.toHaveBeenCalled();
  });
});
