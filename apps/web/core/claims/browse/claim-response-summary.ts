'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getEntityResponseCounts } from '~/core/io/queries';
import { type ResponseKind, entityResponseCountsQueryKey } from '~/core/responses/entity-response';

/** Entity responses rather than relation responses, matching what `EntityVoteButtons` asks for. */
export const CLAIM_RESPONSE_OBJECT_TYPE = 0;

/**
 * How many responses a claim needs before it can be called contested.
 *
 * One-vs-one is 50%, so an unguarded band lands on nearly every barely-touched claim — loudest
 * exactly where the data is thinnest, and marking brand-new claims as contested, which is
 * backwards.
 *
 * Scoped to the tag, deliberately. The floor used to gate the percentage too, which meant the
 * whole verdict disappeared on any claim with fewer than ten responses — i.e. almost all of them
 * — and hid the page's most important module in the name of precision nobody asked for. A split
 * off four responses is worth showing; calling it *controversial* is not.
 */
export const CLAIM_RESPONSE_FLOOR = 10;

const CONTROVERSIAL_LOW = 40;
const CONTROVERSIAL_HIGH = 60;

export type ClaimResponseSummary = {
  positive: number;
  negative: number;
  total: number;
  /** Whole-percent share of positive responses. Null only when nobody has responded at all. */
  percent: number | null;
  /** Whether there are enough responses to characterize the split, rather than just report it. */
  meetsFloor: boolean;
  isControversial: boolean;
  isLoading: boolean;
};

/**
 * The split, or null where there is nothing to divide.
 *
 * Pure so the floor and the band can be tested without a query. `percent` is null rather than 0 on
 * an untouched claim because the two mean different things and callers render them differently:
 * no module at all, versus a genuine 0%.
 */
export function summarizeClaimResponses(positive: number, negative: number): Omit<ClaimResponseSummary, 'isLoading'> {
  const total = positive + negative;
  const percent = total > 0 ? Math.round((100 * positive) / total) : null;
  const meetsFloor = total >= CLAIM_RESPONSE_FLOOR;

  return {
    positive,
    negative,
    total,
    percent,
    meetsFloor,
    isControversial: meetsFloor && percent !== null && percent >= CONTROVERSIAL_LOW && percent <= CONTROVERSIAL_HIGH,
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
