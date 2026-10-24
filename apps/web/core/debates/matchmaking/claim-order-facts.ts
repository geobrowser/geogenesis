import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

/**
 * What the Matches sorts need about each claim that geo-chat's match rows do not carry (GEO-3463):
 * the ranking score Explore orders by ("Best") and when the claim was created ("Newest"). One request
 * for the whole list — Matches is a single page — keyed on the ids so it is shared and cached.
 */
const CLAIM_ORDER_FACTS_SOURCE = /* GraphQL */ `
  query ClaimOrderFacts($ids: [UUID!]!, $first: Int!) {
    entitiesConnection(first: $first, filter: { id: { in: $ids } }) {
      nodes {
        id
        rankingScore
        createdAt
      }
    }
  }
`;

type ClaimOrderFactsQuery = {
  entitiesConnection: {
    nodes: Array<{ id: string; rankingScore: string | null; createdAt: string | null } | null>;
  } | null;
};

const claimOrderFactsDocument = parse(CLAIM_ORDER_FACTS_SOURCE) as TypedDocumentNode<
  ClaimOrderFactsQuery,
  Record<string, unknown>
>;

export type ClaimOrderFacts = { rankingScore: number | null; createdAtMs: number | null };

/** Keys are dashless, the shape every list here compares claim ids in. */
function decodeClaimOrderFacts(data: ClaimOrderFactsQuery): Map<string, ClaimOrderFacts> {
  const facts = new Map<string, ClaimOrderFacts>();
  for (const node of data.entitiesConnection?.nodes ?? []) {
    if (!node) continue;
    const createdAtMs = node.createdAt ? Date.parse(node.createdAt) : NaN;
    facts.set(uuidToHex(node.id), {
      rankingScore: node.rankingScore === null ? null : Number(node.rankingScore),
      createdAtMs: Number.isNaN(createdAtMs) ? null : createdAtMs,
    });
  }
  return facts;
}

const NO_FACTS = new Map<string, ClaimOrderFacts>();

export function useClaimOrderFacts(claimEntityIds: string[], enabled = true) {
  const ids = React.useMemo(() => [...new Set(claimEntityIds.map(uuidToHex))].sort(), [claimEntityIds]);
  const query = useQuery({
    queryKey: ['claim-order-facts', ids] as const,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: claimOrderFactsDocument,
          decoder: decodeClaimOrderFacts,
          variables: { ids, first: ids.length },
          signal,
        })
      ),
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    // A new match or a new page changes the id set and so the key. Without the previous answer held
    // for that round trip, the list fell back to arrival order and then jumped back once it landed.
    // The claims already listed are in the previous answer; only the new ones wait.
    placeholderData: keepPreviousData,
  });
  return { facts: query.data ?? NO_FACTS, isLoading: query.isLoading };
}

/**
 * Explore's "Best" order applied to a list in hand: ranking score descending, unscored last, ties
 * kept in the order they arrived — the same rule `entities_ranked_for_feed` orders Explore by.
 */
export function compareByRanking(left: ClaimOrderFacts | undefined, right: ClaimOrderFacts | undefined) {
  const l = left?.rankingScore ?? null;
  const r = right?.rankingScore ?? null;
  if (l === r) return 0;
  if (l === null) return 1;
  if (r === null) return -1;
  return r - l;
}

/** Newest first, claims with no known creation time last. */
export function compareByNewest(left: ClaimOrderFacts | undefined, right: ClaimOrderFacts | undefined) {
  const l = left?.createdAtMs ?? null;
  const r = right?.createdAtMs ?? null;
  if (l === r) return 0;
  if (l === null) return 1;
  if (r === null) return -1;
  return r - l;
}
