import { SYSTEM_IDS } from '@geogenesis/sdk';

import { useWriteOps } from '../database/write';
import { ID } from '../id';
import { Triple as ITriple } from '../types';
import { Triples } from '../utils/triples';

export function createForeignType(
  foreignType: ITriple,
  spaceId: string,
  spaceConfigId: string | null,
  upsert: ReturnType<typeof useWriteOps>['upsert']
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

    // @TODO(relations)
    const spaceConfigTypeTriple = Triples.withId({
      space: spaceId,
      entityId: newSpaceConfigId,
      entityName: 'Space Configuration',
      attributeId: SYSTEM_IDS.TYPES,
      attributeName: 'Types',
      value: { value: SYSTEM_IDS.SPACE_CONFIGURATION, type: 'ENTITY', name: 'Space Configuration' },
    });

    upsert(spaceConfigNameTriple, spaceId);
    upsert(spaceConfigTypeTriple, spaceId);
  }

  // @TODO(relations)
  const spaceConfigForeignTypeTriple = Triples.withId({
    space: spaceId,
    entityId: newSpaceConfigId,
    entityName: 'Space Configuration',
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    value: { value: foreignType.entityId, type: 'ENTITY', name: foreignType.entityName },
  });

  upsert(spaceConfigForeignTypeTriple, spaceId);
}

export function createType(entityName: string, spaceId: string, upsert: ReturnType<typeof useWriteOps>['upsert']) {
  const entityId = ID.createEntityId();

  const nameTriple = Triples.withId({
    space: spaceId,
    entityId,
    entityName,
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    value: { type: 'TEXT', value: entityName },
  });

  // @TODO(relations)
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

  upsert(nameTriple, spaceId);
  upsert(typeTriple, spaceId);

  // We return the triple to use at any callsites
  return typeTriple;
}
