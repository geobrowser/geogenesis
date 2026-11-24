'use client';

import {
  type Query,
  type QueryKey,
  hashKey,
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import * as React from 'react';

import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';

import { type ClaimsAboutPage, fetchClaimsAbout } from './claims-about';
import {
  type GraphHop1,
  type GraphHop2Result,
  fetchCrossLinks,
  fetchHop1,
  fetchHop2,
} from './fetch-graph-neighbourhood';
import { type GraphFilter, type GraphScope, graphFilterKey } from './graph-filter';
import { type GraphCaps, type GraphKindFilter, presentKinds, selectGraph, selectHop1 } from './select-graph';
import { claimCountsKey, fetchTopicClaims, summariseTopicClaims } from './topic-claims-summary';

const STALE_MS = 60_000;

/** A hop missing a failed kind is stale at once, so the next mount or focus asks again. */
const hop1StaleTime = (query: Query<GraphHop1>) => (query.state.data?.failedKinds?.length ? 0 : STALE_MS);
/** Likewise for a ring missing a failed side. */
const hop2StaleTime = (query: Query<GraphHop2Result>) => (query.state.data?.failedSides ? 0 : STALE_MS);

/**
 * The topic view's scope: the same spaces the topic page draws from. Null while the allowlist is
 * resolving, so the graph waits rather than drawing an unscoped graph and then re-drawing it.
 */
export function useTopicGraphScope(
  routeSpaceId: string | null,
  topicId: string,
  topicSpaceId: string | null
): GraphScope | null {
  const { allowlist } = useClaimSpaceAllowlist();
  const spaceIds = useTopicSpaceScope(routeSpaceId);
  return React.useMemo(() => {
    if (allowlist === null) return null;
    return { spaceIds: spaceIds ?? null, topicId, topicSpaceId };
  }, [allowlist, spaceIds, topicId, topicSpaceId]);
}

export const GRAPH_HOP_PREFETCH_DELAY_MS = 150;

/**
 * Warms hop 1 for a node held under the pointer or focus for `GRAPH_HOP_PREFETCH_DELAY_MS`, so a
 * sweep across the nodes fires nothing. One pending node at a time; `null` cancels it.
 */
export function usePrefetchHop1(filter: GraphFilter | null) {
  const queryClient = useQueryClient();
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return React.useCallback(
    (entityId: string | null) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!filter || !entityId) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        void queryClient.prefetchQuery({
          queryKey: [...neighbourhoodKey('hop1', filter), entityId],
          queryFn: ({ signal }) => fetchHop1(entityId, filter, signal),
          staleTime: hop1StaleTime,
          retry: false,
        });
      }, GRAPH_HOP_PREFETCH_DELAY_MS);
    },
    [filter, queryClient]
  );
}

/** `requestedSpaceId` is the topic page's space, which claims resolve their voting space against. */
export function useClaimsAbout(entityId: string, filter: GraphFilter | null, requestedSpaceId: string | null) {
  return useInfiniteQuery({
    queryKey: [
      'graph-explorer',
      'claims-about',
      entityId,
      requestedSpaceId ?? '*',
      ...(filter ? graphFilterKey(filter) : ['pending']),
    ],
    queryFn: ({ pageParam, signal }) => fetchClaimsAbout(entityId, filter!, requestedSpaceId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ClaimsAboutPage) => (last.hasNextPage ? last.endCursor : undefined),
    enabled: filter !== null,
    staleTime: STALE_MS,
  });
}

const neighbourhoodKey = (part: string, filter: GraphFilter) =>
  ['graph-explorer', 'neighbourhood', part, ...graphFilterKey(filter)] as const;

/** Whether `queryKey` was asked under `filterKey`; another scope's answer must not stand in for this one. */
function underFilter(queryKey: QueryKey | undefined, filterKey: QueryKey | null) {
  return !!queryKey && !!filterKey && hashKey(queryKey.slice(0, filterKey.length)) === hashKey(filterKey);
}

/**
 * The 3D view's data: hop 1, then hop 2 for the hop-1 picks, then cross-links among everything
 * shown. Each stage renders as it lands; the earlier selection stays until the next is ready.
 */
