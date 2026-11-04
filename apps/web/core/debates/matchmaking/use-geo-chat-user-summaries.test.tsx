import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '~/core/types';

const SPACE = '003eaa9b7a56fa847afd6f2e8cc518a6';
const PAGE = '3772c3cc441441d5977ef39c4c02bd6e';

const OTHER_SPACE = '78341ee90d4d40a29181ddc70c97e36c';
const NEW_USER = '0195f0c2a9e47b6c8d1e2f3a4b5c6d7e';

const mocks = vi.hoisted(() => ({
  profiles: new Map<string, Partial<Profile>>(),
  profilesLoading: true,
  pageLookups: [] as string[][],
  profileLookups: [] as string[][],
}));

vi.mock('~/core/io/subgraph/fetch-personal-spaces-by-page-ids', () => ({
  fetchPersonalSpacesByPageIds: async (ids: string[]) => {
    mocks.pageLookups.push(ids);
    return new Map(ids.includes(PAGE) ? [[PAGE, SPACE]] : []);
  },
}));

vi.mock('~/core/hooks/use-profiles-by-space-ids', () => ({
  useProfilesBySpaceIds: (ids: string[]) => {
    mocks.profileLookups.push(ids);
    return { profilesBySpaceId: mocks.profiles, isLoading: mocks.profilesLoading };
  },
}));

const { useGeoChatUserSummaries } = await import('./use-geo-chat-user-summaries');
type GeoChatPersonRef = import('./use-geo-chat-user-summaries').GeoChatPersonRef;

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function summaries(people: GeoChatPersonRef[] = [{ user_id: PAGE }]) {
  const { result } = renderHook(() => useGeoChatUserSummaries(people, true), { wrapper });
  // Past the page-to-space read, so what is left to decide is the profile.
  await waitFor(() => expect(result.current).toBeDefined());
  await new Promise(resolve => setTimeout(resolve, 0));
  return result.current;
}

afterEach(() => {
  mocks.profiles = new Map();
  mocks.profilesLoading = true;
  mocks.pageLookups = [];
  mocks.profileLookups = [];
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

  // Empty is absent, so nothing downstream has to tell '' from null.
  it('reports an empty name or avatar as none', async () => {
    mocks.profiles = new Map([[SPACE, { name: '', avatarUrl: '' }]]);

    expect(await summaries()).toEqual([
      { user_id: PAGE, profile_space_id: SPACE, display_name: null, avatar_cid: null },
    ]);
  });

  // The batch loader can reject; waiting forever would cost them their profile link.
  it('emits them anyway once profiles have settled without one', async () => {
    mocks.profilesLoading = false;

    expect(await summaries()).toEqual([
      { user_id: PAGE, profile_space_id: SPACE, display_name: null, avatar_cid: null },
    ]);
  });

  describe('with the profile space geo-chat sends', () => {
    it('uses it, and never looks the user id up as a graph page', async () => {
      mocks.profiles = new Map([[OTHER_SPACE, { name: 'Nia', avatarUrl: 'ipfs://n' }]]);

      expect(await summaries([{ user_id: NEW_USER, profile_space_id: OTHER_SPACE }])).toEqual([
        { user_id: NEW_USER, profile_space_id: OTHER_SPACE, display_name: 'Nia', avatar_cid: 'ipfs://n' },
      ]);
      expect(mocks.pageLookups).toEqual([]);
    });

    it('takes geo-chat’s name and face first, and does not wait for the profile', async () => {
      const person = { user_id: NEW_USER, profile_space_id: OTHER_SPACE, display_name: 'Nia', avatar_cid: 'ipfs://g' };

      expect(await summaries([person])).toEqual([person]);
    });

    it('spells a dashed profile space dashless', async () => {
      mocks.profilesLoading = false;
      const dashed = '78341ee9-0d4d-40a2-9181-ddc70c97e36c';

      expect(await summaries([{ user_id: NEW_USER, profile_space_id: dashed }])).toEqual([
        { user_id: NEW_USER, profile_space_id: OTHER_SPACE, display_name: null, avatar_cid: null },
      ]);
    });

    it('looks up by page id only the rows from an older geo-chat, once per person however spelled', async () => {
      mocks.profilesLoading = false;
      const dashedNew = '0195f0c2-a9e4-7b6c-8d1e-2f3a4b5c6d7e';

      const result = await summaries([
        { user_id: NEW_USER, profile_space_id: OTHER_SPACE },
        { user_id: dashedNew, profile_space_id: OTHER_SPACE },
        { user_id: PAGE },
      ]);

      expect(result.map(person => person.user_id)).toEqual([NEW_USER, PAGE]);
      expect(mocks.pageLookups).toEqual([[PAGE]]);
    });
  });
});
