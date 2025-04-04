import { SystemIds } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';

import * as React from 'react';

import { ID } from '~/core/id';

import { Filter } from '../blocks/data/filters';
import { upsert, upsertRelation } from '../database/write';
import { EntityId } from '../io/schema';

export function useCreateEntityWithFilters(spaceId: string) {
  const [nextEntityId, setNextEntityId] = React.useState(ID.createEntityId());

  const onClick = React.useCallback(
    ({ name, filters }: { name?: string | null; filters?: Filter[] }) => {
      if (name) {
        upsert(
          {
            attributeId: SystemIds.NAME_PROPERTY,
            attributeName: 'Name',
            entityId: nextEntityId,
            entityName: name,
            value: {
              type: 'TEXT',
              value: name,
            },
          },
          spaceId
        );
      }

      /**
       * We only generate entities with relation filters. Additionally we ignore the
       * space filter since it is an  application-only filter used to switch between
       * behavior in the query.
       */
      const validFilters =
        filters?.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.valueType === 'RELATION') ?? [];

      for (const filter of validFilters) {
        upsertRelation({
          spaceId,
          relation: {
            index: INITIAL_RELATION_INDEX_VALUE,
            space: spaceId,
            fromEntity: {
              id: EntityId(nextEntityId),
              name: null,
            },
            toEntity: {
              id: EntityId(filter.value),
              name: filter.valueName,
              renderableType: 'RELATION',
              value: filter.value,
            },
            typeOf: {
              id: EntityId(filter.columnId),
              name: filter.columnName,
            },
          },
        });
      }

      setNextEntityId(ID.createEntityId());
    },
    [nextEntityId, spaceId]
  );

  return {
    onClick,
    nextEntityId,
  };
}
