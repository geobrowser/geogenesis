'use client';

import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { Filter } from '../blocks/data/filters';
import { useMutate } from '../sync/use-mutate';
import { writeValue } from '~/partials/blocks/table/change-entry';

export function useCreateEntityWithFilters(spaceId: string) {
  const [nextEntityId, setNextEntityId] = React.useState(IdUtils.generate());
  const { storage } = useMutate();

  const onClick = React.useCallback(
    ({ name, filters }: { name?: string | null; filters?: Filter[] }) => {
      if (name) {
        storage.entities.name.set(nextEntityId, spaceId, name);
      }

      /**
       * Apply active table filters to the new entity: relation filters (types, etc.),
       * and TEXT property filters. Space filter is query UI only and is skipped.
       */
      const withoutSpace = filters?.filter(f => f.columnId !== SystemIds.SPACE_FILTER) ?? [];

      for (const filter of withoutSpace) {
        if (filter.valueType === 'RELATION') {
          storage.relations.set({
            id: IdUtils.generate(),
            entityId: IdUtils.generate(),
            spaceId,
            renderableType: 'RELATION',
            fromEntity: {
              id: nextEntityId,
              name: null,
            },
            toEntity: {
              id: filter.value,
              name: filter.valueName,
              value: filter.value,
            },
            type: {
              id: filter.columnId,
              name: filter.columnName,
            },
          });
        } else if (filter.valueType === 'TEXT' && filter.columnId !== SystemIds.NAME_PROPERTY) {
          writeValue(
            storage,
            nextEntityId,
            spaceId,
            {
              id: filter.columnId,
              name: filter.columnName,
              dataType: 'TEXT',
            },
            filter.value,
            null
          );
        }
      }

      setNextEntityId(IdUtils.generate());
    },
    [nextEntityId, spaceId, storage]
  );

  return {
    onClick,
    nextEntityId,
  };
}
