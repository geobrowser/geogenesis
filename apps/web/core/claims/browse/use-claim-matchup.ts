'use client';

import { useQueryClient } from '@tanstack/react-query';

import { type DebateClaimPositionSummary, GeoChatRequestError, notifyClaimResponseIndexed } from '~/core/debates/api';
import { readinessQueryPrefixes } from '~/core/debates/claim-response-indexed-notifier';
import { useDebateActivity, useGeoChatAuth } from '~/core/debates/hooks';
import { useCreateDebateRequest, useDebateRequests, useMatchmakingMatches } from '~/core/debates/matchmaking/hooks';
import { ID } from '~/core/id';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';

/**
 * What to say when a request fails, in the reader's terms where geo-chat's are not theirs.
 *
 * `intent_missing` is geo-chat finding no readiness row behind the request: "respond to this claim
 * before sending a debate request", printed under a pill the reader can see is held. It means one of
 * two things, and the side the pills show says which. Holding one, geo-chat simply has not caught up
 * — the response is still confirming, or its notification was lost — and the retry is worth making.
 * Holding none, the fix is on the page, and it is named in the page's own words.
 */
export function debateRequestErrorMessage(error: unknown, viewerPosition: boolean | null | undefined) {
  if (!(error instanceof Error)) return null;
  if (error instanceof GeoChatRequestError && error.code === 'intent_missing') {
    return typeof viewerPosition === 'boolean'
      ? 'Your response is still confirming — try again in a moment.'
      : 'Choose Agree or Disagree first.';
  }
  return error.message;
}

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
  viewerPosition,
  indexedViewerPosition = null,
}: {
  claimId: string;
  spaceId: string;
  enabled?: boolean;
  /** The side the pills show — see `ClaimEndSlot`. Only chooses what a refused request says. */
  viewerPosition?: boolean | null;
  /**
   * The side the chain's indexed read reports, or null where it holds none or cannot be trusted
   * yet (`trustedIndexedPosition`). Where it agrees with the pills, an `intent_missing` refusal
   * re-reports it to geo-chat, so the retry the message invites can succeed.
   */
  indexedViewerPosition?: boolean | null;
}) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const matchesQuery = useMatchmakingMatches(enabled);
  const requestsQuery = useDebateRequests(enabled);
  const { data: activity } = useDebateActivity(enabled);
  const createRequest = useCreateDebateRequest();

  // geo-chat holds no readiness for a side the chain does. The notification that should have made
  // one either has not landed or never will — a readiness row marked withdrawn is not repaired by
  // anything else — so send it again, then ask for readiness afresh whether or not it went through.
  const recoverFromMissingIntent = () => {
    const refresh = () => {
      if (!accountKey) return;
      for (const queryKey of readinessQueryPrefixes(accountKey, spaceId)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    if (indexedViewerPosition === null || indexedViewerPosition !== viewerPosition) {
      refresh();
      return;
    }
    void notifyClaimResponseIndexed(
      spaceId,
      claimId,
      CLAIM_RESPONSE_KIND,
      indexedViewerPosition,
      getPrivyIdentityToken,
      accountKey
    )
      .catch(() => {})
      .finally(refresh);
  };

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
    requestError: debateRequestErrorMessage(createRequest.error, viewerPosition),
    request: () =>
      createRequest.mutate(
        { space_id: spaceId, claim_entity_id: claimId },
        {
          onError: error => {
            if (error instanceof GeoChatRequestError && error.code === 'intent_missing') recoverFromMissingIntent();
          },
        }
      ),
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
