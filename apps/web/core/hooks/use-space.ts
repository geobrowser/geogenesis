import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getSpace } from '../io/v2/queries';

export function useSpace(spaceId?: string) {
  const { data: space, isLoading } = useQuery({
    queryKey: ['space', spaceId],
    queryFn: () => (spaceId ? Effect.runPromise(getSpace(spaceId)) : null),
    enabled: Boolean(spaceId),
  });

  return {
    space,
    isLoading,
  };
}
