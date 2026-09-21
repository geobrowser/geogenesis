import type { DebateRoomPresenceState } from './room-presence';

/**
 * Every string a room shows. DRAFT — GEO-2945 owns the final wording, so these live in one module
 * to make swapping them one file.
 */

/** The indicator's label. Present in every state, so the pill never renders empty. */
export function roomPresenceLabel(state: DebateRoomPresenceState, opponentName: string): string {
  switch (state) {
    case 'arrived_early':
      return 'Room not open yet';
    case 'waiting':
    case 'waiting_elsewhere':
      return `Waiting for ${opponentName}`;
    case 'present':
      return `${opponentName} is here`;
    case 'left':
      return `${opponentName} left`;
    case 'no_show':
      return `${opponentName} didn’t arrive`;
  }
}

/**
 * The single line under the indicator. Only the three states a viewer would otherwise have to guess
 * at get one; a room is not allowed to grow into a screen that narrates itself.
 */
export function roomPresenceNote(state: DebateRoomPresenceState, opponentName: string): string | null {
  switch (state) {
    case 'arrived_early':
    case 'waiting':
    case 'present':
      return null;
    case 'waiting_elsewhere':
      return `${opponentName} is in another debate right now. Hang on — they may still be on their way.`;
    case 'left':
      return `${opponentName} left the room. You can wait for them to come back, or find someone else to debate.`;
    case 'no_show':
      return `${opponentName} didn’t make it. You can find someone else to debate whenever you’re ready.`;
  }
}

/** The join prompt's urgency turns on whether the other participant is already waiting. */
export const ROOM_JOIN_PROMPT = {
  waitingNow: (opponentName: string) => `${opponentName} is waiting for you now`,
  scheduled: (startsAt: string) => `Your debate starts at ${startsAt}`,
  join: 'Join debate',
  notNow: 'Not now',
} as const;

/** The popup on Explore after a redirect. A stale calendar link produces the second reason. */
export const ROOM_NO_ACCESS = {
  denied: 'That debate isn’t yours to join.',
  ended: 'That debate has already finished.',
} as const;
