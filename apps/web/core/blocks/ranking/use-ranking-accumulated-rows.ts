'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { filterStateToWhere, useDataBlock } from '~/core/blocks/data/use-data-block';
import { mappingToRows } from '~/core/blocks/data/use-mapping';
import { useView } from '~/core/blocks/data/use-view';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Row } from '~/core/types';

export const RANKING_BROWSE_PAGE_SIZE = 50;

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
  const { entityId, source, filterState, filterMode } = useDataBlock();
  const { shownColumnIds } = useView();

  const enabled = source.type === 'SPACES' || source.type === 'GEO';

  const where = React.useMemo(() => filterStateToWhere(filterState, filterMode), [filterState, filterMode]);

  const [afterChain, setAfterChain] = React.useState<string[]>([]);
  const pageIndex = afterChain.length;
  const after = afterChain.length > 0 ? afterChain[afterChain.length - 1] : undefined;

  const { entities, isLoading, isFetched, isPlaceholderData, endCursor, hasNextPage } = useQueryEntities({
    where,
    enabled,
    first: RANKING_BROWSE_PAGE_SIZE,
    after,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
    includeUnpublishedLocal: true,
    orderBy: [EntitiesOrderBy.CreatedAtDesc],
  });

  const pageRows = React.useMemo(() => mappingToRows(entities ?? [], shownColumnIds, []), [entities, shownColumnIds]);

  const [rowPages, setRowPages] = React.useState<RowPage[]>([]);

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
    setAfterChain([]);
  }, [resetKey]);

  const rowsSignature = rowEntityIdsSignature(pageRows);

  React.useEffect(() => {
    if (!isFetched || isPlaceholderData) return;
    setRowPages(prev => upsertRowPage(prev, pageIndex, pageRows));
  }, [pageIndex, rowsSignature, isFetched, isPlaceholderData]);

  const hasCurrentPage = React.useMemo(() => rowPages.some(p => p.page === pageIndex), [rowPages, pageIndex]);

  const accumulatedRows = React.useMemo(() => flattenRowPages(rowPages), [rowPages]);

  const fetchNextPage = React.useCallback(() => {
    if (!hasNextPage || !hasCurrentPage || isPlaceholderData || !endCursor) return;
    setAfterChain(prev => (prev[prev.length - 1] === endCursor ? prev : [...prev, endCursor]));
  }, [hasNextPage, hasCurrentPage, isPlaceholderData, endCursor]);

  const isFetchingNextPage = pageIndex > 0 && !hasCurrentPage;

  return {
    rows: accumulatedRows,
    isLoading: isLoading && !isFetched,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}
