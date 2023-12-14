import { SYSTEM_IDS } from '@geogenesis/ids';

import { Entity, Space, Triple } from '../types';
import { ISubgraph, fetchEntities, fetchEntity } from './subgraph';

export async function fetchSpaceTypeTriples(spaceId: string): Promise<Triple[]> {
  const entities = await fetchEntities({
    spaceId: spaceId,
    typeIds: [SYSTEM_IDS.TYPES],
    filter: [],
  });

  // Map the fetched entity to get any first triple.
  const typeTriples = entities.map(e => e.triples.find(t => t)).filter((t): t is Triple => t !== null);

  return typeTriples;
}

export async function fetchForeignTypeTriples(space: Space): Promise<Triple[]> {
  if (!space.spaceConfig) {
    return [];
  }

  const foreignTypesFromSpaceConfig = space.spaceConfig.triples.filter(t => t.attributeId === SYSTEM_IDS.FOREIGN_TYPES);
  const foreignTypesIds = foreignTypesFromSpaceConfig.map(triple => triple.value.id);

  const maybeForeignTypes = await Promise.all(foreignTypesIds.map(entityId => fetchEntity({ id: entityId })));
  const foreignTypes = maybeForeignTypes.filter((type): type is Entity => type !== null);
  return foreignTypes.map(e => e.triples.find(t => t)).filter((t): t is Triple => t !== null);
}
