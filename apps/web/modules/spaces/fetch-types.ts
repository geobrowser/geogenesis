import { SYSTEM_IDS } from '@geogenesis/ids';
import { NetworkData } from '../io';
import { Space } from '../types';

export const fetchSpaceTypeTriples = async (network: NetworkData.INetwork, spaceId: string, pageSize = 50) => {
  /* Fetch all entities with a type of type (e.g. Person / Place / Claim) */

  const { triples } = await network.fetchTriples({
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

export const fetchForeignTypeTriples = async (network: NetworkData.INetwork, space: Space, pageSize = 50) => {
  if (!space.spaceConfigEntityId) {
    return [];
  }

  const foreignTypesFromSpaceConfig = await network.fetchTriples({
    query: '',
    space: space.id,
    skip: 0,
    first: pageSize,
    filter: [
      { field: 'entity-id', value: space.spaceConfigEntityId },
      { field: 'attribute-id', value: SYSTEM_IDS.FOREIGN_TYPES },
    ],
  });

  const foreignTypesIds = foreignTypesFromSpaceConfig.triples.map(triple => triple.value.id);

  const foreignTypes = await Promise.all(
    foreignTypesIds.map(entityId =>
      network.fetchTriples({
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

  return foreignTypes.flatMap(foreignType => foreignType.triples);
};
