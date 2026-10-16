import type { DebateRoomPresenceState } from './room-presence';

/**
 * Every string a room shows. DRAFT — GEO-2945 owns the final wording, so these live in one module
 * to make swapping them one file.
 */

/** Stands in for the opponent's name until one is known, on every surface that names them. */
export const UNNAMED_OPPONENT = 'Your opponent';

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
 * The banner that tells someone elsewhere on Geo their room has opened. Whether the opponent is in
 * comes from the server's `others_present` on the upcoming-rooms row.
 */
export const ROOM_JOIN_PROMPT = {
  title: 'Your debate room is open',
  scheduledIn: (minutes: number) => `Scheduled in ${minutes} ${minutes === 1 ? 'min' : 'mins'}`,
  scheduledAgo: (minutes: number) => `Scheduled for ${minutes} ${minutes === 1 ? 'min' : 'mins'} ago`,
  startingNow: 'Starting now',
  opponentJoined: (opponentName: string) => `${opponentName} is waiting`,
  opponentNotJoined: (opponentName: string) => `${opponentName} hasn’t joined yet`,
  join: 'Join debate',
  notNow: 'Not now',
} as const;

/** The same banner for a lobby the viewer asked to be reminded of (GEO-3133). */
export const LOBBY_JOIN_PROMPT = {
  title: (name: string | undefined) => (name ? `${name} is open` : 'Your lobby is open'),
  subtitle: 'A debate lobby you asked to be reminded of',
  join: 'Join lobby',
} as const;

/**
 * Shown to someone who arrived before the door unlocked. The lead is read off the room rather than
 * written here, since geo-chat stores it per room and may change it for new ones.
 */
export const ROOM_NOT_YET_OPEN = {
  message: (opensAt: string, leadMinutes: number | null) =>
    leadMinutes
      ? `The debate room opens ${leadMinutes} ${leadMinutes === 1 ? 'minute' : 'minutes'} early at ${opensAt}. In the meantime explore Geo.`
      : `The debate room opens at ${opensAt}. In the meantime explore Geo.`,
  explore: 'Explore',
} as const;

/** Under a disabled Request debate in a room, while the opponent has not arrived. */
export const ROOM_REQUEST_WAITING = 'Waiting for your opponent to arrive';

/** The popup on Explore after a redirect. A stale calendar link produces the second reason. */
export const ROOM_NO_ACCESS = {
  denied: 'That debate isn’t yours to join.',
  ended: 'That debate has already finished.',
} as const;
