import { useQuery } from '@tanstack/react-query';

import { Change } from '../utils/change';

export const useLocalChanges = (spaceId?: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['changes', spaceId],
    queryFn: () => Change.fromLocal(spaceId),
  });

  console.log('error', error);

  return [data, isLoading] as const;
};
