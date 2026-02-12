'use client';

import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DEFAULT_ENTITY_SCHEMA, getSchemaFromTypeIdsAndRelations } from '~/core/database/entities';
import { useRelations, useValue } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { useImageUrlFromEntity } from '~/core/utils/use-entity-media';

export function useEntityTypes(entityId: string, spaceId?: string) {
  const types = useRelations({
    selector: r =>
      r.type.id === SystemIds.TYPES_PROPERTY &&
      r.fromEntity.id === entityId &&
      (spaceId ? r.spaceId === spaceId : true),
  });

  return types.map(t => ({
    id: t.toEntity.id,
    name: t.toEntity.name,
  }));
}

export function useCover(entityId: string, spaceId?: string) {
  const maybeCover = useRelations({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === entityId,
  });

  // Get the cover entity ID from the relation
  const coverEntityId = Entities.cover(maybeCover);

  // Resolve the actual image URL
  const imageUrl = useImageUrlFromEntity(coverEntityId || undefined, spaceId || '');

  return imageUrl || coverEntityId;
}

export function useAvatar(entityId: string, spaceId?: string) {
  const maybeAvatar = useRelations({
    selector: r => r.type.id === ContentIds.AVATAR_PROPERTY && r.fromEntity.id === entityId,
  });

  // Get the avatar entity ID from the relation
  const avatarEntityId = Entities.avatar(maybeAvatar);

  // Resolve the actual image URL
  const imageUrl = useImageUrlFromEntity(avatarEntityId || undefined, spaceId || '');

  return imageUrl || avatarEntityId;
}

export function useName(entityId: string, spaceId?: string) {
  const maybeName = useValue({
    selector: r =>
      r.property.id === SystemIds.NAME_PROPERTY && r.entity.id === entityId && (spaceId ? r.spaceId === spaceId : true),
  });

  return maybeName?.value ?? null;
}

export function useDescription(entityId: string, spaceId?: string) {
  const maybeDescription = useValue({
    selector: r =>
      r.property.id === SystemIds.DESCRIPTION_PROPERTY &&
      r.entity.id === entityId &&
      (spaceId ? r.spaceId === spaceId : true),
  });

  return maybeDescription?.value ?? null;
}

export function useEntitySchema(entityId: string, spaceId?: string) {
  const types = useEntityTypes(entityId, spaceId);
  const stableTypeKey = useMemo(() => types.map(t => t.id).sort(), [types]);
  const hasTypes = types.length > 0;

  const allRelations = useRelations({
    selector: r => r.fromEntity.id === entityId && (spaceId ? r.spaceId === spaceId : true),
  });
  const stableRelationKey = useMemo(
    () => [...new Set(allRelations.map(r => `${r.type.id}:${r.toEntity.id}`))].sort(),
    [allRelations]
  );

  const { data: schema } = useQuery({
    enabled: hasTypes || allRelations.length > 0,
    initialData: DEFAULT_ENTITY_SCHEMA,
    placeholderData: keepPreviousData,
    queryKey: ['entity-schema-for-merging', entityId, stableTypeKey, stableRelationKey],
    queryFn: async () =>
      await getSchemaFromTypeIdsAndRelations(
        types.map(t => t.id),
        allRelations
      ),
  });

  // When there are no types and no relations, always return the default
  // schema. We can't rely on the query result here because keepPreviousData
  // would hold stale type-specific properties (like Avatar) after all types
  // are removed. We still allow the query result through when relations
  // exist, since IS_TYPE_PROPERTY relations can contribute schema properties.
  if (!hasTypes && allRelations.length === 0) {
    return DEFAULT_ENTITY_SCHEMA;
  }

  return schema ?? DEFAULT_ENTITY_SCHEMA;
}

export function useRelationEntityRelations(entityId: string, spaceId?: string) {
  return useRelations({
    selector: r => r.entityId === entityId && (spaceId ? r.spaceId === spaceId : true),
  });
}
