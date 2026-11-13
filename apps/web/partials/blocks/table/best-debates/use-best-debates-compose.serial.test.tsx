import { act, renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { resetRankingPublishStateForTests } from '~/core/blocks/ranking/ranking-publish-queue';

import { useBestDebatesCompose } from './use-best-debates-compose';

const mocks = vi.hoisted(() => ({
  placementArgs: null as null | { publish: (ids: string[]) => Promise<boolean>; isSaving: boolean },
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
  useBestDebatesPlacement: (args: { publish: (ids: string[]) => Promise<boolean>; isSaving: boolean }) => {
    mocks.placementArgs = args;
    return { start: vi.fn(), requestPushDown: vi.fn(), dialogs: null, isPlacing: false, activeEntityId: null };
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
});
