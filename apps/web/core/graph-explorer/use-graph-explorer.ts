'use client';

import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';

import { type ClaimsAboutPage, fetchClaimsAbout } from './claims-about';
import { fetchGraphHop } from './fetch-graph-hop';
import { fetchCrossLinks, fetchHop1, fetchHop2 } from './fetch-graph-neighbourhood';
import { type GraphFilter, type GraphScope, graphFilterKey } from './graph-filter';
import { type GraphCaps, type GraphKindFilter, presentKinds, selectGraph, selectHop1 } from './select-graph';
import { fetchTopicClaimsSummary } from './topic-claims-summary';

const STALE_MS = 60_000;

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

const graphHopQueryKey = (entityId: string, filter: GraphFilter) =>
  ['graph-explorer', 'hop', entityId, ...graphFilterKey(filter)] as const;

export function useGraphHop(entityId: string, filter: GraphFilter | null) {
  return useQuery({
    queryKey: filter ? graphHopQueryKey(entityId, filter) : ['graph-explorer', 'hop', entityId, 'pending'],
    queryFn: ({ signal }) => fetchGraphHop(entityId, filter!, signal),
    enabled: filter !== null,
    staleTime: STALE_MS,
  });
}

export const GRAPH_HOP_PREFETCH_DELAY_MS = 150;

/**
 * Warms the hop for a node held under the pointer or focus for `GRAPH_HOP_PREFETCH_DELAY_MS`, so a
 * sweep across the spokes fires nothing. One pending node at a time; `null` cancels it.
 */
export function usePrefetchGraphHop(filter: GraphFilter | null) {
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
          queryKey: graphHopQueryKey(entityId, filter),
          queryFn: ({ signal }) => fetchGraphHop(entityId, filter, signal),
          staleTime: STALE_MS,
        });
        void queryClient.prefetchQuery({
          queryKey: [...neighbourhoodKey('hop1', filter), entityId],
          queryFn: ({ signal }) => fetchHop1(entityId, filter, signal),
          staleTime: STALE_MS,
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
    staleTime: STALE_MS,
    // The previous graph stays on screen until the next centre's lands, then eases into it.
    placeholderData: keepPreviousData,
  });
  const hop1Data = hop1.data ?? null;
  const noExpand = React.useMemo(() => new Set(hubId ? [hubId] : []), [hubId]);

  const expandIds = React.useMemo(() => {
    if (!hop1Data) return [];
    return selectHop1(centreId, hop1Data.neighbours, caps, kindFilter)
      .map(({ node }) => node.id)
      .filter(id => !noExpand.has(id))
      .sort();
  }, [caps, centreId, hop1Data, kindFilter, noExpand]);

  const hop2 = useQuery({
    queryKey: filter
      ? [...neighbourhoodKey('hop2', filter), expandIds.join(',')]
      : ['graph-explorer', 'hop2', 'pending'],
    queryFn: ({ signal }) => fetchHop2(expandIds, filter!, signal),
    enabled: filter !== null && expandIds.length > 0,
    staleTime: STALE_MS,
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

  const shownIds = React.useMemo(
    () => (withoutCross && hop2Data ? withoutCross.nodes.map(({ node }) => node.id).sort() : []),
    [hop2Data, withoutCross]
  );
  const cross = useQuery({
    queryKey: filter
      ? [...neighbourhoodKey('cross', filter), shownIds.join(',')]
      : ['graph-explorer', 'cross', 'pending'],
    queryFn: ({ signal }) => fetchCrossLinks(shownIds, filter!, signal),
    enabled: filter !== null && shownIds.length > 1,
    staleTime: STALE_MS,
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

/** Responses to the topic's claims in its space, for the topic panel. */
export function useTopicClaimsSummary(topicId: string | null, spaceId: string | null) {
  return useQuery({
    queryKey: ['graph-explorer', 'topic-claims-summary', topicId, spaceId],
    queryFn: ({ signal }) => fetchTopicClaimsSummary(topicId!, spaceId!, signal),
    enabled: Boolean(topicId && spaceId),
    staleTime: STALE_MS,
  });
}
