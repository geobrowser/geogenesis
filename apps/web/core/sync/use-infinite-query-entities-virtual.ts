import * as React from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Entity } from '../v2.types';
import { WhereCondition } from './experimental_query-layer';

const BATCH_SIZE = 50;

interface UseInfiniteQueryEntitiesVirtualOptions {
  where: WhereCondition;
  enabled?: boolean;
}

interface UseInfiniteQueryEntitiesVirtualReturn {
  data: Entity[];
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  totalDBRowCount: number;
  totalFetched: number;
}

async function fetchEntities({
  pageParam,
  where,
}: {
  pageParam: number;
  where: WhereCondition;
}): Promise<{ entities: Entity[]; nextCursor: number | undefined; totalCount: number }> {
  // This is a placeholder implementation
  // In production, this should use your actual query API
  // For now, returning empty results to avoid errors
  return {
    entities: [],
    nextCursor: undefined,
    totalCount: 0,
  };
}

export function useInfiniteQueryEntitiesVirtual({
  where,
  enabled = true,
}: UseInfiniteQueryEntitiesVirtualOptions): UseInfiniteQueryEntitiesVirtualReturn {
  const { data, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['infinite-entities', where],
    queryFn: ({ pageParam }) => fetchEntities({ pageParam, where }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
    refetchOnWindowFocus: false,
    staleTime: 30000,
  });

  const allRows = React.useMemo(
    () => (data ? data.pages.flatMap((d) => d.entities as Entity[]) : []),
    [data]
  );

  const totalDBRowCount = data?.pages?.[0]?.totalCount ?? 0;
  const totalFetched = allRows.length;

  return {
    data: allRows,
    isFetching,
    isFetchingNextPage,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    totalDBRowCount,
    totalFetched,
  };
}