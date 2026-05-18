import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { sanitizeModelMessages } from './sanitize-model-messages';

// Convenience builders so each test reads as the message shape it's verifying,
// not a soup of type assertions.
function userText(text: string): ModelMessage {
  return { role: 'user', content: text };
}

function assistantCall(toolCallId: string, toolName: string, input: unknown): ModelMessage {
  return {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId, toolName, input } as never],
  };
}

function toolResult(toolCallId: string, toolName: string, output: unknown): ModelMessage {
  return {
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId, toolName, output } as never],
  };
}

describe('sanitizeModelMessages', () => {
  it('passes through clean message lists untouched', () => {
    const input: ModelMessage[] = [
      userText('hi'),
      assistantCall('toolu_A', 'searchGraph', { query: 'foo' }),
      toolResult('toolu_A', 'searchGraph', { type: 'json', value: { results: [] } }),
    ];
    const { messages, droppedToolCallIds } = sanitizeModelMessages(input);
    expect(messages).toEqual(input);
    expect(droppedToolCallIds).toEqual([]);
  });

  it('keeps the first occurrence of a duplicated tool-call id and drops the rest', () => {
    const input: ModelMessage[] = [
      assistantCall('toolu_DUP', 'searchGraph', { query: 'first' }),
      toolResult('toolu_DUP', 'searchGraph', { type: 'json', value: { results: ['first'] } }),
      // The SDK's resubmit chain replays the earlier step in later slices.
      assistantCall('toolu_DUP', 'searchGraph', { query: 'first' }),
      toolResult('toolu_DUP', 'searchGraph', { type: 'json', value: { results: ['first'] } }),
    ];
    const { messages, droppedToolCallIds } = sanitizeModelMessages(input);
    expect(messages).toHaveLength(2);
    expect(droppedToolCallIds).toEqual(['tool-call#toolu_DUP', 'tool-result#toolu_DUP-dup']);
  });

  it('drops a tool-result whose call was filtered out earlier in the stream', () => {
    const input: ModelMessage[] = [
      // No matching tool-call in the slice.
      toolResult('toolu_ORPHAN', 'searchGraph', { type: 'json', value: { results: [] } }),
      assistantCall('toolu_B', 'searchGraph', { query: 'foo' }),
      toolResult('toolu_B', 'searchGraph', { type: 'json', value: { results: [] } }),
    ];
    const { messages, droppedToolCallIds } = sanitizeModelMessages(input);
    expect(messages).toHaveLength(2);
    expect(droppedToolCallIds).toEqual(['tool-result#toolu_ORPHAN-orphan']);
  });

  it('drops a tool-call whose input is a string (Sonnet emitted invalid JSON)', () => {
    const input: ModelMessage[] = [
      // First attempt: SDK couldn't parse Sonnet's input, forwarded the raw
      // text in `input` instead of an object. Anthropic 400s on this.
      assistantCall('toolu_BAD', 'createEntity', '{"spaceId":"...","typeIds": f3d44}'),
      toolResult('toolu_BAD', 'createEntity', {
        type: 'error-text',
        value: 'Invalid input for tool createEntity: JSON parsing failed',
      }),
      // Successful retry the model emitted after seeing the error.
      assistantCall('toolu_GOOD', 'createEntity', { spaceId: 'sp', typeIds: ['ty'] }),
      toolResult('toolu_GOOD', 'createEntity', { type: 'json', value: { ok: true } }),
    ];
    const { messages, droppedToolCallIds } = sanitizeModelMessages(input);
    expect(messages).toHaveLength(2);
    // The successful pair survives untouched.
    expect((messages[0].content as Array<{ toolCallId: string }>)[0].toolCallId).toBe('toolu_GOOD');
    expect((messages[1].content as Array<{ toolCallId: string }>)[0].toolCallId).toBe('toolu_GOOD');
    expect(droppedToolCallIds).toEqual(['tool-call#toolu_BAD-unparseable-input', 'tool-result#toolu_BAD-orphan']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['array', ['not', 'an', 'object']],
    ['number', 42],
    ['boolean', true],
  ])('drops a tool-call whose input is %s (non-object)', (_label, badInput) => {
    const input: ModelMessage[] = [assistantCall('toolu_BAD', 'createEntity', badInput)];
    const { messages, droppedToolCallIds } = sanitizeModelMessages(input);
    expect(messages).toEqual([]);
    expect(droppedToolCallIds).toEqual(['tool-call#toolu_BAD-unparseable-input']);
  });

  it('omits an assistant message entirely when all of its content was filtered out', () => {
    const input: ModelMessage[] = [
      userText('hi'),
      assistantCall('toolu_DUP', 'searchGraph', { query: 'first' }),
      toolResult('toolu_DUP', 'searchGraph', { type: 'json', value: { results: [] } }),
      // This whole assistant message is a single duplicate tool-call — drop it.
      assistantCall('toolu_DUP', 'searchGraph', { query: 'first' }),
    ];
    const { messages } = sanitizeModelMessages(input);
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'tool']);
  });

  it('drops a duplicate tool-result even when the call survived', () => {
    const input: ModelMessage[] = [
      assistantCall('toolu_A', 'searchGraph', { query: 'foo' }),
      toolResult('toolu_A', 'searchGraph', { type: 'json', value: { results: [] } }),
      toolResult('toolu_A', 'searchGraph', { type: 'json', value: { results: [] } }),
    ];
    const { messages, droppedToolCallIds } = sanitizeModelMessages(input);
    expect(messages).toHaveLength(2);
    expect(droppedToolCallIds).toEqual(['tool-result#toolu_A-dup']);
  });

  it('leaves non-tool content (text, system) untouched', () => {
    const input: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      userText('hi'),
      { role: 'assistant', content: [{ type: 'text', text: 'hello' } as never] },
    ];
    const { messages, droppedToolCallIds } = sanitizeModelMessages(input);
    expect(messages).toEqual(input);
    expect(droppedToolCallIds).toEqual([]);
  });
});
