'use client';

import { useEntity } from '~/core/database/entities';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useQueryEntity } from '~/core/sync/use-store';

import { useEntityStoreInstance } from './entity-store-provider';

export function useEntityPageStore() {
  const { spaceId, id, initialSpaces, initialTriples, initialRelations } = useEntityStoreInstance();

  const { entity } = useQueryEntity({ id });

  const { spaces, triples, relationsOut, schema, types } = useEntity({
    spaceId: SpaceId(spaceId),
    id: EntityId(id),
    initialData: { spaces: initialSpaces, triples: initialTriples, relations: initialRelations },
  });

  return {
    triples,
    relations: relationsOut,

    name: entity?.name ?? null,
    spaces,
    spaceId,
    id,

    schema,
    types,
  };
}
