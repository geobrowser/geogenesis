import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

const graphql = vi.hoisted(() => ({
  calls: [] as string[][],
  release: null as null | (() => void),
  failing: null as string | null,
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ variables, decoder }: { variables: { ids: string[] }; decoder: (data: unknown) => unknown }) =>
    Effect.promise(async () => {
      graphql.calls.push(variables.ids);
      if (graphql.failing && variables.ids.includes(graphql.failing)) throw new Error('graph unavailable');
      // The second request is held, so the test can look at the list while it is in flight.
      if (graphql.calls.length > 1) await new Promise<void>(resolve => (graphql.release = resolve));
      return decoder({
        entitiesConnection: {
          nodes: variables.ids.map((id, index) => ({ id, rankingScore: String(10 - index), createdAt: null })),
        },
      });
    }),
}));

const { CLAIM_ORDER_FACTS_CHUNK, useClaimOrderFacts } = await import('./claim-order-facts');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  graphql.calls = [];
  graphql.release = null;
  graphql.failing = null;
});

describe('useClaimOrderFacts', () => {
  // A new match changes the id set. The claims already listed keep their scores while the new
  // lookup runs, so a Best-sorted list does not drop to arrival order and jump back.
  it('keeps the previous scores while a changed id set is looked up', async () => {
    const { result, rerender } = renderHook(({ ids }) => useClaimOrderFacts(ids), {
      wrapper,
      initialProps: { ids: ['aa', 'bb'] },
    });
    await waitFor(() => expect(result.current.facts.size).toBe(2));

    rerender({ ids: ['aa', 'bb', 'cc'] });
    await waitFor(() => expect(graphql.calls).toHaveLength(2));

    expect(result.current.facts.get('aa')).toMatchObject({ rankingScore: 10 });
    graphql.release?.();
    await waitFor(() => expect(result.current.facts.size).toBe(3));
  });

  // Review: each page re-requested the facts of every claim already loaded.
  it('asks about a new page, not about every claim again', async () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => `c${String(index).padStart(3, '0')}`);
    const { result, rerender } = renderHook(({ ids }) => useClaimOrderFacts(ids), {
      wrapper,
      initialProps: { ids: ids(CLAIM_ORDER_FACTS_CHUNK) },
    });
    await waitFor(() => expect(result.current.facts.size).toBe(CLAIM_ORDER_FACTS_CHUNK));

    rerender({ ids: ids(CLAIM_ORDER_FACTS_CHUNK + 5) });
    await waitFor(() => expect(graphql.calls).toHaveLength(2));
    graphql.release?.();

    expect(graphql.calls[1]).toEqual(ids(CLAIM_ORDER_FACTS_CHUNK + 5).slice(CLAIM_ORDER_FACTS_CHUNK));
    await waitFor(() => expect(result.current.facts.size).toBe(CLAIM_ORDER_FACTS_CHUNK + 5));
  });

  // The sorted lists memo on it, so a fresh map per render would re-sort them every render.
  it('hands back the same facts across renders that change nothing', async () => {
    const { result, rerender } = renderHook(({ ids }) => useClaimOrderFacts(ids), {
      wrapper,
      initialProps: { ids: ['aa', 'bb'] },
    });
    await waitFor(() => expect(result.current.facts.size).toBe(2));
    const facts = result.current.facts;

    rerender({ ids: ['aa', 'bb'] });

    expect(result.current.facts).toBe(facts);
  });

  // Review: a failed run left its claims at the end in arrival order, under a Sort that said Best.
  it('says so when a run has no answer, rather than leaving its claims unplaced', async () => {
    graphql.failing = 'bb';
    const { result } = renderHook(() => useClaimOrderFacts(['aa', 'bb']), { wrapper });

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.facts.size).toBe(0);
  });

  it('reads creation times as well as scores', async () => {
    const { result } = renderHook(() => useClaimOrderFacts(['aa']), { wrapper });

    await waitFor(() => expect(result.current.facts.get('aa')).toEqual({ rankingScore: 10, createdAtMs: null }));
    expect(result.current.failed).toBe(false);
  });
});
