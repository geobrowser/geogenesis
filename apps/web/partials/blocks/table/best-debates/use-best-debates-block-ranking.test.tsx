import { act, renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { useBestDebatesBlockRanking } from './use-best-debates-block-ranking';

const mocks = vi.hoisted(() => ({ composeArgs: null as null | Record<string, unknown>, recordGrade: vi.fn() }));

vi.mock('~/core/blocks/ranking/use-ranking-submissions', () => ({
  useRankingSubmissions: () => ({
    myLastSubmission: null,
    myGrades: new Map(),
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
      whenPublishesSettle: () => Promise.resolve(),
      requestPushDown: vi.fn(),
      placeFromTeam: vi.fn(),
      dialogs: null,
      activeEntityId: null,
      toRankCoverage: null,
    };
  },
}));

describe('the Best debates block’s publishing (GEO-3729)', () => {
  it('queues its publishes, each built on the base it was queued with', () => {
    renderHook(() => useBestDebatesBlockRanking({ enabled: true, blockId: 'b', spaceId: 's', isMobile: false }));
    expect(mocks.composeArgs?.serialPublishes).toBe(true);
    expect(typeof mocks.composeArgs?.getPublishedBase).toBe('function');
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
  // X moved up into A; meanwhile a publish merged in Y (added elsewhere) and regraded b2 to C.
  const after: Ballot = {
    ids: ['a1', 'x', 'a2', 'y', 'b2'],
    grades: new Map([
      ['a1', 'A'],
      ['x', 'A'],
      ['a2', 'A'],
      ['y', 'B'],
      ['b2', 'C'],
    ]),
  };

  it('puts the draft back when the Placed step closes without Done, since nothing would publish it', () => {
    mocks.recordGrade.mockReset();
    const { result } = renderHook(() =>
      useBestDebatesBlockRanking({ enabled: true, blockId: 'b', spaceId: 's', isMobile: false })
    );
    act(() => reorderEnd('closed', before, after));
    // Only X goes back (to B, under the A tier); Y and b2's new grade, merged in meanwhile, stay.
    expect(result.current.myRankOf('a2')).toBe(2);
    expect(result.current.myRankOf('x')).toBe(3);
    expect(result.current.myRankOf('y')).toBe(4);
    expect(result.current.grading?.gradeOf('x')).toBe('B');
    expect(result.current.grading?.gradeOf('b2')).toBe('C');
    expect(mocks.recordGrade).not.toHaveBeenCalled();
  });

  it('counts only the moved debate’s grade change as a reorder, never one merged in', () => {
    mocks.recordGrade.mockReset();
    renderHook(() => useBestDebatesBlockRanking({ enabled: true, blockId: 'b', spaceId: 's', isMobile: false }));
    act(() => reorderEnd('done', before, after));
    expect(mocks.recordGrade).toHaveBeenCalledTimes(1);
    expect(mocks.recordGrade).toHaveBeenCalledWith('x', {
      grade: 'A',
      previousGrade: 'B',
      method: 'reorder',
      mutationKind: 'published',
    });
  });
});
