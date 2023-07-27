import { SYSTEM_IDS } from '@geogenesis/ids';

import { ID } from '../id';
import { Triple as ITriple } from '../types';
import { Triple } from '../utils/triple';

export function createForeignType(
  foreignType: ITriple,
  spaceId: string,
  spaceConfigId: string | null,
  create: (triple: ITriple) => void
) {
  const newSpaceConfigId = spaceConfigId || ID.createEntityId();

  if (!spaceConfigId) {
    const spaceConfigNameTriple = Triple.withId({
      space: spaceId,
      entityId: newSpaceConfigId,
      entityName: 'Space Configuration',
      attributeId: SYSTEM_IDS.NAME,
      attributeName: 'Name',
      value: { id: ID.createValueId(), type: 'string', value: 'Space Configuration' },
    });

    const spaceConfigTypeTriple = Triple.withId({
      space: spaceId,
      entityId: newSpaceConfigId,
      entityName: 'Space Configuration',
      attributeId: SYSTEM_IDS.TYPES,
      attributeName: 'Types',
      value: { id: SYSTEM_IDS.SPACE_CONFIGURATION, type: 'entity', name: 'Space Configuration' },
    });

    create(spaceConfigNameTriple);
    create(spaceConfigTypeTriple);
  }

  const spaceConfigForeignTypeTriple = Triple.withId({
    space: spaceId,
    entityId: newSpaceConfigId,
    entityName: 'Space Configuration',
    attributeId: SYSTEM_IDS.FOREIGN_TYPES,
    attributeName: 'Foreign Types',
    value: { id: foreignType.entityId, type: 'entity', name: foreignType.entityName },
  });

  create(spaceConfigForeignTypeTriple);
}

export function createType(entityName: string, spaceId: string, create: (triple: ITriple) => void) {
  const entityId = ID.createEntityId();

  const nameTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName,
    attributeId: SYSTEM_IDS.NAME,
    attributeName: 'Name',
    value: { id: ID.createValueId(), type: 'string', value: entityName },
  });
  const typeTriple = Triple.withId({
    space: spaceId,
    entityId,
    entityName,
    attributeId: SYSTEM_IDS.TYPES,
    attributeName: 'Types',
    value: {
      id: SYSTEM_IDS.SCHEMA_TYPE,
      type: 'entity',
      name: 'Type',
    },
  });

  create(nameTriple);
  create(typeTriple);

  // We return the triple to use at any callsites
  return typeTriple;
}
