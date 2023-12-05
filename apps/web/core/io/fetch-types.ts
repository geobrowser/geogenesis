import { SYSTEM_IDS } from '@geogenesis/ids';

import { Space } from '../types';
import { ISubgraph } from './subgraph';

export const fetchSpaceTypeTriples = async (
  fetchTriples: ISubgraph['fetchTriples'],
  spaceId: string,
  pageSize = 1000
) => {
  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */

  const triples = await fetchTriples({
    query: '',
    space: spaceId,
    skip: 0,
    first: pageSize,
    filter: [
      { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
      {
        field: 'linked-to',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    ],
  });

  return triples;
};

export const fetchForeignTypeTriples = async (
  fetchTriples: ISubgraph['fetchTriples'],
  space: Space,
  pageSize = 1000
) => {
  if (!space.spaceConfigEntityId) {
    return [];
  }

  const foreignTypesFromSpaceConfig = await fetchTriples({
    query: '',
    space: space.id,
    skip: 0,
    first: pageSize,
    filter: [
      { field: 'entity-id', value: space.spaceConfigEntityId },
      { field: 'attribute-id', value: SYSTEM_IDS.FOREIGN_TYPES },
    ],
  });

  const foreignTypesIds = foreignTypesFromSpaceConfig.map(triple => triple.value.id);

  const foreignTypes = await Promise.all(
    foreignTypesIds.map(entityId =>
      fetchTriples({
        query: '',
        skip: 0,
        first: pageSize,
        filter: [
          { field: 'entity-id', value: entityId },
          { field: 'attribute-id', value: SYSTEM_IDS.TYPES },
          { field: 'linked-to', value: SYSTEM_IDS.SCHEMA_TYPE },
        ],
      })
    )
  );

  return foreignTypes.flatMap(triples => triples);
};
