import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BallotGrades } from '~/core/blocks/ranking/ranking-grades';

import { useBlockGrading } from './use-best-debates-block-ranking';

const mocks = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock('./best-debate-grading', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debate-grading')>()),
  useRecordGrade: () => mocks.record,
}));

const id = (n: number) => n.toString(16).padStart(32, '0');

function deferred() {
  let resolve!: (ok: boolean) => void;
  const promise = new Promise<boolean>(r => (resolve = r));
  return { promise, resolve };
}

/** The block's draft, the way `useRankingComposeDraft` holds it, around `useBlockGrading`. */
function useHarness(
  publish: (ids: string[], grades?: BallotGrades) => Promise<boolean>,
  /** What the publish path leaves published (it may merge in another device's changes). */
  merge: (ids: string[], grades: BallotGrades) => { ids: string[]; grades: BallotGrades } = (ids, grades) => ({
    ids,
    grades,
  }),
  busy: { settle?: Promise<void>; published?: { ids: string[]; grades: BallotGrades } } = {}
) {
  const published = React.useRef<{ ids: string[]; grades: BallotGrades }>({
    ids: [id(1)],
    grades: new Map([[id(1), 'A']]),
  });
  const [draft, setDraftState] = React.useState(published.current);
  const grading = useBlockGrading({
    blockId: id(99),
    ready: true,
    orderedIds: draft.ids,
    grades: draft.grades,
    setDraft: (ids, grades) => setDraftState({ ids, grades }),
    getBasedOnOrderedIds: () => (busy.published ?? published.current).ids,
    getBasedOnGrades: () => (busy.published ?? published.current).grades,
    whenPublishesSettle: () => busy.settle ?? Promise.resolve(),
    publish: async (ids, grades) => {
      const ok = await publish(ids, grades);
      if (ok) published.current = merge(ids, grades ?? new Map());
      return ok;
    },
    downRank: vi.fn(),
  });
  return { grading, draft };
}

beforeEach(() => mocks.record.mockReset());

