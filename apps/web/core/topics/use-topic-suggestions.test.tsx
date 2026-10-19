import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { print } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CURATED_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';

import { type TopicOption, useTopicSearch, useTopicSuggestions } from './use-topic-suggestions';

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

const SPACE = '224406e0de3c48d78ef12774111b8b2f';
const tagged = { typeId: { is: TAG_PROPERTY_ID }, toEntityId: { is: CURATED_TOPIC_TAG_ID } };
const topics = (prefix: string, count: number): TopicOption[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix} ${i}` }));

function suggestions(spaceIds = [SPACE]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTopicSuggestions(spaceIds), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

/** The graph client is mocked at its decoded result, with two independently ranked lists. */
function serveSuggestions(curated: TopicOption[], remaining: TopicOption[]) {
  mocks.graphql.mockImplementation(({ variables }) => {
    const source = variables.filter.relations.some ? curated : remaining;
    const page = source.slice(variables.offset, variables.offset + variables.first);
    return Effect.succeed({ topics: page, rawCount: page.length });
  });
}

describe('useTopicSuggestions curated-first pagination', () => {
  it('fills the page with remaining topics once curated topics end, preserving both rankings', async () => {
    const curated = topics('curated', 4);
    const remaining = topics('remaining', 25);
    serveSuggestions(curated, remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toHaveLength(20));

    expect(result.current.suggestions).toEqual([...curated, ...remaining.slice(0, 16)]);
    expect(mocks.graphql.mock.calls[0][0].variables).toEqual({
      spaceIds: [SPACE],
      first: 20,
      offset: 0,
      filter: { relations: { some: tagged } },
    });
    expect(mocks.graphql.mock.calls[1][0].variables).toEqual({
      spaceIds: [SPACE],
      first: 16,
      offset: 0,
      filter: { relations: { none: tagged } },
    });
    expect(print(mocks.graphql.mock.calls[0][0].query)).toContain('filter: $filter');

    await act(async () => {
      await result.current.fetchMore();
    });

    await waitFor(() => expect(result.current.suggestions).toEqual([...curated, ...remaining]));
    expect(result.current.hasMore).toBe(false);
    expect(mocks.graphql.mock.calls[2][0].variables).toMatchObject({
      first: 20,
      offset: 16,
      filter: { relations: { none: tagged } },
    });
  });

  it('exhausts multiple curated pages before requesting any remaining topics', async () => {
    const curated = topics('curated', 25);
    const remaining = topics('remaining', 3);
    serveSuggestions(curated, remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toHaveLength(20));

    expect(result.current.suggestions).toEqual(curated.slice(0, 20));
    expect(mocks.graphql).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.fetchMore();
    });

    await waitFor(() => expect(result.current.suggestions).toEqual([...curated, ...remaining]));
    expect(mocks.graphql.mock.calls[1][0].variables).toMatchObject({
      offset: 20,
      first: 20,
      filter: { relations: { some: tagged } },
    });
    expect(mocks.graphql.mock.calls[2][0].variables).toMatchObject({
      offset: 0,
      first: 15,
      filter: { relations: { none: tagged } },
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('returns the existing ranking immediately when there are no curated matches', async () => {
    const remaining = topics('remaining', 7);
    serveSuggestions([], remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toEqual(remaining));

    expect(result.current.hasMore).toBe(false);
    expect(mocks.graphql).toHaveBeenCalledTimes(2);
  });

  it('moves past an exact curated page boundary without repeating curated topics', async () => {
    const curated = topics('curated', 20);
    const remaining = topics('remaining', 2);
    serveSuggestions(curated, remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toHaveLength(20));
    await act(async () => {
      await result.current.fetchMore();
    });

    await waitFor(() => expect(result.current.suggestions).toEqual([...curated, ...remaining]));
    expect(mocks.graphql.mock.calls[1][0].variables).toMatchObject({
      offset: 20,
      filter: { relations: { some: tagged } },
    });
    expect(mocks.graphql.mock.calls[2][0].variables).toMatchObject({
      offset: 0,
      filter: { relations: { none: tagged } },
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps a topic once if a tag change makes it reappear across tiers', async () => {
    const curated = topics('curated', 1);
    const remaining = topics('remaining', 2);
    serveSuggestions(curated, [...curated, ...remaining]);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toEqual([...curated, ...remaining]));
  });

  it('does not query until there are spaces to rank suggestions from', () => {
    suggestions([]);
    expect(mocks.graphql).not.toHaveBeenCalled();
  });

  it('retries a failed curated read before allowing remaining topics through', async () => {
    const curated = topics('curated', 1);
    serveSuggestions(curated, topics('remaining', 1));
    mocks.graphql.mockImplementationOnce(() => Effect.fail(new Error('API unavailable')));
    const { result } = suggestions();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mocks.graphql).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.suggestions[0]).toEqual(curated[0]));
    expect(mocks.graphql.mock.calls[1][0].variables.filter).toEqual({ relations: { some: tagged } });
  });

  it('advances by raw rows and fills a page when a decoded row is missing its name', async () => {
    const curated = topics('curated', 20);
    mocks.graphql
      .mockReturnValueOnce(Effect.succeed({ topics: curated.slice(0, 19), rawCount: 20 }))
      .mockReturnValueOnce(Effect.succeed({ topics: curated.slice(19), rawCount: 1 }));
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toEqual(curated));

    expect(mocks.graphql.mock.calls[1][0].variables).toMatchObject({
      offset: 20,
      first: 1,
      filter: { relations: { some: tagged } },
    });
    expect(mocks.graphql).toHaveBeenCalledTimes(2);
  });
});
