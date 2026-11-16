import { act, renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { useBestDebatesCompose } from './use-best-debates-compose';

const mocks = vi.hoisted(() => ({
  placementArgs: null as null | {
    publish: (ids: string[]) => Promise<boolean>;
    isSaving: boolean;
    onReorderEnd?: (entityId: string, outcome: 'done' | 'closed') => void;
  },
  placementReorder: vi.fn(() => true),
  isDoneOut: false,
}));

vi.mock('~/core/blocks/ranking/use-best-debates-to-rank', () => ({
  useBestDebatesToRank: () => ({ debates: [], isLoading: false, error: null }),
  refreshRankersAfterIndexing: vi.fn(),
}));
vi.mock('~/core/blocks/ranking/use-block-rankers', () => ({
  useBlockRankers: () => ({ status: 'ready', rankersOf: () => [], rankerCount: () => 0, invalidate: vi.fn() }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: [] }),
}));
vi.mock('~/core/blocks/ranking/best-debates-debates', () => ({
  fetchDebateOwnSpaces: async (ids: string[]) => new Map(ids.map(id => [id, 'space'])),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('./best-debates-team-tools', () => ({ useBestDebatesTeamTools: () => ({ topicIds: [] }) }));
vi.mock('./use-best-debates-placement', () => ({
  useBestDebatesPlacement: (args: NonNullable<typeof mocks.placementArgs>) => {
    mocks.placementArgs = args;
    return {
      start: vi.fn(),
      reorder: mocks.placementReorder,
      requestPushDown: vi.fn(),
      dialogs: null,
      isPlacing: false,
      isDoneOut: mocks.isDoneOut,
      activeEntityId: null,
    };
  },
}));
vi.mock('./best-debates-team-row', () => ({ BestDebatesTeamRowContent: () => null }));
vi.mock('./best-debates-to-rank-list', () => ({ BestDebatesToRankList: () => null }));

describe('Re-order (GEO-3729)', () => {
  it('hands back the draft from when Re-order opened, and the draft as its step ended', () => {
    const onReorderEnd = vi.fn();
    type Draft = { ids: string[]; grades: Map<string, 'A' | 'B'> };
    const before: Draft = { ids: ['a', 'x'], grades: new Map([['x', 'B']]) };
    const { result, rerender } = renderHook(
      ({ ids, grades }: Draft) =>
        useBestDebatesCompose({
          enabled: true,
          blockId: 'block3',
          blockSpaceId: 'debates',
          isMobile: false,
          orderedIds: ids,
          grades,
          setOrderedIds: vi.fn(),
          hasUnpublishedChanges: false,
          nameOf: () => null,
          personalSpaceId: 'me',
          saveMySubmission: vi.fn(),
          isSaving: false,
          onReorderEnd,
        }),
      { initialProps: before }
    );
    act(() => result.current.reorder('x'));
    expect(mocks.placementReorder).toHaveBeenCalledWith('x');
    const after: Draft = { ids: ['x', 'a'], grades: new Map([['x', 'A']]) };
    rerender(after);
    act(() => mocks.placementArgs!.onReorderEnd!('x', 'closed'));
    expect(onReorderEnd).toHaveBeenCalledWith({ outcome: 'closed', entityId: 'x', before, after });
    // Once only: a later end without a Re-order open says nothing.
    act(() => mocks.placementArgs!.onReorderEnd!('x', 'done'));
    expect(onReorderEnd).toHaveBeenCalledTimes(1);
  });
});

describe('publishing, as Re-order waits on it (GEO-3729)', () => {
  it('counts a placement Done from its press, before its publish is queued', () => {
    mocks.isDoneOut = true;
    const { result } = renderHook(() =>
      useBestDebatesCompose({
        enabled: true,
        blockId: 'block4',
        blockSpaceId: 'debates',
        isMobile: false,
        orderedIds: ['a'],
        setOrderedIds: vi.fn(),
        hasUnpublishedChanges: false,
        nameOf: () => null,
        personalSpaceId: 'me',
        saveMySubmission: vi.fn(),
        isSaving: false,
      })
    );
    expect(result.current.publishing).toBe(true);
    mocks.isDoneOut = false;
  });
});
