import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BallotGrades } from '~/core/blocks/ranking/ranking-grades';
import { getUnsavedRankingDraft, resetRankingPublishStateForTests } from '~/core/blocks/ranking/ranking-publish-queue';

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
  busy: { published?: { ids: string[]; grades: BallotGrades } } = {},
  options: { reorder?: (entityId: string) => boolean; placeAfterGrade?: boolean; draftKey?: string } = {}
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
    publish: async (ids, grades) => {
      const ok = await publish(ids, grades);
      if (ok) published.current = merge(ids, grades ?? new Map());
      return ok;
    },
    downRank: vi.fn(),
    ...options,
  });
  return { grading, draft, setDraft: setDraftState };
}

beforeEach(() => mocks.record.mockReset());
afterEach(cleanup);

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

  it('keeps every change when the publish fails, and Try again sends them all', async () => {
    const publish = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { result } = renderHook(() => useHarness(publish));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    // Nothing is dropped: the grade stays on the ranking, marked as not saved.
    expect(result.current.draft.ids).toEqual([id(1), id(2)]);
    expect(result.current.grading.gradeOf(id(2))).toBe('B');
    expect(result.current.grading.publishFailed?.(id(2))).toBe(true);
    expect(result.current.grading.isSaving(id(2))).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
    // A grade given after the failure goes with the retry, in one publish.
    await act(async () => result.current.grading.grade(id(3), 'C'));
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]![0]).toEqual([id(1), id(2), id(3)]);
    expect(result.current.grading.publishFailed?.(id(2))).toBe(false);
    expect(mocks.record.mock.calls.map(([entityId]) => entityId)).toEqual([id(2), id(3)]);
  });

  it('Try again resends what failed', async () => {
    const publish = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const { result } = renderHook(() => useHarness(publish));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    await act(async () => result.current.grading.retry?.());
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]![0]).toEqual([id(1), id(2)]);
    expect(result.current.grading.publishFailed?.(id(2))).toBe(false);
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

  it('never holds Re-order back: it opens while a grade is publishing', async () => {
    const reorder = vi.fn(() => true);
    const pending = deferred();
    const publish = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useHarness(publish, undefined, {}, { reorder }));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    expect(result.current.grading.reorderBusy).toBe(false);
    act(() => result.current.grading.reorder(id(1)));
    expect(reorder).toHaveBeenCalledWith(id(1));
  });
});

