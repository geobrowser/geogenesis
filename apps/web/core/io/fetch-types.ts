import { SYSTEM_IDS } from '@graphprotocol/grc-20';

import { Triple } from '../types';
import { Space } from './dto/spaces';
import { fetchTriples } from './subgraph';

export async function fetchSpaceTypeTriples(spaceId: string): Promise<Triple[]> {
  const triples = await fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: 1000,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES_ATTRIBUTE },
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

  const foreignTypesIds = foreignTypesFromSpaceConfig.map(triple => triple.value.value);

  const foreignTypes = await Promise.all(
    foreignTypesIds.map(entityId =>
      fetchTriples({
        query: '',
        skip: 0,
        first: 1000,
        filter: [
          { field: 'entity-id', value: entityId },
          { field: 'attribute-id', value: SYSTEM_IDS.TYPES_ATTRIBUTE },
          { field: 'linked-to', value: SYSTEM_IDS.SCHEMA_TYPE },
        ],
      })
    )
  );

  return foreignTypes.flatMap(triples => triples);
}
