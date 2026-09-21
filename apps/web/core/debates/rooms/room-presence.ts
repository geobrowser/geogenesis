import type { DebateRoom, DebateRoomParticipant } from '../api';

/** Indicator states (GEO-2941). From explicit join/leave events, not GEO-2836's 1-minute heartbeat. */
export type DebateRoomPresenceState =
  /** 1. The viewer is here before the window opens. */
  | 'arrived_early'
  /** 2. The window is open, the viewer is here, the other participant has not arrived. */
  | 'waiting'
  /** 2b. Still waiting, and the server knows why: they are mid-debate somewhere else. */
  | 'waiting_elsewhere'
  /** 3. They are in the room. The only state that changes behaviour — see `opponentPresent`. */
  | 'present'
  /** 4. They were here and left, by an explicit leave rather than a dropped connection. */
  | 'left'
  /** 5. Past the server's deadline with no join event at all. */
  | 'no_show';

export type DebateRoomPresence = {
  state: DebateRoomPresenceState;
  opponent: DebateRoomParticipant;
  /** State 3 alone: opens the mic and enables Request debate. Every other state is indicator-only. */
  opponentPresent: boolean;
};

export type DebateRoomPresenceInput = {
  room: DebateRoom | null | undefined;
  /** `null` until geo-chat resolves the viewer, which is not the same as being alone in the room. */
  currentUserId: string | null;
  now: number;
};

/** `null` when unanswerable. `closes_at` is not read: the window governs joining, never leaving. */
export function debateRoomPresence({ room, currentUserId, now }: DebateRoomPresenceInput): DebateRoomPresence | null {
  if (!room || !currentUserId) return null;

  const opponent = room.participants.find(participant => participant.user_id !== currentUserId) ?? null;
  const viewerIsMember = room.participants.some(participant => participant.user_id === currentUserId);
  if (!opponent || !viewerIsMember) return null;

  return { state: opponentState(room, opponent, now), opponent, opponentPresent: opponent.present };
}

function opponentState(room: DebateRoom, opponent: DebateRoomParticipant, now: number): DebateRoomPresenceState {
  // Being here outranks the viewer's own early arrival: a room the pair are both sitting in is not
  // a room anyone is early for.
  if (opponent.present) return 'present';

  // Ahead of `arrived_early`, which would report an early leave as nobody having arrived.
  if (opponent.left_at !== null) return 'left';

  // Nobody is late before the window opens.
  if (now < timestamp(room.opens_at)) return 'arrived_early';

  // Before `waiting_reason`: GEO-2946 converts a wait into a no-show on a deadline whatever the
  // reason for it, so 2b resolves into 5.
  const noShowAt = room.no_show_at === null ? null : timestamp(room.no_show_at);
  if (noShowAt !== null && now >= noShowAt) return 'no_show';

  if (room.waiting_reason === 'in_another_debate') return 'waiting_elsewhere';

  return 'waiting';
}

/** `NaN` loses every comparison above, so an unreadable timestamp falls through to `waiting`. */
function timestamp(value: string) {
  return Date.parse(value);
}
