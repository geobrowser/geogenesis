'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { type IdPage, flattenIdPages, upsertIdPage } from '~/core/blocks/data/accumulate-id-pages';
import { filterStateToWhere, useDataBlock } from '~/core/blocks/data/use-data-block';
import { type EntityVoteDirectionFilter, useUserVotedEntityIds } from '~/core/hooks/use-user-voted-entity-ids';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';

/**
 * Entities for the Upvoted / Downvoted browse tabs.
 * Hydrating the flattened id list
 */
export function useVoteTabEntities(direction: EntityVoteDirectionFilter | null) {
  const { filterState, filterMode } = useDataBlock();
  const blockWhere = React.useMemo(() => filterStateToWhere(filterState, filterMode), [filterState, filterMode]);

  const enabled = direction !== null;
  const { ids, idPages, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useUserVotedEntityIds(
    direction ?? 'up',
    enabled
  );

  const pageIndex = Math.max(0, idPages.length - 1);
  const pageIds = React.useMemo(() => idPages[pageIndex] ?? [], [idPages, pageIndex]);

  const where = React.useMemo(() => ({ ...blockWhere, id: { in: pageIds } }), [blockWhere, pageIds]);

  const {
    entities,
    isLoading: isLoadingEntities,
    isFetched,
    isPlaceholderData,
  } = useQueryEntities({
    where,
    first: pageIds.length,
    enabled: enabled && pageIds.length > 0,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
  });

  const [entityIdPages, setEntityIdPages] = React.useState<IdPage[]>([]);

  const resetKey = React.useMemo(() => JSON.stringify({ direction, blockWhere }), [direction, blockWhere]);

  React.useEffect(() => {
    setEntityIdPages([]);
  }, [resetKey]);

  const pageEntityIds = React.useMemo(() => (entities ?? []).map(entity => entity.id), [entities]);
  const pageEntityIdsSignature = pageEntityIds.join('|');

  React.useEffect(() => {
    if (!enabled) return;
    if (pageIds.length === 0) {
      setEntityIdPages(prev => upsertIdPage(prev, pageIndex, []));
      return;
    }
    if (!isFetched || isPlaceholderData) return;
    setEntityIdPages(prev => upsertIdPage(prev, pageIndex, pageEntityIds));
  }, [enabled, isFetched, isPlaceholderData, pageIndex, pageIds.length, pageEntityIdsSignature, resetKey]);

  const hasCurrentPage = React.useMemo(
    () => entityIdPages.some(page => page.page === pageIndex),
    [entityIdPages, pageIndex]
  );

  const accumulatedIds = React.useMemo(() => flattenIdPages(entityIdPages), [entityIdPages]);

  // The block query returns entities in its own order, so re-impose the order the user voted in.
  const orderedIds = React.useMemo(() => {
    if (!enabled) return [];

    const voteOrder = new Map(ids.map((id, index) => [id, index]));

    return accumulatedIds
      .map(id => ({ id, order: voteOrder.get(ID.uuidToHex(id)) }))
      .filter((entry): entry is { id: string; order: number } => entry.order !== undefined)
      .sort((a, b) => a.order - b.order)
      .map(entry => entry.id);
  }, [enabled, accumulatedIds, ids]);

  const fetchNextVotePage = React.useCallback(() => {
    if (!hasNextPage || !hasCurrentPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasCurrentPage, hasNextPage, isFetchingNextPage]);

  return {
    orderedIds,
    isLoading: isLoading || (accumulatedIds.length === 0 && pageIds.length > 0 && isLoadingEntities),
    hasNextPage,
    isFetchingNextPage: isFetchingNextPage || (pageIndex > 0 && !hasCurrentPage),
    fetchNextPage: fetchNextVotePage,
  };
}
