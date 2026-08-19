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
    queryClient.setQueryData(profileBySpaceIdQueryKey(profileSpaceId), profile);
  }, [profile, profileSpaceId, queryClient]);

  return {
    profile: profile ?? null,
    isLoading,
    isFetched,
  };
}
