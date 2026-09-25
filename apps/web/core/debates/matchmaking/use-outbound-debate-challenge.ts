'use client';

import * as React from 'react';

import type { DebateActivity, DebateChallenge } from '../api';
import { useUnexpiredRequests } from './use-request-countdown';

export type DebateChallengeRole = 'requester' | 'recipient';

/**
 * Every live person-request state the matchmaking surfaces need, resolved once.
 *
 * Keeping the server-reported challenge and the client-retained outbound challenge separate is
 * load-bearing: both can exist at once, and the former may be inbound while the latter is outbound.
 */
export function useDebateChallengeState(
  activity: DebateActivity | null | undefined,
  currentUserId: string | null
): {
  challenge: DebateChallenge | null;
  challengeRole: DebateChallengeRole | null;
  outboundChallenge: DebateChallenge | null;
  outboundChallengeDirectionUnknown: boolean;
} {
  const reported = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  const retained = activity?.outbound_challenge?.status === 'pending' ? activity.outbound_challenge : null;
  const pendingChallenges = React.useMemo(() => {
    if (!reported) return retained ? [retained] : [];
    return retained && retained.id !== reported.id ? [reported, retained] : [reported];
  }, [reported, retained]);
  const liveChallenges = useUnexpiredRequests(pendingChallenges);
  const challenge = reported ? (liveChallenges.find(candidate => candidate.id === reported.id) ?? null) : null;
  const retainedOutbound = retained ? (liveChallenges.find(candidate => candidate.id === retained.id) ?? null) : null;
  const challengeRole =
    !challenge || !currentUserId
      ? null
      : challenge.requester.user_id === currentUserId
        ? 'requester'
        : challenge.recipient.user_id === currentUserId
          ? 'recipient'
          : null;
  const outboundChallenge = retainedOutbound ?? (challengeRole === 'requester' ? challenge : null);

  return {
    challenge,
    challengeRole,
    outboundChallenge,
    outboundChallengeDirectionUnknown: Boolean(challenge && !retainedOutbound && !currentUserId),
  };
}

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
  const { outboundChallenge, outboundChallengeDirectionUnknown } = useDebateChallengeState(activity, currentUserId);

  return {
    outboundChallenge,
    outboundChallengeDirectionUnknown,
  };
}
