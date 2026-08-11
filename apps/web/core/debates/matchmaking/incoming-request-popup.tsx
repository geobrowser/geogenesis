'use client';

import * as React from 'react';

import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';

import type { DebateRequest, DebateRequestParty } from '../api';
import { DebateRequestDialog, type DebateRequestDialogParticipant } from '../debate-request-dialog';
import { speakerLabel } from '../playback-utils';
import { useAcceptDebateRequest, useBlockDebateUser, useClaimReadiness, useDismissDebateRequest } from './hooks';
import { SpaceChip } from './matchmaking-claim-card';
import { RequestOverflowMenu } from './request-overflow-menu';

/**
 * GEO-2430. The popup a recipient sees the moment a request arrives:
 *
 * - Accept → the server creates the match and debate, and the ready room takes over.
 * - Not now → local only. The request stays live in the hub's Requests tab, under "Received",
 *   until it expires 25 minutes after it was sent.
 * - "Dismiss forever" → dismisses and drops the viewer's intent for that claim.
 * - "Debate this claim" → stands the viewer down from the claim without answering this request.
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
  // `isPending` only disables the buttons on the *next* render, so a double tap gets two answers in
  // before it takes effect — and the second one 409s over a request the first already took.
  const answered = React.useRef(false);
  const answerOnce = (answer: () => void) => {
    if (answered.current) return;
    answered.current = true;
    answer();
  };

  return (
    <DebateRequestDialog
      claim={request.claim.claim}
      participants={participants}
      currentUserId={currentUserId}
      formatId={request.turn_format_id}
      busy={busy}
      error={error?.message ?? null}
      actionsLayout="split"
      rejectLabel="Not now"
      eyebrow={
        <span className="flex min-w-0 items-center justify-center gap-1.5 text-metadata text-grey-04">
          <SpaceChip spaceId={request.claim.space_id} />
          <span aria-hidden>·</span>
          <span className="shrink-0">Debate request</span>
        </span>
      }
      onAccept={() => answerOnce(() => acceptRequest.mutate({ requestId: request.id }))}
      onReject={onNotNow}
      formatAction={{
        label: 'Dismiss forever',
        onClick: () => answerOnce(() => dismissRequest.mutate({ requestId: request.id, removeIntent: true })),
      }}
      footerNote={<ClaimDebateToggle request={request} disabled={busy} />}
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

/**
 * Readiness for the claim this request is about. You only received the request because you were
 * standing ready on the claim, so it starts on — turning it off keeps you out of future matchmaking
 * for it without answering this request either way.
 */
function ClaimDebateToggle({ request, disabled }: { request: DebateRequest; disabled: boolean }) {
  const setReadiness = useClaimReadiness();
  const [ready, setReady] = React.useState(true);

  // The switch moves first, but a failed call has to move it back and say so — otherwise it reads
  // as "you are out of matchmaking for this claim" while the server still has you standing ready.
  const toggle = () => {
    const next = !ready;
    setReady(next);
    setReadiness.mutate(
      { spaceId: request.claim.space_id, claimId: request.claim.claim_entity_id, ready: next },
      { onError: () => setReady(!next) }
    );
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={ready}
        aria-label="Debate this claim"
        disabled={disabled || setReadiness.isPending}
        onClick={toggle}
        className="flex items-center gap-1.5 px-4 py-1 text-grey-04 transition-colors hover:text-text disabled:opacity-50"
      >
        <Toggle checked={ready} className="shrink-0" />
        <Text as="span" variant="metadata" color="current">
          Debate this claim
        </Text>
      </button>
      {setReadiness.error ? (
        <div role="alert">
          <Text as="p" variant="footnote" color="red-01">
            Could not change your readiness for this claim.
          </Text>
        </div>
      ) : null}
    </div>
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
