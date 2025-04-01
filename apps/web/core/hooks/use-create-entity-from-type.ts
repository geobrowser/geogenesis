import { SystemIds } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';

import * as React from 'react';

import { ID } from '~/core/id';

import { upsertRelation } from '../database/write';
import { EntityId } from '../io/schema';
import { queryClient } from '../query-client';
import { E } from '../sync/orm';
import { store } from '../sync/use-sync-engine';

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
  const types = await E.findMany({
    store,
    cache: queryClient,
    where: {
      id: {
        in: typeIds,
      },
    },
    first: 100,
    skip: 0,
  });

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
          id: EntityId(SystemIds.TYPES_ATTRIBUTE),
          name: 'Types',
        },
      },
    });
  }
}
