'use client';

import * as React from 'react';

import type { DebateParticipantSummary, ScheduledDebateRequest, UpcomingDebateRoom } from '../api';
import { useGeoChatUserSummaries } from '../matchmaking/use-geo-chat-user-summaries';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { UNNAMED_OPPONENT } from './room-copy';
import { sameId } from './room-presence';
import { useScheduledDebates } from './scheduling-hooks';

/** `null` whenever the answer would be a guess, so nothing reads the viewer as their own opponent. */
export function opponentOf(request: ScheduledDebateRequest | undefined, viewerId: string | null) {
  if (!request || !viewerId) return null;
  if (!request.participants.some(participant => sameId(participant.user_id, viewerId))) return null;
  return request.participants.find(participant => !sameId(participant.user_id, viewerId))?.user_id ?? null;
}

/** What to call the opponent: their name, or a stand-in until the graph has one. */
export function opponentName(opponent: Pick<DebateParticipantSummary, 'display_name'> | null) {
  return opponent?.display_name || UNNAMED_OPPONENT;
}

/** The request that booked a room. The room's id is dashless here and dashed on the request. */
export function requestForRoom(requests: ScheduledDebateRequest[] | undefined, roomId: string) {
  return (requests ?? []).find(request => request.room_id && sameId(request.room_id, roomId));
}

/**
 * Who the viewer is debating in an upcoming room. A room carries no participants, so this reads
 * the request that booked it, then names them from the graph. `null` until both land.
 */
export function useUpcomingRoomOpponent(room: UpcomingDebateRoom): DebateParticipantSummary | null {
  const requests = useScheduledDebates();
  const viewerId = useCurrentGeoChatUserId();
  const opponentUserId = opponentOf(requestForRoom(requests.data?.requests, room.room_id), viewerId);
  const ids = React.useMemo(() => (opponentUserId ? [opponentUserId] : []), [opponentUserId]);
  const summaries = useGeoChatUserSummaries(ids, opponentUserId !== null);

  return summaries.find(person => opponentUserId !== null && sameId(person.user_id, opponentUserId)) ?? null;
}
