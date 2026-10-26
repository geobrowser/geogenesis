'use client';

import * as React from 'react';

import { GeoChatRequestError, type ScheduledDebateRequest } from '~/core/debates/api';
import { usePeerSchedule } from '~/core/debates/hooks';
import { useRequestRoom } from '~/core/debates/rooms/request-room';
import { sameId } from '~/core/debates/rooms/room-presence';
import { noticeRequestState } from '~/core/debates/rooms/scheduled-notice';
import { useHoldScheduledNotice } from '~/core/debates/rooms/scheduled-notice-open';
import {
  useCreateScheduledDebate,
  useNoTimeWorks,
  useRescheduleScheduledDebate,
} from '~/core/debates/rooms/scheduling-hooks';
import { noticeFailureMessage } from '~/core/debates/rooms/scheduling-refusals';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { useSetToast } from '~/core/hooks/use-toast';

import { firstName } from '~/partials/profile/claim-response-tag';
import { ScheduledDebateNoticeDialog } from '~/partials/scheduled-debates/scheduled-debate-notice';

import { peerDisplayName, requestSentMessage } from './peer-availability';
import { PeerAvailabilityModal } from './peer-availability-modal';
import { RescheduleCloseWarning } from './reschedule-close-warning';

/**
 * How long a Close waits for the requests list to arrive (GEO-3429), so an agreed debate opened from
 * an email in a fresh tab still gets its warning. Bounded: the read has no timeout of its own.
 */
export const CLOSE_WAIT_MS = 2500;

/** A slot is 30 minutes, so a booking is one slot. */
const SCHEDULED_DEBATE_MINUTES = 30;

type Props = Omit<React.ComponentProps<typeof PeerAvailabilityModal>, 'booking'> & {
  /**
   * Picking a slot moves this request instead of proposing a new one. Set by a scheduling email's
   * "Choose different time" (see `core/availability/availability-deep-link`), and by the Requests
   * tab's Reschedule on an accepted debate, which geo-chat sends back to pending for the new time,
   * and its "Choose different time" on an invite the viewer has yet to answer.
   */
  rescheduleRequestId?: string | null;
  /**
   * What someone wrote under Can't make it (GEO-3427). Kept on the room, where the other debater sees
   * it; the email about the new time carries the approved copy only.
   */
  rescheduleNote?: string;
  /**
   * Can't make it, from the close warning (GEO-3429). A caller that is itself the Can't make it
   * screen (GEO-3427's Suggest another time) goes back to it; otherwise the week swaps to that screen.
   */
  onCantMakeIt?: () => void;
  /**
   * A new request the server accepted, before the requests list has been read again. The calendar
   * (GEO-3152) draws it on its week straight away with this.
   */
  onRequested?: (request: ScheduledDebateRequest) => void;
};

/**
 * The bookable week. Separate from the modal so the mutation, and the query client it needs, only
 * enter the tree where booking is turned on.
 */
