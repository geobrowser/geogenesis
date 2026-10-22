'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { ONBOARDING_TOPIC_TAG_ID, TAG_PROPERTY_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

export type TopicOption = { id: string; name: string };

export const TOPIC_SUGGESTIONS_PAGE_SIZE = 20;
const TOPIC_SEARCH_LIMIT = 20;

// Ranked, deduped topics for a set of spaces (gaia#982). An empty `spaceIds` returns [].
const TOPIC_SUGGESTIONS_SOURCE = /* GraphQL */ `
  query TopicSuggestionsForSpaces($spaceIds: [UUID], $first: Int, $offset: Int, $filter: EntityFilter!) {
    topicSuggestionsForSpaces(spaceIds: $spaceIds, first: $first, offset: $offset, filter: $filter) {
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

type SuggestionCursor = { tier: 'onboarding' | 'remaining'; offset: number };
type SuggestionPage = { topics: TopicOption[]; next: SuggestionCursor | null };

/** Each tier keeps Gaia's ranking. Filters run on the server, before its first/offset pagination. */
async function fetchSuggestionPage(
  spaceIds: string[],
  start: SuggestionCursor,
  signal: AbortSignal
): Promise<SuggestionPage> {
  const topics: TopicOption[] = [];
  let cursor = start;

  while (topics.length < TOPIC_SUGGESTIONS_PAGE_SIZE) {
    const first = TOPIC_SUGGESTIONS_PAGE_SIZE - topics.length;
    const batch = await Effect.runPromise(
      graphql({
        query: topicSuggestionsDocument,
        decoder: (data: { topicSuggestionsForSpaces?: TopicRow[] | null }) => ({
          topics: decodeTopicSuggestions(data),
          // Invalid/unnamed rows still consume API offsets, but must not end a tier early.
          rawCount: data.topicSuggestionsForSpaces?.length ?? 0,
        }),
        variables: {
          spaceIds,
          first,
          offset: cursor.offset,
          filter: {
            // Ranking by space includes topics mentioned by its content, even when those topic
            // entities only exist elsewhere. Constrain both tiers to actual space membership.
            spaceIds: { overlaps: spaceIds },
            relations: {
              [cursor.tier === 'onboarding' ? 'some' : 'none']: {
                typeId: { is: TAG_PROPERTY_ID },
                toEntityId: { is: ONBOARDING_TOPIC_TAG_ID },
                spaceId: { in: spaceIds },
              },
            },
          },
        },
        signal,
      })
    );
    topics.push(...batch.topics);

    if (batch.rawCount === first) {
      cursor = { ...cursor, offset: cursor.offset + batch.rawCount };
    } else if (cursor.tier === 'onboarding') {
      // Once local Onboarding tags are exhausted, fill the rest of this page with remaining
      // topics from these spaces, then continue that tier on the next Show more.
      cursor = { tier: 'remaining', offset: 0 };
    } else {
      return { topics, next: null };
    }
  }

  return { topics, next: cursor };
}

/** Onboarding-tagged topics first, then remaining topics; each tier preserves the existing space ranking. */
export function useTopicSuggestions(spaceIds: string[]) {
  const ids = React.useMemo(() => [...new Set(spaceIds.filter(Boolean).map(uuidToHex))].sort(), [spaceIds]);

  const query = useInfiniteQuery({
    queryKey: ['topic-suggestions-for-spaces', 'space-scoped', ONBOARDING_TOPIC_TAG_ID, ids],
    queryFn: ({ pageParam, signal }) => fetchSuggestionPage(ids, pageParam, signal),
    initialPageParam: { tier: 'onboarding', offset: 0 } as SuggestionCursor,
    getNextPageParam: lastPage => lastPage.next ?? undefined,
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });

  // Pages are offsets into a list that is rebuilt hourly, so a topic can recur across pages.
  const suggestions = React.useMemo(() => {
    const byId = new Map<string, TopicOption>();
    for (const page of query.data?.pages ?? []) {
      for (const topic of page.topics) if (!byId.has(topic.id)) byId.set(topic.id, topic);
    }
    return [...byId.values()];
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
    // True while the shown results belong to an earlier query (debouncing, or placeholder data).
    isSearching: query.trim() !== '' && (query.trim() !== trimmed || result.isLoading || result.isPlaceholderData),
    isError: result.isError,
    refetch: result.refetch,
  };
}
