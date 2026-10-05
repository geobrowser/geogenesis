'use client';

import * as React from 'react';

import { activeDebate } from '../activity-state';
import type { DebateActivity, DebateRequestsResponse } from '../api';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useUnexpiredRequests } from './use-request-countdown';

/**
 * Whether the viewer can send a live request right now, and if not, why — the People tab's rule,
 * shared with Find a time (GEO-3152) so a Debate button greys out for the same reasons in both.
 */
export function useLiveRequestBlock(
  activity: DebateActivity | undefined,
  requests: DebateRequestsResponse | undefined
) {
  const currentUserId = useCurrentGeoChatUserId();
  const reportedChallenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  // A challenge stays `pending` in the activity payload until the server says otherwise, so its own
  // expiry has to be applied here — the same filter every other request surface derives from, so
  // none of them disagree about a dead request while waiting for `debate.requests_changed`. Without
  // it this tab would sit on an "Expired" card with every Debate button still dead underneath it.
  const liveChallenges = useUnexpiredRequests(
    React.useMemo(() => (reportedChallenge ? [reportedChallenge] : []), [reportedChallenge])
  );
  const pendingChallenge = liveChallenges[0] ?? null;
  // `activity.challenge` is whichever challenge involves the viewer, in either direction. The card
  // is about a request you sent, so it only stands in for the message when you are the one waiting
  // on a reply — being challenged blocks the buttons just the same, but the sentence is what
  // explains that.
  const outboundChallenge =
    pendingChallenge && currentUserId && pendingChallenge.requester.user_id === currentUserId ? pendingChallenge : null;

  // Every Debate button greys out at once when the viewer already has something open, so say why
  // rather than leaving a list of dead buttons. The card says it for an outbound challenge, so the
  // sentence would only repeat it.
  const blockedReason = pendingChallenge
    ? outboundChallenge
      ? null
      : 'You have a debate request awaiting a reply.'
    : activeDebate(activity)
      ? "You're already in a debate."
      : activity?.outbound_request || requests?.outbound
        ? 'You already have an open request — withdraw it to challenge someone else.'
        : null;

  // Kept separate from `blockedReason`: the card replaces the sentence but not the reason every
  // button below is disabled.
  const buttonsDisabled = Boolean(blockedReason) || Boolean(outboundChallenge);

  return { outboundChallenge, blockedReason, buttonsDisabled };
}
