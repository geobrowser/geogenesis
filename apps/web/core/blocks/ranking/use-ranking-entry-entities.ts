'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { EntityId } from '~/core/io/substream-schema';
import { useHydrateEntities, useQueryEntities } from '~/core/sync/use-store';
import type { Relation, Value } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { compareBySpaceRank } from '~/core/utils/space/space-ranking';

export type RankingEntryDisplay = {
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
};

export function useRankingEntryEntities(spaceId: string, entityIds: string[]) {
  const entityIdsKey = entityIds.filter(Boolean).join('|');
  const stableIds = React.useMemo(() => [...new Set(entityIdsKey ? entityIdsKey.split('|') : [])], [entityIdsKey]);

  useHydrateEntities({ ids: stableIds, spaceId, enabled: stableIds.length > 0 });

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

function pickBySpacePrecedence<T extends { spaceId: string }>(items: T[], currentSpaceId: string): T | null {
  const inSpace = items.find(item => item.spaceId === currentSpaceId);
  if (inSpace) return inSpace;

  const others = items.filter(item => item.spaceId !== currentSpaceId);
  if (others.length === 0) return null;

  return others.sort(compareBySpaceRank(item => item.spaceId))[0];
}

export function pickValueBySpace(values: Value[], propertyId: string, currentSpaceId: string): string | null {
  const candidates = values.filter(v => v.property.id === propertyId && v.value?.trim());
  return pickBySpacePrecedence(candidates, currentSpaceId)?.value?.trim() ?? null;
}

/**
 * Pick a relation of `typeId` preferring `currentSpaceId`, then the highest-ranked space.
 */
export function pickRelationBySpace(relations: Relation[], typeId: string, currentSpaceId: string): Relation | null {
  return pickBySpacePrecedence(
    relations.filter(r => r.type.id === typeId),
    currentSpaceId
  );
}

/**
 * Resolve an image URL for a ranking card. Order:
 *   current-space avatar → current-space cover → ranked-space avatar → ranked-space cover.
 *
 * Relations whose target image has no URL value are skipped at every step so a
 * placeholder avatar in the current space can't mask a usable image from another space.
 */
export function pickImage(relations: Relation[], currentSpaceId: string): string | null {
  const withValue = relations.filter(r => r.toEntity.value);

  const avatar = pickRelationBySpace(withValue, EntityId(ContentIds.AVATAR_PROPERTY), currentSpaceId);
  if (avatar?.spaceId === currentSpaceId) return avatar.toEntity.value;

  const cover = pickRelationBySpace(withValue, EntityId(SystemIds.COVER_PROPERTY), currentSpaceId);
  if (cover?.spaceId === currentSpaceId) return cover.toEntity.value;

  if (avatar) return avatar.toEntity.value;
  if (cover) return cover.toEntity.value;
  return null;
}
