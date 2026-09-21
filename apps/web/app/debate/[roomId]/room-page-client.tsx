'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { GeoChatRequestError } from '~/core/debates/api';
import { useDebateRoom, useDebateRoomPresence, useJoinDebateRoom } from '~/core/debates/rooms/hooks';
import { roomAccessDenialForStatus, toRoomAccess } from '~/core/debates/rooms/room-access-deep-link';
import { DebateRoomProvider } from '~/core/debates/rooms/room-context';
import { DebateRoomPresenceIndicator } from '~/core/debates/rooms/room-presence-indicator';

import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import { DebateRematchPageClient } from '../../space/[id]/(space)/debates/rematches/[sessionId]/rematch-page-client';

/**
 * A debate room (GEO-2941): a wrapper that fetches the room, announces arrival, and puts the
 * indicator over the debate-again picker. Nothing here ejects anyone — `closes_at` is never read.
 */
export function DebateRoomPageClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const roomQuery = useDebateRoom(roomId);
  const room = roomQuery.data ?? null;
  const presence = useDebateRoomPresence(room);

  const denial =
    roomQuery.error instanceof GeoChatRequestError ? roomAccessDenialForStatus(roomQuery.error.status) : null;

  React.useEffect(() => {
    if (!denial) return;
    // `replace`, so the back button does not walk them into the refusal again.
    router.replace(toRoomAccess(denial));
  }, [denial, router]);

  useAnnounceArrival(roomId, room !== null);

  // Nothing renders for someone not in this room: not a degraded room, and not a 404 — the link is
  // valid, they are just not in this one.
  if (denial) return null;

  if (!room) {
    return roomQuery.isError ? (
      <RoomNotice>Could not open this debate room.</RoomNotice>
    ) : (
      <RoomNotice busy>Opening your debate room…</RoomNotice>
    );
  }

  // A room with no session yet has nothing for the picker to draw, and resolves on the next poll.
  if (!room.rematch_session_id) return <RoomNotice busy>Getting your claims ready…</RoomNotice>;

  return (
    <DebateRoomProvider presence={presence}>
      <DebateRematchPageClient sessionId={room.rematch_session_id} />
      {presence && <DebateRoomPresenceIndicator presence={presence} />}
    </DebateRoomProvider>
  );
}

/**
 * Announces arrival once per room per mount. Re-announcing on every refetch would rewrite
 * `joined_at` and turn a viewer who has been sitting here into one who just walked in.
 */
function useAnnounceArrival(roomId: string, ready: boolean) {
  const joinRoom = useJoinDebateRoom(roomId);
  const announcedRef = React.useRef<string | null>(null);

  // `mutate` is stable but the mutation object is not, so the effect keys on the room instead.
  const join = joinRoom.mutate;

  React.useEffect(() => {
    if (!ready || announcedRef.current === roomId) return;
    announcedRef.current = roomId;
    join();
  }, [join, ready, roomId]);
}

function RoomNotice({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        {busy && <Spinner />}
        <Text color="grey-04">{children}</Text>
      </div>
    </div>
  );
}
