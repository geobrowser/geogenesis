import { useQuery } from '@tanstack/react-query';

import { fetchAccount } from '../io/subgraph/fetch-account';

export function useGeoAccount(address?: string) {
  const { data: account, isLoading } = useQuery({
    queryKey: ['geo-account', address],
    queryFn: async () => {
      if (!address) return null;

      return await fetchAccount({
        address,
      });
    },
  });

  return { isLoading, account };
}
