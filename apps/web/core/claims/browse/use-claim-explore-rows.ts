'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import { normId } from '~/core/utils/norm-id';

/**
 * Hydrates a claim-scoped id list through the shared Explore card projection.
 *
 * Related claims, their debates, and source entities all use the same display space and card
 * model. One query key lets overlapping lists share cache data instead of maintaining three
 * nearly-identical wrappers around `fetchExploreRowsByIds`.
 */
export function useClaimExploreRows(ids: string[], spaceId: string, enabled = true) {
  const normalizedIds = React.useMemo(() => ids.map(normId), [ids]);
  const normalizedSpaceId = normId(spaceId);

  return useQuery({
    queryKey: ['claim', 'explore-rows', normalizedSpaceId, normalizedIds],
    queryFn: ({ signal }) => {
      const preferredSpaces = new Map(normalizedIds.map(id => [id, [spaceId]]));
      return fetchExploreRowsByIds(ids, signal, preferredSpaces);
    },
    enabled: enabled && ids.length > 0,
    staleTime: 30_000,
  });
}