export function PeerAvailabilityBookingModal({
  userId,
  onClose,
  rescheduleRequestId = null,
  rescheduleNote,
  entry = null,
  onRequested,
  onCantMakeIt,
  ...props
}: Props) {
  const propose = useCreateScheduledDebate();
  const reschedule = useRescheduleScheduledDebate();
  const noneWork = useNoTimeWorks();
  const mutation = rescheduleRequestId ? reschedule : propose;
  const mode = rescheduleRequestId ? 'reschedule' : 'request';
  const setToast = useSetToast();
  const peer = peerDisplayName(props.peerName, userId);
  const peerFirst = firstName(peer) ?? peer;

  // The debate being moved (GEO-3429): its time and whether it was agreed, from the requests list
  // every reschedule surface already reads. Until it lands the week shows as it always has.
  const { requests, rooms, request, finished } = useRequestRoom(
    rescheduleRequestId,
    Boolean(rescheduleRequestId) && props.open
  );
  const viewerId = useCurrentGeoChatUserId();
  // A converted room can remain listed as accepted until its sweep. Don't act on it while its
  // room/session read is unresolved, or once that session says the debate already happened.
  const roomLoading = Boolean(request?.room_id) && (rooms.isLoading || finished === null);
  // Agreed ('active'), or pending again for an answer ('moved'); anything resolved has nothing to move.
  const state = finished ? 'over' : noticeRequestState(request);
  const active = !roomLoading && finished === false && (state === 'active' || state === 'moved') ? request : undefined;
  const agreed = Boolean(active) && state === 'active';
  // The server may silently withdraw an original inviter's own pending proposal. This includes
  // self-moved invites; the request doesn't expose whether the other side ever took it on.
  // Keep ordinary rescheduling available, but don't promise a free-times email on that path.
  const ownPendingInvite =
    request?.status === 'pending' &&
    !request.viewer_must_answer &&
    viewerId !== null &&
    request.invited_by_user_id != null &&
    sameId(request.invited_by_user_id, viewerId) &&
    request.proposed_by_user_id != null &&
    sameId(request.proposed_by_user_id, viewerId);
  const canAskForTime = viewerId !== null && !ownPendingInvite;
  // From the room's late notice or waiting status the viewer is the one waiting: "they will expect
  // you" is the wrong way round, and "none of these work" would say the waiter can't make it.
  const fromWaitingRoom = entry === 'room_late_notice' || entry === 'room_waiting_status';
  // Closing without a new time leaves an agreed debate on, which is easy to miss when you meant to
  // move it; so it asks first (board 4b).
  const warnsOnClose = agreed && !fromWaitingRoom;
  // The zone the week is drawn in, from the query the week itself reads (no second request), so the
  // warning names the time as the card and the chips do. Read only while a warning can show.
  const viewerTimezone = usePeerSchedule(rescheduleRequestId && warnsOnClose && props.open ? userId : null).schedule
    ?.viewerTimezone;
  const [step, setStep] = React.useState<'week' | 'warn' | 'cant'>('week');
  // One request at a time: a move and "none of these work" racing would leave the other debater
  // with both emails and the move undone.
  const busy = mutation.isPending || noneWork.isPending;
  // The list's first read, not "pending": a query that is off (signed out) stays pending for good.
  const listLoading = Boolean(rescheduleRequestId) && (requests.isLoading || roomLoading);
  // A Close pressed before the list says whether the debate was agreed.
  const [closeWaiting, setCloseWaiting] = React.useState(false);
  // An open week is a dialog the nudge popup never stacks on (GEO-3428), whatever it is booking or
  // moving. The popup comes back when the week closes, if its nudge still stands.
  useHoldScheduledNotice(props.open);

  const close = () => {
    setCloseWaiting(false);
    setStep('week');
    onClose();
    // Otherwise the next person's week opens already showing the last one's outcome.
    mutation.reset();
    noneWork.reset();
  };
  // While a move or "none of these work" is in flight, "still on" may be about to be untrue, so it
  // closes without the warning. Never held open: a request with no timeout can hang (a Privy token
  // stall), and the week must always let go.
  // A Close before the list has loaded waits for it (at most `CLOSE_WAIT_MS`), so the warning isn't
  // skipped just because the answer wasn't in yet.
  const requestClose = () => {
    if (busy) close();
    else if (listLoading) setCloseWaiting(true);
    else if (warnsOnClose) setStep('warn');
    else close();
  };

  // The list landed (or failed) while a Close waited: decide now. A failed read has no agreed
  // debate to warn about, so it just closes.
  const settleWaitingClose = React.useEffectEvent(() => {
    setCloseWaiting(false);
    if (warnsOnClose && !busy) setStep('warn');
    else close();
  });
  React.useEffect(() => {
    if (closeWaiting && !listLoading) settleWaitingClose();
  }, [closeWaiting, listLoading]);
  // Never held open: if the list doesn't come, the Close goes through without it.
  const giveUpWaiting = React.useEffectEvent(() => close());
  React.useEffect(() => {
    if (!closeWaiting) return;
    const timer = window.setTimeout(() => giveUpWaiting(), CLOSE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [closeWaiting]);

  // A sent request is the end of the job, so the week closes on it and the confirmation moves to a
  // toast. Per-call rather than on the hook: closing mid-flight resets the mutation, which detaches
  // these callbacks, so a late success cannot close a week opened since.
  const onSent = (request: ScheduledDebateRequest, viewerTimezone: string) => {
    if (mode === 'request') onRequested?.(request);
    setToast(
      <span>
        {requestSentMessage({
          mode,
          startsAt: request.scheduled_start_at,
          peerName: peerDisplayName(props.peerName, userId),
          viewerTimezone,
        })}
      </span>
    );
    close();
  };

  if (step === 'cant' && rescheduleRequestId) {
    return (
      <ScheduledDebateNoticeDialog
        open={props.open}
        requestId={rescheduleRequestId}
        initialStep="cant"
        onClose={close}
      />
    );
  }

  return (
    <>
      <PeerAvailabilityModal
        {...props}
        userId={userId}
        entry={entry}
        onClose={requestClose}
        booking={{
          mode,
          requestId: rescheduleRequestId,
          moving: active ? { startsAt: active.scheduled_start_at, agreed } : null,
          // Kept while its refusal shows: the refetch it triggers can resolve the request, and the
          // error is the only thing saying why the screen changed.
          noTimeWorks:
            ((active && canAskForTime) || noneWork.error) && rescheduleRequestId && !fromWaitingRoom
              ? {
                  action: request?.viewer_must_answer ? 'decline' : 'cancel',
                  onPress: () =>
                    noneWork.mutate(
                      { requestId: rescheduleRequestId },
                      {
                        onSuccess: result => {
                          // The endpoint returns the resolved request, not an email receipt. An
                          // untouched own invite is withdrawn without sending free times at all.
                          setToast(
                            <span>{result.status === 'declined' ? 'Request declined.' : 'Debate cancelled.'}</span>
                          );
                          close();
                        },
                      }
                    ),
                  pending: noneWork.isPending,
                  // Nothing left to call off once the request has resolved; its refusal still shows.
                  disabled: busy || !active || !canAskForTime,
                  error: noneWork.error ? noticeFailureMessage(noneWork.error, 'cant') : null,
                }
              : null,
          onRequest: (startsAt, pick) => {
            if (rescheduleRequestId && !active) return;
            const slot = {
              startsAt: new Date(startsAt),
              minutes: SCHEDULED_DEBATE_MINUTES,
              analytics: { entry, viewerIsFree: pick.viewerIsFree },
            };
            const callbacks = {
              onSuccess: (request: ScheduledDebateRequest) => onSent(request, pick.viewerTimezone),
            };
            if (rescheduleRequestId) {
              reschedule.mutate({ requestId: rescheduleRequestId, note: rescheduleNote, ...slot }, callbacks);
            } else propose.mutate({ opponentUserId: userId, ...slot }, callbacks);
          },
          pending: mutation.isPending,
          disabled: busy || (Boolean(rescheduleRequestId) && !active),
          error: mutation.error
            ? rescheduleRequestId
              ? rescheduleFailureMessage(mutation.error)
              : mutation.error.message
            : null,
        }}
      />
      {props.open && step === 'warn' && warnsOnClose && active && (
        <RescheduleCloseWarning
          open
          peerFirstName={peerFirst}
          startsAt={active.scheduled_start_at}
          viewerTimezone={viewerTimezone}
          onCantMakeIt={() => {
            if (!onCantMakeIt) return setStep('cant');
            setStep('week');
            onCantMakeIt();
          }}
          onKeep={close}
          onBack={() => setStep('week')}
        />
      )}
    </>
  );
}

/** geo-chat's refusals of a move, said plainly; anything else keeps its own message. */
export function rescheduleFailureMessage(error: unknown): string {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'debate_already_started') {
      return 'This debate has already started, so its time can no longer be changed.';
    }
    if (error.code === 'schedule_conflict') return 'You already have a debate at that time. Pick another.';
    if (error.code === 'reschedule_refused') {
      return /too_many_reschedules/.test(error.message)
        ? 'This debate has been moved too many times. Cancel it and send a new request instead.'
        : 'This debate has already been declined, cancelled or expired.';
    }
  }
  return error instanceof Error ? error.message : 'Could not change the time. Try again.';
}
