'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { useTopicSpaceScope } from '~/core/topics/use-topic-space-scope';

import { type ClaimsAboutPage, fetchClaimsAbout } from './claims-about';
import { fetchGraphHop } from './fetch-graph-hop';
import { type GraphFilter, type GraphScope, graphFilterKey } from './graph-filter';

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
