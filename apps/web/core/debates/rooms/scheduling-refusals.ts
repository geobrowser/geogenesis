import { GeoChatRequestError } from '../api';
import { NOTICE_NOTE_MAX } from './scheduled-notice';

/** geo-chat's refusals of a cancel, said plainly; anything else keeps its own message. */
export function cancelFailureMessage(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'debate_already_started') {
      return 'This debate has already started, so it can no longer be cancelled.';
    }
    if (error.code === 'request_not_cancellable') return 'This has already been answered, cancelled or expired.';
    // A room already closed, as a no-show say, while the request still reads as agreed.
    if (error.code === 'request_not_active') return 'This debate is no longer on.';
  }
  return error instanceof Error ? error.message : 'Could not cancel. Try again.';
}

/**
 * Running late's and Can't make it's refusals (GEO-3427). Can't make it is a cancel, so it says what
 * the Requests tab's Cancel says, plus the codes only these two send.
 */
export function noticeFailureMessage(error: unknown, action: 'late' | 'cant'): string {
  if (error instanceof GeoChatRequestError) {
    switch (error.code) {
      case 'already_joined':
        return 'You’re already in the room, so there’s no need. Join it to carry on.';
      case 'request_not_active':
        return 'This debate is no longer on.';
      case 'too_early':
        return 'You can say you’re running late once the room opens, ten minutes before the start.';
      case 'running_late_limit':
        return 'You’ve already told them three times. Join when you can, or say you can’t make it.';
      case 'note_too_long':
        return `Keep the note to ${NOTICE_NOTE_MAX} characters.`;
    }
  }
  return action === 'cant' ? cancelFailureMessage(error) : error instanceof Error ? error.message : 'Try again.';
}
