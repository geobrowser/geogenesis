import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearch } from './use-search';

const mocks = vi.hoisted(() => ({
  findFuzzyPage: vi.fn(),
  searchSubmitted: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ searchSubmitted: mocks.searchSubmitted }));
vi.mock('../database/result', () => ({ mergeSearchResult: vi.fn() }));
vi.mock('../sync/orm', () => ({ E: { findFuzzyPage: mocks.findFuzzyPage } }));
vi.mock('../sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: {} }) }));
vi.mock('./use-global-search-space-ids', () => ({ useGlobalSearchSpaceIds: () => [] }));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function searchResult(id: string) {
  return { id, name: id, description: null, spaces: [], types: [] };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.findFuzzyPage.mockReset();
  mocks.searchSubmitted.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSearch analytics', () => {
  it('records a completed global search, including a real zero-result outcome', async () => {
    mocks.findFuzzyPage.mockResolvedValue({ results: [], rawCount: 0, serverCount: 0, total: 0 });

    const { result } = renderHook(() => useSearch({ initialQuery: 'knowledge graph', analyticsSurface: 'global' }), {
      wrapper,
    });

    await waitFor(() => expect(mocks.searchSubmitted).toHaveBeenCalledOnce());
    expect(result.current.isLoading).toBe(false);
    expect(mocks.searchSubmitted).toHaveBeenCalledWith({
      queryText: 'knowledge graph',
      resultCount: 0,
      latencyMs: expect.any(Number),
      surface: 'global',
    });
  });

  it('does not misclassify a failed request as a no-results search', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.findFuzzyPage.mockRejectedValue(new Error('search unavailable'));

    const { result } = renderHook(() => useSearch({ initialQuery: 'knowledge graph' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.searchSubmitted).not.toHaveBeenCalled();
  });

  it('reports the visible post-processing count instead of the endpoint total', async () => {
    mocks.findFuzzyPage.mockResolvedValue({ results: [], rawCount: 0, serverCount: 0, total: 3 });

    renderHook(() => useSearch({ initialQuery: 'knowledge graph' }), { wrapper });

    await waitFor(() => expect(mocks.searchSubmitted).toHaveBeenCalledOnce());
    expect(mocks.searchSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        resultCount: 0,
      })
    );
  });

  it('waits for the empty-page pump and includes its visible results', async () => {
    let resolveSecondPage!: (page: {
      results: ReturnType<typeof searchResult>[];
      rawCount: number;
      serverCount: number;
      total: number;
    }) => void;
    const secondPage = new Promise<Parameters<typeof resolveSecondPage>[0]>(resolve => {
      resolveSecondPage = resolve;
    });

    mocks.findFuzzyPage
      .mockResolvedValueOnce({ results: [], rawCount: 0, serverCount: 1, total: 2 })
      .mockReturnValueOnce(secondPage);

    renderHook(() => useSearch({ initialQuery: 'knowledge graph', pageSize: 1 }), { wrapper });

    await waitFor(() => expect(mocks.findFuzzyPage).toHaveBeenCalledTimes(2));
    expect(mocks.searchSubmitted).not.toHaveBeenCalled();

    await act(async () => {
      resolveSecondPage({ results: [searchResult('visible result')], rawCount: 1, serverCount: 1, total: 2 });
      await secondPage;
    });

    await waitFor(() => expect(mocks.searchSubmitted).toHaveBeenCalledOnce());
    expect(mocks.searchSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({
        resultCount: 1,
      })
    );
  });

  it('does not emit when an internally pumped page fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.findFuzzyPage
      .mockResolvedValueOnce({ results: [], rawCount: 0, serverCount: 1, total: 2 })
      .mockRejectedValueOnce(new Error('continuation unavailable'));

    const { result } = renderHook(() => useSearch({ initialQuery: 'knowledge graph', pageSize: 1 }), { wrapper });

    await waitFor(() => expect(mocks.findFuzzyPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(mocks.searchSubmitted).not.toHaveBeenCalled();
  });

  it('does not count a background refetch as another user search', async () => {
    mocks.findFuzzyPage.mockResolvedValue({ results: [], rawCount: 0, serverCount: 0, total: 3 });

    renderHook(() => useSearch({ initialQuery: 'knowledge graph' }), { wrapper });

    await waitFor(() => expect(mocks.searchSubmitted).toHaveBeenCalledOnce());

    await act(async () => {
      await client.invalidateQueries({ queryKey: ['search'] });
    });

    await waitFor(() => expect(mocks.findFuzzyPage).toHaveBeenCalledTimes(2));
    expect(mocks.searchSubmitted).toHaveBeenCalledOnce();
  });
});
