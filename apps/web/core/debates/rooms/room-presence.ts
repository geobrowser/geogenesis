import type { DebateRoomView } from '../api';

/**
 * Indicator states (GEO-2941). Read off the server's `waiting` reason and `occupants`, so the
 * grace periods stay one decision on the backend.
 */
export type DebateRoomPresenceState =
  /** 1. In the room before the scheduled start. */
  | 'arrived_early'
  /** 2. Past the start, no arrival, no information about why. */
  | 'waiting'
  /** 2b. Past the start, and the server knows they are mid-debate elsewhere. */
  | 'waiting_elsewhere'
  /** 3. They are in the room. The only state that changes behaviour. */
  | 'present'
  /** 4. Seen in `occupants` this visit, absent now. See `sawOpponent`. */
  | 'left'
  /** 5. The grace period elapsed with no arrival. */
  | 'no_show';

export type DebateRoomPresence = {
  state: DebateRoomPresenceState;
  /** The other participant's user id. The room payload carries no name to go with it. */
  opponentUserId: string | null;
  /** State 3 alone: opens the mic and enables Request debate. */
  opponentPresent: boolean;
};

export type DebateRoomPresenceInput = {
  room: DebateRoomView | null | undefined;
  /** `null` until geo-chat resolves the viewer, which is not the same as being alone. */
  currentUserId: string | null;
  /**
   * Seen in `occupants` this visit. The view reports who is in the room, never who has been, so
   * "left" and "never came" are one payload without this. Does not survive a refresh.
   */
  sawOpponent: boolean;
};

/**
 * The room's presence, or `null` when there is nothing to say: no room, no viewer, or a viewer who
 * is not admitted. Only an admitted viewer is given occupancy to read.
 */
export function debateRoomPresence({
  room,
  currentUserId,
  sawOpponent,
}: DebateRoomPresenceInput): DebateRoomPresence | null {
  if (!room || !currentUserId || room.access.status !== 'admitted') return null;

  const opponentUserId = room.participants.find(userId => userId !== currentUserId) ?? null;
  const opponentPresent = opponentUserId !== null && room.occupants.includes(opponentUserId);

  return { state: presenceState(room, opponentPresent, sawOpponent), opponentUserId, opponentPresent };
}

function presenceState(room: DebateRoomView, opponentPresent: boolean, sawOpponent: boolean): DebateRoomPresenceState {
  if (opponentPresent) return 'present';

  // `waiting` is null until the viewer has joined themselves, so there is no one-sided wait to
  // describe yet and nothing has happened the indicator can report.
  switch (room.waiting?.reason) {
    case 'no_show':
      return 'no_show';
    case 'opponent_in_another_debate':
      return 'waiting_elsewhere';
    case 'not_yet_due':
      // Someone who was here and stepped out has left, whatever the clock says.
      return sawOpponent ? 'left' : 'arrived_early';
    default:
      return sawOpponent ? 'left' : 'waiting';
  }
}