describe('one publish per sitting from the block (Preston, 16 Nov)', () => {
  it('a popup grade opens the Placed step, and the grade and its move publish once, when it ends', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const reorder = vi.fn(() => true);
    const { result } = renderHook(() => useHarness(publish, undefined, {}, { reorder, placeAfterGrade: true }));
    // Published: 1 (A). Grade 2 as A: it goes to the top of A, and the Placed step opens on it.
    await act(async () => result.current.grading.grade(id(2), 'A'));
    expect(reorder).toHaveBeenCalledWith(id(2));
    expect(result.current.draft.ids).toEqual([id(2), id(1)]);
    // Nothing goes out while the step is open.
    expect(publish).not.toHaveBeenCalled();
    // Move it down one, then Done.
    const before = result.current.draft;
    const after = { ids: [id(1), id(2)], grades: before.grades };
    act(() => result.current.setDraft(after));
    await act(async () => result.current.grading.endPlaced(id(2), before, after));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0]).toEqual([id(1), id(2)]);
    expect((publish.mock.calls[0]![1] as BallotGrades).get(id(2))).toBe('A');
    expect(mocks.record.mock.calls.map(([entityId, change]) => [entityId, change.grade, change.method])).toEqual([
      [id(2), 'A', 'popup'],
    ]);
  });

  it('a list grade (not the popup) publishes straight away, without the Placed step', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const reorder = vi.fn(() => true);
    const { result } = renderHook(() => useHarness(publish, undefined, {}, { reorder, placeAfterGrade: true }));
    await act(async () => result.current.grading.grade(id(2), 'B', 'list'));
    expect(reorder).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('changes made while a publish is out (a grade, a Re-order, a Down rank) go in one follow-up', async () => {
    const first = deferred();
    const publish = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(true);
    const reorder = vi.fn(() => true);
    const { result } = renderHook(() => useHarness(publish, undefined, {}, { reorder }));
    // 1 (A) is published. Grade 2 as B: out at once.
    await act(async () => result.current.grading.grade(id(2), 'B', 'list'));
    expect(publish).toHaveBeenCalledTimes(1);

    // Meanwhile: grade 3 as C, then Re-order 2 up into A, then Down rank 1 off the ballot.
    act(() => result.current.grading.grade(id(3), 'C', 'list'));
    act(() => result.current.grading.reorder(id(2)));
    const before = result.current.draft;
    const after = {
      ids: [id(2), id(1), id(3)],
      grades: new Map([...before.grades, [id(2), 'A' as const]]),
    };
    act(() => result.current.setDraft(after));
    act(() => result.current.grading.endPlaced(id(2), before, after));
    let downRanked: Promise<boolean> | undefined;
    act(() => {
      downRanked = result.current.grading.commitBallot([id(2), id(3)]);
    });
    expect(publish).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve(true));
    // Exactly one more publish, carrying all three.
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]![0]).toEqual([id(2), id(3)]);
    const grades = publish.mock.calls[1]![1] as BallotGrades;
    expect(grades.get(id(2))).toBe('A');
    expect(grades.get(id(3))).toBe('C');
    await expect(downRanked).resolves.toBe(true);
  });

  it('a change the last publish already carried sends nothing again', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useHarness(publish));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    expect(publish).toHaveBeenCalledTimes(1);
    const draft = result.current.draft;
    await act(async () => {
      await result.current.grading.commit([id(2)], current => ({ ...current, ids: [...current.ids] }));
    });
    expect(draft.ids).toEqual([id(1), id(2)]);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('asks before the tab closes while a change is unsent', async () => {
    const pending = deferred();
    const publish = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useHarness(publish));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    const warned = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(warned);
    expect(warned.defaultPrevented).toBe(true);
    await act(async () => pending.resolve(true));
    const quiet = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(quiet);
    expect(quiet.defaultPrevented).toBe(false);
  });

  it('a popup grade moved across a tier line in its Placed step counts once, as the popup’s', async () => {
    const publish = vi.fn().mockResolvedValue(true);
    const reorder = vi.fn(() => true);
    const { result } = renderHook(() => useHarness(publish, undefined, {}, { reorder, placeAfterGrade: true }));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    const before = result.current.draft;
    // Nudged above the A tier's last debate: it takes A.
    const after = { ids: [id(2), id(1)], grades: new Map([...before.grades, [id(2), 'A' as const]]) };
    act(() => result.current.setDraft(after));
    await act(async () => result.current.grading.endPlaced(id(2), before, after));
    expect(mocks.record.mock.calls.map(([entityId, change]) => [entityId, change.grade, change.method])).toEqual([
      [id(2), 'A', 'popup'],
    ]);
  });

  it('hands back edits that never went out when the block goes away', async () => {
    resetRankingPublishStateForTests();
    const publish = vi.fn().mockResolvedValue(false);
    const { result, unmount } = renderHook(() => useHarness(publish, undefined, {}, { draftKey: 'me:block' }));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    expect(getUnsavedRankingDraft('me:block')).toBeNull();
    unmount();
    const handedBack = getUnsavedRankingDraft('me:block');
    expect(handedBack?.orderedEntityIds).toEqual([id(1), id(2)]);
    expect(handedBack?.grades?.get(id(2))).toBe('B');
    expect(handedBack?.baseOrderedIds).toEqual([id(1)]);
    resetRankingPublishStateForTests();
  });

  it('hands back nothing when everything went out', async () => {
    resetRankingPublishStateForTests();
    const publish = vi.fn().mockResolvedValue(true);
    const { result, unmount } = renderHook(() => useHarness(publish, undefined, {}, { draftKey: 'me:block' }));
    await act(async () => result.current.grading.grade(id(2), 'B'));
    unmount();
    expect(getUnsavedRankingDraft('me:block')).toBeNull();
  });
});
