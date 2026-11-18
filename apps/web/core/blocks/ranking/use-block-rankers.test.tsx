import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BlockRankersPageFetchers } from './fetch-block-rankers';
import { BLOCK_RANKERS_STALE_TIME_MS, blockRankersQueryKey, useBlockRankers } from './use-block-rankers';

const ALICE = 'a'.repeat(32);
const BOB = 'b'.repeat(32);
const DEBATE = 'd'.repeat(32);
const OTHER = 'e'.repeat(32);

const mocks = vi.hoisted(() => ({
  fetchProfilesBySpaceIds: vi.fn(),
  getSpaces: vi.fn(),
}));

vi.mock('~/core/io/subgraph/fetch-profile', () => ({
  fetchProfilesBySpaceIds: (spaceIds: string[]) => mocks.fetchProfilesBySpaceIds(spaceIds),
}));

vi.mock('~/core/io/queries', () => ({
  getSpaces: (args: { spaceIds?: string[] }) => mocks.getSpaces(args),
}));

beforeEach(() => {
  mocks.fetchProfilesBySpaceIds.mockReset();
  mocks.getSpaces.mockReset();
  // Alice has a profile with an avatar; Bob has no profile, only a personal space with an image.
  mocks.fetchProfilesBySpaceIds.mockImplementation((spaceIds: string[]) =>
    Effect.succeed(
      spaceIds
        .filter(id => id === ALICE)
        .map(spaceId => ({
          id: `profile-${spaceId}`,
          spaceId,
          address: '0xalice',
          avatarUrl: 'ipfs://alice-profile',
          coverUrl: null,
          name: 'Alice',
          profileLink: null,
        }))
    )
  );
  mocks.getSpaces.mockImplementation(({ spaceIds = [] }: { spaceIds?: string[] }) =>
    Effect.succeed(spaceIds.map(id => ({ id, entity: { name: 'Bob space', image: 'ipfs://bob-space' } })))
  );
});

const page = <T,>(items: T[]) => ({ items, endCursor: null, hasNextPage: false });

function fetchers(): BlockRankersPageFetchers & { calls: number; fail: boolean } {
  const state = {
    calls: 0,
    fail: false,
    ballotHeads: async () => {
      state.calls++;
      if (state.fail) throw new Error('API down');
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
              { entityId: OTHER, toSpaceId: 'debates', position: 'a0' },
              { entityId: DEBATE, toSpaceId: 'debates', position: 'a1' },
            ]
          : [{ entityId: DEBATE, toSpaceId: 'debates', position: 'a0' }]
      ),
  };
  return state;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useBlockRankers', () => {
  it("is 'disabled' with unknown (null) answers while the block id is null, and reads nothing", () => {
    const fake = fetchers();
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlockRankers({ blockId: null, spaceId: 'space' }, fake), { wrapper });

    expect(fake.calls).toBe(0);
    expect(result.current.status).toBe('disabled');
    expect(result.current.rankerCount(DEBATE)).toBeNull();
    expect(result.current.rankersOf(DEBATE)).toBeNull();
    expect(result.current.rankedEntityIds).toBeNull();
    expect(result.current.rankers).toBeNull();
  });

  it("is 'loading' with null answers, never 0, before the first read lands", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers()), {
      wrapper,
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.rankerCount(DEBATE)).toBeNull();
  });

  it("is 'error' with null answers when the first read fails", async () => {
    const fake = fetchers();
    fake.fail = true;
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlockRankers({ blockId: 'block', spaceId: 'space' }, fake), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.message).toBe('API down');
    expect(result.current.rankerCount(DEBATE)).toBeNull();
  });

  it("is 'ready' with counts, and 0 means nobody ranked it", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers()), {
      wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const dashed = `${DEBATE.slice(0, 8)}-${DEBATE.slice(8, 12)}-${DEBATE.slice(12, 16)}-${DEBATE.slice(16, 20)}-${DEBATE.slice(20)}`;
    expect(result.current.rankerCount(dashed)).toBe(2);
    expect(result.current.rankerCount(OTHER)).toBe(1);
    expect(result.current.rankerCount('f'.repeat(32))).toBe(0);
    expect(result.current.rankersOf('f'.repeat(32))).toEqual([]);
    expect([...(result.current.rankedEntityIds ?? [])].sort()).toEqual([DEBATE, OTHER]);
    expect(result.current.error).toBeNull();
  });

  it('resolves identities like the voters popover: profile first, space image as fallback, with a seed', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlockRankers({ blockId: 'block', spaceId: 'space' }, fetchers()), {
      wrapper,
    });

    await waitFor(() => expect(result.current.rankersOf(DEBATE)?.[0]?.avatarUrl).toBe('ipfs://bob-space'));
    expect(result.current.rankersOf(DEBATE)).toEqual([
      {
        spaceId: BOB,
        rankEntityId: 'rank-b',
        place: 1,
        ballotSize: 1,
        name: null,
        avatarUrl: 'ipfs://bob-space',
        fallbackSeed: BOB,
        address: null,
      },
      {
        spaceId: ALICE,
        rankEntityId: 'rank-a',
        place: 2,
        ballotSize: 2,
        name: 'Alice',
        avatarUrl: 'ipfs://alice-profile',
        fallbackSeed: '0xalice',
        address: '0xalice',
      },
    ]);
    expect(result.current.isLoadingIdentities).toBe(false);
  });

  it("keeps the last good answer, still 'ready', with error set, when a re-read fails", async () => {
    const fake = fetchers();
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlockRankers({ blockId: 'block', spaceId: 'space' }, fake), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    fake.fail = true;
    await act(() => result.current.invalidate());

    await waitFor(() => expect(result.current.error?.message).toBe('API down'));
    expect(result.current.status).toBe('ready');
    expect(result.current.rankerCount(DEBATE)).toBe(2);
  });

  it('re-reads on invalidate, not on window focus, and stays fresh for minutes', async () => {
    const fake = fetchers();
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useBlockRankers({ blockId: 'block', spaceId: 'space' }, fake), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fake.calls).toBe(1);

    const query = client.getQueryCache().find({ queryKey: blockRankersQueryKey('block', 'space') });
    expect((query?.options as { refetchOnWindowFocus?: boolean }).refetchOnWindowFocus).toBe(false);
    expect(BLOCK_RANKERS_STALE_TIME_MS).toBeGreaterThanOrEqual(5 * 60_000);

    await act(() => result.current.invalidate());
    await waitFor(() => expect(fake.calls).toBe(2));
  });
});
