import { GeoChatRequestError } from '~/core/debates/api';

export const SPACE_CHAT_ERROR_COPY = {
  tooFast: (seconds: number) => `You’re sending messages too fast. Try again in ${seconds}s.`,
  busy: (seconds: number) => `This chat is busy. Try again in ${seconds}s.`,
  editsTooFast: (seconds: number) => `You’re editing too fast. Try again in ${seconds}s.`,
  reactionsTooFast: (seconds: number) => `You’re reacting too fast. Try again in ${seconds}s.`,
  signIn: 'Log in to chat.',
  forbidden: 'Only members and editors of this space can post here.',
  notAuthor: 'You can only edit your own messages.',
  deleted: 'That message was deleted.',
  notFound: 'That message is gone.',
  invalid: 'That message can’t be sent.',
  slowMode: (seconds: number) => `Slow mode is on. Try again in ${seconds}s.`,
  repliesOnly: 'Only editors post here. Reply to a message instead.',
  archived: 'This channel is archived.',
} as const;

/** Seconds to wait from a 429, at least 1. */
export function retryAfterSeconds(error: GeoChatRequestError, fallbackMs = 10_000) {
  return Math.max(1, Math.ceil((error.retryAfterMs ?? fallbackMs) / 1000));
}

/** geo-chat's slow-mode refusal (GEO-3818). */
export function isSlowModeError(error: unknown): boolean {
  return error instanceof GeoChatRequestError && error.code === 'slow_mode';
}

/** A failed send, edit, delete or reaction as one line; `fallback` for anything unrecognised. */
export function spaceChatErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof GeoChatRequestError)) return fallback;
  if (isSlowModeError(error)) return SPACE_CHAT_ERROR_COPY.slowMode(retryAfterSeconds(error));
  switch (error.code) {
    case 'replies_only':
      return SPACE_CHAT_ERROR_COPY.repliesOnly;
    case 'channel_archived':
      return SPACE_CHAT_ERROR_COPY.archived;
    case 'rate_limited': {
      const seconds = retryAfterSeconds(error);
      const limit = error.details?.limit;
      if (limit === 'sends_by_room') return SPACE_CHAT_ERROR_COPY.busy(seconds);
      if (limit === 'edits_by_user') return SPACE_CHAT_ERROR_COPY.editsTooFast(seconds);
      if (limit === 'reactions_by_user') return SPACE_CHAT_ERROR_COPY.reactionsTooFast(seconds);
      return SPACE_CHAT_ERROR_COPY.tooFast(seconds);
    }
    case 'authentication_required':
    case 'invalid_access_token':
      return SPACE_CHAT_ERROR_COPY.signIn;
    case 'forbidden':
      return SPACE_CHAT_ERROR_COPY.forbidden;
    case 'not_message_author':
      return SPACE_CHAT_ERROR_COPY.notAuthor;
    case 'message_deleted':
      return SPACE_CHAT_ERROR_COPY.deleted;
    case 'not_found':
      return SPACE_CHAT_ERROR_COPY.notFound;
    case 'invalid_request':
      return SPACE_CHAT_ERROR_COPY.invalid;
    default:
      return fallback;
  }
}
