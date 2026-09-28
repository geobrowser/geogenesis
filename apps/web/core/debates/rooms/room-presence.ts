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
 * geo-chat spells uuids both ways -- `serde_uuid` fields are dashless, plain ones dashed -- so two
 * ids for the same thing need not match as written. Compared on one form rather than trusting
 * either.
 */
export function sameId(a: string, b: string) {
  return a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();
}

/**
 * The other participant and whether they are in the room. `null` whenever the answer would be a
 * guess, so nothing downstream reads the viewer as their own opponent.
 */
export function debateRoomOpponent(room: DebateRoomView | null | undefined, currentUserId: string | null) {
  if (!room || !currentUserId || room.access.status !== 'admitted') {
    return { opponentUserId: null, opponentPresent: false };
  }

  const viewerIsListed = room.participants.some(userId => sameId(userId, currentUserId));
  const opponentUserId = viewerIsListed
    ? (room.participants.find(userId => !sameId(userId, currentUserId)) ?? null)
    : null;

  return {
    opponentUserId,
    opponentPresent: opponentUserId !== null && room.occupants.some(userId => sameId(userId, opponentUserId)),
  };
}

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

  const { opponentUserId, opponentPresent } = debateRoomOpponent(room, currentUserId);
  if (!opponentUserId) return null;

  return { state: presenceState(room, opponentPresent, sawOpponent), opponentUserId, opponentPresent };
}

function presenceState(room: DebateRoomView, opponentPresent: boolean, sawOpponent: boolean): DebateRoomPresenceState {
  if (opponentPresent) return 'present';
  // Ahead of the server's `no_show`, which is only a clock: geo-chat reports it once the viewer has
  // waited long enough alone, whether or not the opponent ever came.
  if (sawOpponent) return 'left';

  // `waiting` is null until the viewer has joined themselves, so there is no one-sided wait to
  // describe yet and nothing has happened the indicator can report.
  switch (room.waiting?.reason) {
    case 'no_show':
      return 'no_show';
    case 'opponent_in_another_debate':
      return 'waiting_elsewhere';
    case 'not_yet_due':
      return 'arrived_early';
    default:
      return 'waiting';
  }
}
