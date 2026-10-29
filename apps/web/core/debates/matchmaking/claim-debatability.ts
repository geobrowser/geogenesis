import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_RESPONSE_OBJECT_TYPE, summarizeClaimResponses } from '~/core/claims/browse/claim-response-summary';
import { chunk } from '~/core/community/community-graphql';
import { graphql } from '~/core/io/graphql-client';
import { CLAIM_RESPONSE_KIND, responseKindToVoteKind } from '~/core/responses/entity-response';
import { normId } from '~/core/utils/norm-id';

export type ClaimResponseCounts = { positive: number; negative: number };

/** How far past half the rest of the crowd sits against the holder: 0 at even or with them, 1 alone. */
function againstTheCrowd(counts: ClaimResponseCounts, holderPosition: boolean) {
  // The counts include the holder's own response; take it out so only everyone else is the crowd.
  const crowdWith = Math.max(0, (holderPosition ? counts.positive : counts.negative) - 1);
  const crowdAgainst = holderPosition ? counts.negative : counts.positive;
  const crowd = crowdWith + crowdAgainst;
  return crowd > 0 ? Math.max(0, (2 * crowdAgainst) / crowd - 1) : 0;
}

/**
 * The least a claim must score to be lifted: a minority of at least a quarter, or at least three
 * quarters of everyone else against the person.
 */
export const DEBATABLE_SCORE_CUTOFF = 0.5;

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
 * before the other.
 *
 * Only a claim that reaches {@link DEBATABLE_SCORE_CUTOFF} scores at all; anything short of it scores
 * 0, the same as a claim under the floor. Otherwise a near-unanimous claim the person agrees with —
 * 9 to 1, a split of 0.2 — would outrank every claim with too few positions to judge, which is most
 * of a list, and the lopsided consensus the ordering exists to push down would rise above them.
 *
 * The person's own position is taken out of the crowd before "against" is measured — otherwise a
 * claim they hold alone would read as a crowd that partly agrees with them.
 *
 * Neither counts below `CLAIM_RESPONSE_FLOOR`, the floor every surface uses before calling a claim
 * contested: under it a single disagreement reads as a maximally split claim, and the thinnest data
 * would decide the top of the list.
 */
export function claimDebatability(counts: ClaimResponseCounts | undefined, holderPosition: boolean | null): number {
  if (!counts) return 0;
  const { total, meetsFloor } = summarizeClaimResponses(counts.positive, counts.negative);
  if (!meetsFloor) return 0;

  // From the smaller side, so mirrored counts score exactly alike: `1 - |2p/total - 1|` is the same
  // number on paper but not in floating point, and the sort would put 7–3 ahead of 3–7.
  const split = (2 * Math.min(counts.positive, counts.negative)) / total;
  const score = holderPosition === null ? split : Math.max(split, againstTheCrowd(counts, holderPosition));
  return score >= DEBATABLE_SCORE_CUTOFF ? score : 0;
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

/** Hand-written, as `claim-picker-page.ts`'s are: the generated types predate `VotesCountFilter`. */
type ClaimResponseCountsVariables = {
  filter: {
    objectType: { is: number };
    voteKind: { is: number };
    or: Array<{ spaceId: { is: string }; objectId: { in: string[] } }>;
  };
  first: number;
};

const claimResponseCountsDocument = parse(CLAIM_RESPONSE_COUNTS_SOURCE) as TypedDocumentNode<
  ClaimResponseCountsQuery,
  ClaimResponseCountsVariables
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
          objectType: { is: CLAIM_RESPONSE_OBJECT_TYPE },
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
 * runs, so a claim joining the set re-asks the run it lands in and the runs after it, not the ones
 * before.
 *
 * `isLoading` only on a first ask. A run that fails leaves its claims without counts — they score 0
 * and keep their place — rather than holding the list back.
 */
export function useClaimResponseCounts(claims: Array<{ claimEntityId: string; spaceId: string }>) {
  const signature = [...new Set(claims.map(claim => claimCountsKey(claim.claimEntityId, claim.spaceId)))]
    .sort()
    .join(',');

  const runs = React.useMemo(
    () => chunk(signature ? signature.split(',') : [], CLAIM_RESPONSE_COUNTS_CHUNK),
    [signature]
  );

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
