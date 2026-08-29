'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { getEntityResponseCounts, getUserEntityResponse } from '~/core/io/queries';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  entityResponseCountsQueryKey,
  userEntityResponseQueryKey,
} from '~/core/responses/entity-response';
import { useClaimResponseBatchState } from '~/core/responses/use-claim-response-summaries';

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
  /**
   * The side the viewer holds right now, optimistic included, and the space that identifies them.
   *
   * Exposed because the counts here are adjusted optimistically: anything drawing people onto the
   * two sides has to make the same adjustment, or the number moves while the face stays put.
   */
  viewerDirection: ActiveResponseDirection | null;
  viewerSpaceId: string | null;
};

/**
 * Whether there is a split to draw at all.
 *
 * Two states, not three:
 *
 *   - `invite`  nobody has answered. `percent` is null, there is nothing to divide, and the honest
 *               thing to show is an invitation rather than a 0%.
 *   - `full`    somebody has. Draw the share and the bar.
 *
 * An earlier version withheld the percentage below the response floor and printed a tally instead,
 * on the grounds that 93% of answered claims are unanimous and the median has two responses — so a
 * "100%" is usually standing on a sample of two. The reasoning about the data holds; the remedy was
 * wrong twice over. It made a column of cards look arbitrary, some with a bar and some without, so
 * the caution read as inconsistency rather than as care. And it was solving a problem the layout
 * already solves: the responder cluster sits directly beneath the number and says how many people
 * it is a percentage *of*. The sample size is shown, so the rate does not have to hedge.
 *
 * The floor still governs `isControversial` above, which is the one claim that genuinely needs a
 * population behind it — a 1–1 split is not a contested claim, it is two people.
 *
 * One helper for every surface deliberately: the card, the feed and the claim page draw the same
 * number, and a rule decided twice is a rule that will eventually disagree with itself.
 */
export type ClaimSummaryTier = 'invite' | 'full';

export function claimSummaryTier(total: number): ClaimSummaryTier {
  return total <= 0 ? 'invite' : 'full';
}

/**
 * The split, or null where there is nothing to divide.
 *
 * Pure so the floor and the band can be tested without a query. `percent` is null rather than 0 on
 * an untouched claim because the two mean different things and callers render them differently:
 * no module at all, versus a genuine 0%.
 */
export function summarizeClaimResponses(
  positive: number,
  negative: number
): Omit<ClaimResponseSummary, 'isLoading' | 'viewerDirection' | 'viewerSpaceId'> {
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

/** How many of each side a given response direction is worth, for the optimistic adjustment below. */
function sideWeights(direction: ActiveResponseDirection | null | undefined): [positive: number, negative: number] {
  if (direction === 'positive') return [1, 0];
  if (direction === 'negative') return [0, 1];
  return [0, 0];
}

/**
 * The split of on-chain responses on a claim, in one space.
 *
 * Deliberately the same query keys `EntityVoteButtons` uses, so the verdict, the response pills and
 * this share one fetch each — the three are on screen together and must never disagree.
 *
 * Space-scoped, and the space is the caller's. Responses are published against a space, so a claim
 * that lives in several has a different population in each; reading one space's counts under
 * another space's heading would report a number that belongs to neither.
 *
 * Counts the viewer's own response optimistically. Publishing, indexing and the read-back take a
 * few seconds, so without this the bar sits at the old split while the pills next to it have
 * already moved — which reads as the response not having counted. The adjustment is a delta rather
 * than an increment: it adds the side the viewer now holds and removes the one the indexed counts
 * still have them on, so it stays correct when they switch sides or clear their response, and
 * collapses to zero the moment the server agrees.
 */
export function useClaimResponseSummary(
  entityId: string,
  spaceId: string,
  responseKind: ResponseKind
): ClaimResponseSummary {
  const { personalSpaceId } = usePersonalSpaceId();

  // A page that batches its claims — the space claims list, which asks for up to fifty at once —
  // primes exactly these two keys from one request. Asking here as well is not wrong, because the
  // primed cache answers it; but before the batch lands there is nothing to answer from, and fifty
  // rows would each fire their own pair first. So while a batch is managing this subtree, the
  // individual reads stand down and wait for it. `EntityVoteButtons` has always done this, and the
  // deferral was lost when the claim card replaced it on that page.
  const responseBatch = useClaimResponseBatchState();

  const { data, isLoading } = useQuery({
    queryKey: entityResponseCountsQueryKey(entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind),
    queryFn: () =>
      Effect.runPromise(getEntityResponseCounts(entityId, spaceId, responseKind, CLAIM_RESPONSE_OBJECT_TYPE)),
    enabled: !responseBatch.managed,
    staleTime: 30_000,
  });

  // What the counts above already include for this viewer — the baseline the delta subtracts.
  const { data: indexedDirection } = useQuery({
    queryKey: userEntityResponseQueryKey(personalSpaceId, entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind),
    queryFn: async () => {
      if (!personalSpaceId) return null;
      return Effect.runPromise(
        getUserEntityResponse(personalSpaceId, entityId, spaceId, responseKind, CLAIM_RESPONSE_OBJECT_TYPE)
      );
    },
    enabled: Boolean(personalSpaceId) && !responseBatch.managed,
    staleTime: 30_000,
  });

  const indexing = useEntityResponseIndexingSnapshot({ entityId, spaceId, responseKind });
  // Any non-idle snapshot means we know the viewer's intent, `indexed` included — dropping back to
  // the server's copy the moment indexing reports done, but before the count query has refetched,
  // is what would make a landed response flicker back to the old split.
  const pending = indexing.status === 'idle' ? null : indexing.pending;
  const activeDirection = pending ? pending.expectedResponse : indexedDirection;

  const [activePositive, activeNegative] = sideWeights(activeDirection);
  const [indexedPositive, indexedNegative] = sideWeights(indexedDirection);

  // Clamped: the counts and the viewer's indexed response are two queries that can settle out of
  // step, and a negative side would render as a bar sliver pointing the wrong way.
  const positive = Math.max(0, (data?.positive ?? 0) + activePositive - indexedPositive);
  const negative = Math.max(0, (data?.negative ?? 0) + activeNegative - indexedNegative);

  return {
    ...summarizeClaimResponses(positive, negative),
    // Under a batch the individual query never runs, so its `isLoading` is false from the start —
    // the batch's own readiness is what says whether there is anything to draw yet.
    isLoading: responseBatch.managed ? !responseBatch.ready : isLoading,
    viewerDirection: activeDirection ?? null,
    viewerSpaceId: personalSpaceId ?? null,
  };
}
