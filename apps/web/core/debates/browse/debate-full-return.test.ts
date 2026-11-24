import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEBATE_FULL_CLOSE_FALLBACK,
  debateFullCloseTarget,
  rememberDebateFullReturn,
  useDebateFullScreenPresence,
} from './debate-full-return';

const DEBATE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DEBATE_A_DASHED = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const DEBATE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPACE = '11111111111111111111111111111111';
const pageOf = (debateId: string) => `/space/${SPACE}/${debateId}`;

/** A tab with pages behind this one, as an in-app navigation leaves it. */
const IN_APP = { historyLength: 3 };

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the full screen ×', () => {
  it('goes back to the page that opened this debate', () => {
    rememberDebateFullReturn(pageOf(DEBATE_A), '/explore?tab=best');
    expect(debateFullCloseTarget(DEBATE_A, IN_APP)).toEqual({ kind: 'back' });
  });

  it('matches the debate whichever way its id is spelled', () => {
    rememberDebateFullReturn(`${pageOf(DEBATE_A)}?t=42`, '/explore');
    expect(debateFullCloseTarget(DEBATE_A_DASHED, IN_APP)).toEqual({ kind: 'back' });
  });

  it('goes to Explore from a pasted or shared link, with nothing recorded', () => {
    expect(debateFullCloseTarget(DEBATE_A, IN_APP)).toEqual({ kind: 'push', href: DEBATE_FULL_CLOSE_FALLBACK });
  });

  it("does not trust a record left by a full screen the viewer left with the browser's Back", () => {
    // Explore → debate A's full screen → browser Back → a pasted link to debate B in the same tab.
    rememberDebateFullReturn(pageOf(DEBATE_A), '/explore');
    // Going back from B would leave for whatever was before the paste, possibly another site.
    expect(debateFullCloseTarget(DEBATE_B, IN_APP)).toEqual({ kind: 'push', href: '/explore' });
  });

  it('leaves the full screens for where the viewer came in after "Watch another debate"', () => {
    rememberDebateFullReturn(pageOf(DEBATE_A), '/profile/me');
    const { unmount } = renderHook(() => useDebateFullScreenPresence(true));
    // The end card's link, followed from inside A's full screen, must not record A as the way back.
    rememberDebateFullReturn(pageOf(DEBATE_B), pageOf(DEBATE_A));
    unmount();
    expect(debateFullCloseTarget(DEBATE_B, IN_APP)).toEqual({ kind: 'push', href: '/profile/me' });
  });

  it('records again once no full screen is mounted', () => {
    const { unmount } = renderHook(() => useDebateFullScreenPresence(true));
    unmount();
    rememberDebateFullReturn(pageOf(DEBATE_B), '/explore');
    expect(debateFullCloseTarget(DEBATE_B, IN_APP)).toEqual({ kind: 'back' });
  });

  it('does not go back from the first page of a tab, such as one a modified click opened', () => {
    rememberDebateFullReturn(pageOf(DEBATE_A), '/explore');
    expect(debateFullCloseTarget(DEBATE_A, { historyLength: 1 })).toEqual({ kind: 'push', href: '/explore' });
  });

  it('is used once: a second × has no record', () => {
    rememberDebateFullReturn(pageOf(DEBATE_A), '/explore');
    debateFullCloseTarget(DEBATE_A, IN_APP);
    expect(debateFullCloseTarget(DEBATE_A, IN_APP)).toEqual({ kind: 'push', href: DEBATE_FULL_CLOSE_FALLBACK });
  });

  it('forgets a record from an earlier visit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T08:00:00Z'));
    rememberDebateFullReturn(pageOf(DEBATE_A), '/explore');
    vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
    expect(debateFullCloseTarget(DEBATE_A, IN_APP)).toEqual({ kind: 'push', href: DEBATE_FULL_CLOSE_FALLBACK });
  });

  it('never records a page off the site', () => {
    rememberDebateFullReturn(pageOf(DEBATE_A), '//evil.example/phish');
    expect(debateFullCloseTarget(DEBATE_A, IN_APP)).toEqual({ kind: 'push', href: DEBATE_FULL_CLOSE_FALLBACK });
  });

  it('reads an unreadable record as none', () => {
    window.sessionStorage.setItem('geo:debate-full-return', '{not json');
    expect(debateFullCloseTarget(DEBATE_A, IN_APP)).toEqual({ kind: 'push', href: DEBATE_FULL_CLOSE_FALLBACK });
  });
});
