'use client';

import * as React from 'react';

import type { DebateChallenge } from '../api';
import { useDebateActivity } from '../hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useOutboundRequestCreationPending } from '../use-outbound-request-creation';
import { useDebateChallengeState } from './use-outbound-debate-challenge';

type SharedOutboundRequestState = {
  outboundChallenge: DebateChallenge | null;
  outboundChallengeDirectionUnknown: boolean;
  outboundRequestCreationPending: boolean;
};

const EMPTY_OUTBOUND_REQUEST_STATE: SharedOutboundRequestState = {
  outboundChallenge: null,
  outboundChallengeDirectionUnknown: false,
  outboundRequestCreationPending: false,
};

const DebateChallengeStateContext = React.createContext<SharedOutboundRequestState>(EMPTY_OUTBOUND_REQUEST_STATE);

/**
 * Resolves viewer identity and challenge expiry once for account-level gates rendered across lists.
 * Individual challenge cards may still own their countdown labels; request buttons only need these
 * two booleans and must not start an identity effect and expiry timer for every claim row.
 */
export function DebateChallengeStateProvider({ children }: { children: React.ReactNode }) {
  const { data: activity } = useDebateActivity();
  const currentUserId = useCurrentGeoChatUserId();
  const { outboundChallenge, outboundChallengeDirectionUnknown } = useDebateChallengeState(activity, currentUserId);
  const outboundRequestCreationPending = useOutboundRequestCreationPending();
  const value = React.useMemo(
    () => ({
      outboundChallenge,
      outboundChallengeDirectionUnknown,
      outboundRequestCreationPending,
    }),
    [outboundChallenge, outboundChallengeDirectionUnknown, outboundRequestCreationPending]
  );

  return <DebateChallengeStateContext.Provider value={value}>{children}</DebateChallengeStateContext.Provider>;
}

export function useSharedOutboundRequestState(): SharedOutboundRequestState {
  return React.useContext(DebateChallengeStateContext);
}
