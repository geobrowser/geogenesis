'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { useQueryEntities } from '~/core/sync/use-store';

import { pickImage, pickValueBySpace } from './ranking-entry-pick';

export type RankingEntryDisplay = {
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
};

export { pickImage, pickRelationBySpace, pickValueBySpace } from './ranking-entry-pick';

export function useRankingEntryEntities(spaceId: string, entityIds: string[]) {
  const entityIdsKey = entityIds.filter(Boolean).join('|');
  const stableIds = React.useMemo(() => [...new Set(entityIdsKey ? entityIdsKey.split('|') : [])], [entityIdsKey]);

  const { entities, isLoading, isFetched } = useQueryEntities({
    enabled: stableIds.length > 0,
    where: { id: { in: stableIds } },
    first: stableIds.length || undefined,
    placeholderData: keepPreviousData,
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
            name: pickValueBySpace(entity.values, SystemIds.NAME_PROPERTY, spaceId) ?? 'Untitled',
            description: pickValueBySpace(entity.values, SystemIds.DESCRIPTION_PROPERTY, spaceId),
            image: pickImage(entity.relations, spaceId),
          };
        })
        .filter((e): e is RankingEntryDisplay => e != null),
    [byId, stableIds, spaceId]
  );

  return { entries, isLoading: isLoading && !isFetched };
}
