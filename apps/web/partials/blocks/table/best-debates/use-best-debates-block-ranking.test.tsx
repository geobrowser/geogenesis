import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBestDebatesBlockRanking } from './use-best-debates-block-ranking';

const mocks = vi.hoisted(() => ({
  composeArgs: null as null | Record<string, unknown>,
  recordGrade: vi.fn(),
  publishNow: vi.fn(async (_ids: string[], _grades?: Map<string, string>) => true),
  reorder: vi.fn((_entityId: string) => true),
  published: null as null | { ids: string[]; grades: Map<string, string> },
}));

vi.mock('~/core/blocks/ranking/use-ranking-submissions', () => ({
  useRankingSubmissions: () => ({
    myLastSubmission: mocks.published ? { orderedEntityIds: mocks.published.ids } : null,
    myGrades: mocks.published?.grades ?? new Map(),
    saveMySubmission: vi.fn(),
    isSaving: false,
    isLoading: false,
    ballotReadError: null,
    unsavedDraft: null,
  }),
}));
vi.mock('~/core/blocks/ranking/use-my-pushed-down-debates', () => ({
  useMyPushedDownDebates: () => ({ debates: [] }),
  useBestDebatesBallotPublisher: () => ({ publish: vi.fn(), isPublishing: false }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: [] }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: 'me' }) }));
vi.mock('./use-best-debates-push-down-slot', () => ({
  useBestDebatesPushDownSlot: () => ({ slot: undefined, binding: () => null }),
}));
vi.mock('./best-debate-grading', async importOriginal => ({
  ...(await importOriginal<typeof import('./best-debate-grading')>()),
  useRecordGrade: () => mocks.recordGrade,
}));
vi.mock('./use-best-debates-compose', () => ({
  useBestDebatesCompose: (args: Record<string, unknown>) => {
    mocks.composeArgs = args;
    return {
      publish: vi.fn(),
      publishNow: mocks.publishNow,
      reorder: mocks.reorder,
      whenPublishesSettle: () => Promise.resolve(),
      requestPushDown: vi.fn(),
      placeFromTeam: vi.fn(),
      dialogs: null,
      activeEntityId: null,
      toRankCoverage: null,
      publishing: false,
    };
  },
}));

beforeEach(() => {
  mocks.recordGrade.mockReset();
  mocks.publishNow.mockReset();
  mocks.publishNow.mockResolvedValue(true);
  mocks.reorder.mockReset();
  mocks.reorder.mockReturnValue(true);
  mocks.published = null;
});
afterEach(cleanup);

const renderBlock = () =>
  renderHook(() => useBestDebatesBlockRanking({ enabled: true, blockId: 'b', spaceId: 's', isMobile: false }));

describe('the Best debates block’s publishing (GEO-3729)', () => {
  it('sends a placement’s Done, a closed placement and every Re-order through the one batch', () => {
    renderBlock();
    expect(mocks.composeArgs?.serialPublishes).toBeUndefined();
    expect(typeof mocks.composeArgs?.publishThrough).toBe('function');
    expect(typeof mocks.composeArgs?.onPlacedClose).toBe('function');
    expect(mocks.composeArgs?.publishOnDone).toBe(true);
  });
});

type Ballot = { ids: string[]; grades: Map<string, 'A' | 'B' | 'C'> };
const reorderEnd = (outcome: 'done' | 'closed', before: Ballot, after: Ballot, entityId = 'x') =>
  (mocks.composeArgs?.onReorderEnd as (end: object) => void)({ outcome, entityId, before, after });

describe('Re-order on the block (GEO-3729)', () => {
  const before: Ballot = {
    ids: ['a1', 'a2', 'x', 'b2'],
    grades: new Map([
      ['a1', 'A'],
      ['a2', 'A'],
      ['x', 'B'],
      ['b2', 'B'],
    ]),
  };
  // X moved up into A, between a1 and a2.
  const after: Ballot = {
    ids: ['a1', 'x', 'a2', 'b2'],
    grades: new Map([
      ['a1', 'A'],
      ['x', 'A'],
      ['a2', 'A'],
      ['b2', 'B'],
    ]),
  };

  it('publishes the move once, whether the Placed step ended with Done or a close (Preston, 16 Nov)', async () => {
    for (const outcome of ['done', 'closed'] as const) {
      mocks.published = before;
      mocks.publishNow.mockClear();
      const { result, unmount } = renderBlock();
      act(() => result.current.grading?.reorder('x'));
      expect(mocks.reorder).toHaveBeenCalledWith('x');
      expect(mocks.publishNow).not.toHaveBeenCalled();
      await act(async () => reorderEnd(outcome, before, after));
      expect(mocks.publishNow).toHaveBeenCalledTimes(1);
      expect(mocks.publishNow.mock.calls[0]![0]).toEqual(['a1', 'x', 'a2', 'b2']);
      expect(mocks.publishNow.mock.calls[0]![1]?.get('x')).toBe('A');
      unmount();
    }
  });

  it('counts only the moved debate’s grade change as a reorder', async () => {
    mocks.published = before;
    const { result } = renderBlock();
    act(() => result.current.grading?.reorder('x'));
    await act(async () => reorderEnd('done', before, after));
    expect(mocks.recordGrade).toHaveBeenCalledTimes(1);
    expect(mocks.recordGrade).toHaveBeenCalledWith('x', {
      grade: 'A',
      previousGrade: 'B',
      method: 'reorder',
      mutationKind: 'published',
    });
  });

  it('a Re-order that moved nothing publishes nothing', async () => {
    mocks.published = before;
    const { result } = renderBlock();
    act(() => result.current.grading?.reorder('x'));
    await act(async () => reorderEnd('closed', before, before));
    expect(mocks.publishNow).not.toHaveBeenCalled();
  });
});

describe('grade then fine-tune from the popup: one publish (Preston, 16 Nov)', () => {
  it('a popup grade opens the Placed step, and the grade and its move go out in one publish', async () => {
    mocks.published = {
      ids: ['a1', 'b1'],
      grades: new Map([
        ['a1', 'A'],
        ['b1', 'B'],
      ]),
    };
    const { result } = renderBlock();
    // New debate n, graded A: top of A, and the Placed step opens on it once it's in the draft.
    await act(async () => result.current.grading?.grade('n', 'A'));
    expect(mocks.reorder).toHaveBeenCalledWith('n');
    expect(result.current.myRankOf('n')).toBe(1);
    expect(mocks.publishNow).not.toHaveBeenCalled();
    // Moved down one (still A), then Done.
    const opened = {
      ids: ['n', 'a1', 'b1'],
      grades: new Map([
        ['n', 'A'],
        ['a1', 'A'],
        ['b1', 'B'],
      ]),
    } as Ballot;
    const moved = { ...opened, ids: ['a1', 'n', 'b1'] } as Ballot;
    await act(async () => reorderEnd('done', opened, moved, 'n'));
    expect(mocks.publishNow).toHaveBeenCalledTimes(1);
    expect(mocks.publishNow.mock.calls[0]![0]).toEqual(['a1', 'n', 'b1']);
    expect(mocks.publishNow.mock.calls[0]![1]?.get('n')).toBe('A');
  });
});
