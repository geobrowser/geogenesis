'use client';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { EntityId, SpaceId } from '~/core/io/schema';

import { useEntityStoreInstance } from './entity-store-provider';

export function useEntityPageStore() {
  const { spaceId, id, initialSpaces, initialTriples, initialRelations } = useEntityStoreInstance();
  const { name, spaces, triples, relationsOut, schema, types } = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(id), [id]),
    initialData: React.useMemo(
      () => ({ spaces: initialSpaces, triples: initialTriples, relations: initialRelations }),
      [initialSpaces, initialTriples, initialRelations]
    ),
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
