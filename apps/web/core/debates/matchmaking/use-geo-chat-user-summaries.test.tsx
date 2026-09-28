import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '~/core/types';

const SPACE = '003eaa9b7a56fa847afd6f2e8cc518a6';
const PAGE = '3772c3cc441441d5977ef39c4c02bd6e';

const mocks = vi.hoisted(() => ({
  profiles: new Map<string, Partial<Profile>>(),
  profilesLoading: true,
}));

vi.mock('~/core/io/subgraph/fetch-personal-spaces-by-page-ids', () => ({
  fetchPersonalSpacesByPageIds: async () => new Map([[PAGE, SPACE]]),
}));

vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: () => ({ profilesBySpaceId: mocks.profiles, isLoading: mocks.profilesLoading }),
}));

const { useGeoChatUserSummaries } = await import('./use-geo-chat-user-summaries');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function summaries() {
  const { result } = renderHook(() => useGeoChatUserSummaries([PAGE], true), { wrapper });
  // Past the page-to-space read, so what is left to decide is the profile.
  await waitFor(() => expect(result.current).toBeDefined());
  await new Promise(resolve => setTimeout(resolve, 0));
  return result.current;
}

afterEach(() => {
  mocks.profiles = new Map();
  mocks.profilesLoading = true;
});

describe('useGeoChatUserSummaries', () => {
  // A summary with no name yet would read as the raw space id, and would displace the roster's.
  it('emits nobody whose profile is still loading', async () => {
    expect(await summaries()).toEqual([]);
  });

  it('emits them once their profile lands', async () => {
    mocks.profiles = new Map([[SPACE, { name: 'Akwayi', avatarUrl: 'ipfs://a' }]]);

    expect(await summaries()).toEqual([
      { user_id: PAGE, profile_space_id: SPACE, display_name: 'Akwayi', avatar_cid: 'ipfs://a' },
    ]);
  });

  // The batch loader can reject; waiting forever would cost them their profile link.
  it('emits them anyway once profiles have settled without one', async () => {
    mocks.profilesLoading = false;

    expect(await summaries()).toEqual([
      { user_id: PAGE, profile_space_id: SPACE, display_name: null, avatar_cid: null },
    ]);
  });
});
