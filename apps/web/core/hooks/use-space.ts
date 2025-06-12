import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getSpace } from '../io/v2/queries';

export function useSpace(spaceId: string) {
  const { data: space, isLoading } = useQuery({
    queryKey: ['space', spaceId],
    queryFn: () => Effect.runPromise(getSpace(spaceId)),
  });

  return {
    space,
    isLoading,
  };
}
