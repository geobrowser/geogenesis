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

/** What the waiting debater reads once the other said they are running late (GEO-3427, board 6b). */
export const ROOM_LATE_NOTICE = {
  title: (opponentName: string, minutes: number | null) =>
    minutes ? `${opponentName} is running about ${minutes} minutes late` : `${opponentName} is running late`,
  /** Ahead of the expected time, which the notice sets apart in the text colour. */
  expectedLead: 'Expected by about',
  /** A phone's: "Expected by about 12:40 PM" is wider than its tile and leaves "PM" on a line alone. */
  expectedLeadShort: 'By about',
  reschedule: 'Reschedule',
} as const;

/**
 * Why a room someone was waiting in closed (GEO-3427): the other debater said they can't make it. A
 * `rescheduled` room closed because they proposed a new time with it.
 */
export const ROOM_CANT_MAKE_IT = {
  cancelled: (opponentName: string) => `${opponentName} can’t make it, so the debate is cancelled.`,
  rescheduled: (opponentName: string) =>
    `${opponentName} can’t make it and proposed a new time. You’ll find it under Requests.`,
  /** Moved without a Can't make it: by the one waiting, say, or from Requests days before. */
  moved: 'This debate moved to a new time. You’ll find it under Requests.',
  findSomeone: 'Find someone else',
  seeNewTime: 'See the new time',
} as const;

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
  late: 'Running late',
  cant: 'Can’t make it',
} as const;

/** The same banner for a lobby the viewer asked to be reminded of (GEO-3133). */
export const LOBBY_JOIN_PROMPT = {
  title: (name: string | undefined) => (name ? `${name} is open` : 'Your lobby is open'),
  subtitle: 'A debate lobby you asked to be reminded of',
  join: 'Join lobby',
  notNow: 'Not now',
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

/**
 * The Running late and Can't make it dialog (GEO-3427, boards 1b, 2 and 3), from an email, the
 * calendar invite, or the reschedule link once the room is open.
 */
export const SCHEDULED_NOTICE_COPY = {
  title: { decide: 'Your debate', late: 'Running late', cant: 'Can’t make it' },
  decide: {
    /** Board 2's heading: where the debate stands now, from the same minutes the join prompt counts. */
    heading: (name: string, offset: { in: number } | { ago: number } | 'now' | null) => {
      if (offset === null) return `Your debate with ${name}`;
      if (offset === 'now') return `Your debate with ${name} is starting now`;
      if ('in' in offset)
        return `Your debate with ${name} starts in ${offset.in} ${offset.in === 1 ? 'minute' : 'minutes'}`;
      return `Your debate with ${name} started ${offset.ago} ${offset.ago === 1 ? 'minute' : 'minutes'} ago`;
    },
    waiting: (name: string) => `${name} is in the room, waiting for you`,
    join: 'Join now',
    late: 'I’m running late',
    cant: 'I can’t make it',
    explainer: (name: string) =>
      `Running late and Can’t make it tell ${name} in the room and by email. After Can’t make it you can suggest another time.`,
    reschedule: 'Reschedule instead',
  },
  /** Board 1b: where an email's Running late button lands. */
  lateFromEmail: {
    debateWith: (name: string) => `Your debate with ${name}`,
    title: (name: string) => `Tell ${name} you’re running late`,
    noteLabel: (name: string) => `Note for ${name} (optional)`,
    send: (name: string) => `Send to ${name}`,
  },
  back: 'Back',
  /** Running late before the room opens, which geo-chat refuses: from the invite, say, a day out. */
  lateNotYet: (name: string, opensAt: string) =>
    `You can tell ${name} you’re running late once the room opens, at ${opensAt}.`,
  late: {
    title: 'How late will you be?',
    lead: (name: string) => `We’ll tell ${name} now, in the room and by email.`,
    minutes: (minutes: number) => `${minutes} min`,
    noteLabel: (name: string) => `Add a note for ${name} (optional)`,
    previewLabel: (name: string) => `What ${name} sees`,
    /** In the other debater's words; "You're" when the viewer's own name has not loaded. */
    preview: (viewer: string | null, minutes: number, note: string | undefined) =>
      `“${viewer ? `${viewer} is` : 'You’re'} running about ${minutes} minutes late.${note ? ` ${note}` : ''}”`,
    send: (name: string) => `Tell ${name}`,
    sending: 'Sending…',
    cantInstead: 'I can’t make it at all',
    sent: (name: string, expected: string) => `We’ve told ${name} you’ll be there by about ${expected}.`,
    join: 'Join the room',
  },
  cant: {
    title: 'Can’t make it?',
    lead: (name: string) => `We’ll cancel your debate with ${name} and let them know, in the room and by email.`,
    noteLabel: (name: string) => `Add a note for ${name} (optional)`,
    confirm: 'Cancel the debate',
    confirming: 'Cancelling…',
    suggest: 'Suggest another time instead',
    suggestHint: (name: string) => `${name} is asked to accept the new time. The old one is cancelled straight away.`,
    lateInstead: 'I’m only running late',
    sent: (name: string) => `Your debate is cancelled. We’ve let ${name} know.`,
  },
  done: 'Done',
  signIn: {
    late: 'Sign in to tell the other debater you’re running late.',
    cant: 'Sign in to tell the other debater you can’t make it.',
    action: 'Sign in',
  },
  loading: 'Loading your debate…',
  state: {
    moved: 'This debate has moved to a new time. You’ll find it under Requests.',
    over: 'This debate is no longer on.',
    missing: 'We couldn’t find this debate. It may have been for another account.',
    error: 'Couldn’t load your debate. Try again in a moment.',
    requests: 'Open Requests',
  },
} as const;

/**
 * Leave, asked once while the other person is on their way or already here (GEO-3433). On 21 Oct a
 * debater left a scheduled room for Explore twice in two minutes and came straight back both times.
 */
export const ROOM_LEAVE_CONFIRM = {
  title: 'Leave the room?',
  body: (state: DebateRoomPresenceState, opponentName: string) =>
    state === 'present'
      ? `${opponentName} is here. If you leave, they’ll be left waiting.`
      : // Not "hasn't arrived": after a reload a visit that came and went reads as waiting again.
        `${opponentName} isn’t here yet. If you leave, they’ll find the room empty.`,
  stay: 'Stay',
  leave: 'Leave room',
} as const;
