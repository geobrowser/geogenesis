import { useQuery } from '@tanstack/react-query';

import { fetchSpace } from '../io/subgraph';

export function useSpace(spaceId: string) {
  const { data: space, isLoading } = useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      return await fetchSpace({ id: spaceId });
    },
  });

  return {
    space,
    isLoading,
  };
}
