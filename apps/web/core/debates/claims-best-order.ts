'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';

/**
 * The order the explore page's "Best" sort would put a given set of claims in.
 *
 * Same source as that sort and as `debatesBestOrderDocument` — `entities_ranked_for_feed`, ordered
 * by the function's own `ranking_score DESC, entity_id DESC`.
 *
 * Unlike the debates version this *does* pass `filter`, which that document deliberately avoids.
 * The reason the warning doesn't apply: it narrows to a bounded set of ids we already hold — one
 * debate's claims, a dozen or so — rather than opening the ranking up to a scan. Measured against
 * testnet it is faster than the unfiltered query it replaces (~0.3s vs ~1.7s for one page), and it
 * removes the paging loop entirely, since the filter itself caps the result. Verified that the
 * connection still returns rows in ranking order regardless of the order ids are passed in.
 */
const CLAIMS_BEST_ORDER_SOURCE = /* GraphQL */ `
  query ClaimsBestOrder($first: Int, $spaceIds: [UUID!], $typeIds: [UUID!], $filter: EntityFilter) {
    entitiesRankedForFeedConnection(first: $first, spaceIds: $spaceIds, typeIds: $typeIds, filter: $filter) {
      nodes {
        id
      }
    }
  }
`;

const claimsBestOrderDocument = parse(CLAIMS_BEST_ORDER_SOURCE) as TypedDocumentNode<any, any>;

export async function fetchClaimsBestOrder(
  claimIds: string[],
  spaceId: string,
  signal?: AbortSignal,
  /** The type being ranked. Defaults to Claim; topic pages rank topics through the same path. */
  typeId: string = CLAIM_TYPE_ID
): Promise<string[]> {
  if (claimIds.length === 0) return [];

  return Effect.runPromise(
    graphql({
      query: claimsBestOrderDocument,
      decoder: (data: {
        entitiesRankedForFeedConnection?: { nodes?: ({ id?: string | null } | null)[] | null } | null;
      }) => (data.entitiesRankedForFeedConnection?.nodes ?? []).flatMap(node => (node?.id ? [node.id] : [])),
      variables: {
        first: claimIds.length,
        spaceIds: [spaceId],
        typeIds: [typeId],
        filter: { id: { in: claimIds } },
      },
      signal,
    })
  );
}

export type ClaimsBestOrder = {
  /** Claim entity id (hex) -> position in the ranking. Absent means the ranking didn't cover it. */
  rankByClaimId: Map<string, number>;
  /**
   * Whether the ranking has settled, so callers know when it is safe to paint rows.
   *
   * Deliberately not `!isLoading`: a query that has just been enabled reports `isLoading` false for
   * the render before it starts fetching, which is long enough to paint one frame of unranked rows
   * and then resequence them. This is true only when there is nothing to wait for or the lookup has
   * actually resolved — success or failure, since a failure means transcript order and that is a
   * settled answer too.
   */
  isReady: boolean;
};

/**
 * Ranks a debate's claims the way the explore page's "Best" sort ranks everything else.
 *
 * Worth knowing before reading much into it: the ranking only covers claims the feed has scored,
 * which today is a small fraction of what a debate extracts — on the debate this was built against,
 * 1 of 13. Everything it hasn't scored keeps transcript order behind the ranked ones, so the common
 * case is close to "as spoken". That is a property of what `entities_ranked_for_feed` contains, not
 * of this lookup; as coverage grows the ordering here follows it with no change.
 */
export function useClaimsBestOrder(
  claimIds: string[],
  spaceId: string | null,
  typeId: string = CLAIM_TYPE_ID
): ClaimsBestOrder {
  // Sorted so the key is stable across renders that hand the same ids in a different order.
  const normalizedIds = React.useMemo(() => [...claimIds].map(ID.uuidToHex).sort(), [claimIds]);

  const enabled = Boolean(spaceId) && normalizedIds.length > 0;

  const { data, isFetched } = useQuery({
    queryKey: ['claims', 'best-order', spaceId, typeId, normalizedIds],
    queryFn: ({ signal }) => fetchClaimsBestOrder(normalizedIds, spaceId!, signal, typeId),
    enabled,
    // A snapshot for as long as the panel is open. A refetch would resequence a list someone is
    // already reading, and reshuffle which claims sit above the "Show more" fold.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // `graphql` retries transport failures already; failing here just leaves transcript order.
    retry: false,
  });

  const rankByClaimId = React.useMemo(() => {
    const map = new Map<string, number>();
    (data ?? []).forEach((entityId, index) => map.set(ID.uuidToHex(entityId), index));
    return map;
  }, [data]);

  return { rankByClaimId, isReady: !enabled || isFetched };
}

/**
 * Ranked claims first in ranking order, then everything the ranking didn't cover in the order it
 * was given — which for transcript claims is the order they were spoken.
 *
 * Same shape as the debate feed's own sort: an absent rank sorts last rather than dropping the row.
 */
export function sortClaimsByBest<T extends { id: string }>(claims: T[], rankByClaimId: Map<string, number>): T[] {
  const rankOf = (claim: T) => rankByClaimId.get(ID.uuidToHex(claim.id)) ?? Number.MAX_SAFE_INTEGER;

  return claims
    .map((claim, index) => ({ claim, index }))
    .sort((a, b) => rankOf(a.claim) - rankOf(b.claim) || a.index - b.index)
    .map(entry => entry.claim);
}
