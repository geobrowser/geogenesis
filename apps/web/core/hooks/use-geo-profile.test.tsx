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

  // GEO-2841 review. `fetchProfile` collapses a real-but-empty profile into `defaultProfile`, and
  // once that value is under a space key no reader can tell it from "this person has no profile" —
  // the debates avatar resolver reads it as absent and keeps whatever it was already showing.
  it('does not seed a collapsed placeholder profile', async () => {
    const collapsed: Profile = {
      id: 'viewer-entity',
      spaceId: 'space-viewer',
      address: ADDRESS,
      avatarUrl: null,
      coverUrl: null,
      name: null,
      profileLink: null,
    };
    fetchProfile.mockReturnValue(Effect.succeed(collapsed));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useGeoProfile(ADDRESS), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(queryClient.getQueryData(['profile', ADDRESS])).toEqual(collapsed));
    expect(queryClient.getQueryData(profileBySpaceIdQueryKey('space-viewer'))).toBeUndefined();
  });

  // The other direction, and the reason the guard cannot simply be "is it empty". Clearing an
  // avatar leaves a real profile that is legitimately empty; `useEditProfile` writes that to the
  // address entry and leaves this effect to carry it to every avatar surface.
  it('seeds a real profile whose avatar has been removed, so the removal propagates', async () => {
    const cleared: Profile = {
      id: 'viewer-entity',
      spaceId: 'space-viewer',
      address: ADDRESS,
      avatarUrl: null,
      coverUrl: null,
      name: null,
      profileLink: '/space/space-viewer',
    };
    fetchProfile.mockReturnValue(Effect.succeed(cleared));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useGeoProfile(ADDRESS), { wrapper: makeWrapper(queryClient) });

    await waitFor(() => expect(queryClient.getQueryData(profileBySpaceIdQueryKey('space-viewer'))).toEqual(cleared));
  });
});
