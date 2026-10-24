import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

const graphql = vi.hoisted(() => ({ calls: [] as string[][], release: null as null | (() => void) }));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ variables, decoder }: { variables: { ids: string[] }; decoder: (data: unknown) => unknown }) =>
    Effect.promise(async () => {
      graphql.calls.push(variables.ids);
      // The second request is held, so the test can look at the list while it is in flight.
      if (graphql.calls.length > 1) await new Promise<void>(resolve => (graphql.release = resolve));
      return decoder({
        entitiesConnection: {
          nodes: variables.ids.map((id, index) => ({ id, rankingScore: String(10 - index), createdAt: null })),
        },
      });
    }),
}));

const { useClaimOrderFacts } = await import('./claim-order-facts');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  graphql.calls = [];
  graphql.release = null;
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
});
