'use client';

import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { Filter } from '../blocks/data/filters';
import { useMutate } from '../sync/use-mutate';

export function useCreateEntityWithFilters(spaceId: string) {
  const [nextEntityId, setNextEntityId] = React.useState(IdUtils.generate());
  const { storage } = useMutate();

  const onClick = React.useCallback(
    ({ name, filters }: { name?: string | null; filters?: Filter[] }) => {
      if (name) {
        storage.entities.name.set(nextEntityId, spaceId, name);
      }

      /**
       * We only generate entities with relation filters. Additionally we ignore the
       * space filter since it is an  application-only filter used to switch between
       * behavior in the query.
       */
      const validFilters =
        filters?.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.valueType === 'RELATION') ?? [];

      for (const filter of validFilters) {
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
