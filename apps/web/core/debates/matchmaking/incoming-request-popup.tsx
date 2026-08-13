'use client';

import * as React from 'react';

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
 * - "Debate this claim" off → the same thing. Saying you don't want to debate the claim answers
 *   this request too: leaving it pending would offer a debate the viewer just declined, and hold
 *   the requester waiting on someone who has stood down.
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
  const setReadiness = useClaimReadiness();
  const blockUser = useBlockDebateUser();

  const participants = React.useMemo<DebateRequestDialogParticipant[]>(
    () => [toParticipant(request.requester, 1), toParticipant(request.recipient, 2)],
    [request.recipient, request.requester]
  );

  const busy = acceptRequest.isPending || dismissRequest.isPending || setReadiness.isPending || blockUser.isPending;
  const error = [acceptRequest.error, dismissRequest.error, setReadiness.error, blockUser.error].find(
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
      headerNote={
        <ClaimDebateToggle
          disabled={busy}
          failed={dismissRequest.isError || setReadiness.isError}
          onStandDown={() =>
            answerOnce(() => {
              // Two calls because they undo two different things. The dismiss answers *this*
              // request, for both parties. Leaving the queue is what takes the viewer out of
              // matchmaking on the claim — `remove_intent` alone left them standing as a match in
              // everyone else's list, still offered for debates they had just declined.
              setReadiness.mutate({
                spaceId: request.claim.space_id,
                claimId: request.claim.claim_entity_id,
                ready: false,
              });
              dismissRequest.mutate({ requestId: request.id, removeIntent: true });
            })
          }
        />
      }
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
 * standing ready on the claim, so it starts on — turning it off withdraws you from the claim and
 * answers this request with it, the same way "Dismiss forever" does. The popup then closes on its
 * own: the coordinator only prompts for requests that are still pending.
 */
function ClaimDebateToggle({
  disabled,
  failed,
  onStandDown,
}: {
  disabled: boolean;
  failed: boolean;
  onStandDown: () => void;
}) {
  const [standDownRequested, setStandDownRequested] = React.useState(false);

  // Derived rather than mirrored with an effect: the switch has to move before the round trip (the
  // popup is about to close, so waiting reads as unanswered) but go back if the rejection fails —
  // otherwise it says "you are out of matchmaking for this claim" while the server still has the
  // viewer standing ready and the request live. An effect watching `failed` only fires on the
  // transition, so it misses a mutation that was already in an error state.
  const ready = !standDownRequested || failed;

  const toggle = () => {
    if (!ready) return;
    setStandDownRequested(true);
    onStandDown();
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={ready}
        aria-label="Debate this claim"
        disabled={disabled}
        onClick={toggle}
        className="flex items-center gap-2 text-[15px] leading-[14px] font-medium tracking-[-0.25px] text-grey-04 transition-colors hover:text-text disabled:opacity-50"
      >
        <Toggle checked={ready} className="shrink-0" />
        <span>Debate this claim</span>
      </button>
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
