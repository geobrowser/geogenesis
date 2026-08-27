'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getEntityResponseCounts } from '~/core/io/queries';
import { type ResponseKind, entityResponseCountsQueryKey } from '~/core/responses/entity-response';

/** Entity responses rather than relation responses, matching what `EntityVoteButtons` asks for. */
export const CLAIM_RESPONSE_OBJECT_TYPE = 0;

/**
 * How many responses a claim needs before its split is worth reporting.
 *
 * One-vs-one is 50%, so an unguarded "controversial" band lands on nearly every barely-touched
 * claim — loudest exactly where the data is thinnest, and marking brand-new claims as contested,
 * which is backwards. The same floor suppresses the bare percentage: "100% agree" off a single
 * response says less than showing nothing.
 */
export const CLAIM_RESPONSE_FLOOR = 10;

const CONTROVERSIAL_LOW = 40;
const CONTROVERSIAL_HIGH = 60;

export type ClaimResponseSummary = {
  positive: number;
  negative: number;
  total: number;
  /** Whole-percent share of positive responses. Null until the floor is cleared. */
  percent: number | null;
  isControversial: boolean;
  isLoading: boolean;
};

/**
 * The split, or null where there isn't enough behind it to report one.
 *
 * Pure so the floor and the band can be tested without a query. `percent` is null rather than 0
 * below the floor because the two mean different things and the caller renders them differently:
 * nothing at all, versus a genuine 0%.
 */
export function summarizeClaimResponses(
  positive: number,
  negative: number
): Pick<ClaimResponseSummary, 'positive' | 'negative' | 'total' | 'percent' | 'isControversial'> {
  const total = positive + negative;
  const percent = total >= CLAIM_RESPONSE_FLOOR ? Math.round((100 * positive) / total) : null;

  return {
    positive,
    negative,
    total,
    percent,
    isControversial: percent !== null && percent >= CONTROVERSIAL_LOW && percent <= CONTROVERSIAL_HIGH,
  };
}

/**
 * The split of on-chain responses on a claim, in one space.
 *
 * Deliberately the same query key `EntityVoteButtons` uses, so the verdict and the response control
 * share one fetch and one cache entry — the two are on screen together and must never disagree.
 *
 * Space-scoped, and the space is the caller's. Responses are published against a space, so a claim
 * that lives in several has a different population in each; reading one space's counts under
 * another space's heading would report a number that belongs to neither.
 */
export function useClaimResponseSummary(
  entityId: string,
  spaceId: string,
  responseKind: ResponseKind
): ClaimResponseSummary {
  const { data, isLoading } = useQuery({
    queryKey: entityResponseCountsQueryKey(entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind),
    queryFn: () =>
      Effect.runPromise(getEntityResponseCounts(entityId, spaceId, responseKind, CLAIM_RESPONSE_OBJECT_TYPE)),
    staleTime: 30_000,
  });

  return { ...summarizeClaimResponses(data?.positive ?? 0, data?.negative ?? 0), isLoading };
}
