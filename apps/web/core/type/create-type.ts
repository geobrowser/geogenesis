import { SYSTEM_IDS } from '@geogenesis/sdk';

import { useActionsStore } from '../hooks/use-actions-store';
import { ID } from '../id';
import { Triple as ITriple } from '../types';
import { Triples } from '../utils/triples';

export function createForeignType(
  foreignType: ITriple,
  spaceId: string,
  spaceConfigId: string | null,
  upsert: ReturnType<typeof useActionsStore>['upsert']
) {
  const newSpaceConfigId = spaceConfigId || ID.createEntityId();

  if (!spaceConfigId) {
    const spaceConfigNameTriple = Triples.withId({
      space: spaceId,
      entityId: newSpaceConfigId,
      entityName: 'Space Configuration',
      attributeId: SYSTEM_IDS.NAME,
      attributeName: 'Name',
      value: { type: 'TEXT', value: 'Space Configuration' },
    });

    const spaceConfigTypeTriple = Triples.withId({
      space: spaceId,
      entityId: newSpaceConfigId,
      entityName: 'Space Configuration',
      attributeId: SYSTEM_IDS.TYPES,
      attributeName: 'Types',
      value: { value: SYSTEM_IDS.SPACE_CONFIGURATION, type: 'ENTITY', name: 'Space Configuration' },
    });

    upsert({ ...spaceConfigNameTriple, type: 'SET_TRIPLE' }, spaceId);
    upsert({ ...spaceConfigTypeTriple, type: 'SET_TRIPLE' }, spaceId);
  }

  const spaceConfigForeignTypeTriple = Triples.withId({
    space: spaceId,
    entityId: newSpaceConfigId,
    entityName: 'Space Configuration',
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    value: { value: foreignType.entityId, type: 'ENTITY', name: foreignType.entityName },
  });

  upsert({ ...spaceConfigForeignTypeTriple, type: 'SET_TRIPLE' }, spaceId);
}

export function createType(entityName: string, spaceId: string, upsert: ReturnType<typeof useActionsStore>['upsert']) {
  const entityId = ID.createEntityId();

  const nameTriple = Triples.withId({
    space: spaceId,
    entityId,
    entityName,
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    value: { type: 'TEXT', value: entityName },
  });
  const typeTriple = Triples.withId({
    space: spaceId,
    entityId,
    entityName,
    attributeId: SYSTEM_IDS.TYPES,
    attributeName: 'Types',
    value: {
      value: SYSTEM_IDS.SCHEMA_TYPE,
      type: 'ENTITY',
      name: 'Type',
    },
  });

  upsert({ ...nameTriple, type: 'SET_TRIPLE' }, spaceId);
  upsert({ ...typeTriple, type: 'SET_TRIPLE' }, spaceId);

  // We return the triple to use at any callsites
  return typeTriple;
}
