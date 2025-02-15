import { SYSTEM_IDS } from '@graphprotocol/grc-20';

import { Relation } from '../database/Relation';
import { Triple } from '../database/Triple';
import { upsertRelation, useWriteOps } from '../database/write';
import { ID } from '../id';
import { GeoType } from '../types';

export function createType(
  entityName: string,
  spaceId: string,
  upsert: ReturnType<typeof useWriteOps>['upsert']
): GeoType {
  const entityId = ID.createEntityId();

  const nameTriple = Triple.make({
    space: spaceId,
    entityId,
    entityName,
    attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
    attributeName: 'Name',
    value: { type: 'TEXT', value: entityName },
  });

  upsert(nameTriple, spaceId);
  upsertRelation({
    relation: Relation.make({
      space: spaceId,
      typeOf: {
        id: SYSTEM_IDS.TYPES_ATTRIBUTE,
        name: 'Types',
      },
      fromEntity: {
        id: entityId,
        name: entityName,
      },
      toEntity: {
        id: SYSTEM_IDS.SCHEMA_TYPE,
        name: 'Type',
        renderableType: 'RELATION',
        value: SYSTEM_IDS.SCHEMA_TYPE,
      },
    }),
    spaceId,
  });

  return {
    entityId,
    entityName,
    space: spaceId,
  };
}
