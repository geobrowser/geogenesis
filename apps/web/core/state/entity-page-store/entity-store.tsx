'use client';

import { useEntity } from '~/core/database/entities';

import { useEntityStoreInstance } from './entity-store-provider';

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
