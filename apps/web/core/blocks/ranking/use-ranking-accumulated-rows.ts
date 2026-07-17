'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { type RowPage, flattenRowPages, upsertRowPage } from '~/core/blocks/data/accumulate-row-pages';
import { filterStateToWhere, useDataBlock } from '~/core/blocks/data/use-data-block';
import { mappingToRows } from '~/core/blocks/data/use-mapping';
import { useView } from '~/core/blocks/data/use-view';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { useQueryEntities } from '~/core/sync/use-store';

import { isCreatedWithinWindow } from './ranking-rolling';
import { useRankingBlockConfig } from './use-ranking-block-config';

export type { RowPage };
export { flattenRowPages, upsertRowPage };

function rowEntityIdsSignature(rows: { entityId: string }[]): string {
  return rows.map(row => row.entityId).join('|');
}

export function useRankingAccumulatedRows() {
  const { entityId, source, filterState, filterMode, pageSize } = useDataBlock();
  const { shownColumnIds } = useView();
  const { isRolling, submissionFrequencyHours } = useRankingBlockConfig();

  const enabled = source.type === 'SPACES' || source.type === 'GEO';

  const where = React.useMemo(() => filterStateToWhere(filterState, filterMode), [filterState, filterMode]);

  const [afterChain, setAfterChain] = React.useState<string[]>([]);
  const pageIndex = afterChain.length;
  const after = afterChain.length > 0 ? afterChain[afterChain.length - 1] : undefined;

  const { entities, isLoading, isFetched, isPlaceholderData, endCursor, hasNextPage } = useQueryEntities({
    where,
    enabled,
    first: pageSize,
    after,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
    includeUnpublishedLocal: true,
    orderBy: [EntitiesOrderBy.CreatedAtDesc],
  });

  // Rolling rankings only rank entities created within the submission-frequency window.
  const applyCreationWindow = isRolling && submissionFrequencyHours != null;
  const { windowedEntities, reachedWindowBoundary } = React.useMemo(() => {
    const list = entities ?? [];
    if (!applyCreationWindow || submissionFrequencyHours == null) {
      return { windowedEntities: list, reachedWindowBoundary: false };
    }
    const now = Date.now();
    const inWindow = list.filter(e => isCreatedWithinWindow(e.createdAt, submissionFrequencyHours, now));
    return { windowedEntities: inWindow, reachedWindowBoundary: inWindow.length < list.length };
  }, [entities, applyCreationWindow, submissionFrequencyHours]);

  const effectiveHasNextPage = reachedWindowBoundary ? false : hasNextPage;

  const pageRows = React.useMemo(
    () => mappingToRows(windowedEntities, shownColumnIds, []),
    [windowedEntities, shownColumnIds]
  );

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
    if (!effectiveHasNextPage || !hasCurrentPage || isPlaceholderData || !endCursor) return;
    setAfterChain(prev => (prev[prev.length - 1] === endCursor ? prev : [...prev, endCursor]));
  }, [effectiveHasNextPage, hasCurrentPage, isPlaceholderData, endCursor]);

  const isFetchingNextPage = pageIndex > 0 && !hasCurrentPage;

  return {
    rows: accumulatedRows,
    isLoading: isLoading && !isFetched,
    hasNextPage: effectiveHasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}
