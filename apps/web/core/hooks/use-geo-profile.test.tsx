import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { profileBySpaceIdQueryKey } from '~/core/io/query-keys';
import type { Profile } from '~/core/types';

const fetchProfile = vi.hoisted(() => vi.fn());

vi.mock('../io/subgraph', () => ({ fetchProfile }));

const { useGeoProfile } = await import('./use-geo-profile');

const ADDRESS = '0x1111111111111111111111111111111111111111' as const;

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => fetchProfile.mockReset());

afterEach(() => vi.restoreAllMocks());

describe('useGeoProfile', () => {
  it('seeds the by-space-id profile cache so avatars elsewhere resolve without a request', async () => {
    const viewer: Profile = {
      id: 'viewer-entity',
      spaceId: 'space-viewer',
      address: ADDRESS,
      avatarUrl: 'https://example.com/viewer.png',
      coverUrl: null,
      name: 'Viewer',
      profileLink: null,
    };
    fetchProfile.mockReturnValue(Effect.succeed(viewer));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useGeoProfile(ADDRESS), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(queryClient.getQueryData(profileBySpaceIdQueryKey('space-viewer'))).toEqual(viewer));
  });

  it('does not cache a wallet address as a space id when there is no registered space', async () => {
    // fetchProfile falls back to `defaultProfile(address, address)` for unregistered wallets.
    const fallback: Profile = {
      id: ADDRESS,
      spaceId: ADDRESS,
      address: ADDRESS,
      avatarUrl: null,
      coverUrl: null,
      name: null,
      profileLink: null,
    };
    fetchProfile.mockReturnValue(Effect.succeed(fallback));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useGeoProfile(ADDRESS), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(queryClient.getQueryData(profileBySpaceIdQueryKey(ADDRESS))).toBeUndefined();
  });
});
