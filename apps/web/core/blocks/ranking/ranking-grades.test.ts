import { describe, expect, it } from 'vitest';

import {
  type BallotGrades,
  type Grade,
  applyGradeEdits,
  applyTierLines,
  gradeAtPlace,
  gradeInto,
  isTierOrdered,
  mergeGrades,
  moveToTier,
  parseGrade,
  placeRegradedEntries,
  pruneGrades,
  removeEntry,
  sameGrades,
  tierAtIndex,
  tierSections,
} from './ranking-grades';

// Ids are hex already, so `normId` leaves them as they are.
const id = (n: number) => n.toString(16).padStart(32, '0');
const g = (entries: Array<[number, Grade]>): BallotGrades => new Map(entries.map(([n, grade]) => [id(n), grade]));
const ids = (...ns: number[]) => ns.map(id);

describe('parseGrade', () => {
  it('accepts A, B and C in any case and with spaces, and nothing else', () => {
    expect(parseGrade('A')).toBe('A');
    expect(parseGrade(' b ')).toBe('B');
    expect(parseGrade('c')).toBe('C');
    expect(parseGrade('D')).toBeNull();
    expect(parseGrade('AB')).toBeNull();
    expect(parseGrade('')).toBeNull();
    expect(parseGrade(null)).toBeNull();
  });
});

describe('gradeInto', () => {
  const ballot = ids(1, 2, 3, 4, 5);
  const grades = g([
    [1, 'A'],
    [2, 'A'],
    [3, 'B'],
    [4, 'C'],
  ]); // 5 is ungraded

  it('puts a new A below the last A', () => {
    const next = gradeInto(ballot, grades, id(9), 'A');
    expect(next.ids).toEqual(ids(1, 2, 9, 3, 4, 5));
    expect(next.grades.get(id(9))).toBe('A');
  });

  it('puts a new C below the last C and above ungraded entries', () => {
    expect(gradeInto(ballot, grades, id(9), 'C').ids).toEqual(ids(1, 2, 3, 4, 9, 5));
  });

  it('puts a grade with an empty tier below the higher tiers', () => {
    const noB = g([
      [1, 'A'],
      [4, 'C'],
    ]);
    expect(gradeInto(ids(1, 4, 5), noB, id(9), 'B').ids).toEqual(ids(1, 9, 4, 5));
  });

  it('puts an A at the top when there is no A yet', () => {
    expect(gradeInto(ids(3, 4), g([[3, 'B']]), id(9), 'A').ids).toEqual(ids(9, 3, 4));
  });

  it('moves a regraded entry to the bottom of its new tier', () => {
    const next = gradeInto(ballot, grades, id(1), 'B');
    expect(next.ids).toEqual(ids(2, 3, 1, 4, 5));
    expect(next.grades.get(id(1))).toBe('B');
  });

  it('moves an entry to the bottom of its own tier when given the same grade again', () => {
    expect(gradeInto(ballot, grades, id(1), 'A').ids).toEqual(ids(2, 1, 3, 4, 5));
  });

  it('starts an empty ballot', () => {
    expect(gradeInto([], new Map(), id(9), 'C').ids).toEqual(ids(9));
  });
});

describe('removeEntry', () => {
  it('takes the entry and its grade out', () => {
    const next = removeEntry(ids(1, 2), g([[1, 'A']]), id(1));
    expect(next.ids).toEqual(ids(2));
    expect(next.grades.has(id(1))).toBe(false);
  });
});

describe('tierAtIndex and gradeAtPlace', () => {
  const ballot = ids(1, 2, 3);
  const grades = g([
    [1, 'A'],
    [2, 'B'],
    [3, 'C'],
  ]);

  it('takes the tier of the entry above', () => {
    expect(tierAtIndex(ballot, grades, 1)).toBe('A');
    expect(tierAtIndex(ballot, grades, 2)).toBe('B');
    expect(tierAtIndex(ballot, grades, 3)).toBe('C');
  });

  it('takes the first entry’s tier at the top', () => {
    expect(tierAtIndex(ballot, grades, 0)).toBe('A');
  });

  it('stays ungraded on a ballot with no grades', () => {
    expect(tierAtIndex(ballot, new Map(), 1)).toBe('ungraded');
  });

  it('grades an entry placed between B and C as B', () => {
    const placed = ids(1, 2, 9, 3);
    expect(gradeAtPlace(placed, grades, id(9)).get(id(9))).toBe('B');
  });
});

describe('tierSections', () => {
  it('always lists A, B and C, and Ungraded only when something is', () => {
    const sections = tierSections(ids(1, 3), g([[1, 'A'], [3, 'C']]));
    expect(sections.map(s => [s.tier, s.ids.length, s.start])).toEqual([
      ['A', 1, 0],
      ['B', 0, 1],
      ['C', 1, 1],
    ]);
    expect(tierSections(ids(1, 5), g([[1, 'A']])).map(s => s.tier)).toEqual(['A', 'B', 'C', 'ungraded']);
  });

  it('shows a ballot with no grades as one Ungraded section', () => {
    expect(tierSections(ids(1, 2), new Map()).map(s => s.tier)).toEqual(['ungraded']);
    expect(tierSections([], new Map())).toEqual([]);
  });
});

