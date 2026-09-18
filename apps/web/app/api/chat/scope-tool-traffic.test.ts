import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { scopeToolTrafficToCurrentTurn } from './scope-tool-traffic';

const user = (text: string): ModelMessage => ({ role: 'user', content: text });

const assistantCall = (toolCallId: string, toolName: string, text?: string): ModelMessage => ({
  role: 'assistant',
  content: [
    ...(text ? [{ type: 'text' as const, text }] : []),
    { type: 'tool-call' as const, toolCallId, toolName, input: {} },
  ],
});

const toolResult = (toolCallId: string, toolName: string, output: unknown): ModelMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result' as const, toolCallId, toolName, output: output as never }],
});

const assistantText = (text: string): ModelMessage => ({
  role: 'assistant',
  content: [{ type: 'text', text }],
});

function toolCallIdsIn(messages: ModelMessage[]): string[] {
  return messages.flatMap(m =>
    Array.isArray(m.content)
      ? m.content.flatMap(part => ('toolCallId' in part && part.toolCallId ? [part.toolCallId as string] : []))
      : []
  );
}

describe('scopeToolTrafficToCurrentTurn', () => {
  it('drops a previous turn’s tool traffic and keeps the current turn’s', () => {
    // The Into-the-Ether case: an earlier lookup in another space stayed in
    // view and got answered as if it were this turn's result.
    const scoped = scopeToolTrafficToCurrentTurn([
      user('what is Into the Ether?'),
      assistantCall('call_old', 'searchGraph'),
      toolResult('call_old', 'searchGraph', { results: [{ name: 'Into the Ether', spaceName: 'Crypto' }] }),
      assistantText('Into the Ether is a podcast in the Crypto space.'),
      user('what news stories are in this space?'),
      assistantCall('call_new', 'searchGraph'),
      toolResult('call_new', 'searchGraph', { results: [{ name: 'An AI story', spaceName: 'AI' }] }),
    ]);

    expect(toolCallIdsIn(scoped)).toEqual(['call_new', 'call_new']);

    // The stale *result* is what misled the closer, so that is what has to go.
    // The prose mentioning it stays — the closer still needs it to resolve a
    // later "it", and prose is never mistaken for a fresh lookup.
    const toolPayloads = JSON.stringify(scoped.filter(m => m.role === 'tool'));
    expect(toolPayloads).not.toContain('Into the Ether');
    expect(toolPayloads).toContain('An AI story');
    expect(scoped.some(m => m.role === 'assistant')).toBe(true);
  });

  it('keeps prior prose so the closer can still resolve "it"', () => {
    const scoped = scopeToolTrafficToCurrentTurn([
      user('what is Into the Ether?'),
      assistantText('A podcast.'),
      user('who hosts it?'),
    ]);

    expect(scoped.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('keeps the text of a prior assistant message that also called a tool', () => {
    const scoped = scopeToolTrafficToCurrentTurn([
      user('first'),
      assistantCall('call_old', 'searchGraph', 'Looking that up.'),
      toolResult('call_old', 'searchGraph', {}),
      user('second'),
    ]);

    expect(scoped).toHaveLength(3);
    expect(scoped[1].content).toEqual([{ type: 'text', text: 'Looking that up.' }]);
  });

  it('drops a prior assistant message that held nothing but a tool call', () => {
    const scoped = scopeToolTrafficToCurrentTurn([
      user('first'),
      assistantCall('call_old', 'searchGraph'),
      toolResult('call_old', 'searchGraph', {}),
      user('second'),
    ]);

    expect(scoped.map(m => m.role)).toEqual(['user', 'user']);
  });

  it('never orphans half of a call/result pair', () => {
    // Anthropic 400s on a tool_result with no matching tool_use, so every id
    // that survives must appear on both sides.
    const scoped = scopeToolTrafficToCurrentTurn([
      user('first'),
      assistantCall('call_a', 'searchGraph'),
      toolResult('call_a', 'searchGraph', {}),
      user('second'),
      assistantCall('call_b', 'getEntity'),
      toolResult('call_b', 'getEntity', {}),
    ]);

    const calls = scoped.flatMap(m =>
      m.role === 'assistant' && Array.isArray(m.content)
        ? m.content.flatMap(p => (p.type === 'tool-call' ? [p.toolCallId] : []))
        : []
    );
    const results = scoped.flatMap(m =>
      m.role === 'tool' && Array.isArray(m.content)
        ? m.content.flatMap(p => (p.type === 'tool-result' ? [p.toolCallId] : []))
        : []
    );

    expect(calls.sort()).toEqual(results.sort());
  });

  it('keeps a resubmit chain’s tool traffic — it lives before execMessages', () => {
    // The current turn's earlier calls come back through the converted history,
    // not `execMessages`. Cutting on "history" rather than the last user message
    // would strip exactly the results the closer must summarise.
    const scoped = scopeToolTrafficToCurrentTurn([
      user('create a page'),
      assistantCall('call_1', 'searchGraph'),
      toolResult('call_1', 'searchGraph', {}),
      assistantCall('call_2', 'createEntity'),
      toolResult('call_2', 'createEntity', { ok: true }),
    ]);

    expect(toolCallIdsIn(scoped)).toEqual(['call_1', 'call_1', 'call_2', 'call_2']);
  });

  it('passes a turn through untouched when there is no user message', () => {
    const messages = [assistantText('orphaned')];
    expect(scopeToolTrafficToCurrentTurn(messages)).toEqual(messages);
  });
});
