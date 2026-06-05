'use client';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import { useInfiniteScrollSentinel } from '~/core/space-members/use-space-participants-infinite';
import type { Row } from '~/core/types';

function mergeRows(previous: Row[], pageRows: Row[]): Row[] {
  const byId = new Map(previous.map(row => [row.entityId, row]));
  for (const row of pageRows) {
    byId.set(row.entityId, row);
  }
  return [...byId.values()];
}

function rowEntityIdsSignature(rows: Row[]): string {
  return rows.map(row => row.entityId).join('|');
}

/**
 * Accumulates paginated data-block rows for infinite scroll in ranking compose.
 * Paginated rows from the block source query (`entitiesConnection` + block filters).
 * Permanent data path — not replaced by fetchRankableEntities. Merged with aggregated rankings
 * in `splitRankableEntityIds`.
 */
export function useRankingAccumulatedRows() {
  const { rows, pageNumber, hasNextPage, setPage, isLoading, isFetched } = useDataBlock();
  const [accumulatedRows, setAccumulatedRows] = React.useState<Row[]>([]);

  const rowsSignature = rowEntityIdsSignature(rows);

  React.useEffect(() => {
    setAccumulatedRows(prev => {
      if (pageNumber === 0) {
        if (rowEntityIdsSignature(prev) === rowsSignature) return prev;
        return rows;
      }
      const merged = mergeRows(prev, rows);
      if (rowEntityIdsSignature(merged) === rowEntityIdsSignature(prev)) return prev;
      return merged;
    });
    // rowsSignature tracks content; `rows` is read from the closure when the signature changes.
  }, [rowsSignature, pageNumber]);

  const [isFetchingNextPage, setIsFetchingNextPage] = React.useState(false);

  const fetchNextPage = React.useCallback(() => {
    if (!hasNextPage || isLoading || isFetchingNextPage) return;
    setIsFetchingNextPage(true);
    setPage('next');
  }, [hasNextPage, isLoading, isFetchingNextPage, setPage]);

  React.useEffect(() => {
    if (!isLoading) setIsFetchingNextPage(false);
  }, [isLoading]);

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  return {
    rows: accumulatedRows,
    isLoading: isLoading && !isFetched,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  };
}
