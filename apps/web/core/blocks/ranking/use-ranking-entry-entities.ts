'use client';

import * as React from 'react';

import { useQueryEntities } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';

export type RankingEntryDisplay = {
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
};

export function useRankingEntryEntities(spaceId: string, entityIds: string[]) {
  const entityIdsKey = entityIds.filter(Boolean).join('|');
  const stableIds = React.useMemo(() => [...new Set(entityIdsKey ? entityIdsKey.split('|') : [])], [entityIdsKey]);

  const { entities, isLoading } = useQueryEntities({
    enabled: stableIds.length > 0,
    where: { id: { in: stableIds } },
    first: stableIds.length || undefined,
  });

  const byId = React.useMemo(() => new Map(entities.map(e => [e.id, e])), [entities]);

  const entries: RankingEntryDisplay[] = React.useMemo(
    () =>
      stableIds
        .map(id => {
          const entity = byId.get(id);
          if (!entity) return null;
          return {
            entityId: id,
            name: entity.name?.trim() || 'Untitled',
            description: entity.description?.trim() || null,
            image: Entities.cover(entity.relations) ?? Entities.avatar(entity.relations) ?? null,
          };
        })
        .filter((e): e is RankingEntryDisplay => e != null),
    [byId, stableIds]
  );

  return { entries, isLoading };
}
