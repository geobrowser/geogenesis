import { describe, expect, it } from 'vitest';

import type { WinnerShare } from '~/core/claims/browse/claim-debates';

import { derivePersonRecord, formatJoinedAt } from './person-record';

const ME = 'me';
const THEM = 'them';
const JAN_2026 = '1769726933';

function share(spaceId: string, over: Partial<WinnerShare> = {}): WinnerShare {
  return { spaceId, percent: 100, totalVotes: 2, tied: false, ...over };
}

function record(over: Partial<Parameters<typeof derivePersonRecord>[0]> = {}) {
  return derivePersonRecord({
    personId: ME,
    positions: 0,
    debateIds: [],
    truncated: false,
    createdAt: JAN_2026,
    winnerByDebateId: new Map(),
    ...over,
  });
}

describe('derivePersonRecord', () => {
  it('reads a full record', () => {
    const result = record({
      positions: 119,
      debateIds: ['d1', 'd2', 'd3', 'd4'],
      winnerByDebateId: new Map([
        ['d1', share(ME)],
        ['d2', share(ME)],
        ['d3', share(THEM)],
        ['d4', share(THEM)],
      ]),
    });

    expect(result.positions).toBe(119);
    expect(result.debatesArgued).toBe(4);
    expect(result.winRate).toEqual({ percent: 50, wins: 2, of: 4 });
  });

  // Rule: debates *argued* is the denominator, not debates anyone voted on. The two diverge the
  // moment a debate goes unwatched, and an unwatched debate is not a win.
  it('counts unwatched debates in the denominator', () => {
    const result = record({
      debateIds: ['judged', 'unwatched'],
      winnerByDebateId: new Map([['judged', share(ME)]]),
    });

    expect(result.winRate).toEqual({ percent: 50, wins: 1, of: 2 });
  });

  // Rule: a tie is neither won nor lost. `useWinnerShares` picks its leader with a strict `>`, so
  // without the tie flag whichever side was counted first would be credited with the win.
  it('does not count a tie as a win, but keeps it in the denominator', () => {
    const result = record({
      debateIds: ['tied', 'won'],
      winnerByDebateId: new Map([
        ['tied', share(ME, { tied: true, percent: 50 })],
        ['won', share(ME)],
      ]),
    });

    expect(result.winRate).toEqual({ percent: 50, wins: 1, of: 2 });
  });

  it('ignores a debate whose votes are all gone', () => {
    const result = record({
      debateIds: ['d1'],
      winnerByDebateId: new Map([['d1', share(ME, { totalVotes: 0 })]]),
    });

    expect(result.debatesArgued).toBe(1);
    expect(result.winRate).toBeNull();
  });
});

// "0 debates · 0% won" reads as failure; absence reads as new. New people arrive continuously, so
// this is a permanent case rather than a beta one.
describe('omit, never zero', () => {
  it('leaves out every stat someone has not started', () => {
    const result = record();

    expect(result.positions).toBeNull();
    expect(result.debatesArgued).toBeNull();
    expect(result.winRate).toBeNull();
  });

  // Nobody having watched is not the same as having lost, so no rate is shown at all rather than 0%.
  it('leaves out the win rate until a debate has been judged', () => {
    const result = record({ debateIds: ['d1', 'd2'] });

    expect(result.debatesArgued).toBe(2);
    expect(result.winRate).toBeNull();
  });

  it('still gives a newcomer the join date the row is floored on', () => {
    expect(record().joinedAt).toBeInstanceOf(Date);
  });
});

describe('truncation', () => {
  // A truncated page is an arbitrary subset of someone's debates, so a count from it is quietly low.
  it('withholds the debate count and rate rather than under-reporting', () => {
    const result = record({
      positions: 5,
      debateIds: ['d1'],
      truncated: true,
      winnerByDebateId: new Map([['d1', share(ME)]]),
    });

    expect(result.debatesArgued).toBeNull();
    expect(result.winRate).toBeNull();
    // Positions come from a totalCount, so the relation cap says nothing about them.
    expect(result.positions).toBe(5);
  });
});

describe('join date', () => {
  it('reads unix seconds as a month and year', () => {
    expect(formatJoinedAt(record().joinedAt!)).toBe('Jan 2026');
  });

  it('has no date rather than a wrong one', () => {
    expect(record({ createdAt: null }).joinedAt).toBeNull();
    expect(record({ createdAt: 'not-a-timestamp' }).joinedAt).toBeNull();
    expect(record({ createdAt: '0' }).joinedAt).toBeNull();
  });
});
