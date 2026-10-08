'use client';

import * as React from 'react';

import { equals as idEquals } from '~/core/id/normalize';

import { Text } from '~/design-system/text';

import type { DebateRematchSession } from './api';
import { RequestDebateControl } from './request-debate-control';
import { debateRequestGate } from './request-gate';
import { ROOM_REQUEST_WAITING } from './rooms/room-copy';

/** Shared by the picker and its entity panel: one eligibility rule and one set of waiting states. */
export function RematchRequestControl({
  session,
  claimId,
  chatPosition,
  localPosition,
  remotePosition,
  opponentPresent,
  indexingDelayed,
  busy,
  isSending = false,
  recentlyRejected = false,
  previouslyDebated = false,
  onRequest,
  requestError,
  variant,
  className,
}: {
  session: DebateRematchSession | null;
  claimId: string;
  chatPosition: boolean | null | undefined;
  localPosition: boolean | null;
  remotePosition: boolean | null;
  opponentPresent: boolean;
  indexingDelayed: boolean;
  busy: boolean;
  isSending?: boolean;
  recentlyRejected?: boolean;
  previouslyDebated?: boolean;
  onRequest: () => void;
  requestError?: string | null;
  variant?: React.ComponentProps<typeof RequestDebateControl>['variant'];
  className?: string;
}) {
  const gate = debateRequestGate({
    chatPosition,
    localPosition,
    opponentPresent,
    indexingDelayed,
    opponentReady: localPosition !== null && remotePosition !== null && localPosition !== remotePosition,
  });
  const requesting =
    session?.status === 'request_pending' &&
    session.request != null &&
    idEquals(session.request.claim.claim_entity_id, claimId);
  if (!session || !['browsing', 'request_pending'].includes(session.status)) return null;
  if (!gate.canRequest && !gate.pending && !gate.awaitingOpponent && !requesting && !recentlyRejected && !requestError)
    return null;

  const disabled = !gate.canRequest || busy || session.status === 'request_pending' || recentlyRejected;
  const note = recentlyRejected
    ? 'Recently rejected'
    : gate.awaitingOpponent
      ? ROOM_REQUEST_WAITING
      : previouslyDebated
        ? 'Already debated'
        : null;
  return (
    <RequestDebateControl
      onRequest={() => {
        if (!disabled) onRequest();
      }}
      disabled={disabled}
      isRequesting={requesting || isSending}
      pending={gate.pending}
      pendingLabel={gate.pendingLabel}
      requestError={requestError}
      note={
        note ? (
          <Text as="span" variant="footnote" color="grey-04">
            {note}
          </Text>
        ) : null
      }
      variant={variant}
      className={className}
    />
  );
}
