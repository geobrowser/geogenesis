import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { profileBySpaceIdQueryKey } from '~/core/io/query-keys';
import type { Profile } from '~/core/types';

const fetchProfilesBySpaceIds = vi.hoisted(() => vi.fn());

vi.mock('~/core/io/subgraph/fetch-profile', () => ({ fetchProfilesBySpaceIds }));

const { useProfilesBySpaceIds } = await import('./use-profiles-by-space-ids');

function profile(spaceId: string): Profile {
  return {
    id: spaceId,
    spaceId,
    address: `0x${spaceId}` as `0x${string}`,
    avatarUrl: `https://example.com/${spaceId}.png`,
    coverUrl: null,
    name: spaceId,
    profileLink: null,
  };
}

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchProfilesBySpaceIds.mockReset();
  fetchProfilesBySpaceIds.mockImplementation((spaceIds: string[]) => Effect.succeed(spaceIds.map(profile)));
});

afterEach(() => vi.restoreAllMocks());

describe('useProfilesBySpaceIds', () => {
  it('resolves every id through a single batched request', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useProfilesBySpaceIds(['space-a', 'space-b', 'space-c']), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.profilesBySpaceId.size).toBe(3));
    expect(fetchProfilesBySpaceIds).toHaveBeenCalledTimes(1);
    expect(fetchProfilesBySpaceIds).toHaveBeenCalledWith(['space-a', 'space-b', 'space-c']);
  });

  it('keeps already-resolved profiles and fetches only the added id', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(queryClient);

    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => useProfilesBySpaceIds(ids), {
      wrapper,
      initialProps: { ids: ['space-a', 'space-b'] },
    });

    await waitFor(() => expect(result.current.profilesBySpaceId.size).toBe(2));
    fetchProfilesBySpaceIds.mockClear();

    rerender({ ids: ['space-viewer', 'space-a', 'space-b'] });

    // The two known avatars stay on screen through the fetch for the new one.
    expect(result.current.profilesBySpaceId.get('space-a')?.avatarUrl).toBe('https://example.com/space-a.png');
    expect(result.current.profilesBySpaceId.get('space-b')?.avatarUrl).toBe('https://example.com/space-b.png');

    await waitFor(() => expect(result.current.profilesBySpaceId.size).toBe(3));
    expect(fetchProfilesBySpaceIds).toHaveBeenCalledTimes(1);
    expect(fetchProfilesBySpaceIds).toHaveBeenCalledWith(['space-viewer']);
  });

  // Downstream memos key on this map. query-core skips `combine` only while the function itself is
  // unchanged, so an inline one re-ran every render — and structural sharing doesn't reach into a
  // Map, so every render handed callers a new identity.
  it('keeps one map identity across renders while the inputs are unchanged', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ids = ['space-a', 'space-b'];

    const { result, rerender } = renderHook(() => useProfilesBySpaceIds(ids), {
      wrapper: makeWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.profilesBySpaceId.size).toBe(2));

    const settled = result.current.profilesBySpaceId;
    rerender();
    rerender();

    expect(result.current.profilesBySpaceId).toBe(settled);
  });

  it('serves a seeded profile with no request, even with queries disabled', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(profileBySpaceIdQueryKey('space-viewer'), profile('space-viewer'));

    const { result } = renderHook(() => useProfilesBySpaceIds(['space-viewer'], false), {
      wrapper: makeWrapper(queryClient),
    });

    expect(result.current.profilesBySpaceId.get('space-viewer')?.avatarUrl).toBe(
      'https://example.com/space-viewer.png'
    );
    expect(fetchProfilesBySpaceIds).not.toHaveBeenCalled();
  });
});
