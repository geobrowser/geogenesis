import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { useNextDebate } from './use-next-debate';

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CLAIMS = 'e614cce1c4ce45868304fd1237119eb2';
const VIDEOS = 'c48dc314fa7148aeb967139160456f1d';
const SUPPORTED_BY = 'd19fad5651364a7f8309daf5c7bf99dd';
const OPPOSED_BY = 'c57de77c3eee4e7ba0d2258d18aab11c';

const relation = (typeId: string, toId: string) => ({ type: { id: typeId }, toEntity: { id: toId }, spaceId: SPACE });
const debateEntity = (id: string, claimId: string) => ({
  id,
  name: id,
  relations: [
    relation(CLAIMS, claimId),
    relation(VIDEOS, `video-${id}`),
    relation(SUPPORTED_BY, `ada-${id}`),
    relation(OPPOSED_BY, `bo-${id}`),
  ],
});

const mocks = vi.hoisted(() => ({ watched: new Set<string>(), reads: 0 }));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: { id?: { in: string[] } } }) =>
    where.id
      ? { entities: where.id.in.map(id => ({ id, name: `Claim ${id}`, relations: [] })), isLoading: false }
      : {
          entities: [debateEntity('current', 'c0'), debateEntity('first', 'c1'), debateEntity('second', 'c2')],
          isLoading: false,
        },
}));
vi.mock('./use-debates-best-order', () => ({
  useDebatesBestOrder: () => ({
    rankByDebateId: new Map([
      ['first', 0],
      ['second', 1],
    ]),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('~/core/claims/browse/use-debate-keyframes', () => ({
  useDebateKeyframes: () => new Map([['first', 'ipfs://first-frame']]),
}));
vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: (ids: string[]) => ({
    profilesBySpaceId: new Map(ids.map(id => [id, { name: id.startsWith('ada') ? 'Ada' : 'Bo', avatarUrl: null }])),
    isLoading: false,
  }),
}));
vi.mock('~/core/debates/watched-debates', () => ({
  readWatchedDebateIds: () => {
    mocks.reads += 1;
    return new Set(mocks.watched);
  },
  markDebateWatched: vi.fn(),
}));

const debate = {
  id: 'current',
  claim: { space_id: SPACE, claim_entity_id: 'c0' },
} as unknown as Debate;

describe('useNextDebate', () => {
  beforeEach(() => {
    mocks.watched = new Set();
    mocks.reads = 0;
  });

  it('offers the best-ranked debate, with its key frame and its sides from the graph', () => {
    const { result } = renderHook(() => useNextDebate(debate, true, false));

    expect(result.current).toMatchObject({
      debateId: 'first',
      claimName: 'Claim c1',
      keyFrame: 'ipfs://first-frame',
      participants: [
        { spaceId: 'ada-first', name: 'Ada' },
        { spaceId: 'bo-first', name: 'Bo' },
      ],
    });
  });

  it('re-reads what has been watched when the card comes on screen, not only when it went live', () => {
    // The player stayed mounted while the viewer finished `first` somewhere else in the feed.
    const { result, rerender } = renderHook(({ shown }) => useNextDebate(debate, true, shown), {
      initialProps: { shown: false },
    });
    expect(result.current?.debateId).toBe('first');

    mocks.watched = new Set(['first']);
    rerender({ shown: true });

    expect(result.current?.debateId).toBe('second');
  });

  it('suggests nothing while the debate has not been live', () => {
    const { result } = renderHook(() => useNextDebate(debate, false, false));
    expect(result.current).toBeNull();
  });
});
