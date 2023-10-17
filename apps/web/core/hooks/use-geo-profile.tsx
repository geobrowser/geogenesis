import { useQuery } from '@tanstack/react-query';

import { Services } from '../services';

export function useGeoProfile(account?: `0x${string}`) {
  const { subgraph, config } = Services.useServices();

  const {
    data: profile,
    isLoading,
    isFetched,
  } = useQuery({
    queryKey: ['onchain-profile', account],
    queryFn: async () => {
      if (!account) return null;
      return await subgraph.fetchOnchainProfile({ address: account, endpoint: config.profileSubgraph });
    },
  });

  return {
    profile: profile ?? null,
    isLoading,
    isFetched,
  };
}
