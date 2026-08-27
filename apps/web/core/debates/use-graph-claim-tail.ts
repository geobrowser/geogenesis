'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import type { MatchmakingClaim, MatchmakingTopic } from './api';
import { type ClaimPickerEntity } from './claim-picker-page';
import { type GraphClaimSource, claimIdsBySpace, graphClaimRow, graphClaimTopics } from './graph-claim-rows';
import { fetchGraphClaimSearch, graphClaimSearchQueryKey } from './graph-claim-search';
import { type GraphClaimsQuery, fetchGraphClaims, graphClaimsQueryKey } from './graph-claims';
import { useDebateClaimsBySpaces } from './hooks';

const NO_CLAIMS: MatchmakingClaim[] = [];
const NO_ENTITIES: ClaimPickerEntity[] = [];
const NO_GROUPS: Array<{ spaceId: string; claimIds: string[] }> = [];
const NO_TOPICS = new Map<string, MatchmakingTopic[]>();

type TailPaging = {
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  error: unknown;
};

export type GraphClaimTailSources = TailPaging & {
  /** Each claim with the space it belongs to decided, ready to be built into a row. */
  sources: GraphClaimSource[];
  /** Topics of those claims, for the menus to union with geo-chat's facet. */
  topicsByClaimId: Map<string, MatchmakingTopic[]>;
};

export type GraphClaimTail = TailPaging & {
  /** Rows in the shape the hub's cards speak, ready to append after geo-chat's. */
  claims: MatchmakingClaim[];
  topicsByClaimId: Map<string, MatchmakingTopic[]>;
};

/**
 * GEO-2704. The part of a claim list geo-chat doesn't know about.
 *
 * Enabled by its caller only once geo-chat has no next page, so the list is geo-chat's — its
 * ordering, its readiness, its session exclusions — for as long as geo-chat has anything to say.
 * What comes back here is appended after that, never merged into it: the two are ordered by
 * different things, and interleaving them would produce a sequence answering to neither.
 *
 * `homeSpaceOf` is the caller's, because the answer differs between surfaces. It decides which of a
 * claim's spaces the row belongs to, and returning `null` drops the claim — which is how a caller
 * refuses one whose only spaces it may not show.
 */
export function useGraphClaimTailSources({
  query,
  search,
  enabled,
  homeSpaceOf,
}: {
  query: GraphClaimsQuery;
  /** When set, the tail comes from the indexed search endpoint instead of the ranking walk. */
  search?: string | null;
  enabled: boolean;
  homeSpaceOf: (entity: ClaimPickerEntity) => string | null;
}): GraphClaimTailSources {
  const searching = Boolean(search);

  // Two sources, one shape. The ranking walk cannot answer a search — a substring filter over it
  // measured at ten seconds — so a search goes to the indexed REST endpoint instead, and the rows
  // come back through the same projection either way.
  //
  // Two queries rather than one with a branch inside: their page params are different kinds
  // (a cursor and an offset), and react-query keys them separately, so a viewer clearing a search
  // returns to the walk's pages rather than refetching them.
  const walk = useInfiniteQuery({
    queryKey: graphClaimsQueryKey(query),
    queryFn: ({ pageParam, signal }) => fetchGraphClaims(query, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: page => (page.hasNextPage ? page.endCursor : undefined),
    // Curation and publishing move at human speed, and this list is the tail of another one — a
    // refetch on every focus would re-walk the ranking for rows the viewer has already scrolled past.
    staleTime: 5 * 60_000,
    enabled: enabled && !searching,
  });

  const searchQuery = React.useMemo(
    () => ({ search: search ?? '', spaceIds: query.spaceIds, topicIds: query.topicIds, excludeIds: query.excludeIds }),
    [query.excludeIds, query.spaceIds, query.topicIds, search]
  );

  const searched = useInfiniteQuery({
    queryKey: graphClaimSearchQueryKey(searchQuery),
    queryFn: ({ pageParam, signal }) => fetchGraphClaimSearch(searchQuery, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: page => page.nextOffset ?? undefined,
    staleTime: 5 * 60_000,
    enabled: enabled && searching,
  });

  const pages = searching ? searched : walk;

  const entities = React.useMemo(
    () => (enabled ? (pages.data?.pages.flatMap(page => page.claims) ?? NO_ENTITIES) : NO_ENTITIES),
    [enabled, pages.data]
  );

  // Home space first, because everything else keys on it: which space geo-chat is asked about, and
  // which space's "Is factual" value decides the card's side labels.
  const placed = React.useMemo(
    () =>
      entities.flatMap(entity => {
        const spaceId = homeSpaceOf(entity);
        if (!spaceId || !entity.name) return [];
        return [{ claimEntityId: entity.id, spaceId, name: entity.name, description: entity.description, entity }];
      }),
    [entities, homeSpaceOf]
  );

  const topicsByClaimId = React.useMemo(
    () => (enabled && entities.length > 0 ? graphClaimTopics(entities) : NO_TOPICS),
    [enabled, entities]
  );

  return {
    sources: placed,
    topicsByClaimId,
    // `enabled: false` leaves react-query pending forever, which a caller folding this into its own
    // loading state would read as "still looking" and never settle.
    isLoading: enabled && pages.isLoading,
    isFetchingNextPage: pages.isFetchingNextPage,
    hasNextPage: enabled && pages.hasNextPage,
    fetchNextPage: pages.fetchNextPage,
    error: enabled ? pages.error : null,
  };
}

/**
 * The same tail, built into the rows the hub's cards speak.
 *
 * The rematch picker takes {@link useGraphClaimTailSources} instead: its rows carry session flags
 * and both debaters' sides, so it builds them itself and asks geo-chat through the session's own
 * lookup rather than the per-space one below.
 */
export function useGraphClaimTail(args: {
  query: GraphClaimsQuery;
  search?: string | null;
  enabled: boolean;
  homeSpaceOf: (entity: ClaimPickerEntity) => string | null;
}): GraphClaimTail {
  const { sources, topicsByClaimId, ...paging } = useGraphClaimTailSources(args);

  // Sides and readiness are geo-chat's and nobody else's, and its only lookup for claims it hasn't
  // ranked is the per-space one — so these are asked for by id, grouped by the space they landed in.
  const groups = React.useMemo(() => (sources.length > 0 ? claimIdsBySpace(sources) : NO_GROUPS), [sources]);
  const rows = useDebateClaimsBySpaces(groups);

  const claims = React.useMemo(() => {
    if (sources.length === 0) return NO_CLAIMS;
    const rowsByClaimId = new Map(rows.claims.map(row => [row.claim_entity_id, row]));
    return sources.map(source => graphClaimRow(source, rowsByClaimId.get(source.claimEntityId)));
  }, [rows.claims, sources]);

  return { claims, topicsByClaimId, ...paging };
}
