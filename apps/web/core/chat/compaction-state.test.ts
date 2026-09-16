import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { compactedMessages } from './compaction-state';
import { activeAttachment } from '~/app/api/chat/attachment-note';

const importId = 'a'.repeat(32);
const attachment = { importId, fileName: 'people.csv', sheets: [{ name: 'People', rowCount: 2, headers: ['Name'] }] };
const messages: UIMessage[] = [
  {
    id: 'user',
    role: 'user',
    metadata: { attachment, spaceId: 'b'.repeat(32) },
    parts: [{ type: 'text', text: 'Preview only.' }],
  },
  {
    id: 'assistant',
    role: 'assistant',
    parts: [
      {
        type: 'tool-proposeImportMapping',
        toolCallId: 'mapping',
        state: 'output-available',
        input: { importId },
        output: { importId, excludedSheets: ['Notes'] },
      },
    ],
  },
];

describe('compaction operational state', () => {
  it('preserves attachment identity and the actual latest mapping alongside the summary', () => {
    const compacted = compactedMessages(messages, 'Keep People and wait for approval.', 'Compacted.');
    expect(activeAttachment(compacted)?.attachment).toMatchObject(attachment);
    expect(compacted[1].parts[0]).toEqual(messages[1].parts[0]);
  });
  it('does not resurrect an attachment consumed by the final assistant turn', () => {
    const completed: UIMessage[] = [
      ...messages,
      {
        id: 'applied',
        role: 'assistant',
        parts: [
          {
            type: 'tool-applyImport',
            toolCallId: 'apply',
            state: 'output-available',
            input: { importId },
            output: { staged: true },
          },
        ],
      },
    ];
    expect(activeAttachment(compactedMessages(completed, 'Imported.', 'Compacted.'))).toBeNull();
  });
  it('keeps a file after a failed apply', () => {
    const failed: UIMessage[] = [
      ...messages,
      {
        id: 'failed',
        role: 'assistant',
        parts: [
          {
            type: 'tool-applyImport',
            toolCallId: 'apply',
            state: 'output-available',
            input: { importId },
            output: { error: 'not_authorized' },
          },
        ],
      },
    ];
    expect(activeAttachment(compactedMessages(failed, 'Permission denied.', 'Compacted.'))?.attachment).toMatchObject(
      attachment
    );
  });
});
