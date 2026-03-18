'use client';

import { useQuery } from '@tanstack/react-query';
import { Duration } from 'effect';

import * as React from 'react';

import { fetchSpaceTopicSearch } from '~/core/io/subgraph/fetch-space-topic-search';

import { useDebouncedValue } from './use-debounced-value';

export function useSpaceTopicSearch() {
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebouncedValue(query);

  const { data: results, isLoading } = useQuery({
    enabled: debouncedQuery.trim() !== '',
    queryKey: ['space-topic-search', debouncedQuery],
    queryFn: ({ signal }) => fetchSpaceTopicSearch(debouncedQuery, signal),
    gcTime: Duration.toMillis(Duration.seconds(15)),
  });

  const isQuerySyncing = query !== debouncedQuery;

  return {
    isLoading: isQuerySyncing || isLoading,
    query,
    results: results ?? [],
    onQueryChange: setQuery,
  };
}
