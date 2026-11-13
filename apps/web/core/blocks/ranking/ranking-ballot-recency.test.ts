import { describe, expect, it } from 'vitest';

import { ballotRecencyKey, compareBallotRecency, pickLatestBallot } from './ranking-ballot-recency';

const key = (id: string, createdAt: string | null, updatedAt: string | null) =>
  ballotRecencyKey(id, createdAt, updatedAt);

describe('compareBallotRecency', () => {
  it('orders by creation, even against a later update of the older ballot', () => {
    expect(compareBallotRecency(key('new', '200', '200'), key('old', '100', '900'))).toBeGreaterThan(0);
  });

  it('uses updatedAt when an entity has no createdAt', () => {
    expect(compareBallotRecency(key('a', null, '300'), key('b', '200', '200'))).toBeGreaterThan(0);
  });

  it('breaks a same-second creation by update, then by id', () => {
    expect(compareBallotRecency(key('a', '100', '150'), key('b', '100', '100'))).toBeGreaterThan(0);
    expect(compareBallotRecency(key('b', '100', '100'), key('a', '100', '100'))).toBeGreaterThan(0);
  });

  it('parses unix seconds, milliseconds and ISO strings alike', () => {
    expect(key('a', '1793875856', null).createdAtMs).toBe(1793875856000);
    expect(key('a', '1793875856000', null).createdAtMs).toBe(1793875856000);
    expect(key('a', '2026-11-11T00:00:00Z', null).createdAtMs).toBe(Date.parse('2026-11-11T00:00:00Z'));
  });
});

describe('pickLatestBallot', () => {
  it('gives the same answer in any list order', () => {
    const items = [key('a', '100', '100'), key('c', '100', '100'), key('b', '100', '100')];
    expect(pickLatestBallot(items, k => k)?.id).toBe('c');
    expect(pickLatestBallot([...items].reverse(), k => k)?.id).toBe('c');
    expect(pickLatestBallot([], k => k)).toBeNull();
  });
});
