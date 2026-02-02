'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getSpaceByAddress } from '~/core/io/v2/queries';

import { useSmartAccount } from './use-smart-account';

/** Hook to get the user's personal space ID from the GraphQL API. */
export function usePersonalSpaceId() {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;

  const { data, isLoading, isFetched } = useQuery({
    queryKey: ['personal-space-id', address],
    queryFn: async () => {
      if (!address) return null;

      const space = await Effect.runPromise(getSpaceByAddress(address));

      if (!space) {
        return { isRegistered: false, personalSpaceId: null };
      }

      return { isRegistered: true, personalSpaceId: space.id };
    },
    enabled: !!address,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    personalSpaceId: data?.personalSpaceId ?? null,
    isRegistered: data?.isRegistered ?? false,
    isLoading,
    isFetched,
  };
}
