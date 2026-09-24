import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

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

    const { result } = renderHook(
      () => useSearch({ initialQuery: 'knowledge graph', analyticsQueryType: 'global_entities' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.searchSubmitted).toHaveBeenCalledOnce();
    expect(mocks.searchSubmitted).toHaveBeenCalledWith({
      queryText: 'knowledge graph',
      queryType: 'global_entities',
      resultCount: 0,
      latencyMs: expect.any(Number),
      source: 'global_search',
    });
  });

  it('does not misclassify a failed request as a no-results search', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.findFuzzyPage.mockRejectedValue(new Error('search unavailable'));

    const { result } = renderHook(() => useSearch({ initialQuery: 'knowledge graph' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.searchSubmitted).not.toHaveBeenCalled();
  });
});
