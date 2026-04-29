// Shared between API route and chat widget — safe to import on both sides.
import type { UIMessage } from 'ai';

// Shared so all chat-side callers import the entity-id shape from one place.
export const ENTITY_ID_REGEX = /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export const MAX_MESSAGES = 40;
export const MAX_HISTORY_CHARS = 500_000;
export const MAX_LAST_MESSAGE_CHARS = 4_000;
export const MAX_PATH_CHARS = 200;

export const HISTORY_FULL_MESSAGE = 'Conversation too long. Please start a new chat.';
export const MESSAGE_TOO_LONG_MESSAGE = 'Message is too long. Please shorten it and try again.';

const ASSISTANT_RESPONSE_BUFFER = 20_000;

// Cut off before the server's hard cap, accounting for the next user +
// assistant turn.
const HISTORY_FULL_THRESHOLD = MAX_HISTORY_CHARS - MAX_LAST_MESSAGE_CHARS - ASSISTANT_RESPONSE_BUFFER;

// Cheap proxy: most transcripts have an average part-text length under
// PROXY_AVG_PART_CHARS. If the message count × avg can't possibly clear the
// threshold, skip the O(N) JSON.stringify entirely. Re-checked on every chunk
// during streaming, so the savings matter.
const PROXY_AVG_PART_CHARS = 8_000;

export function isHistoryFull(messages: UIMessage[]): boolean {
  if (messages.length >= MAX_MESSAGES) return true;
  if (messages.length * PROXY_AVG_PART_CHARS < HISTORY_FULL_THRESHOLD) return false;
  return JSON.stringify(messages).length >= HISTORY_FULL_THRESHOLD;
}

// The AI SDK throws `new Error(responseBodyText)` on non-2xx, so the route's
// JSON body becomes error.message. Pattern-match against the canonical 413
// strings to distinguish "conversation full" from generic transport errors.
export function isHistoryFullError(error: { message?: string } | undefined | null): boolean {
  if (!error?.message) return false;
  return error.message.includes(HISTORY_FULL_MESSAGE);
}
