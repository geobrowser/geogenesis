import type { DebateRoomPresenceState } from './room-presence';

/**
 * Every string a room shows. DRAFT — GEO-2945 owns the final wording, so these live in one module
 * to make swapping them one file.
 */

/** The indicator's label. Present in every state, so the pill never renders empty. */
export function roomPresenceLabel(state: DebateRoomPresenceState, opponentName: string): string {
  switch (state) {
    case 'arrived_early':
      return 'Waiting to start';
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

/**
 * The join prompt's urgency turns on `due` and `others_present`, both of which the server supplies
 * on the upcoming-rooms row.
 */
export const ROOM_JOIN_PROMPT = {
  title: 'Your scheduled debate',
  waitingNow: 'Someone is waiting for you now',
  startingNow: 'Your debate is starting now',
  scheduled: (startsAt: string) => `Your debate starts at ${startsAt}`,
  join: 'Join debate',
  notNow: 'Not now',
} as const;

/** Shown to someone who arrived before the door unlocked. */
export const ROOM_NOT_YET_OPEN = {
  title: 'The room isn’t open yet',
  opensAt: (opensAt: string) => `You can join from ${opensAt}.`,
} as const;

/**
 * A room whose session has gone. geo-chat expires one after 90s of either party being offline and
 * never mints a replacement, so voice and Request debate stop working.
 */
export const ROOM_SESSION_ENDED = {
  title: 'This room has closed',
  body: 'You can’t start a debate here any more. Find someone else whenever you’re ready.',
  action: 'Find a debate',
} as const;

/** Under a disabled Request debate in a room, while the opponent has not arrived. */
export const ROOM_REQUEST_WAITING = 'Waiting for your opponent to arrive';

/** The popup on Explore after a redirect. A stale calendar link produces the second reason. */
export const ROOM_NO_ACCESS = {
  denied: 'That debate isn’t yours to join.',
  ended: 'That debate has already finished.',
} as const;
