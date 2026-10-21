import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';
import { NavUtils } from '~/core/utils/utils';

import {
  type DebateRoomNotice,
  GeoChatRequestError,
  RUNNING_LATE_MINUTES,
  type RunningLateMinutes,
  type ScheduledDebateRequest,
} from '../api';
import { sameId } from './room-presence';

/**
 * Running late and Can't make it (GEO-3427): what a debater who won't be there on time tells the
 * other one, from a scheduling email, the calendar invite or the reschedule link.
 *
 *     /explore?modal=running-late&modalTarget=<requestId>
 *     /explore?modal=cant-make-it&modalTarget=<requestId>
 *
 * geo-chat builds both links (`debate_emails.rs`), with the request dashed. They land on Explore
 * rather than the room: opening the room joins it, and someone saying they are late is not there.
 *
 * **Opening a link never acts.** It opens the choice; only the confirm press calls geo-chat. Mail
 * scanners and link previews open every link in an email, and one that acted on arrival would mark
 * people late and cancel debates nobody touched.
 */
export const RUNNING_LATE_MODAL = DEEP_LINK_MODALS.runningLate;
export const CANT_MAKE_IT_MODAL = DEEP_LINK_MODALS.cantMakeIt;

/**
 * Which screen of the notice dialog. `decide` is the three-way choice the reschedule link shows once
 * the room is open, where a calendar is the wrong answer to "I'm on my way" (board 2).
 */
export type ScheduledNoticeStep = 'decide' | 'late' | 'cant';

export function toRunningLate(requestId: string, pathname = NavUtils.toExplore()): string {
  return toModal({ modal: RUNNING_LATE_MODAL, pathname, target: requestId });
}

export function toCantMakeIt(requestId: string, pathname = NavUtils.toExplore()): string {
  return toModal({ modal: CANT_MAKE_IT_MODAL, pathname, target: requestId });
}

// geo-chat writes request ids both ways: dashed in links, dashless in its JSON.
const REQUEST_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** The request a link names, or `null` for anything that is not one, which then opens nothing. */
export function noticeRequestIdFromTarget(target: string | null): string | null {
  return target && REQUEST_ID.test(target) ? target : null;
}

/** As long as geo-chat takes. The field stops typing there rather than refusing on send. */
export const NOTICE_NOTE_MAX = 280;

/** What is sent: trimmed, and nothing at all for a note that is only whitespace. */
export function noticeNote(note: string): string | undefined {
  const trimmed = note.trim().slice(0, NOTICE_NOTE_MAX);
  return trimmed ? trimmed : undefined;
}

export const LATE_MINUTE_CHOICES: readonly RunningLateMinutes[] = RUNNING_LATE_MINUTES;

/** Picked on arrival, so one press sends it: board 3's default. */
export const DEFAULT_LATE_MINUTES: RunningLateMinutes = 10;

/** One participant's notice of one kind, or `null`. */
export function noticeFrom(
  notices: DebateRoomNotice[] | undefined,
  userId: string | null,
  kind: DebateRoomNotice['kind']
): DebateRoomNotice | null {
  if (!userId) return null;
  return (notices ?? []).find(notice => notice.kind === kind && sameId(notice.user_id, userId)) ?? null;
}

/**
 * Whether the request a link names can still be acted on. Only an agreed debate can: a pending one
 * has no room to be late to, and anything resolved is over.
 */
export type NoticeRequestState = 'active' | 'moved' | 'over' | 'missing';

export function noticeRequestState(request: ScheduledDebateRequest | undefined): NoticeRequestState {
  if (!request) return 'missing';
  if (request.status === 'accepted' && request.room_id) return 'active';
  // A moved debate is pending again, waiting on whoever has to accept the new time.
  if (request.status === 'pending') return 'moved';
  return 'over';
}

export function findRequest(requests: ScheduledDebateRequest[] | undefined, requestId: string | null) {
  if (!requestId) return undefined;
  return (requests ?? []).find(request => sameId(request.request_id, requestId));
}

/** `1:13 PM`, in the viewer's own zone. */
export function formatClock(at: Date | string): string {
  const date = typeof at === 'string' ? new Date(at) : at;
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Board 2's heading: where the debate stands right now. */
export function debateTimingHeading(name: string, startsAt: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(startsAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return `Your debate with ${name}`;
  if (minutes >= 1) return `Your debate with ${name} started ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  if (minutes <= -1) {
    const until = -minutes;
    return `Your debate with ${name} starts in ${until} ${until === 1 ? 'minute' : 'minutes'}`;
  }
  return `Your debate with ${name} is starting now`;
}

/** Every string the notice dialog shows, in one place. Copy agreed on GEO-3427's boards 1b, 2 and 3. */
export const SCHEDULED_NOTICE_COPY = {
  decide: {
    waiting: (name: string) => `${name} is in the room, waiting for you`,
    join: 'Join now',
    late: 'I’m running late',
    cant: 'I can’t make it',
    explainer: (name: string) =>
      `Running late and Can’t make it tell ${name} in the room and by email. After Can’t make it you can suggest another time.`,
    reschedule: 'Reschedule instead',
  },
  late: {
    title: 'How late will you be?',
    lead: (name: string) => `We’ll tell ${name} now, in the room and by email.`,
    minutes: (minutes: number) => `${minutes} min`,
    noteLabel: (name: string) => `Add a note for ${name} (optional)`,
    previewLabel: (name: string) => `What ${name} sees`,
    preview: (viewer: string, minutes: number, note: string | undefined) =>
      `“${viewer} is running about ${minutes} minutes late.${note ? ` ${note}` : ''}”`,
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

/** geo-chat's refusals, said plainly; anything else keeps its own message. */
export function noticeFailureMessage(error: unknown, action: 'late' | 'cant'): string {
  if (error instanceof GeoChatRequestError) {
    switch (error.code) {
      case 'already_joined':
        return 'You’re already in the room, so there’s no need. Join it to carry on.';
      case 'debate_already_started':
        return 'This debate has already started, so it can no longer be cancelled.';
      case 'request_not_active':
      case 'request_not_cancellable':
        return 'This debate is no longer on.';
      case 'note_too_long':
        return `Keep the note to ${NOTICE_NOTE_MAX} characters.`;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return action === 'late' ? 'Couldn’t send that. Try again.' : 'Couldn’t cancel. Try again.';
}
