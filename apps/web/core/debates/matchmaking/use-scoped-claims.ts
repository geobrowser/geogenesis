'use client';

import * as React from 'react';

import type { MatchmakingClaimsQuery, MatchmakingClaimsResponse, MatchmakingFacets } from '../api';
import { useMatchmakingClaims } from './hooks';
import { useScopeHeldOver } from './use-scope-holdover';

/**
 * The spaces a viewer may be shown claims from, as the pickers know it.
 *
 * `spaceIds` is `null` for "not narrowed" and `[]` for "narrowed to nothing" — a distinction the
 * wire does not make, since geo-chat reads a missing `space_ids` as no filter at all. `pending`
 * covers every lookup the answer is built from, including one holding a previous answer over.
 */
export type ClaimSpaceScope = {
  spaceIds: string[] | null;
  pending: boolean;
};

export type ScopedClaims = {
  /** Pages that answer the scope in force, or none. Never the previous scope's. */
  pages: MatchmakingClaimsResponse[];
  /** The facets riding page one, on the same terms. */
  facets: MatchmakingFacets | undefined;
  /**
   * Whether `facets` is an answer rather than an absence. An empty menu is a real answer once this
   * is true, and "not known yet" until then — the difference between clearing a viewer's selection
   * and dropping it on a slow load.
   */
  facetsSettled: boolean;
  /** Nothing this query could return is showable, so it was never asked. */
  unusable: boolean;
  /**
   * The facets in hand answer a filter the viewer has since moved on from.
   *
   * They keep being rendered — blanking the menu under the cursor is worse than a beat of staleness
   * — but their *counts* must not be, because a count is the one part that is provably wrong: a
   * topic facet is co-occurrence, so a stale one can show an option counted above the selection
   * itself, which is impossible for a real answer. Callers hide the numbers while this is true.
   */
  countsPending: boolean;
  /** Already masked: a sentinel rendered on this can't page a corpus the caller can't show. */
  hasNextPage: boolean;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  refetch: () => void;
  error: unknown;
};

/**
 * geo-chat's claims query, narrowed to a scope and held to it.
 *
 * Both pickers ask geo-chat the same question and face the same hazard: the rows come back with
 * facets attached, the caller re-gates the rows on the way out, and nothing re-gates the facets —
 * a topic facet carries no space to gate it by. Any moment the pages in hand describe a wider
 * corpus than the caller will show is a menu offering topics that lead nowhere, which is GEO-2653.
 *
 * There are more such moments than is obvious: the scope isn't known yet; it is known and empty;
 * it changed after settling and `keepPreviousData` is answering with the previous one's pages; a
 * lookup underneath it is holding its own previous answer. Each was found separately, and each was
 * fixed twice, once per picker, until they drifted. So the scope is applied here, once, where the
 * pages are read — everything downstream inherits it and needs no guard of its own.
 *
 * `alsoUnusable` is for a caller whose own reasons make the answer unshowable: the debate-again
 * picker drops every browsed row when the selected space is outside the viewer's allowlist, so
 * there is nothing worth asking for.
 */
export function useScopedMatchmakingClaims(
  query: Omit<MatchmakingClaimsQuery, 'spaceIds' | 'spaceId'>,
  scope: ClaimSpaceScope,
  selectedSpaceIds: string[],
  alsoUnusable = false
): ScopedClaims {
  // A known-empty scope is not the same as no scope: omitting the ids would fetch the unfiltered
  // corpus, which is the opposite of what an empty eligible set means.
  const unusable = (scope.spaceIds !== null && scope.spaceIds.length === 0) || alsoUnusable;

  // `query` is expected memoized by the caller — it is the react-query key, so a fresh object every
  // render would refetch on every render.
  // The viewer's picked spaces stand in for the scope rather than joining it. They are always a
  // subset of it — the menu offers nothing the scope doesn't admit — so sending them alone is both
  // correct and narrower. Sending both would *widen*: geo-chat ORs the space parameters together
  // rather than intersecting them, so a scope of ten spaces alongside a pick of one asks about all
  // ten. With nothing picked the scope is the filter, which is what bounds the facets.
  const spaceIds = selectedSpaceIds.length > 0 ? selectedSpaceIds : scope.spaceIds;

  const scopedQuery = React.useMemo<MatchmakingClaimsQuery>(() => ({ ...query, spaceIds }), [query, spaceIds]);

  const claimsQuery = useMatchmakingClaims(scopedQuery, !unusable && !scope.pending);

  // A settled scope can still change — the allowlist refetches, a space is joined — and no loading
  // flag turns over when it does. The only sign is the pages in hand naming the scope before it.
  const heldOver = useScopeHeldOver(scope.spaceIds?.join(',') ?? null, claimsQuery.isPlaceholderData);

  const masked = unusable || scope.pending || heldOver;
  const pages = React.useMemo(() => (masked ? [] : (claimsQuery.data?.pages ?? [])), [claimsQuery.data, masked]);
  const facets = pages[0]?.facets;

  // An unusable scope is an answer, not a silence. The query is deliberately never made, so the
  // facets never arrive — and read as "not known yet" that would leave a selected space or topic
  // held forever, filtering a list that has nothing in it and unpickable from a menu that is
  // empty. Knowing there is nothing to show is knowing the menu.
  const facetsSettled =
    !scope.pending && (unusable || (facets !== undefined && !claimsQuery.isLoading && !claimsQuery.isPlaceholderData));

  // Placeholder data is the previous key's answer, and since GEO-2696 a topic facet is narrowed by
  // the topic selection — so on a filter change the held counts don't merely lag, they describe a
  // question the viewer is no longer asking.
  const countsPending = claimsQuery.isPlaceholderData || claimsQuery.isLoading;

  return {
    pages,
    facets,
    facetsSettled,
    unusable,
    countsPending,
    hasNextPage: !masked && Boolean(claimsQuery.hasNextPage),
    isLoading: claimsQuery.isLoading,
    isFetchingNextPage: claimsQuery.isFetchingNextPage,
    fetchNextPage: claimsQuery.fetchNextPage,
    refetch: claimsQuery.refetch,
    error: claimsQuery.error,
  };
}