export function useGraphNeighbourhood({
  centreId,
  filter,
  caps,
  kindFilter,
  hubId,
}: {
  centreId: string;
  filter: GraphFilter | null;
  caps: GraphCaps;
  kindFilter: GraphKindFilter;
  /** Not expanded in hop 2: the scope's topic, whose thousands of backlinks would swamp it. */
  hubId: string | null;
}) {
  const hop1 = useQuery({
    queryKey: filter ? [...neighbourhoodKey('hop1', filter), centreId] : ['graph-explorer', 'neighbourhood', 'pending'],
    queryFn: ({ signal }) => fetchHop1(centreId, filter!, signal),
    enabled: filter !== null,
    staleTime: hop1StaleTime,
    // The fetches carry their own deadline; a query that missed it would miss it again.
    retry: false,
    // The previous graph stays on screen until the next centre's lands, then eases into it.
    placeholderData: keepPreviousData,
  });
  const hop1Data = hop1.data ?? null;
  // Placeholder data belongs to the previous centre, so everything below follows the data's centre.
  const dataCentreId = hop1Data?.centre?.id ?? null;
  const noExpand = React.useMemo(() => new Set(hubId ? [hubId] : []), [hubId]);

  const expandIds = React.useMemo(() => {
    // Wait for the new centre's own hop 1; the placeholder ring stays meanwhile.
    if (!hop1Data || !dataCentreId || hop1.isPlaceholderData) return [];
    return selectHop1(dataCentreId, hop1Data.neighbours, caps, kindFilter)
      .map(({ node }) => node.id)
      .filter(id => !noExpand.has(id))
      .sort();
  }, [caps, dataCentreId, hop1.isPlaceholderData, hop1Data, kindFilter, noExpand]);

  const hop2 = useQuery({
    queryKey: filter
      ? [...neighbourhoodKey('hop2', filter), expandIds.join(',')]
      : ['graph-explorer', 'hop2', 'pending'],
    queryFn: ({ signal }) => fetchHop2(expandIds, filter!, signal),
    select: result => result.hop2,
    enabled: filter !== null && expandIds.length > 0,
    staleTime: hop2StaleTime,
    retry: false,
    // Keyed by parent, so a previous ring only fills nodes the new hop 1 shares, until its own lands.
    placeholderData: (previous, previousQuery) =>
      underFilter(previousQuery?.queryKey, filter && neighbourhoodKey('hop2', filter)) ? previous : undefined,
  });
  const hop2Data = hop2.data ?? null;

  const withoutCross = React.useMemo(() => {
    if (!hop1Data?.centre) return null;
    return selectGraph({
      centre: hop1Data.centre,
      neighbours: hop1Data.neighbours,
      hop2: hop2Data,
      crossLinks: null,
      caps,
      kindFilter,
      noExpand,
    });
  }, [caps, hop1Data, hop2Data, kindFilter, noExpand]);

  // Cross-links only for a settled set, not one built on placeholder hop 2.
  const hop2Settled = hop2Data !== null && !hop2.isPlaceholderData;
  const shownIds = React.useMemo(
    () => (withoutCross && hop2Settled ? withoutCross.nodes.map(({ node }) => node.id).sort() : []),
    [hop2Settled, withoutCross]
  );
  const cross = useQuery({
    queryKey: filter
      ? [...neighbourhoodKey('cross', filter), shownIds.join(',')]
      : ['graph-explorer', 'cross', 'pending'],
    queryFn: ({ signal }) => fetchCrossLinks(shownIds, filter!, signal),
    enabled: filter !== null && shownIds.length > 1,
    staleTime: STALE_MS,
    retry: false,
    // Cross-links are drawn only between shown nodes, so the previous set's are safe until these land.
    placeholderData: (previous, previousQuery) =>
      underFilter(previousQuery?.queryKey, filter && neighbourhoodKey('cross', filter)) ? previous : undefined,
  });

  const selection = React.useMemo(() => {
    if (!hop1Data?.centre || !withoutCross) return null;
    if (!cross.data) return withoutCross;
    return selectGraph({
      centre: hop1Data.centre,
      neighbours: hop1Data.neighbours,
      hop2: hop2Data,
      crossLinks: cross.data,
      caps,
      kindFilter,
      noExpand,
    });
  }, [caps, cross.data, hop1Data, hop2Data, kindFilter, noExpand, withoutCross]);

  const kinds = React.useMemo(() => (hop1Data ? presentKinds(hop1Data.neighbours) : []), [hop1Data]);

  return { hop1, centre: hop1Data?.centre ?? null, selection, kinds, isSwitching: hop1.isPlaceholderData };
}

/**
 * How people responded to the topic's claims, each counted in the space it is voted in. Reads the
 * shared per-claim counts, so it agrees with the node cards and moves when a vote lands.
 */
export function useTopicClaimsSummary(topicId: string | null, filter: GraphFilter | null, topicSpaceId: string | null) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isLoading: personalSpaceLoading } = usePersonalSpaceId();
  const claims = useQuery({
    queryKey: [
      'graph-explorer',
      'topic-claims',
      topicId,
      topicSpaceId ?? '*',
      personalSpaceId,
      ...(filter ? graphFilterKey(filter) : ['pending']),
    ],
    queryFn: ({ signal }) =>
      fetchTopicClaims({ topicId: topicId!, filter: filter!, topicSpaceId, queryClient, personalSpaceId, signal }),
    enabled: Boolean(topicId && filter) && !personalSpaceLoading,
    staleTime: STALE_MS,
  });

  const listed = claims.data;
  const keys = React.useMemo(
    () => new Set(listed?.claims.map(claim => hashKey(claimCountsKey(claim))) ?? []),
    [listed]
  );
  const [version, setVersion] = React.useState(0);
  React.useEffect(() => {
    if (keys.size === 0) return;
    return queryClient.getQueryCache().subscribe(event => {
      if (event.type === 'updated' && keys.has(event.query.queryHash)) setVersion(current => current + 1);
    });
  }, [keys, queryClient]);

  const data = React.useMemo(() => {
    void version;
    if (!listed) return undefined;
    return summariseTopicClaims(
      listed.claims,
      claim => {
        const key = claimCountsKey(claim);
        return queryClient.getQueryData<{ positive: number; negative: number }>(key) ?? listed.counts[hashKey(key)];
      },
      listed.truncated
    );
  }, [listed, queryClient, version]);

  return { data, isLoading: claims.isLoading || personalSpaceLoading, isError: claims.isError };
}
