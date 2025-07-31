'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { useRelations, useValue } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';

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

export function useCover(entityId: string) {
  const maybeCover = useRelations({
    selector: r => r.type.id === SystemIds.COVER_PROPERTY && r.fromEntity.id === entityId,
  });

  return Entities.cover(maybeCover);
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
    placeholderData: keepPreviousData,
    queryFn: async () => {
      return await getSchemaFromTypeIds(types.map(t => t.id));
    },
  });

  return schema ?? [];
}
