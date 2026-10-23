import { DEEP_LINK_MODALS, toModal } from '~/core/deep-links/modal-deep-link';
import { NavUtils } from '~/core/utils/utils';

import type { RunningLateMinutes, ScheduledDebateRequest } from '../api';

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
 * the room is open, where a calendar is the wrong answer to "I'm on my way" (board 2). `nudge` is the
 * same three choices as the popup a nudge from the waiting debater puts on screen (GEO-3428, board
 * 6c).
 */
export type ScheduledNoticeStep = 'decide' | 'nudge' | 'late' | 'cant';

export function toRunningLate(requestId: string, pathname = NavUtils.toExplore()): string {
  return toModal({ modal: RUNNING_LATE_MODAL, pathname, target: requestId });
}

export function toCantMakeIt(requestId: string, pathname = NavUtils.toExplore()): string {
  return toModal({ modal: CANT_MAKE_IT_MODAL, pathname, target: requestId });
}

/**
 * As long as a note can be and still show in full in the waiting room (GEO-3427): two lines of the
 * late notice in the other debater's video slot, measured at the narrowest desktop slot (768px),
 * where ordinary text fits about 110 characters. geo-chat caps it there too (geo-chat#293). The field stops typing
 * there and counts down to it, rather than refusing on send.
 */
export const NOTICE_NOTE_MAX = 100;

/** What is sent: trimmed, and nothing at all for a note that is only whitespace. */
export function noticeNote(note: string): string | undefined {
  const trimmed = note.trim().slice(0, NOTICE_NOTE_MAX);
  return trimmed ? trimmed : undefined;
}

/** Picked on arrival, so one press sends it: board 3's default. */
export const DEFAULT_LATE_MINUTES: RunningLateMinutes = 10;

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
