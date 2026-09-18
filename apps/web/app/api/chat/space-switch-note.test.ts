import type { ModelMessage, UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  appendNoteToLastUserMessage,
  previousSpaceInConversation,
  renderCurrentSpaceNote,
  renderSpaceSwitchNote,
} from './space-switch-note';

const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';
const AI = '41e851610e13a19441c4d980f2f2ce6b';
const CRYPTO_DASHED = 'c9f267dc-b0d2-7071-8c2a-3c45a64afd32';
const AI_DASHED = '41e85161-0e13-a194-41c4-d980f2f2ce6b';

function user(text: string, spaceId?: string): UIMessage {
  return {
    id: `u-${text}`,
    role: 'user',
    parts: [{ type: 'text', text }],
    ...(spaceId ? { metadata: { spaceId } } : {}),
  };
}

function assistant(text: string): UIMessage {
  return { id: `a-${text}`, role: 'assistant', parts: [{ type: 'text', text }] };
}

describe('previousSpaceInConversation', () => {
  it('finds the space the conversation moved on from', () => {
    const messages = [user('how many projects', CRYPTO), assistant('2,672'), user('what is in this space', AI)];

    expect(previousSpaceInConversation(messages, AI)).toBe(CRYPTO);
  });

  it('stays silent while the conversation has not moved', () => {
    // The guarantee that ordinary conversations are untouched: no other space
    // in the history means no note, so the request is exactly as before.
    const messages = [user('how many projects', CRYPTO), assistant('2,672'), user('and tokens', CRYPTO)];

    expect(previousSpaceInConversation(messages, CRYPTO)).toBeNull();
  });

  it('keeps firing on later turns, not just the turn the space changed', () => {
    // A change-only trigger goes quiet here — and the old space's tool calls are
    // still in context, so the second question after moving reverts to the old
    // id. This is the case that made "detect the change" the wrong condition.
    const messages = [
      user('how many projects', CRYPTO),
      assistant('2,672'),
      user('what is in this space', AI),
      assistant('...'),
      user('and how many tokens', AI),
    ];

    expect(previousSpaceInConversation(messages, AI)).toBe(CRYPTO);
  });

  it('treats dashed and dashless ids as the same space', () => {
    // The client sends whatever the route param holds; a format difference must
    // not read as a move and announce a switch that never happened.
    const messages = [user('how many projects', CRYPTO_DASHED), assistant('2,672'), user('and tokens', CRYPTO)];

    expect(previousSpaceInConversation(messages, CRYPTO)).toBeNull();
  });

  it('still detects a real move when either id is dashed', () => {
    // The "same space in two formats" case above passes even with normalization
    // removed — a dashed id simply fails the hex test and is skipped, and the
    // expected answer is null either way. These two are the ones that hold
    // normalization in place: a genuine move must survive either format, in
    // the stamp or in the current space.
    expect(previousSpaceInConversation([user('a', CRYPTO_DASHED), user('b', AI)], AI)).toBe(CRYPTO);
    expect(previousSpaceInConversation([user('a', CRYPTO), user('b', AI)], AI_DASHED)).toBe(CRYPTO);
  });

  it('reports the most recently left space when there were several', () => {
    const messages = [user('a', CRYPTO), user('b', AI), user('c', CRYPTO)];

    expect(previousSpaceInConversation(messages, CRYPTO)).toBe(AI);
  });

  it('says nothing without a current space or without stamps', () => {
    // Messages sent before this shipped carry no stamp, and a user outside a
    // space page has no current space. Neither is a move.
    expect(previousSpaceInConversation([user('hi', CRYPTO)], null)).toBeNull();
    expect(previousSpaceInConversation([user('hi')], AI)).toBeNull();
    expect(previousSpaceInConversation([], AI)).toBeNull();
  });

  it('ignores a stamp that is not an id', () => {
    expect(previousSpaceInConversation([user('hi', 'not-a-space')], AI)).toBeNull();
  });
});

describe('renderSpaceSwitchNote', () => {
  it('names the current id and the one not to copy', () => {
    // Both halves matter: the model reused old counts (so the old space must be
    // marked dead) and copied the old id into a new query (so the current id
    // has to be right there to use instead).
    const note = renderSpaceSwitchNote(AI, CRYPTO);

    expect(note).toContain(AI);
    expect(note).toContain(CRYPTO);
    expect(note).toContain('this space');
  });
});

describe('appendNoteToLastUserMessage', () => {
  it('appends to the last user message, leaving the user text first', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'how many projects' },
      { role: 'assistant', content: '2,672' },
      { role: 'user', content: 'what is in this space' },
    ];

    const result = appendNoteToLastUserMessage(messages, 'NOTE');

    expect(result[2].content).toBe('what is in this space\n\nNOTE');
    // Earlier turns are untouched — the note describes this question only.
    expect(result[0].content).toBe('how many projects');
  });

  it('appends a text part when the content is a parts array', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'what is in this space' }] }];

    const result = appendNoteToLastUserMessage(messages, 'NOTE');

    expect(result[0].content).toEqual([
      { type: 'text', text: 'what is in this space' },
      { type: 'text', text: '\n\nNOTE' },
    ]);
  });

  it('skips past trailing tool traffic to reach the user message', () => {
    // Mid-resubmit the trailing message is a tool result, not the question.
    // Appending there would attach the note to a tool payload.
    const messages: ModelMessage[] = [
      { role: 'user', content: 'what is in this space' },
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'geoQuery', input: {} }] },
      {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'geoQuery', output: { type: 'json', value: {} } }],
      },
    ];

    const result = appendNoteToLastUserMessage(messages, 'NOTE');

    expect(result[0].content).toBe('what is in this space\n\nNOTE');
    expect(result[2].content).toEqual(messages[2].content);
  });

  it('returns the conversation untouched when there is no user message', () => {
    const messages: ModelMessage[] = [{ role: 'assistant', content: 'hi' }];

    expect(appendNoteToLastUserMessage(messages, 'NOTE')).toEqual(messages);
  });
});

describe('renderCurrentSpaceNote', () => {
  const SPACE = '959838ee0bbc429a8aeb2136dd1cafd7';

  it('names the current space as the target for "this space" and for writes', () => {
    const note = renderCurrentSpaceNote(SPACE);

    expect(note).toContain(`\`${SPACE}\``);
    expect(note).toMatch(/"this space".*mean/s);
    expect(note).toMatch(/every write this turn targets/);
  });

  // The switch note argues about "earlier messages"; this one has to retire the
  // assistant's own "you're now viewing it", which is what actually anchored the
  // model to the space it had navigated to.
  it('retracts an earlier navigation claim rather than only stating the current space', () => {
    const note = renderCurrentSpaceNote(SPACE);

    expect(note).toMatch(/navigated them somewhere else/);
    expect(note).toMatch(/no longer there/);
    expect(note).toMatch(/disregard any earlier statement/);
  });

  it('leaves room for a space the user names in the message itself', () => {
    expect(renderCurrentSpaceNote(SPACE)).toMatch(/unless the user names a different space/);
  });
});
