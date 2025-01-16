import { useQuery } from '@tanstack/react-query';

import { Change } from '../utils/change';

export const useLocalChanges = (spaceId?: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ['local-changes', spaceId],
    queryFn: () => Change.fromLocal(spaceId),
    staleTime: 0,
  });

  return [data, isLoading] as const;
};
