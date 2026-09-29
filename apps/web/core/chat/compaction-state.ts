import { type UIMessage, isToolUIPart } from 'ai';

import { activeAttachment } from '~/app/api/chat/attachment-note';

/** Keep attachment identity and its latest mapping as data, outside the lossy prose summary. */
export function compactedMessages(messages: UIMessage[], summary: string, notice: string): UIMessage[] {
  // The final assistant turn is complete at compaction time, so include its successful consumption.
  const active = activeAttachment([...messages, { id: 'compaction-boundary', role: 'user', parts: [] }]);
  const importId = active?.attachment.kind === 'table' ? active.attachment.importId : null;
  const mapping = importId
    ? messages
        .flatMap(message => message.parts)
        .reverse()
        .find(
          part =>
            isToolUIPart(part) &&
            part.type === 'tool-proposeImportMapping' &&
            part.state === 'output-available' &&
            (part.input as { importId?: string })?.importId === importId &&
            !(part.output as { error?: string })?.error
        )
    : undefined;
  const latestSpace = [...messages]
    .reverse()
    .find(message => message.role === 'user' && (message.metadata as { spaceId?: string } | undefined)?.spaceId)
    ?.metadata as { spaceId?: string } | undefined;
  return [
    {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: notice }],
      metadata: { ...latestSpace, ...(active ? { attachment: active.attachment } : { attachment: undefined }) },
    },
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      // The retained mapping is historical evidence, not a just-finished client
      // tool awaiting continuation. End that step before the completed summary
      // or the widget's auto-resubmit heuristic leaves the composer busy.
      parts: [...(mapping ? [mapping] : []), { type: 'step-start' }, { type: 'text', text: summary }],
    },
  ];
}
