'use client';

import * as React from 'react';

import type { DebateRequest, DebateRequestParty } from '../api';
import { DebateRequestDialog, type DebateRequestDialogParticipant } from '../debate-request-dialog';
import { speakerLabel } from '../playback-utils';
import { useAcceptDebateRequest, useBlockDebateUser, useDismissDebateRequest } from './hooks';
import { RequestOverflowMenu } from './request-overflow-menu';

/**
 * GEO-2430. The popup a recipient sees the moment a request arrives:
 *
 * - Accept → the server creates the match and debate, and the ready room takes over.
 * - Not now → local only. The request stays live in the hub's Requests tab until it expires.
 * - "I don't want to debate this claim" → dismisses and drops the viewer's intent for that claim.
 * - Block → dismisses and hides both users from each other's matchmaking.
 *
 * Dismissing (unlike "Not now") lets the server advance the request to the next candidate.
 */
export function IncomingRequestPopup({
  request,
  currentUserId,
  onNotNow,
}: {
  request: DebateRequest;
  currentUserId: string;
  onNotNow: () => void;
}) {
  const acceptRequest = useAcceptDebateRequest();
  const dismissRequest = useDismissDebateRequest();
  const blockUser = useBlockDebateUser();

  const participants = React.useMemo<DebateRequestDialogParticipant[]>(
    () => [toParticipant(request.requester, 1), toParticipant(request.recipient, 2)],
    [request.recipient, request.requester]
  );

  const busy = acceptRequest.isPending || dismissRequest.isPending || blockUser.isPending;
  const error = [acceptRequest.error, dismissRequest.error, blockUser.error].find(
    (candidate): candidate is Error => candidate instanceof Error
  );

  return (
    <DebateRequestDialog
      claim={request.claim.claim}
      participants={participants}
      currentUserId={currentUserId}
      formatId={request.turn_format_id}
      busy={busy}
      error={error?.message ?? null}
      rejectLabel="Not now"
      onAccept={() => acceptRequest.mutate({ requestId: request.id })}
      onReject={onNotNow}
      tertiaryAction={{
        label: "I don't want to debate this claim",
        onClick: () => dismissRequest.mutate({ requestId: request.id, removeIntent: true }),
      }}
      overflowMenu={
        <RequestOverflowMenu
          actions={[
            {
              label: `Block ${speakerLabel(request.requester)}`,
              destructive: true,
              onClick: () => blockUser.mutate(request.requester.user_id),
            },
          ]}
        />
      }
    />
  );
}

// The dialog is shared with the match flow, which orders participants by turn slot. A request has
// no slots yet — the requester speaks first — so we assign them here.
function toParticipant(party: DebateRequestParty, slot: 1 | 2): DebateRequestDialogParticipant {
  return {
    user_id: party.user_id,
    profile_space_id: party.profile_space_id,
    display_name: party.display_name,
    avatar_cid: party.avatar_cid,
    participant_slot: slot,
    position: party.position,
    position_label: party.position_label,
  };
}
