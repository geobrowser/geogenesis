import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { isInterrupted, markLastTurnInterrupted } from './interrupted';

function user(text: string): UIMessage {
  return { id: `u-${text}`, role: 'user', parts: [{ type: 'text', text }] };
}

function assistant(text: string): UIMessage {
  return { id: `a-${text}`, role: 'assistant', parts: [{ type: 'text', text }] };
}

function assistantWithToolOnly(): UIMessage {
  return {
    id: 'a-tool',
    role: 'assistant',
    parts: [{ type: 'tool-searchGraph', toolCallId: 't1', state: 'output-available', input: {}, output: {} }],
  } as unknown as UIMessage;
}

describe('markLastTurnInterrupted', () => {
  it('marks a turn that already has opener text', () => {
    // Round 6's failure. The first attempt inferred "interrupted" from the
    // transcript's shape — no visible text meant cut short. But the opener
    // writes a line at the *start* of every turn, so an interrupted turn on
    // disk carries text and looked finished. The mark has to be applied when
    // the turn is cut, not reconstructed from what it left behind.
    const marked = markLastTurnInterrupted([user('hi'), assistant('Looking that up.')]);

    expect(isInterrupted(marked[1])).toBe(true);
  });

  it('marks a trailing assistant turn', () => {
    const marked = markLastTurnInterrupted([user('hi'), assistantWithToolOnly()]);

    expect(isInterrupted(marked[1])).toBe(true);
    expect(isInterrupted(marked[0])).toBe(false);
  });

  it('marks the question when nothing replied at all', () => {
    const marked = markLastTurnInterrupted([user('hi')]);

    expect(isInterrupted(marked[0])).toBe(true);
  });

  it('leaves the existing parts alone', () => {
    const before = [user('hi'), assistant('partial answer')];
    const marked = markLastTurnInterrupted(before);

    expect(marked[1].parts).toEqual(before[1].parts);
  });

  it('returns the same array when the turn is already marked', () => {
    // Restore runs on every mount; re-marking would hand every downstream
    // effect a fresh object on each one.
    const once = markLastTurnInterrupted([user('hi')]);
    expect(markLastTurnInterrupted(once)).toBe(once);
  });

  it('returns the same array for an empty chat', () => {
    const empty: UIMessage[] = [];
    expect(markLastTurnInterrupted(empty)).toBe(empty);
  });

  it('preserves other metadata already on the message', () => {
    const withMeta: UIMessage = { ...user('hi'), metadata: { createdAt: 123 } };
    const marked = markLastTurnInterrupted([withMeta]);

    expect(marked[0].metadata).toEqual({ createdAt: 123, interrupted: true });
  });
});

describe('isInterrupted', () => {
  it('is false for an ordinary message', () => {
    expect(isInterrupted(assistant('hello'))).toBe(false);
  });
});
