import { useQuery } from '@tanstack/react-query';

import { Change } from '../utils/change';

export const useLocalChanges = (spaceId?: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ['changes', spaceId],
    queryFn: () => Change.fromLocal(spaceId),
  });

  return [data, isLoading] as const;
};
