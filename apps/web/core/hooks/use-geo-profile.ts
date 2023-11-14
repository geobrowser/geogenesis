import { useQuery } from '@tanstack/react-query';

import { Services } from '../services';
import { OnchainProfile } from '../types';

export function useGeoProfile(account?: `0x${string}`): {
  profile: OnchainProfile | null;
  isLoading: boolean;
  isFetched: boolean;
} {
  const { subgraph } = Services.useServices();

  const {
    data: profile,
    isLoading,
    isFetched,
  } = useQuery({
    queryKey: ['onchain-profile', account],
    queryFn: async () => {
      if (!account) return null;

      return await subgraph.fetchOnchainProfile({
        address: account,
      });
    },
    // Only fetch the profile when the page is loaded. If a user has gone through onboarding,
    // we optimistically update the cache with their profile, so this query will begin reading
    // from the cache for the lifetime of the browser tab.
    staleTime: Infinity,
  });

  return {
    profile: profile ?? null,
    isLoading,
    isFetched,
  };
}
