'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getSpaceAccess, normalizeSpaceId } from '~/core/access/space-access';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { getSpace } from '~/core/io/queries';

export type CreatableSpaceIdsMap = Map<string, boolean>;

async function fetchCreatableSpaceIds(
  spaceIds: string[],
  personalSpaceId: string,
  signal?: AbortSignal
): Promise<CreatableSpaceIdsMap> {
  const unique = [...new Set(spaceIds.filter(Boolean))];
  const map: CreatableSpaceIdsMap = new Map();

  await Promise.all(
    unique.map(async spaceId => {
      const key = normalizeSpaceId(spaceId);
      try {
        const space = await Effect.runPromise(getSpace(spaceId));
        if (!space) {
          map.set(key, false);
          return;
        }
        const access = await Effect.runPromise(getSpaceAccess(space, personalSpaceId, signal));
        map.set(key, access.canEdit);
      } catch {
        map.set(key, false);
      }
    })
  );

  return map;
}

/**
 * Per-space member/editor check for the "+" create-entity dropdown.
 * Uses the same access path as `useAccessControl` (including personal-space ownership).
 */
export function useCreatableSpaceIds(spaceIds: string[], enabled: boolean) {
  // TODO: Each space id = getSpace + getSpaceAccess. Large GEO dropdowns = many parallel requests on open.
  // staleTime only helps reopen. Needs a batch access API.
  const hydrated = useHydrated();
  const { personalSpaceId, isLoading: isLoadingPersonalSpaceId } = usePersonalSpaceId();

  const spaceIdsKey = React.useMemo(
    () => [...new Set(spaceIds.map(id => normalizeSpaceId(id)))].sort().join(','),
    [spaceIds]
  );

  const hasSpaceIds = spaceIdsKey.length > 0;
  const canLoad = enabled && hydrated && Boolean(personalSpaceId) && hasSpaceIds;

  const query = useQuery({
    queryKey: ['creatable-space-ids', personalSpaceId, spaceIdsKey],
    enabled: canLoad,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchCreatableSpaceIds(spaceIds, personalSpaceId!, signal),
  });

  const canCreateInSpace = React.useCallback(
    (spaceId: string): boolean => {
      if (!query.isSuccess || !query.data) return false;
      return query.data.get(normalizeSpaceId(spaceId)) === true;
    },
    [query.data, query.isSuccess]
  );

  // Settled once we have an answer, know we cannot ask (no personal space), or there is nothing to ask.
  const isResolved =
    !enabled ||
    !hasSpaceIds ||
    query.isSuccess ||
    query.isError ||
    (hydrated && !isLoadingPersonalSpaceId && !personalSpaceId);

  const isLoading =
    enabled && hasSpaceIds && hydrated && !isResolved && (isLoadingPersonalSpaceId || Boolean(personalSpaceId));

  return {
    canCreateInSpace,
    isLoading,
    isResolved,
  };
}
