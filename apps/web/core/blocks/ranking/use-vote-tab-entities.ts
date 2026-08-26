'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { type RowPage, flattenRowPages, upsertRowPage } from '~/core/blocks/data/accumulate-row-pages';
import { filterStateToWhere, useDataBlock } from '~/core/blocks/data/use-data-block';
import { type RankingEntryDisplay, toRankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { type EntityVoteDirectionFilter, useUserVotedEntityIds } from '~/core/hooks/use-user-voted-entity-ids';
import { ID } from '~/core/id';
import { resolveEntityResponseKind, responseKindToVoteKind } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';

/**
 * Entities for the Upvoted / Downvoted browse tabs.
 * Hydrates one page of voted ids at a time and accumulates the display entries,
 * so callers don't need a second entity query over the accumulated list.
 *
 * Entries are snapshotted per page (like useRankingAccumulatedRows), so an
 * entity edited after its page landed keeps its fetched name/description here
 * until the tab or filter resets. Rows shared with the global browse list stay
 * live through the caller's own entries map.
 */
export function useVoteTabEntities(direction: EntityVoteDirectionFilter | null) {
  const { filterState, filterMode, spaceId } = useDataBlock();
  const blockWhere = React.useMemo(() => filterStateToWhere(filterState, filterMode), [filterState, filterMode]);

  const enabled = direction !== null;
  const { ids, idPages, voteKindById, isLoading, hasNextPage, isFetchingNextPage, isError, refetch, fetchNextPage } =
    useUserVotedEntityIds(direction ?? 'up', enabled);

  const [entryPages, setEntryPages] = React.useState<RowPage<RankingEntryDisplay>[]>([]);

  const resetKey = React.useMemo(() => JSON.stringify({ direction, blockWhere }), [direction, blockWhere]);

  React.useEffect(() => {
    setEntryPages([]);
  }, [resetKey]);

  // Hydrate the earliest page not yet accumulated. Pages usually arrive one at
  // a time, but a cached revisit delivers several at once — walking forward
  // from the first gap catches up through the cached entity batches instead of
  // skipping to the newest page and stranding the ones before it.
  const pageIndex = React.useMemo(() => {
    const hydrated = new Set(entryPages.map(page => page.page));
    for (let index = 0; index < idPages.length; index++) {
      if (!hydrated.has(index)) return index;
    }
    return Math.max(0, idPages.length - 1);
  }, [entryPages, idPages]);

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

  const pageEntries = React.useMemo(
    () =>
      (entities ?? [])
        .filter(entity => {
          const votedKind = voteKindById.get(ID.uuidToHex(entity.id));
          if (votedKind === undefined) return false;
          return responseKindToVoteKind(resolveEntityResponseKind(entity, spaceId)) === votedKind;
        })
        .map(entity => toRankingEntryDisplay(entity, spaceId)),
    [entities, voteKindById, spaceId]
  );
  const pageEntriesSignature = pageEntries.map(entry => entry.entityId).join('|');

  React.useEffect(() => {
    if (!enabled) return;
    if (pageIds.length === 0) {
      setEntryPages(prev => upsertRowPage(prev, pageIndex, []));
      return;
    }
    if (!isFetched || isPlaceholderData) return;
    setEntryPages(prev => upsertRowPage(prev, pageIndex, pageEntries));
  }, [enabled, isFetched, isPlaceholderData, pageIndex, pageIds.length, pageEntriesSignature, resetKey]);

  const hasCurrentPage = React.useMemo(() => entryPages.some(page => page.page === pageIndex), [entryPages, pageIndex]);

  const accumulatedEntries = React.useMemo(() => flattenRowPages(entryPages), [entryPages]);

  // The block query returns entities in its own order, so re-impose the order the user voted in.
  const entries = React.useMemo(() => {
    if (!enabled) return [];

    const voteOrder = new Map(ids.map((id, index) => [id, index]));

    return accumulatedEntries
      .map(entry => ({ entry, order: voteOrder.get(ID.uuidToHex(entry.entityId)) }))
      .filter((item): item is { entry: RankingEntryDisplay; order: number } => item.order !== undefined)
      .sort((a, b) => a.order - b.order)
      .map(item => item.entry);
  }, [enabled, accumulatedEntries, ids]);

  const orderedIds = React.useMemo(() => entries.map(entry => entry.entityId), [entries]);

  const fetchNextVotePage = React.useCallback(() => {
    if (!hasNextPage || !hasCurrentPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasCurrentPage, hasNextPage, isFetchingNextPage]);

  return {
    orderedIds,
    entries,
    isLoading: isLoading || (accumulatedEntries.length === 0 && pageIds.length > 0 && isLoadingEntities),
    hasNextPage,
    isFetchingNextPage: !isError && (isFetchingNextPage || (pageIndex > 0 && !hasCurrentPage)),
    isError,
    retry: refetch,
    fetchNextPage: fetchNextVotePage,
  };
}
