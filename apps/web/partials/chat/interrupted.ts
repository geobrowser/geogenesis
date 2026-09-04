import type { UIMessage } from 'ai';

/**
 * A turn can end without an answer three ways: the user presses Stop, they
 * reload mid-turn, or they switch to another chat while one is running. All
 * three leave a transcript that simply stops — a question with nothing under
 * it, or an assistant turn holding tool calls and no reply.
 *
 * The mark is applied at the moment the turn is cut, never inferred afterwards
 * from the transcript's shape: the opener writes visible text at the *start* of
 * every turn, so a half-finished turn on disk is indistinguishable from a
 * finished one.
 *
 * Marking it says so. Without the mark the user cannot tell "it was cut short"
 * from "it answered and the answer was blank", and after a reload there is no
 * spinner left to hint at which one happened.
 *
 * The flag lives in `metadata` rather than as a text part on purpose: it
 * survives the JSON round-trip through localStorage, so a reloaded chat keeps
 * the mark, and `convertToModelMessages` drops metadata, so nothing extra is
 * ever sent to the model.
 */
type InterruptedMetadata = { interrupted?: boolean };

export function isInterrupted(message: UIMessage): boolean {
  return (message.metadata as InterruptedMetadata | undefined)?.interrupted === true;
}

/**
 * Stamp the final message so the transcript records that its turn was cut
 * short. Stamps whichever message is last: a trailing user message means the
 * assistant never replied, and the mark belongs under the question.
 *
 * Returns the input by identity when there is nothing to mark, so restoring
 * doesn't churn effects that key off message objects.
 */
export function markLastTurnInterrupted(messages: UIMessage[]): UIMessage[] {
  const last = messages.at(-1);
  if (!last) return messages;
  if (isInterrupted(last)) return messages;

  const next = [...messages];
  next[next.length - 1] = {
    ...last,
    metadata: { ...(last.metadata as InterruptedMetadata | undefined), interrupted: true },
  };
  return next;
}
