import { describe, expect, it } from 'vitest';

import { COMPACT_AT_INPUT_TOKENS } from '~/core/chat/limits';

import { type AutoCompactState, shouldAutoCompact } from './should-auto-compact';

// A chat that is idle, long, and has never failed — every guard satisfied.
function ready(overrides: Partial<AutoCompactState> = {}): AutoCompactState {
  return {
    status: 'ready',
    isBusy: false,
    isCompacting: false,
    messageCount: 12,
    contextTokens: COMPACT_AT_INPUT_TOKENS,
    lastFailedAtTokens: null,
    ...overrides,
  };
}

describe('shouldAutoCompact', () => {
  it('compacts an idle chat that has crossed the threshold', () => {
    expect(shouldAutoCompact(ready())).toBe(true);
  });

  it('never compacts an empty chat', () => {
    // The reported bug: the token reading is per-widget, not per-chat, so it
    // outlived the transcript it described. Opening a new chat while the reading
    // was high fired compaction against zero messages, and the endpoint rejected
    // the empty body — the user saw "Invalid request body" on clicking New chat.
    expect(shouldAutoCompact(ready({ messageCount: 0 }))).toBe(false);
  });

  it('waits until the chat is actually long', () => {
    expect(shouldAutoCompact(ready({ contextTokens: COMPACT_AT_INPUT_TOKENS - 1 }))).toBe(false);
  });

  it('never compacts mid-stream', () => {
    expect(shouldAutoCompact(ready({ status: 'streaming' }))).toBe(false);
    expect(shouldAutoCompact(ready({ status: 'submitted' }))).toBe(false);
  });

  it('never compacts between a turn resubmits, where status is briefly ready', () => {
    expect(shouldAutoCompact(ready({ isBusy: true }))).toBe(false);
  });

  it('does not start a second compaction over the first', () => {
    expect(shouldAutoCompact(ready({ isCompacting: true }))).toBe(false);
  });

  it('retries a failed reading exactly zero more times', () => {
    const tokens = COMPACT_AT_INPUT_TOKENS + 5_000;
    expect(shouldAutoCompact(ready({ contextTokens: tokens, lastFailedAtTokens: tokens }))).toBe(false);
  });

  it('tries again once the next turn reports a different reading', () => {
    // The failure guard must not be permanent — a transient 502 shouldn't
    // disable compaction for the life of the chat.
    const failed = COMPACT_AT_INPUT_TOKENS + 5_000;
    expect(shouldAutoCompact(ready({ contextTokens: failed + 1_000, lastFailedAtTokens: failed }))).toBe(true);
  });
});
