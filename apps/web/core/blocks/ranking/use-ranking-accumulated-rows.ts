'use client';

import * as React from 'react';

import { useDataBlock } from '~/core/blocks/data/use-data-block';
import type { Row } from '~/core/types';

export type RowPage = { page: number; rows: Row[] };

function rowEntityIdsSignature(rows: Row[]): string {
  return rows.map(row => row.entityId).join('|');
}

export function upsertRowPage(pages: RowPage[], page: number, rows: Row[]): RowPage[] {
  const signature = rowEntityIdsSignature(rows);
  const existing = pages.find(p => p.page === page);
  if (existing && rowEntityIdsSignature(existing.rows) === signature) {
    return pages;
  }
  const without = pages.filter(p => p.page !== page);
  const next = [...without, { page, rows }];
  next.sort((a, b) => a.page - b.page);
  return next;
}

export function flattenRowPages(pages: RowPage[]): Row[] {
  const ordered: Row[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const row of page.rows) {
      if (!row.entityId || seen.has(row.entityId)) continue;
      seen.add(row.entityId);
      ordered.push(row);
    }
  }

  return ordered;
}

export function useRankingAccumulatedRows() {
  const { rows, pageNumber, hasNextPage, setPage, isLoading, isFetched, entityId, source, filterState } =
    useDataBlock();

  const [rowPages, setRowPages] = React.useState<RowPage[]>([]);
  const [isFetchingNextPage, setIsFetchingNextPage] = React.useState(false);

  const resetKey = React.useMemo(
    () =>
      JSON.stringify({
        entityId,
        sourceType: source.type,
        sourceValue: 'value' in source ? source.value : null,
        filterState: filterState.map(f => ({ columnId: f.columnId, value: f.value })),
      }),
    [entityId, filterState, source]
  );

  React.useEffect(() => {
    setRowPages([]);
    setIsFetchingNextPage(false);
  }, [resetKey]);

  React.useEffect(() => {
    if (!hasNextPage) {
      setIsFetchingNextPage(false);
    }
  }, [hasNextPage]);

  const rowsSignature = rowEntityIdsSignature(rows);

  React.useEffect(() => {
    setRowPages(prev => {
      // While the next page is in flight, the query layer serves the previous
      // page's rows as placeholder data — don't record them under the new
      // page number.
      if (pageNumber > 0) {
        const previousPage = prev.find(p => p.page === pageNumber - 1);
        if (previousPage && rowEntityIdsSignature(previousPage.rows) === rowsSignature) {
          return prev;
        }
      }
      return upsertRowPage(prev, pageNumber, rows);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, rowsSignature]);

  const hasCurrentPage = React.useMemo(() => rowPages.some(p => p.page === pageNumber), [rowPages, pageNumber]);

  const accumulatedRows = React.useMemo(() => flattenRowPages(rowPages), [rowPages]);

  const fetchNextPage = React.useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || !hasCurrentPage) return;
    setIsFetchingNextPage(true);
    setPage('next');
  }, [hasNextPage, isFetchingNextPage, hasCurrentPage, setPage]);

  React.useEffect(() => {
    if (!isFetchingNextPage) return;
    if (hasCurrentPage) {
      setIsFetchingNextPage(false);
    }
  }, [isFetchingNextPage, hasCurrentPage]);

  const isLoadingMore = hasNextPage && isFetchingNextPage;

  return {
    rows: accumulatedRows,
    isLoading: isLoading && !isFetched,
    hasNextPage,
    isFetchingNextPage: isLoadingMore,
    fetchNextPage,
  };
}
