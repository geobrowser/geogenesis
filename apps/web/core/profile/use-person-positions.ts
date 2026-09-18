'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { ID } from '~/core/id';
import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import {
  type ClaimResponse,
  DEFAULT_POSITION_SORT,
  type PositionOrder,
  type PositionSort,
  type Stance,
  fetchPositionOrder,
  personPositionOrderQueryKey,
} from '~/core/profile/person-position-order';
import { normId } from '~/core/utils/norm-id';

export type { ClaimResponse, PositionSort, Stance };
export { DEFAULT_POSITION_SORT };

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

const EMPTY_RESPONSES: Record<string, ClaimResponse> = {};
const EMPTY_SPACES: Record<string, string[]> = {};

/**
 * The vote table, read once for the whole tab (GEO-2859).
 *
 * Three things need it and none of them can be answered without it: how each
 * claim was answered, whether the answer still stands — a retraction is a row
 * rather than an absence, so `entitiesConnection(votedBy:)` counts claims this
 * person no longer holds a position on — and which space they answered in.
 *
 * One query key, shared with the `new` order, so the list, the filter menus and
 * the count all narrow to the same set and one request serves them.
 */
export function usePersonResponses({ spaceId, enabled = true }: { spaceId: string; enabled?: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: personPositionOrderQueryKey(spaceId, 'new'),
    enabled: enabled && spaceId !== '',
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchPositionOrder(spaceId, 'new', signal),
  });

  const answeredIds = React.useMemo(() => (data ? new Set(data.entityIds) : undefined), [data]);

  return {
    responseByClaimId: data?.responseByClaimId ?? EMPTY_RESPONSES,
    spacesByClaimId: data?.spacesByClaimId ?? EMPTY_SPACES,
    /**
     * The claims still answered, or undefined while the read is out.
     *
     * Undefined rather than an empty set, and callers must keep the difference:
     * narrowing to an empty set draws a full record as an empty one.
     */
    answeredIds,
    /** Positions this person actually holds — what the rail and the tab count. */
    total: data ? data.entityIds.length : null,
    isLoading,
    isError,
  };
}

/**
 * The Positions number, from the only source that can tell a held position from
 * a retracted one (GEO-2859).
 *
 * `entitiesConnection(votedBy:)` counts the row, and taking a side back rewrites
 * the row to "neither" rather than removing it — so the server's count is of
 * claims this person has *answered at some point*, which on one account is 211
 * against 194 positions actually held and on another 34 against 22. That number
 * sits directly above a list that shows the 194, so the two had to be reconciled
 * and the vote table is the side that can be.
 *
 * There is no server-side fix available *yet*: `votedByTypes` does not exist on
 * either connection, and `userVotes` counts rows rather than claims — a claim
 * answered for both stance and veracity is two of them. GEO-2962 asks for the
 * argument; when it lands this function and the vote scan behind it come out,
 * and the count goes back to being one `totalCount` in the server-rendered
 * facts query.
 */
export function heldPositionsCount(
  responses: { total: number | null; isError: boolean },
  /** The server's count, which includes retractions. Used only as a last resort. */
  serverCount: number
): number | null {
  if (responses.total !== null) return responses.total;

  // The vote read failed. The server's count is then the only number there is,
  // and an overstated count reads better than a permanently blank one — the
  // alternative is a profile whose headline number never arrives.
  return responses.isError ? serverCount : null;
}

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
  /**
   * Where to show each claim, for claims the reader narrowed to a space.
   *
   * `pickDisplaySpaceId` otherwise takes the first of an entity's spaces, which
   * for a multi-space claim is not necessarily one the reader picked — see
   * `preferredSpacesFor`.
   */
  preferredSpaceById?: Map<string, string>;
  first?: number;
};

