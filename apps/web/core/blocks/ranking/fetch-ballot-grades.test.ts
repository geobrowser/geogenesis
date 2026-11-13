import { describe, expect, it, vi } from 'vitest';

import { GRADE_PROPERTY_ID, RANK_VOTES_RELATION_TYPE_ID, VOTE_ORDINAL_VALUE_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity, Relation } from '~/core/types';

import {
  type BallotVoteRow,
  BallotGradesPendingError,
  decodeBallotVoteRow,
  fetchBallotGrades,
} from './fetch-ballot-grades';

const RANK = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const AUTHOR = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_SPACE = 'cccccccccccccccccccccccccccccccc';
const id = (n: number) => n.toString(16).padStart(32, '0');

function vote(n: number, spaceId = AUTHOR): Relation {
  return {
    id: id(1000 + n),
    entityId: id(2000 + n),
    type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
    fromEntity: { id: RANK, name: null },
    toEntity: { id: id(n), name: null, value: id(n) },
    renderableType: 'RELATION',
    position: `a${n}`,
    spaceId,
  };
}

function rank(n: number): Entity {
  return {
    id: RANK,
    name: null,
    description: null,
    spaces: [AUTHOR],
    types: [],
    relations: Array.from({ length: n }, (_, i) => vote(i + 1)),
    values: [],
  };
}

const row = (n: number, grade: 'A' | 'B' | 'C' | null, hasOrdinal = true): BallotVoteRow => ({
  relationId: id(1000 + n),
  entityId: id(n),
  hasOrdinal,
  grade,
});

/** Serves `rows` in pages of `size`, with cursors. */
function pages(rows: BallotVoteRow[], size: number) {
  return vi.fn(async (_rank: string, _space: string, after: string | undefined) => {
    const start = after ? Number(after) : 0;
    const end = start + size;
    return { items: rows.slice(start, end), endCursor: String(end), hasNextPage: end < rows.length };
  });
}

describe('decodeBallotVoteRow', () => {
  it('reads the ordinal and the grade and ignores other properties', () => {
    expect(
      decodeBallotVoteRow({
        id: id(1),
        toEntityId: id(2),
        entity: {
          valuesList: [
            { propertyId: VOTE_ORDINAL_VALUE_PROPERTY_ID, text: 'a0' },
            { propertyId: GRADE_PROPERTY_ID, text: 'b' },
            { propertyId: id(9), text: 'A' },
          ],
        },
      })
    ).toEqual({ relationId: id(1), entityId: id(2), hasOrdinal: true, grade: 'B' });
  });

  it('reads no grade from a value that isn’t A, B or C', () => {
    expect(
      decodeBallotVoteRow({
        id: id(1),
        toEntityId: id(2),
        entity: { valuesList: [{ propertyId: GRADE_PROPERTY_ID, text: 'D' }] },
      })?.grade
    ).toBeNull();
  });
});

describe('fetchBallotGrades', () => {
  it('walks every page of a ballot past 100 and 1,000 entries', async () => {
    const n = 1203;
    const rows = Array.from({ length: n }, (_, i) => row(i + 1, i < 20 ? 'A' : i < 60 ? 'B' : 'C'));
    const fetchPage = pages(rows, 1000);
    const grades = await fetchBallotGrades(rank(n), AUTHOR, { fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(grades.size).toBe(n);
    expect(grades.get(id(n))).toBe('C');
    expect(grades.get(id(1))).toBe('A');
  });

  it('reads an entry without a grade as ungraded', async () => {
    const grades = await fetchBallotGrades(rank(2), AUTHOR, { fetchPage: pages([row(1, 'A'), row(2, null)], 10) });
    expect(grades.get(id(1))).toBe('A');
    expect(grades.has(id(2))).toBe(false);
  });

  it('reads again, then refuses, when a vote is missing its ordinal (the index is mid-update)', async () => {
    const fetchPage = pages([row(1, 'A'), row(2, 'B', false)], 10);
    await expect(fetchBallotGrades(rank(2), AUTHOR, { fetchPage, attempts: 2, retryDelayMs: 0 })).rejects.toBeInstanceOf(
      BallotGradesPendingError
    );
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('refuses when the votes don’t match the ballot read (a publish landed in between)', async () => {
    const fetchPage = pages([row(1, 'A')], 10);
    await expect(fetchBallotGrades(rank(2), AUTHOR, { fetchPage, attempts: 1 })).rejects.toBeInstanceOf(
      BallotGradesPendingError
    );
    const extra = pages([row(1, 'A'), row(2, 'A'), row(3, 'A')], 10);
    await expect(fetchBallotGrades(rank(2), AUTHOR, { fetchPage: extra, attempts: 1 })).rejects.toBeInstanceOf(
      BallotGradesPendingError
    );
  });

  it('recovers when the second read lines up', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [row(1, 'A')], endCursor: null, hasNextPage: false })
      .mockResolvedValueOnce({ items: [row(1, 'A'), row(2, 'C')], endCursor: null, hasNextPage: false });
    const grades = await fetchBallotGrades(rank(2), AUTHOR, { fetchPage, retryDelayMs: 0 });
    expect(grades.get(id(2))).toBe('C');
  });

  it('only counts the author’s own votes', async () => {
    const ballot = rank(1);
    ballot.relations.push(vote(5, OTHER_SPACE));
    const grades = await fetchBallotGrades(ballot, AUTHOR, { fetchPage: pages([row(1, 'B')], 10) });
    expect(grades.get(id(1))).toBe('B');
  });
});
