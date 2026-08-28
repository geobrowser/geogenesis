'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

import { debatesBestOrderDocument } from './debates-best-order-document';

/**
 * One page covers a space's debates today — the busiest space on testnet has single digits — but
 * paging exists so a space that outgrows it ranks all of its debates rather than ranking the first
 * page and dropping the rest to the bottom of the scroll.
 */
const PAGE_SIZE = 100;

/**
 * A runaway guard, not a paging policy. Reaching it means either a space with more ranked debates
 * than anyone has built, or a connection that keeps claiming another page — so it says so rather
 * than returning a truncated ranking as if it were the whole thing.
 */
const MAX_PAGES = 50;

/** Debate entity ids in "Best" order, most deserving of attention first. */
export async function fetchDebatesBestOrder(spaceId: string, signal?: AbortSignal): Promise<string[]> {
  const ids: string[] = [];
  const seenCursors = new Set<string>();
  let after: string | null = null;
  let page = 0;

  for (; page < MAX_PAGES; page++) {
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
    // A cursor that repeats would page forever. Offset cursors make that unlikely, but the loop is
    // driven entirely by what the server hands back, so it must not depend on the server behaving.
    if (seenCursors.has(result.endCursor)) {
      console.error('[useDebatesBestOrder] Ranking connection repeated a cursor; ranking may be partial', {
        spaceId,
        ranked: ids.length,
      });
      break;
    }
    seenCursors.add(result.endCursor);
    after = result.endCursor;
  }

  if (page === MAX_PAGES) {
    console.error('[useDebatesBestOrder] Ranking hit the page cap; debates past it fall back to recency', {
      spaceId,
      ranked: ids.length,
    });
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
    // A snapshot for as long as the feed is open, deliberately. A refetch would hand back a
    // different order and resequence a feed someone is already scrolling — the exact movement the
    // loading gate exists to prevent, arriving later and with no gate in front of it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // `graphql` already retries transport failures with backoff. Retrying around it multiplies that
    // budget and holds the feed on its loading gate, when the promise on failure is that it drops
    // straight through to recency.
    retry: false,
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