describe('grading from the block (GEO-3729)', () => {
  it('publishes a grade at once, and sends grades given meanwhile together in the next publish', async () => {
    const first = deferred();
    const second = deferred();
    const publish = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useHarness(publish));

    await act(async () => result.current.grading.grade(id(2), 'B'));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(result.current.grading.isSaving(id(2))).toBe(true);
    expect(result.current.grading.gradeOf(id(2))).toBe('B');

    act(() => result.current.grading.grade(id(3), 'A'));
    act(() => result.current.grading.grade(id(4), 'C'));
    // Nothing more goes out while the first publish is out.
    expect(publish).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(true));
    expect(publish).toHaveBeenCalledTimes(2);
    const [ids, grades] = publish.mock.calls[1] as [string[], BallotGrades];
    expect(ids).toEqual([id(3), id(1), id(2), id(4)]);
    expect([...grades.values()]).toEqual(['A', 'B', 'A', 'C']);

    await act(async () => second.resolve(true));
    expect(publish).toHaveBeenCalledTimes(2);
    expect(result.current.grading.isSaving(id(2))).toBe(false);
    // One published grade per debate graded.
    expect(mocks.record.mock.calls.map(([entityId, change]) => [entityId, change.grade, change.mutationKind])).toEqual([
      [id(2), 'B', 'published'],
      [id(3), 'A', 'published'],
      [id(4), 'C', 'published'],
    ]);
  });

  it('puts the ranking back as published when the publish fails', async () => {
    const publish = vi.fn().mockResolvedValue(false);
    const { result } = renderHook(() => useHarness(publish));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    expect(result.current.draft.ids).toEqual([id(1)]);
    expect(result.current.grading.gradeOf(id(2))).toBeNull();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('removes a debate from the ranking', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useHarness(publish));
    await act(async () => result.current.grading.remove(id(1)));
    expect(publish).toHaveBeenCalledWith([], new Map());
    expect(mocks.record.mock.calls[0][1]).toMatchObject({ grade: 'none', previousGrade: 'A' });
  });

  it('asks for the tier lines on a ranking with no grades', () => {
    const { result } = renderHook(() =>
      useBlockGrading({
        blockId: id(99),
        ready: true,
        orderedIds: [id(1)],
        grades: new Map(),
        setDraft: vi.fn(),
        getBasedOnOrderedIds: () => [id(1)],
        getBasedOnGrades: () => new Map(),
        publish: vi.fn(),
        downRank: vi.fn(),
      })
    );
    expect(result.current.needsTierLines).toBe(true);
  });

  it('builds the next publish on what the last one left published, not on a stale copy', async () => {
    const first = deferred();
    const publish = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(true);
    // The first publish merges in a debate another device added (5, graded C).
    const merge = (ids: string[], grades: BallotGrades) =>
      ids.includes(id(5))
        ? { ids, grades }
        : { ids: [...ids, id(5)], grades: new Map([...grades, [id(5), 'C' as const]]) };
    const { result } = renderHook(() => useHarness(publish, merge));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    act(() => result.current.grading.grade(id(3), 'A'));
    await act(async () => first.resolve(true));
    const [ids, grades] = publish.mock.calls[1] as [string[], BallotGrades];
    expect(ids).toEqual([id(3), id(1), id(2), id(5)]);
    expect(grades.get(id(5))).toBe('C');
  });

  it('waits for the block’s placement publish, then builds on what it published', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    let settle!: () => void;
    const busy: { settle?: Promise<void>; published?: { ids: string[]; grades: BallotGrades } } = {
      settle: new Promise<void>(resolve => (settle = resolve)),
    };
    const { result } = renderHook(() => useHarness(publish, undefined, busy));
    act(() => result.current.grading.grade(id(2), 'B'));
    await act(async () => Promise.resolve());
    expect(publish).not.toHaveBeenCalled();
    // The placement publish lands: debate 8, placed as B.
    busy.published = {
      ids: [id(1), id(8)],
      grades: new Map([
        [id(1), 'A'],
        [id(8), 'B'],
      ]),
    };
    await act(async () => settle());
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toEqual([id(1), id(2), id(8)]);
  });

  it('opens Re-order through the surface’s placement flow', () => {
    const reorder = vi.fn();
    const { result } = renderHook(() =>
      useBlockGrading({
        blockId: id(99),
        ready: true,
        orderedIds: [id(1)],
        grades: new Map([[id(1), 'A']]),
        setDraft: vi.fn(),
        getBasedOnOrderedIds: () => [id(1)],
        getBasedOnGrades: () => new Map(),
        publish: vi.fn(),
        downRank: vi.fn(),
        reorder,
      })
    );
    result.current.reorder(id(1));
    expect(reorder).toHaveBeenCalledWith(id(1));
  });

  it('holds Re-order while a placement’s Done from the block is still publishing', () => {
    const reorder = vi.fn();
    const { result } = renderHook(() =>
      useBlockGrading({
        blockId: id(97),
        ready: true,
        orderedIds: [id(1)],
        grades: new Map([[id(1), 'A']]),
        setDraft: vi.fn(),
        getBasedOnOrderedIds: () => [id(1)],
        getBasedOnGrades: () => new Map(),
        publish: vi.fn(),
        downRank: vi.fn(),
        reorder,
        publishing: true,
      })
    );
    expect(result.current.reorderBusy).toBe(true);
    result.current.reorder(id(1));
    expect(reorder).not.toHaveBeenCalled();
  });

  it('holds Re-order while a grade is still publishing, whose publish would rewrite the moves', async () => {
    const reorder = vi.fn();
    const pending = deferred();
    const { result } = renderHook(() =>
      useBlockGrading({
        blockId: id(98),
        ready: true,
        orderedIds: [id(1), id(2)],
        grades: new Map([
          [id(1), 'A'],
          [id(2), 'B'],
        ]),
        setDraft: vi.fn(),
        getBasedOnOrderedIds: () => [id(1), id(2)],
        getBasedOnGrades: () => new Map(),
        publish: vi.fn(() => pending.promise),
        downRank: vi.fn(),
        reorder,
      })
    );
    await act(async () => result.current.grade(id(2), 'A'));
    expect(result.current.reorderBusy).toBe(true);
    result.current.reorder(id(1));
    expect(reorder).not.toHaveBeenCalled();
    await act(async () => pending.resolve(true));
    expect(result.current.reorderBusy).toBe(false);
    result.current.reorder(id(1));
    expect(reorder).toHaveBeenCalledWith(id(1));
  });
});
