import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { print } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TOPIC_TYPE_ID } from '~/core/constants';

import { useTopicSearch } from './use-topic-suggestions';

const mocks = vi.hoisted(() => ({ graphql: vi.fn() }));
vi.mock('~/core/io/graphql-client', () => ({ graphql: mocks.graphql }));
vi.mock('~/core/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: string) => value }));

function search(query: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTopicSearch(query), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  mocks.graphql.mockReset();
  mocks.graphql.mockReturnValue(Effect.succeed([{ id: 'marriage', name: 'Marriage' }]));
});
afterEach(cleanup);

describe('useTopicSearch', () => {
  it('constrains the actual search request to Topic entities', async () => {
    const { result } = search(' marriage ');
    await waitFor(() => expect(result.current.results).toEqual([{ id: 'marriage', name: 'Marriage' }]));

    const request = mocks.graphql.mock.calls[0][0];
    expect(request.variables).toEqual({ query: 'marriage', typeId: TOPIC_TYPE_ID, first: 20 });
    expect(print(request.query)).toContain('filter: {typeIds: {anyEqualTo: $typeId}}');
  });

  it('does not issue a search for an empty query', () => {
    search('   ');
    expect(mocks.graphql).not.toHaveBeenCalled();
  });
});