export function usePersonPositions({
  spaceId,
  // So the Activity gallery, which asks for no sort at all, is ordered the same
  // way as the tab it links to.
  sort = DEFAULT_POSITION_SORT,
  matchingIds = null,
  preferredSpaceById,
  first = PAGE_SIZE,
}: UsePersonPositionsParams) {
  const order = useQuery({
    queryKey: personPositionOrderQueryKey(spaceId, sort),
    enabled: spaceId !== '',
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchPositionOrder(spaceId, sort, signal),
  });

  // The vote table, which Top needs as well as its own order: score order says
  // nothing about how a claim was answered or whether the answer still stands.
  // Keyed identically to the `new` order, so the two share one cache entry and
  // switching sorts back and forth costs nothing.
  const responses = usePersonResponses({ spaceId });
  const { responseByClaimId, answeredIds } = responses;

  // Nothing before the vote table lands. Top's own order includes claims this
  // person has retracted — `entitiesOrderedByPropertyConnection(votedBy:)`
  // cannot tell a held position from a withdrawn one — so rendering it early
  // would show the retracted ones for a beat and then drop them.
  const orderedIds = React.useMemo(
    () => (answeredIds ? applyFilter(order.data, matchingIds, answeredIds) : []),
    [order.data, matchingIds, answeredIds]
  );

  /**
   * Where to render each claim: only where the *reader* asked for.
   *
   * The space they voted in used to be offered as a preference too, and that was
   * a mistake worth recording. It narrowed a multi-space claim to one space
   * before `pickDisplaySpaceId` could rank them — so a claim answered in a
   * personal space rendered there, carrying no Claim type and so no response
   * controls, even though the same claim sits in the topic space it is argued
   * in. Ranking is the rule, and a preference that pre-empts it is not a
   * refinement of it.
   *
   * A filter is different in kind: narrow to a space and the card has to land in
   * the space asked for, ranking or not.
   */
  const preferredSpaces = React.useMemo(() => {
    if (!preferredSpaceById) return undefined;
    return new Map([...preferredSpaceById].map(([id, space]) => [id, [space]]));
  }, [preferredSpaceById]);

  // The ids the page fetcher closes over — identified, not counted.
  //
  // Two counts is not an identity: any two selections leaving the same number of
  // claims collide, and with a 30-second stale time react-query then answers the
  // new filter with the old filter's cards rather than calling the closure at
  // all. Pick one topic matching ten, swap it for another matching ten, and the
  // list does not change.
  //
  // The ids themselves rather than a digest of them: this is exact by
  // construction, where a hash is exact only probabilistically, and the cost is
  // a ~7KB key for the largest record that exists against a handful of live
  // selections. Worth revisiting if a record ever gets big enough for the key to
  // matter, which is the same point at which the whole complete-list approach
  // needs rethinking anyway.
  const filterKey = React.useMemo(() => {
    const ids = matchingIds === null ? 'all' : orderedIds.join(',');
    // The preference is in the closure too, and it can change while the id list
    // does not: two spaces holding the same claims narrow to the same rows but
    // label them differently. Without this the second selection is served the
    // first one's cards, pointing at the space the reader just navigated away
    // from — the same collision as above, one field over.
    const preferred = orderedIds.map(id => (preferredSpaces?.get(id) ?? []).join('+')).join(',');
    return `${ids}|${preferred}`;
  }, [matchingIds, orderedIds, preferredSpaces]);

  const {
    data,
    isLoading: isLoadingRows,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError: isRowsError,
  } = useInfiniteQuery({
    queryKey: personPositionsQueryKey(spaceId, sort, filterKey),
    enabled: spaceId !== '' && order.isSuccess && answeredIds !== undefined,
    initialPageParam: 0,
    getNextPageParam: (_last: ExploreFeedRow[], _pages: ExploreFeedRow[][], lastOffset: number) => {
      const next = lastOffset + first;
      return next < orderedIds.length ? next : null;
    },
    queryFn: ({ pageParam, signal }) =>
      fetchExploreRowsByIds(orderedIds.slice(pageParam, pageParam + first), signal, preferredSpaces),
    retry: 1,
    staleTime: 30_000,
  });

  const rows = React.useMemo(() => (data?.pages ?? []).flat(), [data]);

  return {
    rows,
    responseByClaimId,
    /** How many claims the current filter leaves — not how many are rendered. */
    total: orderedIds.length,
    isLoading: order.isLoading || responses.isLoading || isLoadingRows,
    isError: order.isError || responses.isError || isRowsError,
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
export function applyFilter(
  order: PositionOrder | undefined,
  matchingIds: readonly string[] | null,
  /**
   * The claims still answered, from the vote table.
   *
   * Applies to Top, whose order arrives from a connection that cannot tell a
   * held position from a retracted one. The `new` order is already narrowed to
   * these, so intersecting again costs a set lookup and changes nothing.
   */
  answeredIds?: ReadonlySet<string>
): string[] {
  if (!order) return [];

  const held = answeredIds ? order.entityIds.filter(id => answeredIds.has(id)) : order.entityIds;
  if (matchingIds === null) return held;

  const keep = new Set(matchingIds.map(normId));

  return held.filter(id => keep.has(id));
}
