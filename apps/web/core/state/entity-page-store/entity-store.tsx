'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import { useEntity } from '~/core/database/entities';
import { useRelations, useValues } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';

import { useEntityStoreInstance } from './entity-store-provider';

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
  const maybeName = useValues({
    selector: r =>
      r.property.id === SystemIds.NAME_PROPERTY && r.entity.id === entityId && (spaceId ? r.spaceId === spaceId : true),
  });

  return maybeName[0]?.value ?? null;
}

export function useDescription(entityId: string, spaceId?: string) {
  const maybeDescription = useValues({
    selector: r =>
      r.property.id === SystemIds.DESCRIPTION_PROPERTY &&
      r.entity.id === entityId &&
      (spaceId ? r.spaceId === spaceId : true),
  });

  return maybeDescription[0]?.value ?? null;
}

export function useEntityPageStore() {
  const { spaceId, id, initialSpaces, initialValues, initialRelations } = useEntityStoreInstance();

  const { name, spaces, values, relations, schema, types } = useEntity({
    spaceId: spaceId,
    id: id,
    initialData: { spaces: initialSpaces, values: initialValues, relations: initialRelations },
  });

  return {
    values,
    relations,

    name,
    spaces,
    spaceId,
    id,

    schema,
    types,
  };
}
