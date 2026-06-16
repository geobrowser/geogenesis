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

/**
 * Pick a value for `propertyId` preferring `currentSpaceId`, then the highest-ranked
 * space per {@link getSpaceRank}. Whitespace-only values are ignored so they don't
 * mask a usable value from another space.
 */
export function pickValueBySpace(values: Value[], propertyId: string, currentSpaceId: string): string | null {
  let inSpace: string | null = null;
  const others: { spaceId: string; value: string }[] = [];

  for (const v of values) {
    if (v.property.id !== propertyId) continue;
    const trimmed = v.value?.trim();
    if (!trimmed) continue;
    if (v.spaceId === currentSpaceId) {
      if (inSpace == null) inSpace = trimmed;
    } else {
      others.push({ spaceId: v.spaceId, value: trimmed });
    }
  }

  if (inSpace != null) return inSpace;
  if (others.length === 0) return null;

  return others.sort((a, b) => getSpaceRank(a.spaceId) - getSpaceRank(b.spaceId))[0].value;
}

/**
 * Pick a relation of `typeId` preferring `currentSpaceId`, then the highest-ranked
 * space per {@link getSpaceRank}.
 */
export function pickRelationBySpace(relations: Relation[], typeId: string, currentSpaceId: string): Relation | null {
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
