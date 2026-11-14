import { act, renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { resetRankingPublishStateForTests } from '~/core/blocks/ranking/ranking-publish-queue';

import { useBestDebatesCompose } from './use-best-debates-compose';

const mocks = vi.hoisted(() => ({
  placementArgs: null as null | {
    publish: (ids: string[]) => Promise<boolean>;
    isSaving: boolean;
    onReorderEnd?: (entityId: string, outcome: 'done' | 'closed') => void;
  },
  placementReorder: vi.fn(),
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
      activeEntityId: null,
    };
  },
}));
vi.mock('./best-debates-team-row', () => ({ BestDebatesTeamRowContent: () => null }));
vi.mock('./best-debates-to-rank-list', () => ({ BestDebatesToRankList: () => null }));

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(r => (resolve = r));
  return { promise, resolve };
}

describe('publishing from the Best debates block (GEO-3729)', () => {
  it('runs a placement’s Done and a grade one at a time, and shows the queued one as saving', async () => {
    resetRankingPublishStateForTests();
    const first = deferred();
    const saves: string[][] = [];
    const saveMySubmission = vi.fn(async (slots: Array<{ id: string }>) => {
      saves.push(slots.map(slot => slot.id));
      if (saves.length === 1) await first.promise;
      return {
        rankEntityId: 'r',
        authorSpaceId: 'me',
        orderedEntityIds: slots.map(slot => slot.id),
        grades: new Map(),
        authorName: null,
        authorAvatarUrl: null,
        indexingSettled: Promise.resolve(null),
      };
    });
    const { result } = renderHook(() =>
      useBestDebatesCompose({
        enabled: true,
        blockId: 'block',
        blockSpaceId: 'debates',
        isMobile: false,
        orderedIds: ['a'],
        setOrderedIds: vi.fn(),
        hasUnpublishedChanges: false,
        nameOf: () => null,
        personalSpaceId: 'me',
        saveMySubmission,
        isSaving: false,
        publishOnDone: true,
        serialPublishes: true,
      })
    );
    let placement!: Promise<boolean>;
    let grade!: Promise<boolean>;
    await act(async () => {
      placement = mocks.placementArgs!.publish(['a', 'p']);
      grade = result.current.publish(['a', 'g']);
    });
    expect(saves).toEqual([['a', 'p']]);
    expect(mocks.placementArgs!.isSaving).toBe(true);
    await act(async () => first.resolve(undefined));
    await expect(placement).resolves.toBe(true);
    await expect(grade).resolves.toBe(true);
    expect(saves).toEqual([
      ['a', 'p'],
      ['a', 'g'],
    ]);
  });

  it('builds a queued publish on the base it was queued with, not on one a publish ahead moved', async () => {
    resetRankingPublishStateForTests();
    const first = deferred();
    const bases: unknown[] = [];
    let base = { ids: ['a'], grades: new Map() };
    const saveMySubmission = vi.fn(async (slots: Array<{ id: string }>, basedOn?: unknown) => {
      bases.push(basedOn);
      if (bases.length === 1) await first.promise;
      return {
        rankEntityId: 'r',
        authorSpaceId: 'me',
        orderedEntityIds: slots.map(slot => slot.id),
        grades: new Map(),
        authorName: null,
        authorAvatarUrl: null,
        indexingSettled: Promise.resolve(null),
      };
    });
    const { result } = renderHook(() =>
      useBestDebatesCompose({
        enabled: true,
        blockId: 'block2',
        blockSpaceId: 'debates',
        isMobile: false,
        orderedIds: ['a'],
        setOrderedIds: vi.fn(),
        hasUnpublishedChanges: false,
        nameOf: () => null,
        personalSpaceId: 'me',
        saveMySubmission,
        isSaving: false,
        serialPublishes: true,
        getPublishedBase: () => base,
      })
    );
    const queuedWith = base;
    await act(async () => {
      void result.current.publish(['a', 'g']);
      void result.current.publish(['a', 'p']);
    });
    // The first publish merges in another device's debate and moves the base.
    base = { ids: ['a', 'y'], grades: new Map() };
    await act(async () => first.resolve(undefined));
    await act(async () => Promise.resolve());
    expect(bases[1]).toBe(queuedWith);
  });
});

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
