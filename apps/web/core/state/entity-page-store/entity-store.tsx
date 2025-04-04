'use client';

import { useEntity } from '~/core/database/entities';
import { EntityId, SpaceId } from '~/core/io/schema';

import { useEntityStoreInstance } from './entity-store-provider';

export function useEntityPageStore() {
  const { spaceId, id, initialSpaces, initialTriples, initialRelations } = useEntityStoreInstance();

  const { name, spaces, triples, relationsOut, schema, types } = useEntity({
    spaceId: SpaceId(spaceId),
    id: EntityId(id),
    initialData: { spaces: initialSpaces, triples: initialTriples, relationsOut: initialRelations },
  });

  return {
    triples,
    relations: relationsOut,

    name,
    spaces,
    spaceId,
    id,

    schema,
    types,
  };
}
