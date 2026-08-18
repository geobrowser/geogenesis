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
  /**
   * Whether `spacesById` is the previous id set's map, held over by `placeholderData` below. False
   * while it is genuinely loading with nothing to hold over — `isLoading` covers that case. A
   * caller that only reads ids it is currently rendering can ignore this; one that needs to know
   * whether a *missing* id is missing for good has to check it, since a held-over map answers
   * nothing about ids it was never asked for.
   */
  isPlaceholderData: boolean;
};

type UseSpacesByIdsData = Omit<UseSpacesByIdsResult, 'isLoading' | 'isPlaceholderData'>;

export function useSpacesByIds(spaceIds: string[] = [], enabled = true): UseSpacesByIdsResult {
  const requestedIds = [...new Set(spaceIds.filter(Boolean))];
  const normalizedIds = [...requestedIds].sort();

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: spacesByIdsQueryKey(normalizedIds),
    queryFn: ({ signal }) => Effect.runPromise(getSpaces({ spaceIds: normalizedIds }, signal)),
    select: (fetchedSpaces): UseSpacesByIdsData => {
      const spacesById = new Map(fetchedSpaces.map(space => [space.id, space]));
      const spaces = requestedIds.map(id => spacesById.get(id)).filter((space): space is Space => Boolean(space));

      return {
        spaces,
        spacesById,
      };
    },
    enabled: enabled && normalizedIds.length > 0,
    // A space's name and image are about as static as this app's data gets, and the panels that
    // read them mount and unmount constantly (side panels, dropdowns, per-row chips). Without a
    // stale window every one of those remounts refetched an answer it already had, and the label
    // fell back to a placeholder for the length of the round trip.
    staleTime: 5 * 60_000,
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
    isPlaceholderData,
  };
}
