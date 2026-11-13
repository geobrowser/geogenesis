import { type UIMessage, isToolUIPart } from 'ai';

/**
 * Drop tool parts that never settled, so a restored chat is a finished
 * transcript rather than a paused one.
 *
 * A chat can be persisted with a part pinned in `input-available` — an aborted
 * stream leaves them that way, which is why `stopAndScrub` exists. On a fresh
 * page load the edit dispatcher walks every message and executes any write part
 * in that state, and its dedup set is per-mount, so it has no memory of having
 * run the call before the reload: restoring such a part would stage the edit a
 * second time. An unsettled part also keeps the thinking indicator spinning
 * forever, since nothing is left to resolve it.
 *
 * Dropping is right rather than replaying: the turn that owned the call is over,
 * and a write the user never saw complete is not one to silently redo.
 *
 * Untouched messages are returned by identity so restoring doesn't churn every
 * downstream effect that keys off message objects.
 */
export function scrubUnsettledToolParts(messages: UIMessage[]): UIMessage[] {
  return messages.map(message => {
    if (message.role !== 'assistant') return message;
    const parts = message.parts.filter(
      part => !isToolUIPart(part) || part.state === 'output-available' || part.state === 'output-error'
    );
    return parts.length === message.parts.length ? message : { ...message, parts };
  });
}
