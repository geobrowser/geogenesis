'use client';

import { useQuery } from '@tanstack/react-query';
import { Duration } from 'effect';

import * as React from 'react';

import { fetchSubtopicSearch } from '~/core/io/subgraph/fetch-subtopic-search';

import { useDebouncedValue } from './use-debounced-value';

export function useSubtopicSearch() {
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebouncedValue(query);

  const { data: results, isLoading } = useQuery({
    enabled: debouncedQuery.trim() !== '',
    queryKey: ['subtopic-search', debouncedQuery],
    queryFn: ({ signal }) => fetchSubtopicSearch(debouncedQuery, signal),
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
