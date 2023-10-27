import { useQuery } from '@tanstack/react-query';

import { Environment } from '../environment';
import { Services } from '../services';

export function useGeoProfile(account?: `0x${string}`) {
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
        endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).profileSubgraph,
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
