import { type UIMessage, convertToModelMessages } from 'ai';
import { describe, expect, it } from 'vitest';

import { withInterruptionNotes } from './interruption-note';

describe('interrupted turn context', () => {
  it.each(['user', 'assistant'] as const)('preserves a stopped %s turn through SDK conversion', async role => {
    const messages: UIMessage[] = [
      { id: 'stopped', role, metadata: { interrupted: true }, parts: [] },
      { id: 'status', role: 'user', parts: [{ type: 'text', text: 'Was it submitted?' }] },
    ];
    const converted = await convertToModelMessages(withInterruptionNotes(messages));
    expect(JSON.stringify(converted)).toContain('This turn was interrupted');
    expect(JSON.stringify(converted)).toContain('A status question is not a retry request');
    expect(messages[0].parts).toEqual([]);
  });

  it('retains recorded tool outcomes and leaves normal turns untouched', () => {
    const normal: UIMessage = { id: 'normal', role: 'user', parts: [{ type: 'text', text: 'Try again.' }] };
    const completedTool: UIMessage['parts'][number] = {
      type: 'tool-joinSpace',
      toolCallId: 'joined',
      state: 'output-available',
      input: {},
      output: { ok: true, status: 'requested' },
    };
    const stopped: UIMessage = {
      id: 'stopped',
      role: 'assistant',
      metadata: { interrupted: true },
      parts: [completedTool],
    };
    const result = withInterruptionNotes([stopped, normal]);
    expect(result[0].parts[0]).toBe(completedTool);
    expect(result[1]).toBe(normal);
  });
});
