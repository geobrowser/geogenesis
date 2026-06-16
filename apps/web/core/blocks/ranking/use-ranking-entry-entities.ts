'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { EntityId } from '~/core/io/substream-schema';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Relation, Value } from '~/core/types';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

export type RankingEntryDisplay = {
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
};

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
            name: pickValueBySpace(entity.values, SystemIds.NAME_PROPERTY, spaceId)?.trim() || 'Untitled',
            description: pickValueBySpace(entity.values, SystemIds.DESCRIPTION_PROPERTY, spaceId)?.trim() || null,
            image: pickImage(entity.relations, spaceId),
          };
        })
        .filter((e): e is RankingEntryDisplay => e != null),
    [byId, stableIds, spaceId]
  );

  return { entries, isLoading: isLoading && !isFetched };
}

function pickValueBySpace(values: Value[], propertyId: string, currentSpaceId: string): string | null {
  let inSpace: string | null = null;
  const others: Value[] = [];

  for (const v of values) {
    if (v.property.id !== propertyId || !v.value) continue;
    if (v.spaceId === currentSpaceId) {
      if (inSpace == null) inSpace = v.value;
    } else {
      others.push(v);
    }
  }

  if (inSpace != null) return inSpace;
  if (others.length === 0) return null;

  return others.sort((a, b) => getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId))[0].value;
}

function pickRelationBySpace(relations: Relation[], typeId: string, currentSpaceId: string): Relation | null {
  let inSpace: Relation | null = null;
  const others: Relation[] = [];

  for (const r of relations) {
    if (r.type.id !== typeId) continue;
    if (r.spaceId === currentSpaceId) {
      if (inSpace == null) inSpace = r;
    } else {
      others.push(r);
    }
  }

  if (inSpace) return inSpace;
  if (others.length === 0) return null;

  return others.sort((a, b) => getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId))[0];
}

function pickImage(relations: Relation[], currentSpaceId: string): string | null {
  // Current-space avatar wins, then current-space cover, then ranked-space avatar, then ranked-space cover.
  const avatar = pickRelationBySpace(relations, EntityId(ContentIds.AVATAR_PROPERTY), currentSpaceId);
  if (avatar?.spaceId === currentSpaceId && avatar.toEntity.value) return avatar.toEntity.value;

  const cover = pickRelationBySpace(relations, EntityId(SystemIds.COVER_PROPERTY), currentSpaceId);
  if (cover?.spaceId === currentSpaceId && cover.toEntity.value) return cover.toEntity.value;

  if (avatar?.toEntity.value) return avatar.toEntity.value;
  if (cover?.toEntity.value) return cover.toEntity.value;
  return null;
}
