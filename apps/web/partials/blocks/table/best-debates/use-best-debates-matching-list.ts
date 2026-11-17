'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { fetchMatchingDebates } from '~/core/blocks/ranking/best-debates-debates';
import { teamSearchEntityClauses } from '~/core/blocks/ranking/best-debates-team-filters';
import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { normId } from '~/core/utils/norm-id';

/**
 * The whole list behind All and By space while a search or a topic is active (Preston, 12 Nov), so
 * the rows reachable agree with the Topic menu's count and By space's headers count whole groups.
 * Without a filter the column keeps its own paging and this reads nothing. The recorded, debater
 * and claim filters (GEO-3774) are more clauses on the same read.
 */
export function useBestDebatesMatchingList({
  active,
  query,
  topicIds,
  filterClauses = NO_CLAUSES,
}: {
  active: boolean;
  query: string;
  topicIds: readonly string[];
  /** The recorded, debater and claim filters as entity clauses (GEO-3774). */
  filterClauses?: readonly Record<string, unknown>[];
}) {
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const picked = React.useMemo(() => [...topicIds].map(normId).sort(), [topicIds]);
  const result = useQuery({
    queryKey: ['best-debates', 'matching-list', debouncedQuery, picked, filterClauses] as const,
    queryFn: () => {
      const clauses = [
        ...teamSearchEntityClauses({
          topicsPropertyId: TOPICS_PROPERTY_ID,
          query: debouncedQuery,
          topicIds: picked,
        }),
        ...filterClauses,
      ];
      return fetchMatchingDebates(clauses.length > 0 ? { and: clauses } : null);
    },
    staleTime: 60_000,
    enabled: active,
  });
  return {
    debates: result.data?.debates ?? null,
    capped: result.data?.capped ?? false,
    loading: active && (result.isLoading || debouncedQuery !== query.trim()),
    error: result.error,
  };
}

const NO_CLAUSES: readonly Record<string, unknown>[] = [];
