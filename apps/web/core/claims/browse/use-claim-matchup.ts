'use client';

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
export function useClaimMatchup({ claimId, spaceId, enabled = true }: { claimId: string; spaceId: string; enabled?: boolean }) {
  const matchesQuery = useMatchmakingMatches(enabled);
  const requestsQuery = useDebateRequests(enabled);
  const { data: activity } = useDebateActivity(enabled);
  const createRequest = useCreateDebateRequest();

  const match =
    (matchesQuery.data?.matches ?? []).find(
      candidate => ID.equals(candidate.claim.claim_entity_id, claimId) && ID.equals(candidate.claim.space_id, spaceId)
    ) ?? null;

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
