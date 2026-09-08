'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import {
  type RowPage,
  flattenRowPages,
  rowEntityIdsSignature,
  upsertRowPage,
} from '~/core/blocks/data/accumulate-row-pages';
import { filterStateToWhere, useDataBlock } from '~/core/blocks/data/use-data-block';
import { type RankingEntryDisplay, toRankingEntryDisplay } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { type EntityVoteDirectionFilter, useUserVotedEntityIds } from '~/core/hooks/use-user-voted-entity-ids';
import { ID } from '~/core/id';
import { resolveEntityResponseKind, responseKindToVoteKind } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

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
type VoteTabHydration = {
  entries: RowPage<RankingEntryDisplay>[];
  /**
   * The ids each page was hydrated from. Tracking the contents rather than just
   * the page number is what lets a page whose ids changed under it — a restored
   * vote landing mid-list, or a page pre-marked empty before the cached ids
   * arrived — be recognised as stale and fetched again.
   */
  signatures: Record<number, string>;
};

const EMPTY_VOTE_TAB_HYDRATION: VoteTabHydration = { entries: [], signatures: {} };

export function useVoteTabEntities(direction: EntityVoteDirectionFilter | null) {
  const { filterState, modesByColumn, spaceId } = useDataBlock();
  const blockWhere = React.useMemo(
    () => filterStateToWhere(filterState, modesByColumn),
    [filterState, modesByColumn]
  );

  const enabled = direction !== null;
  const { ids, idPages, voteKindById, isLoading, hasNextPage, isFetchingNextPage, isError, refetch, fetchNextPage } =
    useUserVotedEntityIds(direction ?? 'up', enabled);

  // Kept per list rather than wiped when the direction changes: a tab switch
  // would otherwise throw away every hydrated page, and since the votes query is
  // cached by then nothing reports loading — the tab renders as empty and then
  // regrows a page per effect flush. The ids survive a switch already
  // (`fetchedPagesByList`); this is the display half of the same idea.
  const [hydrationByList, setHydrationByList] = React.useState<Record<string, VoteTabHydration>>({});

  const listKey = React.useMemo(() => JSON.stringify({ direction, blockWhere }), [direction, blockWhere]);
  const { entries: entryPages, signatures: hydratedSignatures } = hydrationByList[listKey] ?? EMPTY_VOTE_TAB_HYDRATION;

  // Hydrate the earliest page whose ids aren't the ones we accumulated. Pages
  // usually arrive one at a time, but a cached revisit delivers several at once —
  // walking forward from the first gap catches up through the cached entity
  // batches instead of skipping to the newest page and stranding the ones before it.
  const pageIndex = React.useMemo(() => {
    for (let index = 0; index < idPages.length; index++) {
      if (hydratedSignatures[index] !== idPages[index].join('|')) return index;
    }
    return Math.max(0, idPages.length - 1);
  }, [hydratedSignatures, idPages]);

  const pageIds = React.useMemo(() => idPages[pageIndex] ?? [], [idPages, pageIndex]);

  const where = React.useMemo(() => ({ ...blockWhere, id: { in: pageIds } }), [blockWhere, pageIds]);

  const {
    entities,
    isLoading: isLoadingEntities,
    isFetched,
    isPlaceholderData,
    error: entitiesError,
    refetch: refetchEntities,
  } = useQueryEntities({
    where,
    first: pageIds.length,
    enabled: enabled && pageIds.length > 0,
    placeholderData: keepPreviousData,
    deferUntilFetched: true,
  });

  const pageEntries = React.useMemo(
    () =>
      (entities ?? []).flatMap(entity => {
        const votedKind = voteKindById.get(ID.uuidToHex(entity.id));
        if (votedKind === undefined) return [];
        // Votes span every space the viewer has voted in, so the kind has to be
        // read in the entity's own space — resolving a claim verified elsewhere
        // against this block's space downgrades it and drops it from the tab.
        const entitySpaceId = resolveEntitySpaceId(entity, spaceId);
        if (responseKindToVoteKind(resolveEntityResponseKind(entity, entitySpaceId)) !== votedKind) return [];
        return [toRankingEntryDisplay(entity, entitySpaceId)];
      }),
    [entities, voteKindById, spaceId]
  );
  const pageEntriesSignature = rowEntityIdsSignature(pageEntries);
  const pageIdsSignature = pageIds.join('|');

  React.useEffect(() => {
    if (!enabled) return;
    const commit = (entries: RankingEntryDisplay[]) => {
      setHydrationByList(prev => {
        const current = prev[listKey] ?? EMPTY_VOTE_TAB_HYDRATION;
        const nextEntries = upsertRowPage(current.entries, pageIndex, entries);
        const nextSignatures =
          current.signatures[pageIndex] === pageIdsSignature
            ? current.signatures
            : { ...current.signatures, [pageIndex]: pageIdsSignature };

        if (nextEntries === current.entries && nextSignatures === current.signatures) return prev;
        return { ...prev, [listKey]: { entries: nextEntries, signatures: nextSignatures } };
      });
    };

    if (pageIds.length === 0) {
      commit([]);
      return;
    }
    // A failed fetch settles as isFetched with the local-store fallback, so
    // committing here would bank an empty page as hydrated and never retry it.
    if (entitiesError) return;
    if (!isFetched || isPlaceholderData) return;
    commit(pageEntries);
  }, [
    enabled,
    entitiesError,
    isFetched,
    isPlaceholderData,
    pageIndex,
    pageIds.length,
    pageIdsSignature,
    pageEntriesSignature,
    listKey,
  ]);

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

  const hasError = isError || entitiesError != null;

  // A failed hydration must not advance the list. The ids query stays healthy
  // when it's the entity fetch that failed, so without this guard the consumer's
  // scroll sentinel walks the viewer's entire vote history back to back — every
  // page landing, none of them hydrating, and no spinner to show for it.
  const fetchNextVotePage = React.useCallback(() => {
    if (hasError || !hasNextPage || !hasCurrentPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, hasCurrentPage, hasError, hasNextPage, isFetchingNextPage]);

  const retry = React.useCallback(() => {
    void refetch();
    void refetchEntities();
  }, [refetch, refetchEntities]);

  return {
    orderedIds,
    entries,
    isLoading: isLoading || (accumulatedEntries.length === 0 && pageIds.length > 0 && isLoadingEntities),
    // Retiring the sentinel while the error shows keeps "Try again" as the only
    // way forward, rather than letting infinite scroll retry it silently.
    hasNextPage: hasNextPage && !hasError,
    isFetchingNextPage: !hasError && (isFetchingNextPage || (pageIndex > 0 && !hasCurrentPage)),
    isError: hasError,
    retry,
    fetchNextPage: fetchNextVotePage,
  };
}
