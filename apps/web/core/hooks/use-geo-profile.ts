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
  });

  return {
    profile: profile ?? null,
    isLoading,
    isFetched,
  };
}
