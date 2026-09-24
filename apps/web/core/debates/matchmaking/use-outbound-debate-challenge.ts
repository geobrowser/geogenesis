'use client';

import * as React from 'react';

import type { DebateActivity, DebateChallenge } from '../api';
import { useUnexpiredRequests } from './use-request-countdown';

/**
 * The live person-to-person request sent by the viewer.
 *
 * geo-chat's activity payload currently exposes whichever challenge involves the viewer in
 * `challenge`, regardless of direction. The client-retained `outbound_challenge` removes that
 * ambiguity when an incoming challenge and a newly sent challenge coexist; after a reload, the
 * current user id identifies whether the server's single challenge is outbound.
 */
export function useOutboundDebateChallenge(
  activity: DebateActivity | null | undefined,
  currentUserId: string | null
): {
  outboundChallenge: DebateChallenge | null;
  outboundChallengeDirectionUnknown: boolean;
} {
  const retained = activity?.outbound_challenge?.status === 'pending' ? activity.outbound_challenge : null;
  const reported = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  const candidate =
    retained ?? (reported && (!currentUserId || reported.requester.user_id === currentUserId) ? reported : null);
  const liveCandidates = useUnexpiredRequests(React.useMemo(() => (candidate ? [candidate] : []), [candidate]));
  const liveCandidate = liveCandidates[0] ?? null;
  const retainedIsLive = Boolean(liveCandidate && retained?.id === liveCandidate.id);
  const directionUnknown = Boolean(liveCandidate && !retainedIsLive && !currentUserId);

  return {
    outboundChallenge:
      liveCandidate && (retainedIsLive || liveCandidate.requester.user_id === currentUserId) ? liveCandidate : null,
    outboundChallengeDirectionUnknown: directionUnknown,
  };
}
