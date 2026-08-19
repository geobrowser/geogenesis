'use client';

import * as React from 'react';

import { useQueryEntities } from '~/core/sync/use-store';

import type { AggregatedRankingSubmitterRef } from './ranking-block-relations';

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter(id => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Home space of each rank entity that didn't carry one on its relation.
 */
export function useRankEntitySpaceById(refs: AggregatedRankingSubmitterRef[]): Map<string, string> {
  const rankEntityIdsNeedingSpace = React.useMemo(
    () => refs.filter(ref => !ref.spaceId).map(ref => ref.rankEntityId),
    [refs]
  );

  const { entities } = useQueryEntities({
    enabled: rankEntityIdsNeedingSpace.length > 0,
    where: { id: { in: rankEntityIdsNeedingSpace } },
    first: rankEntityIdsNeedingSpace.length || undefined,
  });

  return React.useMemo(() => {
    const map = new Map<string, string>();
    for (const entity of entities) {
      const homeSpaceId = entity.spaces?.[0];
      if (homeSpaceId) {
        map.set(entity.id, homeSpaceId);
      }
    }
    return map;
  }, [entities]);
}

/** Resolves submitter personal space ids from relation `to_space` or the rank entity's home space. */
export function useResolvedRankingSubmitterSpaceIds(refs: AggregatedRankingSubmitterRef[]): string[] {
  const rankEntitySpaceById = useRankEntitySpaceById(refs);

  return React.useMemo(
    () =>
      dedupePreserveOrder(
        refs
          .map(ref => ref.spaceId ?? rankEntitySpaceById.get(ref.rankEntityId))
          .filter((id): id is string => Boolean(id))
      ),
    [refs, rankEntitySpaceById]
  );
}
