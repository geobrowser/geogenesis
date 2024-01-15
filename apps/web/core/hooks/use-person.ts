import { useQuery } from '@tanstack/react-query';

import { Services } from '../services';

export function usePerson(address?: string) {
  const { subgraph } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: ['user-profile', address],
    queryFn: async () => {
      if (!address) return null;
      return await subgraph.fetchProfile({ address });
    },
  });

  return {
    isLoading,
    person: data ? data[1] : null,
  };
}
