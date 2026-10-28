import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { claimResponseTargetKey, fetchClaimResponseSummaries } from '~/core/responses/claim-response-summaries';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';
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
 */
export function orderByDebatability<T>(rows: T[], scoreOf: (row: T) => number): T[] {
  return rows
    .map((row, index) => ({ row, index, score: scoreOf(row) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.row);
}

/** Responses are counted per space, so claims are asked for in runs per space of at most this many. */
export const CLAIM_RESPONSE_COUNTS_CHUNK = 50;

const NO_COUNTS = new Map<string, ClaimResponseCounts>();

export const claimResponseCountsQueryKey = (spaceId: string, claimIds: string[]) =>
  ['claim-picker', 'response-counts', spaceId, claimIds] as const;

/**
 * The agree / disagree counts for a set of claims, each in the space its card is drawn for, keyed by
 * {@link claimCountsKey}.
 *
 * Its own cache entries rather than the per-card counts keys: those move optimistically with the
 * viewer's own vote, and this is read once to arrange a list, not to draw a number. Runs are sorted
 * by id within a space, so a claim joining the list re-asks its own run and nothing else.
 *
 * `isLoading` only on a first ask. A run that fails leaves its claims without counts — they score 0
 * and keep their place — rather than holding the list back.
 */
export function useClaimResponseCounts(claims: Array<{ claimEntityId: string; spaceId: string }>) {
  const signature = [...new Set(claims.map(claim => claimCountsKey(claim.claimEntityId, claim.spaceId)))]
    .sort()
    .join(',');

  const runs = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const key of signature ? signature.split(',') : []) {
      const [spaceId, claimId] = key.split(':');
      bySpace.set(spaceId, [...(bySpace.get(spaceId) ?? []), claimId]);
    }
    const chunks: Array<{ spaceId: string; claimIds: string[] }> = [];
    for (const [spaceId, claimIds] of bySpace) {
      for (let start = 0; start < claimIds.length; start += CLAIM_RESPONSE_COUNTS_CHUNK) {
        chunks.push({ spaceId, claimIds: claimIds.slice(start, start + CLAIM_RESPONSE_COUNTS_CHUNK) });
      }
    }
    return chunks;
  }, [signature]);

  const combine = React.useCallback(
    (results: UseQueryResult<Map<string, ClaimResponseCounts>>[]) => {
      const counts = new Map<string, ClaimResponseCounts>();
      results.forEach((result, index) => {
        const run = runs[index];
        if (!run || !result.data) return;
        for (const claimId of run.claimIds) {
          const found = result.data.get(claimId);
          if (found) counts.set(claimCountsKey(claimId, run.spaceId), found);
        }
      });
      return {
        counts: counts.size > 0 ? counts : NO_COUNTS,
        isLoading: results.some(result => result.isLoading),
      };
    },
    [runs]
  );

  return useQueries({
    queries: runs.map(run => ({
      queryKey: claimResponseCountsQueryKey(run.spaceId, run.claimIds),
      queryFn: async ({ signal }: { signal?: AbortSignal }) => {
        const targets = run.claimIds.map(entityId => ({ entityId, responseKind: CLAIM_RESPONSE_KIND }));
        const summaries = await fetchClaimResponseSummaries({
          spaceId: run.spaceId,
          targets,
          personalSpaceId: null,
          signal,
        });
        const byClaim = new Map<string, ClaimResponseCounts>();
        for (const target of targets) {
          const summary = summaries.get(claimResponseTargetKey(target));
          if (summary) byClaim.set(target.entityId, summary.counts);
        }
        return byClaim;
      },
      staleTime: 60_000,
      retry: 1,
    })),
    combine,
  });
}