describe('moveToTier', () => {
  const ballot = ids(1, 2, 3, 4);
  const grades = g([
    [1, 'A'],
    [2, 'B'],
    [3, 'B'],
    [4, 'C'],
  ]);

  it('drags an entry down across a tier line, regrading it', () => {
    const next = moveToTier(ballot, grades, id(2), 'C', 0);
    expect(next.ids).toEqual(ids(1, 3, 2, 4));
    expect(next.grades.get(id(2))).toBe('C');
  });

  it('drags an entry up across a tier line, regrading it', () => {
    const next = moveToTier(ballot, grades, id(4), 'A', 0);
    expect(next.ids).toEqual(ids(4, 1, 2, 3));
    expect(next.grades.get(id(4))).toBe('A');
  });

  it('drops into an empty tier', () => {
    const noB = g([
      [1, 'A'],
      [4, 'C'],
    ]);
    const next = moveToTier(ids(1, 4), noB, id(1), 'B', 0);
    expect(next.ids).toEqual(ids(1, 4));
    expect(next.grades.get(id(1))).toBe('B');
  });

  it('reorders within a tier without regrading', () => {
    const next = moveToTier(ballot, grades, id(3), 'B', 0);
    expect(next.ids).toEqual(ids(1, 3, 2, 4));
    expect(next.grades.get(id(3))).toBe('B');
  });
});

describe('applyTierLines', () => {
  it('grades by the two lines and keeps the order', () => {
    const grades = applyTierLines(ids(1, 2, 3, 4, 5), 1, 2);
    expect([1, 2, 3, 4, 5].map(n => grades.get(id(n)))).toEqual(['A', 'B', 'B', 'C', 'C']);
  });
});

describe('isTierOrdered', () => {
  it('needs A, then B, then C, then ungraded', () => {
    expect(isTierOrdered(ids(1, 2, 3), g([[1, 'A'], [2, 'B']]))).toBe(true);
    expect(isTierOrdered(ids(1, 2), g([[1, 'B'], [2, 'A']]))).toBe(false);
    expect(isTierOrdered(ids(1, 2), g([[2, 'C']]))).toBe(false);
  });
});

describe('applyGradeEdits', () => {
  it('sets, clears, and leaves entries the edit doesn’t name', () => {
    const next = applyGradeEdits(
      g([
        [1, 'A'],
        [2, 'B'],
      ]),
      new Map([
        [id(2), null],
        [id(3), 'C' as const],
      ])
    );
    expect(next.get(id(1))).toBe('A');
    expect(next.has(id(2))).toBe(false);
    expect(next.get(id(3))).toBe('C');
  });
});

describe('mergeGrades', () => {
  it('keeps another device’s regrade of an entry this edit didn’t regrade', () => {
    const base = g([
      [1, 'A'],
      [2, 'A'],
    ]);
    const ours = base; // this device only reordered
    const theirs = g([
      [1, 'C'],
      [2, 'A'],
    ]);
    const merged = mergeGrades({ ids: ids(2, 1), base, ours, theirs });
    expect(merged.get(id(1))).toBe('C');
  });

  it('keeps this edit’s regrade over the published grade', () => {
    const base = g([[1, 'A']]);
    const merged = mergeGrades({ ids: ids(1), base, ours: g([[1, 'B']]), theirs: g([[1, 'C']]) });
    expect(merged.get(id(1))).toBe('B');
  });

  it('keeps this edit’s grade on an entry only it has', () => {
    const merged = mergeGrades({ ids: ids(9), base: new Map(), ours: g([[9, 'A']]), theirs: new Map() });
    expect(merged.get(id(9))).toBe('A');
  });
});

describe('placeRegradedEntries', () => {
  it('moves an entry regraded elsewhere to the bottom of its new tier', () => {
    // Another device moved 1 from A to C; this device's order still has it among the A's.
    const merged = g([
      [1, 'C'],
      [2, 'A'],
      [3, 'C'],
    ]);
    const ours = g([
      [1, 'A'],
      [2, 'A'],
      [3, 'C'],
    ]);
    expect(placeRegradedEntries(ids(1, 2, 3), merged, ours)).toEqual(ids(2, 3, 1));
  });

  it('moves an entry regraded elsewhere even when the order already looks tier-ordered', () => {
    // 1 was A here and is C now; it sits at the top of C, and goes to the bottom like any regrade.
    const merged = g([
      [2, 'A'],
      [1, 'C'],
      [3, 'C'],
    ]);
    const ours = g([
      [2, 'A'],
      [1, 'A'],
      [3, 'C'],
    ]);
    expect(placeRegradedEntries(ids(2, 1, 3), merged, ours)).toEqual(ids(2, 3, 1));
  });

  it('leaves a ballot alone when no grade came from elsewhere', () => {
    const grades = g([
      [1, 'A'],
      [2, 'B'],
    ]);
    expect(placeRegradedEntries(ids(1, 2), grades, grades)).toEqual(ids(1, 2));
  });
});

describe('pruneGrades and sameGrades', () => {
  it('keeps only the ballot’s entries', () => {
    expect([...pruneGrades(ids(1), g([[1, 'A'], [2, 'B']])).keys()]).toEqual([id(1)]);
  });

  it('compares grades over the given entries', () => {
    expect(sameGrades(ids(1), g([[1, 'A']]), g([[1, 'A'], [2, 'B']]))).toBe(true);
    expect(sameGrades(ids(1), g([[1, 'A']]), g([[1, 'B']]))).toBe(false);
    expect(sameGrades(ids(1), g([[1, 'A']]), new Map())).toBe(false);
  });
});
