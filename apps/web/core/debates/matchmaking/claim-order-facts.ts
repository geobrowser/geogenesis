import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

/**
 * What the Matches sorts need about each claim that geo-chat's match rows do not carry (GEO-3463):
 * the ranking score Explore orders by ("Best") and when the claim was created ("Newest"). One request
 * per page-sized run of ids, keyed on them so it is shared and cached.
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

/** No score and no creation time: what a claim the graph has nothing on is ordered by. */
const UNKNOWN_FACTS: ClaimOrderFacts = { rankingScore: null, createdAtMs: null };

/** The size of geo-chat's claim pages, so a list that pages asks once per page. */
export const CLAIM_ORDER_FACTS_CHUNK = 20;

function mergeFacts(results: UseQueryResult<Map<string, ClaimOrderFacts>>[]) {
  const facts = new Map<string, ClaimOrderFacts>();
  for (const result of results) for (const [id, fact] of result.data ?? NO_FACTS) facts.set(id, fact);
  return { facts: facts.size > 0 ? facts : NO_FACTS, isLoading: results.some(result => result.isLoading) };
}

/**
 * Order facts for the claims in hand, keyed dashless. Every id asked about gets an entry once its
 * request lands, `UNKNOWN_FACTS` for one the graph has nothing on, so `facts.has(id)` says whether
 * a claim can be placed in a sorted list yet.
 *
 * Asked in runs of {@link CLAIM_ORDER_FACTS_CHUNK} in the order the ids arrive, so a list that grows
 * a page at a time asks about the new page rather than about every claim again.
 */
export function useClaimOrderFacts(claimEntityIds: string[], enabled = true) {
  const chunks = React.useMemo(() => {
    const ids = [...new Set(claimEntityIds.map(uuidToHex))];
    const runs: string[][] = [];
    for (let start = 0; start < ids.length; start += CLAIM_ORDER_FACTS_CHUNK) {
      runs.push(ids.slice(start, start + CLAIM_ORDER_FACTS_CHUNK).sort());
    }
    return runs;
  }, [claimEntityIds]);

  // The last run grows as rows arrive, which changes its key. Its claims already listed keep the
  // answer they had for that round trip, or they fell back to arrival order and then jumped back.
  const lastFacts = React.useRef<ReadonlyMap<string, ClaimOrderFacts>>(NO_FACTS);
  const result = useQueries({
    queries: chunks.map(ids => ({
      queryKey: ['claim-order-facts', ids] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const found = await Effect.runPromise(
          graphql({
            query: claimOrderFactsDocument,
            decoder: decodeClaimOrderFacts,
            variables: { ids, first: ids.length },
            signal,
          })
        );
        return new Map(ids.map(id => [id, found.get(id) ?? UNKNOWN_FACTS]));
      },
      enabled,
      staleTime: 5 * 60_000,
      placeholderData: () => {
        const held = new Map<string, ClaimOrderFacts>();
        for (const id of ids) {
          const fact = lastFacts.current.get(id);
          if (fact) held.set(id, fact);
        }
        return held.size > 0 ? held : undefined;
      },
    })),
    combine: mergeFacts,
  });
  React.useEffect(() => {
    lastFacts.current = result.facts;
  }, [result.facts]);
  return result;
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
