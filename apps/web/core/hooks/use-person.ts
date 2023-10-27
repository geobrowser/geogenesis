import { useQuery } from '@tanstack/react-query';

import { Services } from '../services';

export function usePerson(address?: string) {
  const { subgraph, config } = Services.useServices();
  const { data } = useQuery({
    queryKey: ['user-profile', address],
    queryFn: async () => {
      if (!address) return null;
      return await subgraph.fetchProfile({ address, endpoint: config.subgraph });
    },
  });

  return data ? data[1] : null;
}
