'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { toSignIn } from '~/core/auth/sign-in-deep-link';
import { GeoChatRequestError } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { useDebateRoom, useDebateRoomPresence, useRoomPresence } from '~/core/debates/rooms/hooks';
import {
  roomAccessDenialFor,
  roomAccessDenialForStatus,
  toRoomAccess,
} from '~/core/debates/rooms/room-access-deep-link';
import { DebateRoomProvider } from '~/core/debates/rooms/room-context';
import { ROOM_NOT_YET_OPEN } from '~/core/debates/rooms/room-copy';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { rememberRoomSession } from '~/core/debates/rooms/room-sessions';

import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import { DebateRematchPageClient } from '../../space/[id]/(space)/debates/rematches/[sessionId]/rematch-page-client';

/**
 * A debate room (GEO-2941): the debate-again picker with an indicator over it, so a wrapper rather
 * than a screen. Nothing here ejects anyone — `scheduled_end_at` is never read.
 */
export function DebateRoomPageClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const roomQuery = useDebateRoom(roomId);
  const room = roomQuery.data ?? null;

  // Refusals arrive in the body, not the status: a stranger gets a 200 saying `not_a_participant`.
  // Only a room that does not exist is an HTTP error.
  // Read the body's own verdict first, and consult the transport only when there is no room to go
  // on. React Query keeps the last payload through a failed refetch, and `retry: false` means one
  // 404 on one 3s poll would otherwise redirect everyone currently sitting in the room.
  const denial = room
    ? roomAccessDenialFor(room.access)
    : roomQuery.error instanceof GeoChatRequestError
      ? roomAccessDenialForStatus(roomQuery.error.status)
      : null;

  React.useEffect(() => {
    if (!denial) return;
    // `replace`, so the back button does not walk them into the refusal again.
    router.replace(toRoomAccess(denial));
  }, [denial, router]);

  const admitted = room?.access.status === 'admitted';
  useRoomPresence(roomId, admitted);
  const presence = useDebateRoomPresence(room);
  const { ready, authenticated } = useGeoChatAuth();

  // So the coordinator can tell this session from a challenge's and leave it alone. See
  // `room-sessions`.
  const sessionId = room?.rematch_session_id ?? null;
  React.useEffect(() => {
    if (sessionId) rememberRoomSession(sessionId);
  }, [sessionId]);

  // Nothing renders for someone not in this room: not a degraded room, and not a 404 — the link is
  // valid, they are just not in this one.
  if (denial) return null;

  // A room link is pasted into a calendar invite, so the person opening it is often signed out.
  // The room cannot say who they are, and an error card is a dead end.
  if (ready && !authenticated) {
    return (
      <RoomNotice action={{ href: toSignIn({ pathname: debateRoomPath(roomId), via: 'room' }), label: 'Sign in' }}>
        Sign in to join your debate.
      </RoomNotice>
    );
  }

  if (!room) {
    return roomQuery.isError ? (
      <RoomNotice>Could not open this debate room.</RoomNotice>
    ) : (
      <RoomNotice busy>Opening your debate room…</RoomNotice>
    );
  }

  // On the list, door still locked. The server refuses the join until `opens_at`, so this says when
  // rather than bouncing someone who is merely early.
  if (room.access.status === 'not_yet_open') {
    return (
      <RoomNotice>
        {ROOM_NOT_YET_OPEN.title} {ROOM_NOT_YET_OPEN.opensAt(formatTime(room.access.opens_at))}
      </RoomNotice>
    );
  }

  // Created on first join, so it trails admission by a round trip rather than being absent.
  if (!room.rematch_session_id) return <RoomNotice busy>Getting your claims ready…</RoomNotice>;

  return (
    <DebateRoomProvider roomId={roomId} presence={presence}>
      <DebateRematchPageClient sessionId={room.rematch_session_id} />
    </DebateRoomProvider>
  );
}

/**
 * `opens_at` has no lower bound — a room booked for next week is `not_yet_open` all week — so the
 * date is only dropped when it is today.
 */
function formatTime(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'the scheduled time';

  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const sameDay =
    at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();

  return sameDay ? time : `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

function RoomNotice({
  children,
  busy = false,
  action,
}: {
  children: React.ReactNode;
  busy?: boolean;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        {busy && <Spinner />}
        <Text color="grey-04">{children}</Text>
        {action && (
          <Link href={action.href} className="shrink-0 rounded-full bg-text px-3 py-1.5 text-metadata text-white">
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
