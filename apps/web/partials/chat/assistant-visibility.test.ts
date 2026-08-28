import { describe, expect, it } from 'vitest';

import { shouldHideAssistant } from './assistant-visibility';

const FEED = '/space/25omwWh6HYgeRQKCaSpVpa/debates';
const WIDE = false;
const COMPACT = true;

describe('shouldHideAssistant', () => {
  // The launcher is fixed bottom-right at z-1100. Below `md` the feed is full-bleed and its
  // interaction bar runs horizontally under the videos, putting share directly beneath it.
  it('hides on the debates feed only once the layout is compact', () => {
    expect(shouldHideAssistant(FEED, COMPACT)).toBe(true);
    expect(shouldHideAssistant(FEED, WIDE)).toBe(false);
  });

  // Its bar is a vertical rail beside the column at this width, so there is nothing to obstruct
  // and no reason to take the assistant away.
  it('leaves the desktop feed alone', () => {
    expect(shouldHideAssistant(FEED, WIDE)).toBe(false);
  });

  // Full-screen at every width and parks a voice dock in the same corner, so width is irrelevant.
  it('keeps hiding on the rematch picker at any width', () => {
    const picker = '/space/25omwWh6HYgeRQKCaSpVpa/debates/rematches/session-1';
    expect(shouldHideAssistant(picker, COMPACT)).toBe(true);
    expect(shouldHideAssistant(picker, WIDE)).toBe(true);
  });

  it('keeps hiding on ranking-compose at any width', () => {
    const compose = '/space/25omwWh6HYgeRQKCaSpVpa/ranking-compose';
    expect(shouldHideAssistant(compose, COMPACT)).toBe(true);
    expect(shouldHideAssistant(compose, WIDE)).toBe(true);
  });

  // The pattern is anchored, so it must not swallow the room or anything nested under it.
  it('does not match routes below the feed', () => {
    for (const pathname of [
      '/space/25omwWh6HYgeRQKCaSpVpa/debates/debate-1',
      '/space/25omwWh6HYgeRQKCaSpVpa/debates/rematches',
    ]) {
      expect(shouldHideAssistant(pathname, COMPACT)).toBe(false);
    }
  });

  it('leaves unrelated routes alone at both widths', () => {
    for (const pathname of ['/', '/root', '/space/25omwWh6HYgeRQKCaSpVpa', '/space/25omwWh6HYgeRQKCaSpVpa/community']) {
      expect(shouldHideAssistant(pathname, COMPACT)).toBe(false);
      expect(shouldHideAssistant(pathname, WIDE)).toBe(false);
    }
  });
});
