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
// The indexer writes UUIDs dashed; the graph query and the presence feed write them dashless. An
// exact match across that boundary finds nothing and reports a real record as 0%.
describe('id formats across services', () => {
  const DASHED_PERSON = '11111111-1111-1111-1111-111111111111';
  const HEX_PERSON = '11111111111111111111111111111111';
  const DASHED_DEBATE = '22222222-2222-2222-2222-222222222222';
  const HEX_DEBATE = '22222222222222222222222222222222';

  it('finds the debate when the winner map is keyed dashed', () => {
    const result = derivePersonRecord({
      personId: HEX_PERSON,
      positions: 0,
      debateIds: [HEX_DEBATE],
      truncated: false,
      createdAt: JAN_2026,
      winnerByDebateId: new Map([[DASHED_DEBATE, share(HEX_PERSON)]]),
    });

    expect(result.winRate).toEqual({ percent: 100, wins: 1, of: 1 });
  });

  it('credits the win when the winner id is dashed and the person id is not', () => {
    const result = derivePersonRecord({
      personId: HEX_PERSON,
      positions: 0,
      debateIds: [HEX_DEBATE],
      truncated: false,
      createdAt: JAN_2026,
      winnerByDebateId: new Map([[HEX_DEBATE, share(DASHED_PERSON)]]),
    });

    expect(result.winRate).toEqual({ percent: 100, wins: 1, of: 1 });
  });

  it('still does not credit a different person written dashed', () => {
    const result = derivePersonRecord({
      personId: HEX_PERSON,
      positions: 0,
      debateIds: [HEX_DEBATE],
      truncated: false,
      createdAt: JAN_2026,
      winnerByDebateId: new Map([[HEX_DEBATE, share('33333333-3333-3333-3333-333333333333')]]),
    });

    expect(result.winRate).toEqual({ percent: 0, wins: 0, of: 1 });
  });
});

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
    expect(record({ createdAt: '' }).joinedAt).toBeNull();
    expect(record({ createdAt: 'not-a-timestamp' }).joinedAt).toBeNull();
    // `Date.parse` reads "0" as the year 2000; an empty timestamp must not become a join date.
    expect(record({ createdAt: '0' }).joinedAt).toBeNull();
    expect(record({ createdAt: '-1' }).joinedAt).toBeNull();
  });

  // The scalar is documented as numeric *or* string. A number reaching a string method would take
  // the whole tab down mid-render, so it is stringified before anything reads it.
  it('accepts a numeric timestamp without throwing', () => {
    expect(() => record({ createdAt: 1769726933 as unknown as string })).not.toThrow();
    expect(formatJoinedAt(record({ createdAt: 1769726933 as unknown as string }).joinedAt!)).toBe('Jan 2026');
    expect(record({ createdAt: 0 as unknown as string }).joinedAt).toBeNull();
  });

  // `createdAt` is documented as unix seconds, stringified or numeric, or ISO 8601 — "varies by
  // backend". Assuming the one form it happened to return when measured would drop the date from
  // every row on an ISO value, and read a millisecond value as the sixty-seventh millennium.
  it('reads the other shapes the backend may send', () => {
    expect(formatJoinedAt(record({ createdAt: '2026-01-29T00:00:00.000Z' }).joinedAt!)).toBe('Jan 2026');
    expect(formatJoinedAt(record({ createdAt: '1769726933000' }).joinedAt!)).toBe('Jan 2026');
  });
});
