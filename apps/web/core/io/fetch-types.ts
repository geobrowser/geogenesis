import { SYSTEM_IDS } from '@geogenesis/ids';

import { Entity, Space, Triple } from '../types';
import { ISubgraph, fetchEntities, fetchEntity, fetchTriples } from './subgraph';

export async function fetchSpaceTypeTriples(spaceId: string): Promise<Triple[]> {
  const triples = await fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: 1000,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });

  return triples;
}

export async function fetchForeignTypeTriples(space: Space): Promise<Triple[]> {
  const foreignTypesFromSpaceConfig = await fetchTriples({
    query: '',
    space: space.id,
    skip: 0,
    first: 1000,
    filter: [
      { field: 'entity-id', value: space.spaceConfig?.id ?? '' },
      { field: 'attribute-id', value: SYSTEM_IDS.FOREIGN_TYPES },
    ],
  });

  const foreignTypesIds = foreignTypesFromSpaceConfig.map(triple => triple.value.id);

  const foreignTypes = await Promise.all(
    foreignTypesIds.map(entityId =>
      fetchTriples({
        query: '',
        skip: 0,
        first: 1000,
        filter: [
          { field: 'entity-id', value: entityId },
          { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
          { field: 'linked-to', value: SYSTEM_IDS.SCHEMA_TYPE },
        ],
      })
    )
  );

  return foreignTypes.flatMap(triples => triples);
}
