'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

import { debatesBestOrderDocument } from './debates-best-order-document';

/**
 * One page is plenty for a space's debates — the busiest space on testnet has single digits — but
 * paging exists so a space that outgrows it ranks all of its debates rather than silently ranking
 * the first page and dropping the rest to the bottom of the scroll.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Debate entity ids in "Best" order, most deserving of attention first. */
export async function fetchDebatesBestOrder(spaceId: string, signal?: AbortSignal): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result: { ids: string[]; endCursor: string | null; hasNextPage: boolean } = await Effect.runPromise(
      graphql({
        query: debatesBestOrderDocument,
        decoder: (data: {
          entitiesRankedForFeedConnection?: {
            pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
            nodes?: ({ id?: string | null } | null)[] | null;
          } | null;
        }) => {
          const connection = data.entitiesRankedForFeedConnection;
          return {
            ids: (connection?.nodes ?? []).flatMap(node => (node?.id ? [node.id] : [])),
            endCursor: connection?.pageInfo?.endCursor ?? null,
            hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
          };
        },
        variables: { first: PAGE_SIZE, after, spaceIds: [spaceId], typeIds: [DEBATE_TYPE_ID] },
        signal,
      })
    );

    ids.push(...result.ids);
    if (!result.hasNextPage || !result.endCursor) break;
    after = result.endCursor;
  }

  return ids;
}

export type DebatesBestOrder = {
  /** Entity id (normalized) -> position in the ranking. Absent means the ranking didn't cover it. */
  rankByDebateId: Map<string, number>;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Ranks a space's debates the way the explore page's "Best" sort ranks everything else.
 *
 * Returns positions rather than a sorted list of debates: the feed already knows which debates it
 * can play — geo-chat says which exist, and the media checks say which have finished processing —
 * and a ranking that returned debates would be able to reintroduce ones the feed had ruled out.
 */
export function useDebatesBestOrder(spaceId: string, enabled: boolean): DebatesBestOrder {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['debates', 'best-order', spaceId],
    queryFn: ({ signal }) => fetchDebatesBestOrder(spaceId, signal),
    enabled: enabled && Boolean(spaceId),
    staleTime: 60_000,
  });

  const rankByDebateId = React.useMemo(() => {
    const map = new Map<string, number>();
    (data ?? []).forEach((entityId, index) => {
      // geo-chat hands the feed dashed uuids while the graph stores bare hex, so both sides are
      // normalized before they ever meet.
      map.set(ID.uuidToHex(entityId), index);
    });
    return map;
  }, [data]);

  return { rankByDebateId, isLoading, isError };
}
