import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { graphql } from '~/core/io/graphql-client';
import { CLAIM_RESPONSE_KIND, responseKindToVoteKind } from '~/core/responses/entity-response';
import { normId } from '~/core/utils/norm-id';

/**
 * How debatable a claim is for one person, from the split of positions on it (GEO-3527).
 *
 * Two things make a claim worth arguing about, and neither outranks the other:
 *
 *   - **Against the crowd.** The person holds the side most other people don't. Scored by how far
 *     past half the rest of the crowd sits on the other side: 1 when everyone else disagrees with
 *     them, 0 at an even crowd or anywhere they are with the majority.
 *   - **Split.** People are divided. 1 at an even split, 0 when everyone holds one side.
 *
 * The score is the larger of the two, so the top of a list mixes both kinds rather than listing one
 * before the other. A lopsided claim the person sides with scores low on both and sinks.
 *
 * The person's own position is taken out of the crowd before "against" is measured — otherwise a
 * claim they hold alone would read as a crowd that partly agrees with them.
 */
export type ClaimResponseCounts = { positive: number; negative: number };

/**
 * Positions a claim needs before either signal counts. Below it a single disagreement reads as a
 * maximally contested claim, which is the thinnest data deciding the top of the list. The ticket
 * gave a range of 7 to 10.
 */
export const DEBATABLE_MIN_POSITIONS = 8;

export function claimDebatability(counts: ClaimResponseCounts | undefined, holderPosition: boolean | null): number {
  if (!counts) return 0;
  const total = counts.positive + counts.negative;
  if (total < DEBATABLE_MIN_POSITIONS) return 0;

  const split = 1 - Math.abs((2 * counts.positive) / total - 1);

  if (holderPosition === null) return split;
  // The counts include the holder's own response; take it out so only everyone else is the crowd.
  const crowdWith = Math.max(0, (holderPosition ? counts.positive : counts.negative) - 1);
  const crowdAgainst = holderPosition ? counts.negative : counts.positive;
  const crowd = crowdWith + crowdAgainst;
  const against = crowd > 0 ? Math.max(0, (2 * crowdAgainst) / crowd - 1) : 0;

  return Math.max(split, against);
}

/** The key a claim's counts are filed under: the claim in the space its card is drawn for. */
export function claimCountsKey(claimEntityId: string, spaceId: string) {
  return `${normId(spaceId)}:${normId(claimEntityId)}`;
}

/**
 * Most debatable first. Stable, so claims that score the same — every claim below the floor among
 * them — keep the order they came in.
 *
 * `pinned` rows go above all the rest, most debatable first among themselves: the claims the pair
 * already hold opposite sides on, which can be requested as they stand.
 */
export function orderByDebatability<T>(
  rows: T[],
  scoreOf: (row: T) => number,
  pinned: (row: T) => boolean = () => false
): T[] {
  return rows
    .map((row, index) => ({ row, index, pinned: pinned(row), score: scoreOf(row) }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score || a.index - b.index)
    .map(entry => entry.row);
}

/**
 * Claims per counts request. Each claim is one row of the graph's per-claim tally, so this bounds the
 * filter's size rather than the answer's.
 */
export const CLAIM_RESPONSE_COUNTS_CHUNK = 100;

const NO_COUNTS = new Map<string, ClaimResponseCounts>();

/**
 * The graph's running tally per claim and space — the table the cards' own counts read one claim at
 * a time — for many claims in one request. One row per claim, where the per-vote rows the claims
 * list batches by would be one per person and need paging.
 */
const CLAIM_RESPONSE_COUNTS_SOURCE = /* GraphQL */ `
  query ClaimPickerResponseCounts($filter: VotesCountFilter!, $first: Int!) {
    votesCountsConnection(first: $first, filter: $filter) {
      nodes {
        objectId
        spaceId
        positive
        negative
      }
    }
  }
`;

type ClaimResponseCountsQuery = {
  votesCountsConnection: {
    nodes: Array<{ objectId: string; spaceId: string; positive: string | number; negative: string | number } | null>;
  } | null;
};

const claimResponseCountsDocument = parse(CLAIM_RESPONSE_COUNTS_SOURCE) as TypedDocumentNode<
  ClaimResponseCountsQuery,
  { filter: unknown; first: number }
>;

/** `claimCountsKey`s in, each claim's counts out under the same key. A claim nobody has answered has no row. */
export function fetchClaimResponseCounts(keys: string[], signal?: AbortSignal) {
  const bySpace = new Map<string, string[]>();
  for (const key of keys) {
    const [spaceId, claimId] = key.split(':');
    bySpace.set(spaceId, [...(bySpace.get(spaceId) ?? []), claimId]);
  }
  return Effect.runPromise(
    graphql({
      query: claimResponseCountsDocument,
      decoder: data => {
        const counts = new Map<string, ClaimResponseCounts>();
        for (const node of data.votesCountsConnection?.nodes ?? []) {
          if (!node) continue;
          counts.set(claimCountsKey(node.objectId, node.spaceId), {
            positive: Number(node.positive),
            negative: Number(node.negative),
          });
        }
        return counts;
      },
      variables: {
        filter: {
          objectType: { is: 0 },
          voteKind: { is: responseKindToVoteKind(CLAIM_RESPONSE_KIND) },
          or: [...bySpace].map(([spaceId, claimIds]) => ({ spaceId: { is: spaceId }, objectId: { in: claimIds } })),
        },
        first: keys.length,
      },
      signal,
    })
  );
}

export const claimResponseCountsQueryKey = (keys: string[]) => ['claim-picker', 'response-counts', keys] as const;

/**
 * The agree / disagree counts for a set of claims, each in a given space, keyed by
 * {@link claimCountsKey}.
 *
 * Its own cache entries rather than the per-card counts keys: those move optimistically with the
 * viewer's own vote, and this is read once to arrange a list, not to draw a number. Asked in sorted
 * runs, so a claim joining the set re-asks its own run and nothing else.
 *
 * `isLoading` only on a first ask. A run that fails leaves its claims without counts — they score 0
 * and keep their place — rather than holding the list back.
 */
export function useClaimResponseCounts(claims: Array<{ claimEntityId: string; spaceId: string }>) {
  const signature = [...new Set(claims.map(claim => claimCountsKey(claim.claimEntityId, claim.spaceId)))]
    .sort()
    .join(',');

  const runs = React.useMemo(() => {
    const keys = signature ? signature.split(',') : [];
    const chunks: string[][] = [];
    for (let start = 0; start < keys.length; start += CLAIM_RESPONSE_COUNTS_CHUNK) {
      chunks.push(keys.slice(start, start + CLAIM_RESPONSE_COUNTS_CHUNK));
    }
    return chunks;
  }, [signature]);

  const combine = React.useCallback((results: UseQueryResult<Map<string, ClaimResponseCounts>>[]) => {
    const counts = new Map<string, ClaimResponseCounts>();
    for (const result of results) {
      for (const [key, found] of result.data ?? []) counts.set(key, found);
    }
    return {
      counts: counts.size > 0 ? counts : NO_COUNTS,
      isLoading: results.some(result => result.isLoading),
    };
  }, []);

  return useQueries({
    queries: runs.map(run => ({
      queryKey: claimResponseCountsQueryKey(run),
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchClaimResponseCounts(run, signal),
      staleTime: 60_000,
      retry: 1,
    })),
    combine,
  });
}
