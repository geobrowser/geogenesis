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
  const {
    rows,
    pageNumber,
    hasNextPage,
    setPage,
    isLoading,
    isFetched,
    isPagePlaceholder,
    isPageFetching,
    entityId,
    source,
    filterState,
  } = useDataBlock();

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
    if (pageNumber > 0 && isPagePlaceholder) return;
    setRowPages(prev => upsertRowPage(prev, pageNumber, rows));
  }, [pageNumber, rowsSignature, isPagePlaceholder]);

  const accumulatedRows = React.useMemo(() => flattenRowPages(rowPages), [rowPages]);

  const fetchNextPage = React.useCallback(() => {
    if (!hasNextPage || isPagePlaceholder || isPageFetching || isFetchingNextPage) return;
    setIsFetchingNextPage(true);
    setPage('next');
  }, [hasNextPage, isPagePlaceholder, isPageFetching, isFetchingNextPage, setPage]);

  React.useEffect(() => {
    if (!isFetchingNextPage || !hasNextPage) return;
    if (!isPagePlaceholder && !isPageFetching) {
      setIsFetchingNextPage(false);
    }
  }, [isFetchingNextPage, hasNextPage, isPagePlaceholder, isPageFetching]);

  const isLoadingMore = hasNextPage && isFetchingNextPage;

  return {
    rows: accumulatedRows,
    isLoading: isLoading && !isFetched,
    hasNextPage,
    isFetchingNextPage: isLoadingMore,
    fetchNextPage,
  };
}
