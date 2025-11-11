'use client';

import { ContentIds, SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { useRelations, useValue } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { useImageUrlFromEntity } from '~/core/utils/utils';

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

  const { data: schema } = useQuery({
    enabled: types.length > 0,
    queryKey: ['entity-schema-for-merging', entityId, types],
    queryFn: async () => await getSchemaFromTypeIds(types.map(t => t.id)),
  });

  return schema ?? [];
}

export function useRelationEntityRelations(entityId: string, spaceId?: string) {
  return useRelations({
    selector: r => r.entityId === entityId && (spaceId ? r.spaceId === spaceId : true),
  });
}
