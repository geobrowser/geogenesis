'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { spacesByIdsQueryKey } from '~/core/io/query-keys';

type UseSpacesByIdsResult = {
  spaces: Space[];
  spacesById: Map<string, Space>;
  isLoading: boolean;
};

type UseSpacesByIdsData = Omit<UseSpacesByIdsResult, 'isLoading'>;

const SPACE_ID_REQUEST_LIMIT = 100;

function chunkSpaceIds(spaceIds: string[]): string[][] {
  const batches: string[][] = [];
  for (let start = 0; start < spaceIds.length; start += SPACE_ID_REQUEST_LIMIT) {
    batches.push(spaceIds.slice(start, start + SPACE_ID_REQUEST_LIMIT));
  }
  return batches;
}

export function useSpacesByIds(spaceIds: string[] = [], enabled = true): UseSpacesByIdsResult {
  const requestedIds = [...new Set(spaceIds.filter(Boolean))];
  const normalizedIds = [...requestedIds].sort();

  const { data, isLoading } = useQuery({
    queryKey: spacesByIdsQueryKey(normalizedIds),
    queryFn: async ({ signal }) => {
      const batches = chunkSpaceIds(normalizedIds);
      const results = await Promise.all(
        batches.map(batch => Effect.runPromise(getSpaces({ spaceIds: batch }, signal)))
      );
      return results.flat();
    },
    select: (fetchedSpaces): UseSpacesByIdsData => {
      const spacesById = new Map(fetchedSpaces.map(space => [space.id, space]));
      const spaces = requestedIds.map(id => spacesById.get(id)).filter((space): space is Space => Boolean(space));

      return {
        spaces,
        spacesById,
      };
    },
    enabled: enabled && normalizedIds.length > 0,
    // The key is the whole id set, so adding one id (the viewer's own space, the moment they
    // respond to a claim) would otherwise empty `spacesById` until a refetch lands and blank
    // out every space image that was already on screen. Entries are looked up by id, so the
    // held-over map can only ever serve ids it genuinely resolved.
    //
    // The trade: `spacesById` is no longer empty when this hook is disabled or handed no ids —
    // it holds the previous fetch's map, since there is no data of its own to replace it with.
    // Every caller looks entries up by an id it is currently rendering, which a stale map either
    // answers correctly or not at all. Anything that instead *enumerates* the map, or treats its
    // size as the current id count, would be reading ids it never asked for.
    placeholderData: keepPreviousData,
  });

  return {
    spaces: data?.spaces ?? [],
    spacesById: data?.spacesById ?? new Map(),
    isLoading,
  };
}
