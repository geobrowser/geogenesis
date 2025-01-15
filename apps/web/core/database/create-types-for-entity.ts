import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { EntityId } from '../io/schema';
import { DB } from './write';

type CreateTypesForEntityArgs = {
  entityId: string;
  entityName: string | null;
  spaceId: string;
  typeId: string;
  typeName: string | null;
};

export function createTypesForEntity(args: CreateTypesForEntityArgs) {
  const { entityId, entityName, spaceId, typeId, typeName } = args;
  DB.upsertRelation({
    spaceId,
    relation: {
      space: spaceId,
      index: INITIAL_RELATION_INDEX_VALUE,
      fromEntity: {
        id: EntityId(entityId),
        name: entityName,
      },
      typeOf: {
        id: EntityId(SYSTEM_IDS.TYPES_ATTRIBUTE),
        name: 'Types',
      },
      toEntity: {
        id: EntityId(typeId),
        name: typeName,
        renderableType: 'RELATION',
        value: typeId,
      },
    },
  });
}
