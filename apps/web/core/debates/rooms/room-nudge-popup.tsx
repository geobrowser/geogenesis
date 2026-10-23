'use client';

import * as React from 'react';

import dynamic from 'next/dynamic';

import type { UpcomingDebateRoom } from '../api';
import { requestForRoom } from './room-opponent';
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
 * The popup a nudge puts on the screen of the debater someone is waiting for (GEO-3428, board 6c), on
 * whatever Geo page they have open: Join now, Running late and Can't make it, the last two answered
 * in place.
 *
 * geo-chat sends a popup only to someone at their screen; anyone else gets the email. The room's
 * `nudged_at` stands until they join or say they are running late, and arrives on the
 * `debate.requests_changed` the nudge emits. Once open the popup is held here, not read off that
 * row: answering it clears the row, and the confirmation it shows must not vanish with it. Closing it
 * hides that nudge on this page; a second nudge opens it again.
 */
export function RoomNudgePopup({
  rooms,
  enabled,
  onOpenChange,
}: {
  /** The viewer's joinable rooms, as the join prompt reads them. */
  rooms: UpcomingDebateRoom[];
  /** Off in a room or a debate already: nobody is interrupted mid-debate. */
  enabled: boolean;
  /** So the coordinator can hold the join banner back while this is up. */
  onOpenChange: (open: boolean) => void;
}) {
  const [handled, setHandled] = React.useState<readonly string[]>([]);
  const [open, setOpen] = React.useState<{ key: string; requestId: string } | null>(null);

  const nudged = enabled
    ? (rooms.find(room => room.kind !== 'lobby' && room.nudged_at && !handled.includes(nudgeKey(room))) ?? null)
    : null;
  // The dialog speaks in requests; only read the list once there is a nudge to answer.
  const requests = useScheduledDebates(nudged !== null);
  const request = nudged ? requestForRoom(requests.data?.requests, nudged.room_id) : undefined;

  React.useEffect(() => {
    if (open || !nudged || !request) return;
    setOpen({ key: nudgeKey(nudged), requestId: request.request_id });
  }, [nudged, open, request]);

  React.useEffect(() => {
    onOpenChange(open !== null);
  }, [onOpenChange, open]);

  if (!open || !enabled) return null;
  return (
    <ScheduledDebateNoticeDialog
      key={open.key}
      open
      requestId={open.requestId}
      initialStep="nudge"
      onClose={() => {
        setHandled(current => [...current, open.key]);
        setOpen(null);
      }}
    />
  );
}
