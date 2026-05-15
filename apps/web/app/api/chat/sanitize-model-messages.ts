import type { ModelMessage } from 'ai';

// Drops blocks Anthropic rejects: duplicate `tool_use_id`s replayed by the SDK
// across resubmits, orphan / duplicate `tool-result` blocks, and tool-calls
// whose `input` isn't a JSON object — the latter happens when Sonnet emits
// invalid JSON, the SDK forwards the raw string in `input`, and the model's
// retry succeeds as a separate pair we want to survive.
export function sanitizeModelMessages(rawConverted: ReadonlyArray<ModelMessage>): {
  messages: ModelMessage[];
  droppedToolCallIds: string[];
} {
  const keptToolCalls = new Set<string>();
  const seenToolResults = new Set<string>();
  const droppedToolCallIds: string[] = [];
  const messages: ModelMessage[] = [];

  for (const m of rawConverted) {
    if (!Array.isArray(m.content)) {
      messages.push(m);
      continue;
    }
    const filtered = m.content.filter(part => {
      if (part.type === 'tool-call') {
        const id = (part as { toolCallId?: unknown }).toolCallId;
        if (typeof id !== 'string') return true;
        if (keptToolCalls.has(id)) {
          droppedToolCallIds.push(`tool-call#${id}`);
          return false;
        }
        const input = (part as { input?: unknown }).input;
        if (input == null || typeof input !== 'object' || Array.isArray(input)) {
          droppedToolCallIds.push(`tool-call#${id}-unparseable-input`);
          return false;
        }
        keptToolCalls.add(id);
        return true;
      }
      if (part.type === 'tool-result') {
        const id = (part as { toolCallId?: unknown }).toolCallId;
        if (typeof id !== 'string') return true;
        if (!keptToolCalls.has(id)) {
          droppedToolCallIds.push(`tool-result#${id}-orphan`);
          return false;
        }
        if (seenToolResults.has(id)) {
          droppedToolCallIds.push(`tool-result#${id}-dup`);
          return false;
        }
        seenToolResults.add(id);
        return true;
      }
      return true;
    });
    if (filtered.length === 0) continue;
    if (filtered.length === m.content.length) {
      messages.push(m);
    } else {
      messages.push({ ...m, content: filtered } as ModelMessage);
    }
  }

  return { messages, droppedToolCallIds };
}
