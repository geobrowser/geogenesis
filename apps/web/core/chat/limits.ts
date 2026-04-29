// Shared between the /api/chat route (validates incoming requests) and the
// chat widget (pre-flight check + error pattern matching).
import type { UIMessage } from 'ai';

// Dashless 32-hex or dashed UUID. Same shape used everywhere ids cross the
// chat boundary (route input validation, chat widget filtering of route
// params). Kept here so all chat-side callers import from one place.
export const ENTITY_ID_REGEX = /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export const MAX_MESSAGES = 40;
export const MAX_HISTORY_CHARS = 500_000;
export const MAX_LAST_MESSAGE_CHARS = 4_000;
export const MAX_PATH_CHARS = 200;

export const HISTORY_FULL_MESSAGE = 'Conversation too long. Please start a new chat.';
export const MESSAGE_TOO_LONG_MESSAGE = 'Message is too long. Please shorten it and try again.';

// Reserve for the next assistant turn (text + tool calls + tool results). Set
// generously so a tool-heavy edit turn doesn't push us over the server cap.
const ASSISTANT_RESPONSE_BUFFER = 20_000;

// Block one full max-length user message + a typical assistant response with
// tool calls before letting the user submit again. Tuned so a normal short
// reply still goes through but we cut off well before the server's hard cap.
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
