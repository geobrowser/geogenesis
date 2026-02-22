'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { fetchProfile } from '../io/subgraph';
import { Profile } from '../types';

export function useGeoProfile(account?: `0x${string}`): {
  profile: Profile | null;
  isLoading: boolean;
  isFetched: boolean;
} {
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

  return {
    profile: profile ?? null,
    isLoading,
    isFetched,
  };
}
