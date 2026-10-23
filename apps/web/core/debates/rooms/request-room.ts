'use client';

import { useRoomFinished, useUpcomingDebateRooms } from './hooks';
import { requestById } from './room-opponent';
import { sameId } from './room-presence';
import { useScheduledDebates } from './scheduling-hooks';

/**
 * A scheduled request a link names, the room it booked as "your upcoming debates" lists it, and
 * whether that room's debate has already happened (GEO-3427). The reschedule link and the Running
 * late / Can't make it dialog both decide from these three, so they read them one way.
 *
 * `requests` and `rooms` are the reads themselves, for their pending and error states. `finished`
 * is `null` while the room's session is read, and `false` without a listed room.
 */
export function useRequestRoom(requestId: string | null, enabled: boolean) {
  const requests = useScheduledDebates(enabled);
  const rooms = useUpcomingDebateRooms(enabled);
  const request = enabled ? requestById(requests.data?.requests, requestId) : undefined;
  const roomId = request?.room_id ?? null;
  const room = roomId ? (rooms.data?.rooms.find(row => sameId(row.room_id, roomId)) ?? null) : null;
  const finished = useRoomFinished(room);
  return { requests, rooms, request, room, finished };
}
