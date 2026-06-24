'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration } from 'effect';

import { fetchDefaultSubtopics, fetchSubtopicSearch } from '~/core/io/subgraph/fetch-subtopic-search';

import { useDebouncedValue } from './use-debounced-value';

const RESULTS_CACHE_TIME = Duration.toMillis(Duration.minutes(5));

// Shared so the live query and the prefetch hook stay
function defaultSubtopicsQueryOptions() {
  return {
    queryKey: ['subtopic-default-suggestions'] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) => fetchDefaultSubtopics(signal),
    staleTime: RESULTS_CACHE_TIME,
    gcTime: RESULTS_CACHE_TIME,
  };
}

export function usePrefetchDefaultSubtopics() {
  const queryClient = useQueryClient();

  return React.useCallback(() => {
    void queryClient.prefetchQuery(defaultSubtopicsQueryOptions());
  }, [queryClient]);
}

export function useSubtopicSearch() {
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebouncedValue(query);
  const trimmedQuery = debouncedQuery.trim();
  const hasQuery = trimmedQuery !== '';

  const { data: searchResults, isLoading: isSearchLoading } = useQuery({
    enabled: hasQuery,
    queryKey: ['subtopic-search', trimmedQuery],
    queryFn: ({ signal }) => fetchSubtopicSearch(trimmedQuery, signal),
    placeholderData: keepPreviousData,
    staleTime: RESULTS_CACHE_TIME,
    gcTime: RESULTS_CACHE_TIME,
  });

  const { data: defaultResults, isLoading: isDefaultsLoading } = useQuery(defaultSubtopicsQueryOptions());

  const results = hasQuery ? (searchResults ?? []) : (defaultResults ?? []);
  const hasResults = results.length > 0;
  const isSyncing = query.trim() !== '' && query !== debouncedQuery;

  const isLoading = hasQuery ? (isSyncing || isSearchLoading) && !hasResults : isDefaultsLoading && !hasResults;

  return {
    isLoading,
    query,
    results,
    onQueryChange: setQuery,
  };
}
