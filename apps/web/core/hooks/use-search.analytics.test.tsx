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

type SearchResponse = {
  results: ReturnType<typeof searchResult>[];
  rawCount: number;
  serverCount: number;
  total: number;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(complete => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
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
    const secondPage = deferred<SearchResponse>();

    mocks.findFuzzyPage
      .mockResolvedValueOnce({ results: [], rawCount: 0, serverCount: 1, total: 2 })
      .mockReturnValueOnce(secondPage.promise);

    renderHook(() => useSearch({ initialQuery: 'knowledge graph', pageSize: 1 }), { wrapper });

    await waitFor(() => expect(mocks.findFuzzyPage).toHaveBeenCalledTimes(2));
    expect(mocks.searchSubmitted).not.toHaveBeenCalled();

    await act(async () => {
      secondPage.resolve({ results: [searchResult('visible result')], rawCount: 1, serverCount: 1, total: 2 });
      await secondPage.promise;
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

  it('does not emit a superseded query while the next input is debouncing', async () => {
    const firstPage = deferred<SearchResponse>();
    mocks.findFuzzyPage.mockReturnValueOnce(firstPage.promise);

    const { result, unmount } = renderHook(() => useSearch({ initialQuery: 'first query' }), { wrapper });

    await waitFor(() => expect(mocks.findFuzzyPage).toHaveBeenCalledOnce());
    await act(async () => {
      result.current.onQueryChange('next query');
      firstPage.resolve({ results: [searchResult('superseded result')], rawCount: 1, serverCount: 1, total: 1 });
      await firstPage.promise;
    });

    await waitFor(() => expect(result.current.isFetching).toBe(false), { timeout: 100 });
    expect(mocks.searchSubmitted).not.toHaveBeenCalled();
    unmount();
  });

  it('measures a cache hit as the current search attempt', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const firstPage = deferred<SearchResponse>();
    mocks.findFuzzyPage
      .mockReturnValueOnce(firstPage.promise)
      .mockResolvedValueOnce({ results: [searchResult('second result')], rawCount: 1, serverCount: 1, total: 1 });

    const { result } = renderHook(() => useSearch({ initialQuery: 'first query' }), { wrapper });

    await waitFor(() => expect(mocks.findFuzzyPage).toHaveBeenCalledOnce());
    clock.mockReturnValue(100);
    await act(async () => {
      firstPage.resolve({ results: [searchResult('first result')], rawCount: 1, serverCount: 1, total: 1 });
      await firstPage.promise;
    });
    await waitFor(() => expect(mocks.searchSubmitted).toHaveBeenCalledOnce());
    expect(mocks.searchSubmitted.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ latencyMs: 100 }));

    clock.mockReturnValue(200);
    act(() => result.current.onQueryChange('second query'));
    await waitFor(() => expect(mocks.searchSubmitted).toHaveBeenCalledTimes(2));

    clock.mockReturnValue(500);
    act(() => result.current.onQueryChange('first query'));
    await waitFor(() => expect(mocks.searchSubmitted).toHaveBeenCalledTimes(3));

    expect(mocks.findFuzzyPage).toHaveBeenCalledTimes(2);
    expect(mocks.searchSubmitted.mock.calls[2]?.[0]).toEqual(expect.objectContaining({ latencyMs: 0 }));
  });

  it('supports opting programmatic entity loading out of search analytics', async () => {
    mocks.findFuzzyPage.mockResolvedValue({
      results: [searchResult('loaded entity')],
      rawCount: 1,
      serverCount: 1,
      total: 1,
    });

    const { result } = renderHook(() => useSearch({ analyticsSurface: false }), { wrapper });

    act(() => result.current.onQueryChange('programmatic entity id'));
    await waitFor(() => expect(mocks.findFuzzyPage).toHaveBeenCalledOnce());
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
