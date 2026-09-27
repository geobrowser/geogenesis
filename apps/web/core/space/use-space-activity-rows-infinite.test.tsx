import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceActivitySort } from './space-activity-rows';
import type { SpaceActivityKind } from './space-debate-activity';
import { useSpaceActivityRowsInfinite } from './use-space-debate-activity';

/**
 * The rows half of the claims feed, against a faked graph.
 *
 * `graphql` is the seam rather than the hook under it: the paging, the held rows and the space
 * identity under test are all this hook's, and the decoder they run through is covered in
 * `space-activity-rows.test.ts`.
 */
const mocks = vi.hoisted(() => ({ graphql: vi.fn() }));

vi.mock('~/core/io/graphql-client', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/io/graphql-client')>();
  return { ...actual, graphql: mocks.graphql };
});

/** One decoded page, in the shape `decodeSpaceActivityRows` produces. */
function rowsPage(spaceId: string, ids: string[], hasNextPage = false) {
  return Effect.succeed({
    rows: ids.map(entityId => ({ entityId, spaceId, types: [] })),
    endCursor: hasNextPage ? 'cursor' : null,
    hasNextPage,
  });
}

let queryClient: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  mocks.graphql.mockReset();
});

describe('useSpaceActivityRowsInfinite', () => {
  /**
   * Held rows are for a filter or a sort changing under the same list. `keepPreviousData` applies
   * to every key change, `spaceId` included, so a component reused across a space navigation showed
   * the previous space's claims under the new space's heading — which on a surface whose whole
   * promise is "only this space's entities" is the wrong rows entirely.
   */
  it('does not hold one space’s rows under another', async () => {
    mocks.graphql.mockReturnValue(rowsPage('space-1', ['a1']));

    const { result, rerender } = renderHook(({ spaceId }) => useSpaceActivityRowsInfinite(spaceId, 'claims'), {
      wrapper,
      initialProps: { spaceId: 'space-1' },
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    // Never resolves, so anything on screen is held rather than fetched.
    mocks.graphql.mockReturnValue(Effect.promise(() => new Promise(() => undefined)));
    rerender({ spaceId: 'space-2' });

    expect(result.current.rows).toEqual([]);
  });

  // Same list, different question: these are the transitions the hold exists for.
  it('holds the rows while the sort changes', async () => {
    mocks.graphql.mockReturnValue(rowsPage('space-1', ['a1']));

    const { result, rerender } = renderHook<
      ReturnType<typeof useSpaceActivityRowsInfinite>,
      { sort: SpaceActivitySort }
    >(({ sort }) => useSpaceActivityRowsInfinite('space-1', 'claims', sort), {
      wrapper,
      initialProps: { sort: 'best' },
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    mocks.graphql.mockReturnValue(Effect.promise(() => new Promise(() => undefined)));
    rerender({ sort: 'new' });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.isPending).toBe(true);
  });

  // Debates and claims are two lists, not two views of one.
  it('does not hold one kind’s rows under the other', async () => {
    mocks.graphql.mockReturnValue(rowsPage('space-1', ['a1']));

    const { result, rerender } = renderHook<
      ReturnType<typeof useSpaceActivityRowsInfinite>,
      { kind: SpaceActivityKind }
    >(({ kind }) => useSpaceActivityRowsInfinite('space-1', kind), {
      wrapper,
      initialProps: { kind: 'claims' },
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    mocks.graphql.mockReturnValue(Effect.promise(() => new Promise(() => undefined)));
    rerender({ kind: 'debates' });

    expect(result.current.rows).toEqual([]);
  });
});
