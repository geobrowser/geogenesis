import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';

import { useRankingVoters } from './use-ranking-voters';

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

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [] }),
}));

const profile = (spaceId: string, avatarUrl: string | null) => ({
  id: `profile-${spaceId}`,
  spaceId,
  address: `0x${spaceId}`,
  avatarUrl,
  coverUrl: null,
  name: `Curator ${spaceId}`,
  profileLink: null,
});

const space = (id: string, image: string) => ({ id, entity: { image } });

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mocks.fetchProfilesBySpaceIds.mockReset();
  mocks.getSpaces.mockReset();
  mocks.getSpaces.mockReturnValue(Effect.succeed([]));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const refs = [
  { rankEntityId: 'rank-a', spaceId: 'space-a' },
  { rankEntityId: 'rank-b', spaceId: 'space-b' },
];

describe('useRankingVoters', () => {
  it('never fetches spaces when every profile carries an avatar', async () => {
    mocks.fetchProfilesBySpaceIds.mockReturnValue(
      Effect.succeed([profile('space-a', 'ipfs://a'), profile('space-b', 'ipfs://b')])
    );

    const { result } = renderHook(() => useRankingVoters(refs), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.voters[0].avatarUrl).toBe('ipfs://a'));

    expect(mocks.getSpaces).not.toHaveBeenCalled();
  });

  it('fetches only the spaces whose profile came back without one', async () => {
    mocks.fetchProfilesBySpaceIds.mockReturnValue(
      Effect.succeed([profile('space-a', 'ipfs://a'), profile('space-b', null)])
    );
    mocks.getSpaces.mockReturnValue(Effect.succeed([space('space-b', 'ipfs://from-space')]));

    const { result } = renderHook(() => useRankingVoters(refs), { wrapper: createWrapper() });

    await waitFor(() => expect(mocks.getSpaces).toHaveBeenCalled());

    expect(mocks.getSpaces).toHaveBeenCalledWith(expect.objectContaining({ spaceIds: ['space-b'] }));
    await waitFor(() => expect(result.current.voters[1].avatarUrl).toBe('ipfs://from-space'));
    expect(result.current.voters[0].avatarUrl).toBe('ipfs://a');
  });

  it('treats the placeholder image as no avatar at all', async () => {
    mocks.fetchProfilesBySpaceIds.mockReturnValue(
      Effect.succeed([profile('space-a', PLACEHOLDER_SPACE_IMAGE), profile('space-b', 'ipfs://b')])
    );

    const { result } = renderHook(() => useRankingVoters(refs), { wrapper: createWrapper() });

    await waitFor(() => expect(mocks.getSpaces).toHaveBeenCalled());

    expect(mocks.getSpaces).toHaveBeenCalledWith(expect.objectContaining({ spaceIds: ['space-a'] }));

    await waitFor(() => expect(result.current.voters[0].avatarUrl).toBeNull());
  });
});
