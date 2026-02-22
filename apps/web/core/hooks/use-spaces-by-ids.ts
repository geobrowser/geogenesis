'use client';

import { useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';

type UseSpacesByIdsResult = {
  spaces: Space[];
  spacesById: Map<string, Space>;
  isLoading: boolean;
};

type UseSpacesByIdsData = Omit<UseSpacesByIdsResult, 'isLoading'>;

export function useSpacesByIds(spaceIds: string[] = []): UseSpacesByIdsResult {
  const requestedIds = [...new Set(spaceIds.filter(Boolean))];
  const normalizedIds = [...requestedIds].sort();

  const { data, isLoading } = useQuery({
    queryKey: ['spaces-by-ids', normalizedIds],
    queryFn: ({ signal }) => Effect.runPromise(getSpaces({ spaceIds: normalizedIds }, signal)),
    select: (fetchedSpaces): UseSpacesByIdsData => {
      const spacesById = new Map(fetchedSpaces.map(space => [space.id, space]));
      const spaces = requestedIds.map(id => spacesById.get(id)).filter((space): space is Space => Boolean(space));

      return {
        spaces,
        spacesById,
      };
    },
    enabled: normalizedIds.length > 0,
  });

  return {
    spaces: data?.spaces ?? [],
    spacesById: data?.spacesById ?? new Map(),
    isLoading,
  };
}
