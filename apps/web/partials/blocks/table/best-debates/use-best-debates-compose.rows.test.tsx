import { cleanup, render, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBestDebatesCompose } from './use-best-debates-compose';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  rowProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('~/core/blocks/ranking/use-best-debates-to-rank', () => ({
  useBestDebatesToRank: () => ({ debates: [], isLoading: false, error: null }),
}));
vi.mock('~/core/blocks/ranking/use-block-rankers', () => ({
  useBlockRankers: () => ({ status: 'ready', rankersOf: () => [], rankerCount: () => 0, invalidate: vi.fn() }),
}));
vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: [] }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('./best-debates-team-tools', () => ({
  useBestDebatesTeamTools: () => ({ topicIds: [] }),
}));
vi.mock('./use-best-debates-placement', () => ({
  useBestDebatesPlacement: () => ({
    start: mocks.start,
    requestPushDown: vi.fn(),
    dialogs: null,
    isPlacing: false,
    activeEntityId: null,
  }),
}));
vi.mock('./best-debates-team-row', () => ({
  BestDebatesTeamRowContent: (props: Record<string, unknown>) => {
    mocks.rowProps.push(props);
    return null;
  },
}));
vi.mock('./best-debates-to-rank-list', () => ({ BestDebatesToRankList: () => null }));

afterEach(() => {
  cleanup();
  mocks.start.mockClear();
  mocks.rowProps.length = 0;
});

function useCompose(orderedIds: string[]) {
  return useBestDebatesCompose({
    enabled: true,
    blockId: 'block',
    blockSpaceId: 'debates',
    isMobile: true,
    orderedIds,
    setOrderedIds: vi.fn(),
    hasUnpublishedChanges: false,
    nameOf: () => null,
    personalSpaceId: 'me',
    saveMySubmission: vi.fn(async () => null),
    isSaving: false,
  });
}

// The team column's rows (All, By space, search) are only click targets that open the video
// (Preston, 13 Nov), so their Rank button is the one way to rank from them, and on a phone the
// only one (touch has no drag).
describe('the team rows useBestDebatesCompose draws', () => {
  it('gives a debate not yet in your ranking a Rank button that places it from the team', () => {
    const { result } = renderHook(() => useCompose(['x']));
    render(
      <>
        {result.current.teamView.renderRow?.({
          entityId: 'd1',
          name: 'D1',
          spaceId: 's',
          isInMyRanking: false,
        })}
      </>
    );
    const onRank = mocks.rowProps.at(-1)?.onRank as (() => void) | undefined;
    expect(onRank).toBeTypeOf('function');
    onRank?.();
    expect(mocks.start).toHaveBeenCalledWith('d1', 'team');
  });

  it('gives a debate already in your ranking no Rank button', () => {
    const { result } = renderHook(() => useCompose(['d1']));
    render(
      <>
        {result.current.teamView.renderRow?.({
          entityId: 'd1',
          name: 'D1',
          spaceId: 's',
          isInMyRanking: true,
        })}
      </>
    );
    expect(mocks.rowProps.at(-1)?.onRank).toBeUndefined();
    expect(mocks.rowProps.at(-1)?.myRank).toBe(1);
  });
});
