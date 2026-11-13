import { describe, expect, it } from 'vitest';

import type { BallotGrades, Grade } from './ranking-grades';
import { classifyReadBack, foldOvertakenPublish, rebaseUnsavedDraft, sameBallot } from './ranking-publish-queue';

// GEO-3729: a ballot is its order and its grades; a regrade alone is a change.

const id = (n: number) => n.toString(16).padStart(32, '0');
const g = (entries: Array<[number, Grade]>): BallotGrades => new Map(entries.map(([n, grade]) => [id(n), grade]));
const RANK = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('sameBallot', () => {
  it('tells a regrade apart even when the order is the same', () => {
    expect(sameBallot([id(1)], g([[1, 'A']]), [id(1)], g([[1, 'A']]))).toBe(true);
    expect(sameBallot([id(1)], g([[1, 'A']]), [id(1)], g([[1, 'B']]))).toBe(false);
    expect(sameBallot([id(1)], undefined, [id(1)], undefined)).toBe(true);
  });
});

describe('classifyReadBack with grades', () => {
  const own = {
    rankId: RANK,
    orderedEntityIds: [id(1), id(2)],
    grades: g([
      [1, 'A'],
      [2, 'A'],
    ]),
    baseline: {
      rankId: RANK,
      orderedEntityIds: [id(1), id(2)],
      grades: g([
        [1, 'A'],
        [2, 'B'],
      ]),
    },
  };

  it('is still pending while the index shows the old grades in the same order', () => {
    expect(classifyReadBack({ rankId: RANK, orderedEntityIds: [id(1), id(2)], grades: own.baseline.grades }, own)).toBe(
      'pending'
    );
  });

  it('is ours once the grades read back too', () => {
    expect(classifyReadBack({ rankId: RANK, orderedEntityIds: [id(1), id(2)], grades: own.grades }, own)).toBe('ours');
  });
});

describe('foldOvertakenPublish with grades', () => {
  it('folds our regrade onto another device’s ballot', () => {
    const own = {
      rankId: RANK,
      orderedEntityIds: [id(1), id(2)],
      grades: g([
        [1, 'A'],
        [2, 'A'],
      ]),
      baseline: {
        rankId: RANK,
        orderedEntityIds: [id(1), id(2)],
        grades: g([
          [1, 'A'],
          [2, 'B'],
        ]),
      },
    };
    const folded = foldOvertakenPublish(
      own,
      [id(1), id(2), id(3)],
      g([
        [1, 'A'],
        [2, 'B'],
        [3, 'C'],
      ])
    );
    expect(folded.ids).toEqual([id(1), id(2), id(3)]);
    expect(folded.grades.get(id(2))).toBe('A');
    expect(folded.grades.get(id(3))).toBe('C');
  });
});

describe('rebaseUnsavedDraft with grades', () => {
  const draft = {
    orderedEntityIds: [id(1)],
    grades: g([[1, 'B']]),
    baseOrderedIds: [id(1)],
    baseGrades: g([[1, 'A']]),
    overtakenOrderedIds: [id(1)],
    overtakenGrades: g([[1, 'A']]),
  };

  it('keeps a grade-only draft while the published ballot hasn’t moved', () => {
    expect(rebaseUnsavedDraft(draft, [id(1)], g([[1, 'A']]))).toBe(draft);
  });

  it('drops it once the published ballot holds the regrade', () => {
    expect(rebaseUnsavedDraft(draft, [id(1)], g([[1, 'B']]))).toBeNull();
  });
});
