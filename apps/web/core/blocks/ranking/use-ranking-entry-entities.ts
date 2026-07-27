'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { EntityId } from '~/core/io/substream-schema';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Relation, Value } from '~/core/types';
import { compareBySpaceRank } from '~/core/utils/space/space-ranking';

export type RankingEntryDisplay = {
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
};

export type RankingImagePreference = 'avatar' | 'cover';

export function useRankingEntryEntities(
  spaceId: string,
  entityIds: string[],
  imageProperty: RankingImagePreference = 'avatar'
) {
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
            image: pickImageByPreference(entity.relations, spaceId, imageProperty),
          };
        })
        .filter((e): e is RankingEntryDisplay => e != null),
    [byId, stableIds, spaceId, imageProperty]
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

export function pickImageByPreference(
  relations: Relation[],
  currentSpaceId: string,
  preference: RankingImagePreference
): string | null {
  const withValue = relations.filter(r => r.toEntity.value);

  const preferredType = preference === 'cover' ? SystemIds.COVER_PROPERTY : ContentIds.AVATAR_PROPERTY;
  const otherType = preference === 'cover' ? ContentIds.AVATAR_PROPERTY : SystemIds.COVER_PROPERTY;

  const preferred = pickRelationBySpace(withValue, EntityId(preferredType), currentSpaceId);
  if (preferred?.spaceId === currentSpaceId) return preferred.toEntity.value;

  const other = pickRelationBySpace(withValue, EntityId(otherType), currentSpaceId);
  if (other?.spaceId === currentSpaceId) return other.toEntity.value;

  if (preferred) return preferred.toEntity.value;
  if (other) return other.toEntity.value;
  return null;
}

export function pickImage(relations: Relation[], currentSpaceId: string): string | null {
  return pickImageByPreference(relations, currentSpaceId, 'avatar');
}
