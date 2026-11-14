import { describe, expect, it } from 'vitest';

import type { BallotGrades, Grade } from './ranking-grades';
import {
  classifyReadBack,
  foldOvertakenPublish,
  mergeBallots,
  rebaseUnsavedDraft,
  sameBallot,
} from './ranking-publish-queue';

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

describe('mergeBallots keeps tiers (GEO-3729)', () => {
  const tierRank = { A: 0, B: 1, C: 2 } as const;
  const isTierOrdered = (ids: string[], grades: BallotGrades) =>
    ids.every(
      (x, i) =>
        i === 0 ||
        (tierRank[grades.get(ids[i - 1]!) ?? ('D' as 'A')] ?? 3) <= (tierRank[grades.get(x) ?? ('D' as 'A')] ?? 3)
    );

  it('moves a debate promoted elsewhere to the top of its new tier when this edit reordered', () => {
    // Base [1 A, 2 A, 3 C, 4 C]. Elsewhere 4 went to A (top). Here 2 and 1 swapped.
    const graded = g([
      [1, 'A'],
      [2, 'A'],
      [3, 'C'],
      [4, 'C'],
    ]);
    const merged = mergeBallots({
      base: { ids: [id(1), id(2), id(3), id(4)], grades: graded },
      ours: { ids: [id(2), id(1), id(3), id(4)], grades: graded },
      theirs: {
        ids: [id(4), id(1), id(2), id(3)],
        grades: g([
          [1, 'A'],
          [2, 'A'],
          [3, 'C'],
          [4, 'A'],
        ]),
      },
    });
    expect(merged.ids).toEqual([id(4), id(2), id(1), id(3)]);
  });

  it('keeps where the other device put a debate inside a tier when its order led', () => {
    // Elsewhere: 3 regraded A→B and dragged to the top of B. Here nothing reordered.
    const base = {
      ids: [id(1), id(3), id(2), id(4)],
      grades: g([
        [1, 'A'],
        [3, 'A'],
        [2, 'B'],
        [4, 'B'],
      ]),
    };
    const merged = mergeBallots({
      base,
      ours: base,
      theirs: {
        ids: [id(1), id(3), id(2), id(4)],
        grades: g([
          [1, 'A'],
          [3, 'B'],
          [2, 'B'],
          [4, 'B'],
        ]),
      },
    });
    expect(merged.ids).toEqual([id(1), id(3), id(2), id(4)]);
  });

  it('keeps a debate the other device placed mid-tier where it placed it', () => {
    const base = {
      ids: [id(1), id(2), id(3)],
      grades: g([
        [1, 'B'],
        [2, 'B'],
        [3, 'B'],
      ]),
    };
    const merged = mergeBallots({
      base,
      ours: { ids: [id(2), id(1), id(3)], grades: base.grades },
      theirs: {
        ids: [id(1), id(9), id(2), id(3)],
        grades: g([
          [1, 'B'],
          [9, 'B'],
          [2, 'B'],
          [3, 'B'],
        ]),
      },
    });
    // Next to the debate it was placed after there, not sent to the bottom of B.
    expect(merged.ids.indexOf(id(9))).toBe(merged.ids.indexOf(id(1)) + 1);
  });

  it('keeps the order when the other side has no grades at all (never upside down)', () => {
    const graded = g([
      [1, 'A'],
      [2, 'A'],
      [3, 'B'],
      [4, 'C'],
      [5, 'C'],
    ]);
    const ids = [id(1), id(2), id(3), id(4), id(5)];
    const merged = mergeBallots({
      base: { ids, grades: graded },
      ours: { ids: [id(2), id(1), id(3), id(4), id(5)], grades: graded },
      theirs: { ids, grades: new Map() },
    });
    expect(merged.ids).toEqual([id(2), id(1), id(3), id(4), id(5)]);
  });

  it('comes out tier-ordered from random three-way edits', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = (): Grade | null => (['A', 'B', 'C', null] as const)[Math.floor(rand() * 4)]!;
    const side = (ids: string[]) => {
      const shuffled = [...ids].sort(() => rand() - 0.5).filter(() => rand() > 0.1);
      const grades = new Map<string, Grade>();
      for (const x of shuffled) {
        const grade = pick();
        if (grade) grades.set(x, grade);
      }
      return { ids: shuffled, grades };
    };
    for (let run = 0; run < 300; run++) {
      const ids = Array.from({ length: 8 }, (_, i) => id(i + 1));
      const merged = mergeBallots({ base: side(ids), ours: side(ids), theirs: side(ids) });
      expect(isTierOrdered(merged.ids, merged.grades)).toBe(true);
    }
  });
});

describe('whenRankingPublishQueueSettles', () => {
  it('waits for tasks queued while it waited', async () => {
    const { enqueueRankingPublish, whenRankingPublishQueueSettles } = await import('./ranking-publish-queue');
    const order: string[] = [];
    let release!: () => void;
    void enqueueRankingPublish('k', () => new Promise<void>(r => (release = r)).then(() => void order.push('first')));
    const settled = whenRankingPublishQueueSettles('k').then(() => order.push('settled'));
    void enqueueRankingPublish('k', async () => void order.push('second'));
    // The first task starts a tick after it is queued.
    await new Promise(resolve => setTimeout(resolve, 0));
    release();
    await settled;
    expect(order).toEqual(['first', 'second', 'settled']);
  });
});
