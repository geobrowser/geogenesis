import { describe, expect, it } from 'vitest';

import type { PersonRecordInput } from './person-record';
import { derivePersonRecord, formatJoinedAt } from './person-record';

const JAN_2026 = '1769726933';

function record(over: Partial<PersonRecordInput> = {}) {
  return derivePersonRecord({
    positions: 0,
    positionsTruncated: false,
    debateIds: [],
    truncated: false,
    createdAt: JAN_2026,
    ...over,
  });
}

describe('derivePersonRecord', () => {
  it('reads the activity counts used by a People row', () => {
    const result = record({ positions: 119, debateIds: ['d1', 'd2', 'd3', 'd4'] });

    expect(result.positions).toBe(119);
    expect(result.debatesArgued).toBe(4);
  });

  it('omits activity someone has not started instead of rendering zeroes', () => {
    const result = record();

    expect(result.positions).toBeNull();
    expect(result.debatesArgued).toBeNull();
    expect(result.joinedAt).toBeInstanceOf(Date);
  });

  it('collects active spaces from either claims or debates', () => {
    const result = record({
      claimsBySpace: new Map([
        ['claims', 2],
        ['inactive', 0],
      ]),
      debatesBySpace: new Map([['debates', 1]]),
    });

    expect(result.activeSpaceIds).toEqual(new Set(['claims', 'debates']));
  });
});

describe('truncation', () => {
  it('withholds a debate count whose relation page came back short', () => {
    const result = record({
      positions: 5,
      claimsBySpace: new Map([['space-a', 5]]),
      debateIds: ['d1'],
      debatesBySpace: new Map([['space-a', 1]]),
      truncated: true,
    });

    expect(result.debatesArgued).toBeNull();
    expect(result.debatesBySpace).toBeUndefined();
    expect(result.activeSpaceIds).toEqual(new Set(['space-a']));
    expect(result.positions).toBe(5);
    expect(result.claimsBySpace).toEqual(new Map([['space-a', 5]]));
  });

  it('withholds positions when their own page came back short', () => {
    const result = record({
      positions: 250,
      positionsTruncated: true,
      claimsBySpace: new Map([['space-a', 137]]),
      debateIds: ['d1'],
    });

    expect(result.positions).toBeNull();
    expect(result.claimsBySpace).toBeUndefined();
    expect(result.debatesArgued).toBe(1);
    expect(result.activeSpaceIds).toEqual(new Set(['space-a']));
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
    expect(record({ createdAt: '0' }).joinedAt).toBeNull();
    expect(record({ createdAt: '-1' }).joinedAt).toBeNull();
  });

  it('accepts every timestamp shape the backend documents', () => {
    expect(formatJoinedAt(record({ createdAt: 1769726933 }).joinedAt!)).toBe('Jan 2026');
    expect(formatJoinedAt(record({ createdAt: '2026-01-29T00:00:00.000Z' }).joinedAt!)).toBe('Jan 2026');
    expect(formatJoinedAt(record({ createdAt: '1769726933000' }).joinedAt!)).toBe('Jan 2026');
    expect(record({ createdAt: 0 }).joinedAt).toBeNull();
  });
});
