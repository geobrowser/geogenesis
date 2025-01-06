import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import * as React from 'react';

import { ID } from '~/core/id';

import { mergeEntityAsync } from '../database/entities';
import { upsertRelation } from '../database/write';
import { EntityId } from '../io/schema';

export function useCreateEntityFromType(spaceId: string, typeIds: string[]) {
  const [nextEntityId, setNextEntityId] = React.useState(ID.createEntityId());

  const onClick = React.useCallback(() => {
    addTypesToEntityId(nextEntityId, spaceId, typeIds);
    setNextEntityId(ID.createEntityId());
  }, [nextEntityId, spaceId, typeIds]);

  return {
    onClick,
    nextEntityId,
  };
}

async function addTypesToEntityId(entityId: string, spaceId: string, typeIds: string[]) {
  const types = await Promise.all(typeIds.map(typeId => mergeEntityAsync(EntityId(typeId))));

  for (const type of types) {
    upsertRelation({
      spaceId,
      relation: {
        index: INITIAL_RELATION_INDEX_VALUE,
        space: spaceId,
        fromEntity: {
          id: EntityId(entityId),
          name: null,
        },
        toEntity: {
          id: type.id,
          name: type.name,
          renderableType: 'RELATION',
          value: type.id,
        },
        typeOf: {
          id: EntityId(SYSTEM_IDS.TYPES_ATTRIBUTE),
          name: 'Types',
        },
      },
    });
  }
}
