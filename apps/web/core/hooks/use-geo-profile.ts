'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect } from 'react';

import { Effect } from 'effect';

import { profileBySpaceIdQueryKey } from '../io/query-keys';
import { fetchProfile } from '../io/subgraph';
import { Profile } from '../types';

export function useGeoProfile(account?: `0x${string}`): {
  profile: Profile | null;
  isLoading: boolean;
  isFetched: boolean;
} {
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    isFetched,
  } = useQuery({
    enabled: account !== undefined,
    queryKey: ['profile', account],
    queryFn: async () => {
      if (!account) return null;

      return await Effect.runPromise(fetchProfile(account));
    },
  });

  // /profile/address and /profile/space return the same record, so an address lookup can stand
  // in for the space lookup. The navbar runs this hook on every page, which means the viewer's
  // own avatar is in cache before they ever act — and their avatar can then appear the instant
  // they respond to a claim instead of after a round trip they didn't need to make.
  const profileSpaceId = profile?.spaceId;
  useEffect(() => {
    // fetchProfile falls back to `defaultProfile(address, address)` when there's no registered
    // space. That id is a wallet address, not a space, so caching it under a space key would
    // be a lie waiting to be read back.
    if (!profile || !profileSpaceId || profileSpaceId === profile.address) return;
    // Nor when the address lookup collapsed a real-but-empty profile into `defaultProfile`: that
    // value is indistinguishable from "no such profile" once it is in the cache, and readers that
    // tell those apart — the debates avatar resolver does — would take it for an absent one and
    // keep showing whatever they had.
    //
    // Only a value that is both empty *and* unmarked, which is exactly the shape `defaultProfile`
    // has and nothing else does. Neither half is enough on its own:
    //
    // - emptiness alone would drop a real removal. Clearing an avatar leaves a legitimately empty
    //   profile, and `useEditProfile` writes that to the address entry and leaves this effect to
    //   carry it here; skipping it would leave the removed photo on screen everywhere else.
    // - a missing `profileLink` alone is not proof either. `apiProfileToProfile` sets it, but a
    //   profile can reach here from elsewhere without one, and a real avatar should still be warmed.
    if (!profile.profileLink && !profile.name && !profile.avatarUrl) return;
    queryClient.setQueryData(profileBySpaceIdQueryKey(profileSpaceId), profile);
  }, [profile, profileSpaceId, queryClient]);

  return {
    profile: profile ?? null,
    isLoading,
    isFetched,
  };
}
