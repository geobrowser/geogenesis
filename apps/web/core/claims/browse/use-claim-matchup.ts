'use client';

import type { DebateClaimPositionSummary } from '~/core/debates/api';
import { useDebateActivity } from '~/core/debates/hooks';
import { useCreateDebateRequest, useDebateRequests, useMatchmakingMatches } from '~/core/debates/matchmaking/hooks';
import { ID } from '~/core/id';

/**
 * Whether there is a debate to be had on this claim right now, and what it would take to ask for
 * one.
 *
 * Lifted out of the claim page so the card can offer the same thing without a second copy of the
 * conditions. A match needs three things at once — the viewer standing ready, someone else standing
 * ready, and opposite responses — which is why `match` is null far more often than not, and why
 * every surface must treat its absence as the ordinary case rather than an error.
 *
 * The queries are the hub's own and are keyed identically, so a list of cards asking this question
 * shares one fetch of the matches rather than one per card.
 */
export function useClaimMatchup({
  claimId,
  spaceId,
  enabled = true,
}: {
  claimId: string;
  spaceId: string;
  enabled?: boolean;
}) {
  const matchesQuery = useMatchmakingMatches(enabled);
  const requestsQuery = useDebateRequests(enabled);
  const { data: activity } = useDebateActivity(enabled);
  const createRequest = useCreateDebateRequest();

  // `enabled: false` only stops this query from *fetching*. React Query still hands back whatever
  // another mounted caller has already put in the cache — and on the hub the Matches tab is one, so
  // a claim disabled precisely because the graph cannot resolve it would find a cached match and
  // offer a debate it cannot honour. Disabled has to mean no answer, not a stale one.
  const match = !enabled
    ? null
    : ((matchesQuery.data?.matches ?? []).find(
        candidate => ID.equals(candidate.claim.claim_entity_id, claimId) && ID.equals(candidate.claim.space_id, spaceId)
      ) ?? null);

  const outbound = requestsQuery.data?.outbound ?? activity?.outbound_request ?? null;
  // Only when the server actually says so — a missing field must not block requesting.
  const unavailable = activity?.available_to_debate === false;
  const blockedReason = unavailable
    ? 'Switch yourself to available to send a request.'
    : outbound
      ? 'Withdraw your open request to send another.'
      : undefined;

  return {
    match,
    blockedReason,
    isRequesting: createRequest.isPending,
    requestError: createRequest.error instanceof Error ? createRequest.error.message : null,
    request: () => createRequest.mutate({ space_id: spaceId, claim_entity_id: claimId }),
  };
}

/**
 * Put the opponent's face on the side the match is against.
 *
 * The offer and the faces come from two different places, and that is deliberate rather than an
 * oversight to unify: the counts under the pills are on-chain totals, so they agree with the
 * percentage above them, while the faces are geo-chat's `online_choices` — who is here and
 * available *right now*. Neither can replace the other.
 *
 * But they can disagree, and when they do the card is incoherent: it offers a debate on a side
 * showing nobody to debate. That happens because the matches lookup is one shared account-level
 * query while `online_choices` rides a per-claim row — so the offer can land first, and on a claim
 * geo-chat has no row for it lands alone.
 *
 * The match already carries the participants the server based it on, in the same shape. So where a
 * side has no faces and the match has some, the match's are used. Counts are left alone, because
 * those are the on-chain ones and the percentage is drawn from them.
 */
export function withMatchParticipants(
  positions: DebateClaimPositionSummary[],
  matchPositions: DebateClaimPositionSummary[] | undefined
): DebateClaimPositionSummary[] {
  if (!matchPositions || matchPositions.length === 0) return positions;

  return positions.map(side => {
    if (side.participants.length > 0) return side;

    const fromMatch = matchPositions.find(candidate => candidate.position === side.position);
    if (!fromMatch || fromMatch.participants.length === 0) return side;

    return {
      ...side,
      participants: fromMatch.participants,
      // The larger of the two, not the match's.
      //
      // Today `positionSummariesFromCounts` derives `present_count` from the same participant list,
      // so a side with no faces reports zero and this cannot lose anything. That is a property of
      // one caller, not of the helper — the server's own `match.positions` carry a count that is
      // independent of their capped preview, and taking the match's number there would drop the
      // pill's `+N` overflow and underreport who is available.
      present_count: Math.max(side.present_count ?? 0, fromMatch.present_count ?? fromMatch.participants.length),
    };
  });
}
