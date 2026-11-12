import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { Space } from '~/core/io/dto/spaces';

import type { BlockRankersPageFetchers } from './fetch-block-rankers';
import { useBlockRankers } from './use-block-rankers';

const ALICE = 'a'.repeat(32);
const BOB = 'b'.repeat(32);
const DEBATE = 'd'.repeat(32);
const OTHER = 'e'.repeat(32);

vi.mock('~/core/hooks/use-spaces-by-ids', () => ({
  useSpacesByIds: (ids: string[]) => {
    const spaces = ids
      .filter(id => id === ALICE)
      .map(id => ({ id, entity: { name: 'Alice', image: 'ipfs://alice' } }) as unknown as Space);
    return { spaces, spacesById: new Map(spaces.map(space => [space.id, space])), isLoading: false };
  },
}));

const page = <T,>(items: T[]) => ({ items, endCursor: null, hasNextPage: false });

function fetchers(): BlockRankersPageFetchers & { calls: number } {
  const state = {
    calls: 0,
    ballotHeads: async () => {
      state.calls++;
      return page([
        { rankEntityId: 'rank-a', authorSpaceId: ALICE, createdAtMs: 1, updatedAtMs: 1 },
        { rankEntityId: 'rank-b', authorSpaceId: BOB, createdAtMs: 2, updatedAtMs: 2 },
      ]);
    },
    membership: async (kind: 'members' | 'editors') => page(kind === 'members' ? [ALICE] : [BOB]),
    ballotItems: async (rankEntityId: string) =>
      page(
        rankEntityId === 'rank-a'
          ? [
              { entityId: OTHER, position: 'a0' },
              { entityId: DEBATE, position: 'a1' },
            ]
          : [{ entityId: DEBATE, position: 'a0' }]
      ),
  };
  return state;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useBlockRankers', () => {
  it('reads nothing and answers empty while the block id is null', () => {
    const fake = fetchers();
    const { result } = renderHook(() => useBlockRankers({ blockId: null, spaceId: 'space' }, fake), { wrapper });

    expect(fake.calls).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.rankerCount(DEBATE)).toBe(0);
    expect(result.current.rankersOf(DEBATE)).toEqual([]);
  });

  it("returns each entity's rankers with identity, whatever spelling the id is asked in", async () => {
    const { result } = renderHook(() => useBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers()), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const dashed = `${DEBATE.slice(0, 8)}-${DEBATE.slice(8, 12)}-${DEBATE.slice(12, 16)}-${DEBATE.slice(16, 20)}-${DEBATE.slice(20)}`;
    expect(result.current.rankerCount(dashed)).toBe(2);
    expect(result.current.rankersOf(DEBATE)).toEqual([
      { spaceId: BOB, rankEntityId: 'rank-b', place: 1, ballotSize: 1, name: null, avatarUrl: null },
      { spaceId: ALICE, rankEntityId: 'rank-a', place: 2, ballotSize: 2, name: 'Alice', avatarUrl: 'ipfs://alice' },
    ]);
    expect(result.current.rankerCount(OTHER)).toBe(1);
    expect([...result.current.rankedEntityIds].sort()).toEqual([DEBATE, OTHER]);
    expect(result.current.rankers.map(r => r.name)).toEqual(['Alice', null]);
  });
});
