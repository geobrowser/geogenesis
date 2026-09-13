import { describe, expect, it } from 'vitest';

import { shouldHideAssistant } from './assistant-visibility';

const SPACE = '25omwWh6HYgeRQKCaSpVpa';
const FEED_ROUTE = `/space/${SPACE}/debates`;
// What a shared debate link opens: the same feed, rendered by DebateEntityView under the generic
// entity route. Nothing in this path says "debate".
const ENTITY_ROUTE = `/space/${SPACE}/8f2c1d4e9a0b4c7d8e5f6a7b8c9d0e1f`;
const TAKEOVER = true;
const NO_TAKEOVER = false;

describe('shouldHideAssistant', () => {
  // The launcher is fixed bottom-right at z-1100. While the feed fills a compact viewport its
  // interaction bar runs horizontally under the videos, putting share directly beneath it.
  it('hides wherever the feed has taken over a compact viewport', () => {
    expect(shouldHideAssistant(FEED_ROUTE, TAKEOVER)).toBe(true);
    // The route this is really about: a shared link, where the path gives nothing away.
    expect(shouldHideAssistant(ENTITY_ROUTE, TAKEOVER)).toBe(true);
  });

  // Wider viewports put that bar in a vertical rail beside the column, so nothing is obstructed
  // and there is no reason to take the assistant away.
  it('leaves both routes alone when the feed is not a compact takeover', () => {
    expect(shouldHideAssistant(FEED_ROUTE, NO_TAKEOVER)).toBe(false);
    expect(shouldHideAssistant(ENTITY_ROUTE, NO_TAKEOVER)).toBe(false);
  });

  // Full-screen at every width and parks a voice dock in the same corner, so the takeover flag
  // is irrelevant to it.
  it('keeps hiding on the rematch picker either way', () => {
    const picker = `/space/${SPACE}/debates/rematches/session-1`;
    expect(shouldHideAssistant(picker, TAKEOVER)).toBe(true);
    expect(shouldHideAssistant(picker, NO_TAKEOVER)).toBe(true);
  });

  it('keeps hiding on ranking-compose either way', () => {
    const compose = `/space/${SPACE}/ranking-compose`;
    expect(shouldHideAssistant(compose, TAKEOVER)).toBe(true);
    expect(shouldHideAssistant(compose, NO_TAKEOVER)).toBe(true);
  });

  // An ordinary entity page is the same path shape as the shared-link case above, so nothing may
  // hang off the path — only off the takeover the feed announces.
  it('leaves an ordinary entity page alone', () => {
    expect(shouldHideAssistant(ENTITY_ROUTE, NO_TAKEOVER)).toBe(false);
  });

  it('leaves unrelated routes alone either way', () => {
    for (const pathname of ['/', '/root', `/space/${SPACE}`, `/space/${SPACE}/community`]) {
      expect(shouldHideAssistant(pathname, NO_TAKEOVER)).toBe(false);
    }
  });
});
