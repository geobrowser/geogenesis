import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { print } from 'graphql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ONBOARDING_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';

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
const tagged = {
  typeId: { is: TAG_PROPERTY_ID },
  toEntityId: { is: 'be0299ee92dd4e7ab11bfb810643b288' },
  spaceId: { in: [SPACE] },
};
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
function serveSuggestions(onboarding: TopicOption[], remaining: TopicOption[]) {
  mocks.graphql.mockImplementation(({ variables }) => {
    const source = variables.filter.relations.some ? onboarding : remaining;
    const page = source.slice(variables.offset, variables.offset + variables.first);
    return Effect.succeed({ topics: page, rawCount: page.length });
  });
}

describe('useTopicSuggestions onboarding-first pagination', () => {
  it('fills the page with remaining topics once onboarding topics end, preserving both rankings', async () => {
    const onboarding = topics('onboarding', 4);
    const remaining = topics('remaining', 25);
    serveSuggestions(onboarding, remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toHaveLength(20));

    expect(result.current.suggestions).toEqual([...onboarding, ...remaining.slice(0, 16)]);
    expect(mocks.graphql.mock.calls[0][0].variables).toEqual({
      spaceIds: [SPACE],
      first: 20,
      offset: 0,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { some: tagged } },
    });
    expect(mocks.graphql.mock.calls[1][0].variables).toEqual({
      spaceIds: [SPACE],
      first: 16,
      offset: 0,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { none: tagged } },
    });
    expect(print(mocks.graphql.mock.calls[0][0].query)).toContain('filter: $filter');

    await act(async () => {
      await result.current.fetchMore();
    });

    await waitFor(() => expect(result.current.suggestions).toEqual([...onboarding, ...remaining]));
    expect(result.current.hasMore).toBe(false);
    expect(mocks.graphql.mock.calls[2][0].variables).toMatchObject({
      first: 20,
      offset: 16,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { none: tagged } },
    });
  });

  it('exhausts multiple onboarding pages before requesting any remaining topics', async () => {
    const onboarding = topics('onboarding', 25);
    const remaining = topics('remaining', 3);
    serveSuggestions(onboarding, remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toHaveLength(20));

    expect(result.current.suggestions).toEqual(onboarding.slice(0, 20));
    expect(mocks.graphql).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.fetchMore();
    });

    await waitFor(() => expect(result.current.suggestions).toEqual([...onboarding, ...remaining]));
    expect(mocks.graphql.mock.calls[1][0].variables).toMatchObject({
      offset: 20,
      first: 20,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { some: tagged } },
    });
    expect(mocks.graphql.mock.calls[2][0].variables).toMatchObject({
      offset: 0,
      first: 15,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { none: tagged } },
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('returns the existing ranking immediately when there are no onboarding matches', async () => {
    const remaining = topics('remaining', 7);
    serveSuggestions([], remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toEqual(remaining));

    expect(result.current.hasMore).toBe(false);
    expect(mocks.graphql).toHaveBeenCalledTimes(2);
  });

  it('moves past an exact onboarding page boundary without repeating onboarding topics', async () => {
    const onboarding = topics('onboarding', 20);
    const remaining = topics('remaining', 2);
    serveSuggestions(onboarding, remaining);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toHaveLength(20));
    await act(async () => {
      await result.current.fetchMore();
    });

    await waitFor(() => expect(result.current.suggestions).toEqual([...onboarding, ...remaining]));
    expect(mocks.graphql.mock.calls[1][0].variables).toMatchObject({
      offset: 20,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { some: tagged } },
    });
    expect(mocks.graphql.mock.calls[2][0].variables).toMatchObject({
      offset: 0,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { none: tagged } },
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps a topic once if a tag change makes it reappear across tiers', async () => {
    const onboarding = topics('onboarding', 1);
    const remaining = topics('remaining', 2);
    serveSuggestions(onboarding, [...onboarding, ...remaining]);
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toEqual([...onboarding, ...remaining]));
  });

  it('scopes membership and both tag tiers to the selected spaces on every page', async () => {
    const crypto = 'c9f267dcb0d270718c2a3c45a64afd32';
    const selected = [SPACE, crypto].sort();
    serveSuggestions(topics('onboarding', 25), topics('remaining', 25));
    const { result } = suggestions([crypto.toUpperCase(), SPACE, crypto]);
    await waitFor(() => expect(result.current.suggestions).toHaveLength(20));
    await act(async () => {
      await result.current.fetchMore();
    });
    await act(async () => {
      await result.current.fetchMore();
    });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(50));

    // Ranking by selected spaces alone can return topics that only exist elsewhere. Both the
    // membership constraint and local tag relation must be applied before first/offset slicing.
    for (const [request] of mocks.graphql.mock.calls) {
      expect(request.variables.spaceIds).toEqual(selected);
      expect(request.variables.filter.spaceIds).toEqual({ overlaps: selected });
      const relation = request.variables.filter.relations;
      expect(relation.some ?? relation.none).toEqual({
        ...tagged,
        spaceId: { in: selected },
      });
    }
    expect(mocks.graphql.mock.calls.some(([r]) => r.variables.filter.relations.none)).toBe(true);
  });

  it('does not reuse cached suggestions from the old cross-space filter', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['topic-suggestions-for-spaces', ONBOARDING_TOPIC_TAG_ID, [SPACE]], {
      pages: [{ topics: [{ id: 'trump', name: 'Trump administration' }], next: null }],
      pageParams: [{ tier: 'onboarding', offset: 0 }],
    });
    const local = topics('local', 2);
    serveSuggestions(local, []);
    const { result } = renderHook(() => useTopicSuggestions([SPACE]), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await waitFor(() => expect(result.current.suggestions).toEqual(local));
    expect(result.current.suggestions.some(topic => topic.id === 'trump')).toBe(false);
  });

  it('does not query until there are spaces to rank suggestions from', () => {
    suggestions([]);
    expect(mocks.graphql).not.toHaveBeenCalled();
  });

  it('retries a failed onboarding read before allowing remaining topics through', async () => {
    const onboarding = topics('onboarding', 1);
    serveSuggestions(onboarding, topics('remaining', 1));
    mocks.graphql.mockImplementationOnce(() => Effect.fail(new Error('API unavailable')));
    const { result } = suggestions();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mocks.graphql).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.suggestions[0]).toEqual(onboarding[0]));
    expect(mocks.graphql.mock.calls[1][0].variables.filter).toEqual({
      spaceIds: { overlaps: [SPACE] },
      relations: { some: tagged },
    });
  });

  it('advances by raw rows and fills a page when a decoded row is missing its name', async () => {
    const onboarding = topics('onboarding', 20);
    mocks.graphql
      .mockReturnValueOnce(Effect.succeed({ topics: onboarding.slice(0, 19), rawCount: 20 }))
      .mockReturnValueOnce(Effect.succeed({ topics: onboarding.slice(19), rawCount: 1 }));
    const { result } = suggestions();
    await waitFor(() => expect(result.current.suggestions).toEqual(onboarding));

    expect(mocks.graphql.mock.calls[1][0].variables).toMatchObject({
      offset: 20,
      first: 1,
      filter: { spaceIds: { overlaps: [SPACE] }, relations: { some: tagged } },
    });
    expect(mocks.graphql).toHaveBeenCalledTimes(2);
  });
});
