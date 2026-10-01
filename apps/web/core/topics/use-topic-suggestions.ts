'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPIC_TYPE_ID } from '~/core/constants';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

export type TopicOption = { id: string; name: string };

export const TOPIC_SUGGESTIONS_PAGE_SIZE = 20;
const TOPIC_SEARCH_LIMIT = 20;

// Ranked, deduped topics for a set of spaces (gaia#982). An empty `spaceIds` returns [].
const TOPIC_SUGGESTIONS_SOURCE = /* GraphQL */ `
  query TopicSuggestionsForSpaces($spaceIds: [UUID], $first: Int, $offset: Int) {
    topicSuggestionsForSpaces(spaceIds: $spaceIds, first: $first, offset: $offset) {
      id
      name
    }
  }
`;

const TOPIC_SEARCH_SOURCE = /* GraphQL */ `
  query TopicSearch($query: String!, $typeId: UUID!, $first: Int) {
    search(query: $query, first: $first, filter: { typeIds: { anyEqualTo: $typeId } }) {
      id
      name
    }
  }
`;

const topicSuggestionsDocument = parse(TOPIC_SUGGESTIONS_SOURCE) as TypedDocumentNode<any, any>;
const topicSearchDocument = parse(TOPIC_SEARCH_SOURCE) as TypedDocumentNode<any, any>;

type TopicRow = { id?: string | null; name?: string | null } | null;

function decodeTopics(rows: TopicRow[] | null | undefined): TopicOption[] {
  const out: TopicOption[] = [];
  for (const row of rows ?? []) {
    const name = row?.name?.trim();
    if (!row?.id || !name) continue;
    out.push({ id: uuidToHex(row.id), name });
  }
  return out;
}

export function decodeTopicSuggestions(data: { topicSuggestionsForSpaces?: TopicRow[] | null }): TopicOption[] {
  return decodeTopics(data.topicSuggestionsForSpaces);
}

export function decodeTopicSearch(data: { search?: TopicRow[] | null }): TopicOption[] {
  return decodeTopics(data.search);
}

/** Suggested topics for `spaceIds`, in rank order. `fetchNextPage` appends the next page. */
export function useTopicSuggestions(spaceIds: string[]) {
  const ids = React.useMemo(() => [...new Set(spaceIds.filter(Boolean).map(uuidToHex))].sort(), [spaceIds]);

  const query = useInfiniteQuery({
    queryKey: ['topic-suggestions-for-spaces', ids],
    queryFn: ({ pageParam, signal }) =>
      Effect.runPromise(
        graphql({
          query: topicSuggestionsDocument,
          decoder: decodeTopicSuggestions,
          variables: { spaceIds: ids, first: TOPIC_SUGGESTIONS_PAGE_SIZE, offset: pageParam },
          signal,
        })
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < TOPIC_SUGGESTIONS_PAGE_SIZE ? undefined : pages.length * TOPIC_SUGGESTIONS_PAGE_SIZE,
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });

  const suggestions = React.useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flat().filter(topic => !seen.has(topic.id) && seen.add(topic.id));
  }, [query.data]);

  return {
    suggestions,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    fetchMore: query.fetchNextPage,
  };
}

/** Debounced name search over Topic entities only. */
export function useTopicSearch(query: string) {
  const trimmed = useDebouncedValue(query).trim();

  const result = useQuery({
    queryKey: ['topic-search', trimmed],
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: topicSearchDocument,
          decoder: decodeTopicSearch,
          variables: { query: trimmed, typeId: TOPIC_TYPE_ID, first: TOPIC_SEARCH_LIMIT },
          signal,
        })
      ),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  return {
    results: result.data ?? [],
    isSearching: query.trim() !== '' && (query.trim() !== trimmed || result.isLoading),
    isError: result.isError,
  };
}
