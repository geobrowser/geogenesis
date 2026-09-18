import type { UIMessage } from 'ai';

const INTERRUPTION_NOTE =
  '[This turn was interrupted. Do not resume or retry its unfinished actions unless the latest user message explicitly requests that. A status question is not a retry request. Only recorded successful tool results establish completed actions; interruption alone establishes neither success nor failure.]';

/** SDK conversion drops metadata; preserve cancellation as model-visible context. */
export function withInterruptionNotes(messages: UIMessage[]): UIMessage[] {
  return messages.map(message =>
    (message.metadata as { interrupted?: boolean } | undefined)?.interrupted === true
      ? { ...message, parts: [...message.parts, { type: 'text', text: INTERRUPTION_NOTE }] }
      : message
  );
}
