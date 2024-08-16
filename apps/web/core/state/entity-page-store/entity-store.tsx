'use client';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { EntityId } from '~/core/io/schema';

import { useEntityStoreInstance } from './entity-store-provider';

export function useEntityPageStore() {
  const { spaceId, id, initialTriples, initialRelations } = useEntityStoreInstance();
  const { name, triples, relationsOut, schema } = useEntity(
    React.useMemo(() => EntityId(id), [id]),
    React.useMemo(() => ({ triples: initialTriples, relations: initialRelations }), [initialTriples, initialRelations])
  );

  return {
    triples,
    relations: relationsOut,

    name,
    spaceId,
    id,

    schema,
  };
}
