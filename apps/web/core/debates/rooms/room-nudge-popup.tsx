'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import type { UpcomingDebateRoom } from '../api';
import { requestForRoom } from './room-opponent';
import { useScheduledNoticeOpen } from './scheduled-notice-open';
import { useScheduledDebates } from './scheduling-hooks';

/** Loaded when a nudge arrives: the coordinator is on every page, and few of them ever get one. */
const ScheduledDebateNoticeDialog = dynamic(
  () => import('~/partials/scheduled-debates/scheduled-debate-notice').then(m => m.ScheduledDebateNoticeDialog),
  { ssr: false }
);

/** One nudge, by room and when it was sent: a second nudge to the same room is news again. */
function nudgeKey(room: UpcomingDebateRoom) {
  return `${room.room_id}:${room.nudged_at}`;
}

/**
 * A nudge still asks something: the viewer has not joined or said they are late since (geo-chat
 * clears `nudged_at` then), and the one who nudged is still in the room, as the popup says they are.
 */
function standingNudge(room: UpcomingDebateRoom) {
  return room.kind !== 'lobby' && Boolean(room.nudged_at) && room.others_present;
}

type Held = { key: string; roomId: string; requestId: string; answering: boolean };

/**
 * The popup a nudge puts on the screen of the debater someone is waiting for (GEO-3428, board 6c), on
 * whatever Geo page they have open: Join now, Running late and Can't make it, the last two answered
 * in place.
 *
 * geo-chat sends a popup only to someone at their screen; anyone else gets the email. The room's
 * `nudged_at` arrives on the `debate.requests_changed` the nudge emits.
 *
 * The popup is held here rather than read off the row, with two rules:
 * - **Until they answer, it follows the nudge.** It goes, without counting as seen, the moment the
 *   nudge stops standing (answered in another tab, the waiter left) or the popup is not allowed
 *   (`enabled` off, another scheduling dialog up), and comes back only if the nudge still stands.
 * - **Once they are answering, it stays** until they close it: the answer clears the nudge, and the
 *   confirmation must not vanish with it.
 *
 * Closing hides every nudge the room has had so far on this page; a later nudge opens it again. The
 * coordinator keys this by account, so none of it carries over a sign-out or a switch.
 */
export function RoomNudgePopup({
  rooms,
  enabled,
  onOpenChange,
}: {
  /** The viewer's joinable rooms, as the join prompt reads them. */
  rooms: UpcomingDebateRoom[];
  /** Off in a room, a debate, or under another prompt: nobody is interrupted twice. */
  enabled: boolean;
  /** So the coordinator can hold the join banner back while this is up. */
  onOpenChange: (open: boolean) => void;
}) {
  const otherNoticeOpen = useScheduledNoticeOpen();
  const allowed = enabled && !otherNoticeOpen;
  const [handled, setHandled] = React.useState<readonly string[]>([]);
  const [held, setHeld] = React.useState<Held | null>(null);

  const nudged = allowed
    ? (rooms.find(room => standingNudge(room) && !handled.includes(nudgeKey(room))) ?? null)
    : null;
  // The dialog speaks in requests; only read the list once there is a nudge to answer.
  const requests = useScheduledDebates(nudged !== null);
  const request = nudged ? requestForRoom(requests.data?.requests, nudged.room_id) : undefined;

  // The held room's row while its nudge stands. A newer nudge to the same room keeps the popup up,
  // rather than closing and reopening it: it is the same question, asked again.
  const heldRow = held ? rooms.find(room => room.room_id === held.roomId && standingNudge(room)) : undefined;
  const show = held !== null && (held.answering || (allowed && heldRow !== undefined));
  const latestKey = heldRow ? nudgeKey(heldRow) : null;

  React.useEffect(() => {
    if (held && !show) setHeld(null);
  }, [held, show]);

  // Unanswered, the held nudge moves on to the newest, so closing counts every one it showed.
  React.useEffect(() => {
    if (!held || held.answering || !latestKey || latestKey === held.key) return;
    setHeld({ ...held, key: latestKey });
  }, [held, latestKey]);

  React.useEffect(() => {
    if (held || !nudged || !request) return;
    setHeld({ key: nudgeKey(nudged), roomId: nudged.room_id, requestId: request.request_id, answering: false });
  }, [held, nudged, request]);

  React.useEffect(() => {
    onOpenChange(show);
  }, [onOpenChange, show]);

  if (!held || !show) return null;
  return (
    <ScheduledDebateNoticeDialog
      // By room: a newer nudge to the same room keeps the dialog it is in.
      key={held.roomId}
      open
      requestId={held.requestId}
      initialStep="nudge"
      onAnswering={() => setHeld(current => (current ? { ...current, answering: true } : current))}
      onClose={() => {
        // This nudge, and any later one to the same room that landed while the popup was up.
        const current = rooms.find(room => room.room_id === held.roomId);
        setHandled(seen => [...seen, held.key, ...(current?.nudged_at ? [nudgeKey(current)] : [])]);
        setHeld(null);
      }}
    />
  );
}
