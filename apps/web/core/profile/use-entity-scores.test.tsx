import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntityScores } from './use-entity-scores';

const mocks = vi.hoisted(() => ({ graphql: vi.fn(), failLastChunk: true }));

vi.mock('~/core/io/graphql-client', () => ({ graphql: mocks.graphql }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useEntityScores chunk retries', () => {
  beforeEach(() => {
    mocks.graphql.mockReset();
    mocks.failLastChunk = true;
    mocks.graphql.mockImplementation(({ variables }: { variables: { ids: string[] } }) => {
      if (variables.ids.includes('id-100') && mocks.failLastChunk) {
        return Effect.fail(new Error('last score chunk failed'));
      }

      return Effect.succeed({ scores: new Map(), rankings: new Map() });
    });
  });

  it('retries only failed score chunks', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `id-${index}`);
    const { result } = renderHook(() => useEntityScores({ ids }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.graphql).toHaveBeenCalledTimes(2);

    mocks.failLastChunk = false;
    await act(async () => void (await result.current.refetch()));
    await waitFor(() => expect(result.current.isError).toBe(false));

    const firstChunkCalls = mocks.graphql.mock.calls.filter(
      ([options]) => !(options as { variables: { ids: string[] } }).variables.ids.includes('id-100')
    );
    const lastChunkCalls = mocks.graphql.mock.calls.filter(([options]) =>
      (options as { variables: { ids: string[] } }).variables.ids.includes('id-100')
    );
    expect(firstChunkCalls).toHaveLength(1);
    expect(lastChunkCalls).toHaveLength(2);
  });

  it('reports cached rankings as available after a background refresh fails', async () => {
    mocks.failLastChunk = false;
    mocks.graphql.mockReturnValueOnce(
      Effect.succeed({ scores: new Map(), rankings: new Map([['id-1', 42]]) })
    );
    const { result } = renderHook(() => useEntityScores({ ids: ['id-1'] }), { wrapper });
    await waitFor(() => expect(result.current.rankings.get('id-1')).toBe(42));

    mocks.graphql.mockReturnValueOnce(Effect.fail(new Error('refresh failed')));
    await act(async () => void (await result.current.refetch()));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.rankings.get('id-1')).toBe(42);
    expect(result.current.dataAvailable).toBe(true);
  });
});
