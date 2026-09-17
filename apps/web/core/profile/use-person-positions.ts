'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { ID } from '~/core/id';
import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import {
  type PositionOrder,
  type PositionSort,
  type Stance,
  fetchPositionOrder,
  personPositionOrderQueryKey,
} from '~/core/profile/person-position-order';
import { normId } from '~/core/utils/norm-id';

export type { PositionSort, Stance };

/**
 * The claims a person holds a position on, ordered and narrowed (GEO-2859, GEO-2918).
 *
 * Built in two halves, and the split is the point. **Which claims, in what
 * order** is a complete list of ids — see `person-position-order` — because the
 * control row narrows the record rather than the screen, and an ordering can
 * only meet a filter over the whole set. **What those claims are** is fetched a
 * page at a time, because that is the expensive half and the reader sees twenty.
 *
 * Deduping therefore happens once, over the complete list, rather than per page.
 * The old shape paged the vote table directly and merged pages afterwards: a
 * claim whose stance and veracity votes straddled a page boundary escaped the
 * per-page dedupe and rendered twice, with two React keys the same. That class
 * of bug is gone rather than fixed — there are no page boundaries left in the id
 * list for anything to straddle.
 */
const PAGE_SIZE = 20;

const EMPTY_STANCES: Record<string, Stance> = {};

export function personPositionsQueryKey(spaceId: string, sort: PositionSort, filterKey: string) {
  return ['person-positions', ID.uuidToHex(spaceId), sort, filterKey] as const;
}

export type UsePersonPositionsParams = {
  /** The personal space. A vote's `userId` is this, not the person entity. */
  spaceId: string;
  sort?: PositionSort;
  /**
   * The claims the filters left, or null for "no filter applied".
   *
   * Null and an empty array mean opposite things — everything, and nothing — and
   * the tab renders an empty list for the second. Passing `[]` while the index
   * is still loading would flash "no positions" over a record holding hundreds,
   * so callers pass null until they know.
   */
  matchingIds?: readonly string[] | null;
  first?: number;
};

export function usePersonPositions({
  spaceId,
  sort = 'new',
  matchingIds = null,
  first = PAGE_SIZE,
}: UsePersonPositionsParams) {
  const order = useQuery({
    queryKey: personPositionOrderQueryKey(spaceId, sort),
    enabled: spaceId !== '',
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchPositionOrder(spaceId, sort, signal),
  });

  // Stances come from the vote table and nowhere else, so Top needs it as well
  // as its own order. Keyed identically to the `new` order, so the two share one
  // cache entry and switching sorts back and forth costs nothing.
  const stanceSource = useQuery({
    queryKey: personPositionOrderQueryKey(spaceId, 'new'),
    enabled: spaceId !== '' && sort !== 'new',
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchPositionOrder(spaceId, 'new', signal),
  });

  const stanceByClaimId = (sort === 'new' ? order.data : stanceSource.data)?.stanceByClaimId ?? EMPTY_STANCES;

  const orderedIds = React.useMemo(() => applyFilter(order.data, matchingIds), [order.data, matchingIds]);

  // The ids the page fetcher closes over. Without them in the key, changing a
  // filter would serve the previous selection's pages straight from cache.
  const filterKey = matchingIds === null ? 'all' : `${matchingIds.length}:${orderedIds.length}`;

  const {
    data,
    isLoading: isLoadingRows,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError: isRowsError,
  } = useInfiniteQuery({
    queryKey: personPositionsQueryKey(spaceId, sort, filterKey),
    enabled: spaceId !== '' && order.isSuccess,
    initialPageParam: 0,
    getNextPageParam: (_last: ExploreFeedRow[], _pages: ExploreFeedRow[][], lastOffset: number) => {
      const next = lastOffset + first;
      return next < orderedIds.length ? next : null;
    },
    queryFn: ({ pageParam, signal }) => fetchExploreRowsByIds(orderedIds.slice(pageParam, pageParam + first), signal),
    retry: 1,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => (data?.pages ?? []).flat(), [data]);

  return {
    rows,
    stanceByClaimId,
    /** How many claims the current filter leaves — not how many are rendered. */
    total: orderedIds.length,
    isLoading: order.isLoading || isLoadingRows,
    isError: order.isError || isRowsError,
    isFetchingNextPage,
    hasNextPage: Boolean(hasNextPage),
    fetchNextPage,
  };
}

/**
 * The ordered list, keeping only what the filters left.
 *
 * Intersected rather than re-queried. The order and the filter are both complete
 * lists over the same record, so this is exact — and it is what lets the two
 * halves come from different connections without ever disagreeing.
 */
export function applyFilter(order: PositionOrder | undefined, matchingIds: readonly string[] | null): string[] {
  if (!order) return [];
  if (matchingIds === null) return order.entityIds;

  const keep = new Set(matchingIds.map(normId));

  return order.entityIds.filter(id => keep.has(id));
}
