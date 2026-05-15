// Shared between the widget (sendAutomaticallyWhen + addToolResult typing) and
// chat-messages (continuous-thinking heuristic). Lives in core so both can
// import without crossing a UI boundary.
import { type UIMessage, isToolUIPart } from 'ai';

import { EDIT_TOOL_NAMES } from './edit-types';

// Tools whose execution lives client-side. The SDK's stock
// `lastAssistantMessageIsCompleteWithToolCalls` would also fire on the
// server-executed `suggestFollowUps` (whose result is filled inline by the
// route), causing an infinite resend loop. Restrict auto-resubmit + thinking
// latch to turns whose last step actually contains one of these.
export const CLIENT_EXECUTED_TOOL_TYPES = new Set<string>([
  'tool-getEntity',
  'tool-searchGraph',
  'tool-listSpaces',
  'tool-research',
  'tool-webFetch',
  ...EDIT_TOOL_NAMES.map(name => `tool-${name}`),
]);

// Auto-resubmit gate: returns true when the last assistant step's client
// tools have all resolved, so the SDK should fire another request to let the
// model react to their results.
export function shouldResubmitAfterClientExecution({ messages }: { messages: UIMessage[] }): boolean {
  const message = messages[messages.length - 1];
  if (!message || message.role !== 'assistant') return false;

  const lastStepStartIndex = message.parts.reduce(
    (lastIdx, part, idx) => (part.type === 'step-start' ? idx : lastIdx),
    -1
  );
  const lastStepTools = message.parts.slice(lastStepStartIndex + 1).filter(isToolUIPart);
  if (lastStepTools.length === 0) return false;

  const hasClientExecuted = lastStepTools.some(part => CLIENT_EXECUTED_TOOL_TYPES.has(part.type));
  if (!hasClientExecuted) return false;

  return lastStepTools.every(part => part.state === 'output-available' || part.state === 'output-error');
}

// True while any client-executed tool on the latest assistant message is
// awaiting its result. Used alongside `status` so the stop button stays put
// during the gap between the server's stream finishing and the SDK firing the
// auto-resubmit — that gap shows as status='ready' but the agent is still working.
export function hasPendingClientToolCall(messages: UIMessage[]): boolean {
  const message = messages[messages.length - 1];
  if (!message || message.role !== 'assistant') return false;
  for (const part of message.parts) {
    if (!isToolUIPart(part)) continue;
    if (!CLIENT_EXECUTED_TOOL_TYPES.has(part.type)) continue;
    if (part.state === 'input-streaming' || part.state === 'input-available') return true;
  }
  return false;
}
